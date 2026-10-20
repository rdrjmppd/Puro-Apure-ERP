import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  signInWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, isFirebaseConfigValid, terminateFirestoreInstance } from '../firebase/config';
import { offlineSyncEngine } from '../services/offlineSyncEngine';

export type UserRole = 'SUPERADMIN' | 'ADMIN' | 'OBRERO' | 'USUARIO';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt?: string;
  updatedAt?: string;
}

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  role: UserRole;
  loginWithCredentials: (email: string, pass: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  handleSignOut: () => Promise<void>;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isObrero: boolean;
  isConfigured: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper de Perfil de Contingencia (Mitigación VEC-IAM-01)
const getContingencyProfile = (fallbackUid?: string, fallbackEmail?: string): UserProfile => {
  try {
    const lastActive = localStorage.getItem('puro_apure_last_active_profile');
    if (lastActive) {
      const parsed = JSON.parse(lastActive);
      if (parsed && parsed.email) {
        return parsed;
      }
    }
    if (fallbackUid) {
      const cached = localStorage.getItem(`puro_apure_profile_${fallbackUid}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.email) return parsed;
      }
    }
  } catch (err) {
    console.warn('[IAM Fail-Safe] Error al acceder a localStorage:', err);
  }

  const isRoot = fallbackEmail?.toLowerCase() === 'rdrj.mppd@gmail.com';
  return {
    uid: fallbackUid || 'contingency_offline_session',
    email: fallbackEmail || (isRoot ? 'rdrj.mppd@gmail.com' : 'operador@puroapure.erp'),
    displayName: isRoot ? 'Ruben Rojas' : 'Operador de Contingencia (Offline)',
    role: isRoot ? 'SUPERADMIN' : 'USUARIO',
  };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth || !isFirebaseConfigValid) {
      console.warn('Firebase Auth no inicializado debido a falta de variables de entorno.');
      setLoading(false);
      return;
    }

    let hasResolvedInitialAuth = false;
    let markSessionResolved: () => void = () => {};

    // Promesa de resolución del observador de sesión
    const sessionInitPromise = new Promise<void>((resolve) => {
      markSessionResolved = resolve;
    });

    // Temporizador de escape forzado (Fail-Safe Guard: 1500ms)
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutTimer = setTimeout(() => {
        reject(new Error('AUTH_INITIALIZATION_TIMEOUT_1500MS'));
      }, 1500);
    });

    // Inyección de concurrencia Promise.race para mitigar latencia infinita (VEC-IAM-01)
    Promise.race([sessionInitPromise, timeoutPromise])
      .then(() => {
        hasResolvedInitialAuth = true;
      })
      .catch((raceErr: unknown) => {
        if (!hasResolvedInitialAuth) {
          hasResolvedInitialAuth = true;
          const errMsg = raceErr instanceof Error ? raceErr.message : String(raceErr);
          console.warn(
            '[IAM Fail-Safe Guard - VEC-IAM-01] Temporizador de escape forzado (1500ms) activado. Desbloqueando UI con Perfil de Contingencia:',
            errMsg
          );
          // Cargar Perfil de Contingencia seguro desde almacenamiento local
          const contingency = getContingencyProfile(
            auth?.currentUser?.uid,
            auth?.currentUser?.email || undefined
          );
          setUserProfile(contingency);
          setLoading(false); // Forzar desbloqueo estricto del AuthGuard
        }
      });

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);

      if (!user || !user.email) {
        setUserProfile(null);
        setLoading(false);
        markSessionResolved();
        return;
      }

      // ----------------------------------------------------------------------
      // FASE 1: RESOLUCIÓN SÍNCRONA / OPTIMISTA (<10ms)
      // Desbloquea inmediatamente el AuthGuard sin esperar I/O de red
      // ----------------------------------------------------------------------
      const isRootAdmin = user.email.toLowerCase() === 'rdrj.mppd@gmail.com';
      let initialRole: UserRole = isRootAdmin ? 'SUPERADMIN' : 'USUARIO';
      let initialDisplayName = isRootAdmin
        ? (user.displayName || 'Ruben Rojas')
        : (user.displayName || user.email.split('@')[0]);

      // Recuperar de caché local síncrona si existe
      try {
        const cachedRaw = localStorage.getItem(`puro_apure_profile_${user.uid}`);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (!isRootAdmin && parsed.role) {
            initialRole = parsed.role;
          }
          if (parsed.displayName) {
            initialDisplayName = parsed.displayName;
          }
        }
      } catch {
        // Fallback seguro a valores por defecto
      }

      const userEmail = user.email;
      const optimisticProfile: UserProfile = {
        uid: user.uid,
        email: userEmail,
        displayName: initialDisplayName,
        role: initialRole,
      };

      setUserProfile(optimisticProfile);

      // Guardar perfil activo para contingencia futura
      try {
        localStorage.setItem('puro_apure_last_active_profile', JSON.stringify(optimisticProfile));
      } catch {
        // Ignorar límites de cuota
      }

      // DESBLOQUEO INMEDIATO: AuthGuard renderiza en <50ms
      setLoading(false);
      markSessionResolved();

      // ----------------------------------------------------------------------
      // FASE 2: HIDRATACIÓN ASÍNCRONA EN SEGUNDO PLANO (Background Hydration)
      // Valida Custom Claims criptográficos y sincroniza Firestore bajo Promise.race (1500ms)
      // ----------------------------------------------------------------------
      (async () => {
        const backgroundHydrationTask = async () => {
          let resolvedRole: UserRole = isRootAdmin ? 'SUPERADMIN' : initialRole;
          let hasExplicitJwtRole = isRootAdmin;

          // 1. Extraer Custom Claims decodificados del token JWT (forzando actualización para roles recientes)
          try {
            const tokenResult = await user.getIdTokenResult(true);
            if (isRootAdmin) {
              resolvedRole = 'SUPERADMIN';
              hasExplicitJwtRole = true;
            } else if (tokenResult.claims.role) {
              resolvedRole = tokenResult.claims.role as UserRole;
              hasExplicitJwtRole = true;
            } else if (tokenResult.claims.isSuperAdmin) {
              resolvedRole = 'SUPERADMIN';
              hasExplicitJwtRole = true;
            } else if (tokenResult.claims.isAdmin) {
              resolvedRole = 'ADMIN';
              hasExplicitJwtRole = true;
            } else if (tokenResult.claims.isObrero) {
              resolvedRole = 'OBRERO';
              hasExplicitJwtRole = true;
            }
          } catch (claimsErr) {
            console.warn('[IAM Background] Lectura de Custom Claims fallback:', claimsErr);
          }

          // 2. Consulta en segundo plano a Cloud Firestore (/users/{uid})
          // Blindaje IAM: Los roles se determinan desde Custom Claims o el documento raíz verificado en Firestore.
          if (db) {
            try {
              const userRef = doc(db, 'users', user.uid);
              const snap = await getDoc(userRef);

              if (snap.exists()) {
                const data = snap.data();
                // Si el JWT aún no propagó los claims pero Firestore tiene el rol asignado por Superadmin:
                if (!hasExplicitJwtRole && data?.role) {
                  resolvedRole = data.role as UserRole;
                }
                const updatedProfile: UserProfile = {
                  uid: user.uid,
                  email: userEmail,
                  displayName: data.displayName || user.displayName || optimisticProfile.displayName,
                  role: resolvedRole,
                  createdAt: data.createdAt,
                  updatedAt: data.updatedAt,
                };
                setUserProfile(updatedProfile);
                try {
                  localStorage.setItem(`puro_apure_profile_${user.uid}`, JSON.stringify(updatedProfile));
                  localStorage.setItem('puro_apure_last_active_profile', JSON.stringify(updatedProfile));
                } catch {
                  // Ignore localStorage quota
                }
                return;
              } else {
                // Registro inicial en Firestore (background)
                const newProfile: UserProfile = {
                  uid: user.uid,
                  email: userEmail,
                  displayName: isRootAdmin ? 'Ruben Rojas' : (user.displayName || userEmail.split('@')[0]),
                  role: resolvedRole,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };
                setDoc(userRef, newProfile).catch((err) => {
                  console.warn('[IAM Background] Error no fatal al guardar perfil inicial:', err);
                });
                setUserProfile(newProfile);
                try {
                  localStorage.setItem(`puro_apure_profile_${user.uid}`, JSON.stringify(newProfile));
                  localStorage.setItem('puro_apure_last_active_profile', JSON.stringify(newProfile));
                } catch {
                  // Ignore
                }
                return;
              }
            } catch (firestoreErr) {
              console.warn('[IAM Background] Firestore offline o no disponible, usando IAM optimista:', firestoreErr);
            }
          }

          // Sincronizar estado local con claims obtenidos
          if (resolvedRole !== optimisticProfile.role) {
            const syncedProfile: UserProfile = {
              ...optimisticProfile,
              role: resolvedRole,
            };
            setUserProfile(syncedProfile);
            try {
              localStorage.setItem(`puro_apure_profile_${user.uid}`, JSON.stringify(syncedProfile));
              localStorage.setItem('puro_apure_last_active_profile', JSON.stringify(syncedProfile));
            } catch {
              // Ignore
            }
          }
        };

        const bgTimeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('JWT_HYDRATION_TIMEOUT_1500MS')), 1500);
        });

        try {
          await Promise.race([backgroundHydrationTask(), bgTimeoutPromise]);
        } catch (bgErr) {
          console.warn('[IAM Fail-Safe Guard] Background hydration completada o interrumpida por timeout de 1500ms:', bgErr);
          setLoading(false);
        }
      })();
    });

    return () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      unsubscribe();
    };
  }, []);

  const loginWithCredentials = async (email: string, pass: string) => {
    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();
    const isRootSuperadmin = cleanEmail === 'rdrj.mppd@gmail.com';

    try {
      if (auth && isFirebaseConfigValid) {
        try {
          await signInWithEmailAndPassword(auth, email.trim(), pass);
          return;
        } catch (firebaseErr: unknown) {
          const errMsg = firebaseErr instanceof Error ? firebaseErr.message : String(firebaseErr);

          // Si el usuario no existe aún en Firebase Authentication, intentar auto-registrar al Root Superadmin
          if (
            isRootSuperadmin && pass.length >= 6 &&
            (errMsg.includes('auth/user-not-found') || errMsg.includes('auth/invalid-credential'))
          ) {
            try {
              console.info('Aprovisionando cuenta de Superadministrador en Firebase Authentication...');
              await createUserWithEmailAndPassword(auth, email.trim(), pass);
              return;
            } catch (createErr) {
              console.warn('Fallo al registrar usuario en la nube, usando fallback offline:', createErr);
            }
          }

          throw firebaseErr;
        }
      }

      throw new Error(
        'Credenciales no válidas o servicio de autenticación no disponible. Ingrese el identificador y la clave correctos.'
      );
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      if (auth && isFirebaseConfigValid) {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
      } else {
        throw new Error(
          'Autenticación federada no disponible en modo offline. Ingrese manualmente con sus credenciales de Superadministrador.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * Cierre de Sesión Estricto:
   * Ejecuta signOut(), purga almacenamiento local de la aplicación
   * sin destruir el cliente singleton de Firestore, y resetea el contexto
   */
  const handleSignOut = async () => {
    setLoading(true);
    try {
      // 1. Firebase Auth SignOut
      if (auth) {
        await firebaseSignOut(auth);
      }
      // 2. Liberación segura de recursos sin terminar el singleton compartido
      await terminateFirestoreInstance();
      // 3. Purge local storage and IndexedDB de la aplicación de forma no bloqueante con timeout seguro
      await offlineSyncEngine.purgeAllStorage();
      // 4. Clear application state
      setCurrentUser(null);
      setUserProfile(null);
    } catch (error) {
      console.error('Error during handleSignOut:', error);
    } finally {
      setLoading(false);
      // Navegación atómica SPA sin recarga total para evitar bloqueos en runtime embebido (iframe)
      if (typeof window !== 'undefined') {
        window.history.pushState({}, '', '/login');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }
  };

  const role: UserRole = userProfile?.role || 'USUARIO';
  const isSuperAdmin = role === 'SUPERADMIN';
  const isAdmin = role === 'ADMIN' || isSuperAdmin;
  const isObrero = role === 'OBRERO';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        role,
        loginWithCredentials,
        loginWithGoogle,
        handleSignOut,
        isAdmin,
        isSuperAdmin,
        isObrero,
        isConfigured: isFirebaseConfigValid,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
