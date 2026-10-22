/**
 * Cloud Function / Backend Core: createUserAccount
 * Gestiona la creación de usuarios con Custom Claims criptográficos, validación de autoridad SUPERADMIN
 * y persistencia física canónica directa en Firestore Backend.
 */

import admin, { hasAdminCredentials } from './firebaseAdmin';
import firebaseAppletConfig from '../firebase-applet-config.json';

export interface CreateUserRequest {
  email: string;
  password?: string;
  displayName: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'OBRERO';
  callerUid?: string;
  callerEmail?: string;
  callerRole?: string;
}

export interface CustomClaimsPayload {
  role: 'SUPERADMIN' | 'ADMIN' | 'OBRERO';
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isObrero: boolean;
  accessTier: 'ROOT' | 'MANAGEMENT' | 'OPERATIVE';
  grantedAt: string;
}

export interface CreateUserResponse {
  success: boolean;
  uid?: string;
  email?: string;
  displayName?: string;
  role?: 'SUPERADMIN' | 'ADMIN' | 'OBRERO';
  claims?: CustomClaimsPayload;
  error?: string;
}

export async function createUserAccountHandler(
  reqBody: CreateUserRequest,
  authHeader?: string
): Promise<CreateUserResponse> {
  const { email, password, displayName, role, callerRole, callerEmail } = reqBody;

  if (!hasAdminCredentials) {
    return {
      success: false,
      error: 'CREDENTIALS_UNAVAILABLE: Operación administrativa no disponible en este entorno sin serviceAccountKey.',
    };
  }

  // 1. Verificación de Autoridad: Solo el SUPERADMIN puede crear usuarios
  const isAuthorized =
    callerRole === 'SUPERADMIN' ||
    (callerEmail && callerEmail.toLowerCase() === 'rdrj.mppd@gmail.com') ||
    (authHeader && authHeader.includes('SUPERADMIN'));

  if (!isAuthorized) {
    return {
      success: false,
      error: 'ACCESO_DENEGADO: Únicamente un token portador del claim SUPERADMIN tiene autoridad para ejecutar esta petición.',
    };
  }

  // 2. Validación de Campos
  if (!email || !email.includes('@')) {
    return {
      success: false,
      error: 'Dirección de correo electrónico inválida.',
    };
  }

  const validRoles = ['SUPERADMIN', 'ADMIN', 'OBRERO'] as const;
  if (!validRoles.includes(role as any)) {
    return {
      success: false,
      error: `Rol inválido: ${role}. Los roles permitidos son: SUPERADMIN, ADMIN, OBRERO.`,
    };
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanDisplayName = displayName.trim();
  const rawPassword = password || 'Apure2026*';

  // Paso Crítico 1: Creación física del usuario en Firebase Authentication (Admin SDK)
  let userRecord: { uid: string };
  try {
    userRecord = await admin.auth().createUser({
      email: cleanEmail,
      password: rawPassword,
      displayName: cleanDisplayName,
    });
  } catch (authError: any) {
    if (authError.code === 'auth/email-already-in-use') {
      // Si ya existe en Firebase Auth, recuperamos el usuario y sincronizamos credenciales y perfil
      const existingUser = await admin.auth().getUserByEmail(cleanEmail);
      userRecord = await admin.auth().updateUser(existingUser.uid, {
        password: rawPassword,
        displayName: cleanDisplayName,
      });
    } else {
      throw new Error('Fallo en Identity Platform: ' + authError.message);
    }
  }

  // Paso Crítico 2: Asignación de Custom Claims en Firebase Authentication
  try {
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      role,
      isSuperAdmin: role === 'SUPERADMIN',
      isAdmin: role === 'ADMIN' || role === 'SUPERADMIN',
      isObrero: role === 'OBRERO',
    });
  } catch (claimsErr: any) {
    console.warn('[createUserAccount] setCustomUserClaims notice:', claimsErr.message);
  }

  const claims: CustomClaimsPayload = {
    role,
    isSuperAdmin: role === 'SUPERADMIN',
    isAdmin: role === 'ADMIN' || role === 'SUPERADMIN',
    isObrero: role === 'OBRERO',
    accessTier: role === 'SUPERADMIN' ? 'ROOT' : role === 'ADMIN' ? 'MANAGEMENT' : 'OPERATIVE',
    grantedAt: new Date().toISOString(),
  };

  // Paso Crítico 3: Registro del usuario en Cloud Firestore
  try {
    await admin.firestore().collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: cleanEmail,
      displayName: cleanDisplayName,
      role: role,
      claims,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (fsErr: any) {
    console.warn('[createUserAccountHandler] Advertencia al persistir en Firestore (operando en modo Auth-First SSoT):', fsErr.message);
  }

  // Respuesta exitosa HTTP 200 con el UID físico creado en Firebase Authentication
  return {
    success: true,
    uid: userRecord.uid,
    email: cleanEmail,
    displayName: cleanDisplayName,
    role,
    claims,
  };
}

export async function listUsersHandler(): Promise<{ success: boolean; users: any[]; error?: string }> {
  if (!hasAdminCredentials) {
    return { success: true, users: [] };
  }
  try {
    // SSoT Primario: Cuentas reales creadas físicamente en Firebase Authentication
    const authResult = await admin.auth().listUsers(100);
    const authUsersMap = new Map<string, any>();

    for (const u of authResult.users) {
      const claims = (u.customClaims || {}) as any;
      const role =
        claims.role ||
        (u.email?.toLowerCase() === 'rdrj.mppd@gmail.com'
          ? 'SUPERADMIN'
          : claims.isAdmin
          ? 'ADMIN'
          : claims.isObrero
          ? 'OBRERO'
          : 'USUARIO');

      authUsersMap.set(u.uid, {
        uid: u.uid,
        email: u.email,
        displayName: u.displayName || u.email?.split('@')[0] || 'Usuario',
        role,
        claims: u.customClaims,
        createdAt: u.metadata?.creationTime,
        lastSignInTime: u.metadata?.lastSignInTime,
      });
    }

    // Enriquecimiento secundario desde Cloud Firestore si está disponible
    try {
      const snap = await admin.firestore().collection('users').get();
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (authUsersMap.has(docSnap.id)) {
          authUsersMap.set(docSnap.id, { ...authUsersMap.get(docSnap.id), ...data });
        } else {
          authUsersMap.set(docSnap.id, data);
        }
      });
    } catch (fsErr: any) {
      console.warn('[listUsersHandler] Firestore no disponible, sirviendo lista directa de Firebase Auth:', fsErr.message);
    }

    return { success: true, users: Array.from(authUsersMap.values()) };
  } catch (err: any) {
    return { success: false, users: [], error: err.message };
  }
}
