/**
 * Puro Apure ERP - SuperAdminDashboard
 * Módulo de Gestión de Identidad (IAM) y Creación de Cuentas con Custom Claims
 * Roles soportados: SUPERADMIN, ADMIN, OBRERO
 */

import React, { useState, useEffect, useCallback } from 'react';
import { doc, deleteDoc, getDocs, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth, UserRole } from '../context/AuthContext';
import {
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  KeyRound,
  Users,
  CheckCircle2,
  Lock,
  Sparkles,
  Terminal,
  RefreshCw,
  HardHat,
  Briefcase,
  Crown,
  Trash2,
} from 'lucide-react';

interface ProvisionedUser {
  uid: string;
  email: string;
  displayName: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'OBRERO';
  claims: {
    role: string;
    isSuperAdmin: boolean;
    isAdmin: boolean;
    isObrero: boolean;
    accessTier: string;
    grantedAt: string;
  };
}

export const SuperAdminDashboard: React.FC = () => {
  const { isSuperAdmin, userProfile } = useAuth();

  // Form State
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'SUPERADMIN' | 'ADMIN' | 'OBRERO'>('OBRERO');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [userToDelete, setUserToDelete] = useState<{ uid: string; name: string } | null>(null);

  // Lista reactiva de cuentas aprovisionadas (SSoT en Firestore)
  const [usersList, setUsersList] = useState<ProvisionedUser[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Función de sincronización bidireccional inmediata
  const syncUsers = useCallback(async () => {
    setIsRefreshing(true);
    try {
      if (db) {
        const snap = await getDocs(collection(db, 'users'));
        if (!snap.empty) {
          const list: ProvisionedUser[] = [];
          snap.forEach((docSnap) => {
            const data = docSnap.data();
            list.push({
              uid: docSnap.id,
              email: data.email || '',
              displayName: data.displayName || 'Usuario sin nombre',
              role: (data.role as 'SUPERADMIN' | 'ADMIN' | 'OBRERO') || 'OBRERO',
              claims: data.claims || {
                role: data.role || 'OBRERO',
                isSuperAdmin: data.role === 'SUPERADMIN',
                isAdmin: data.role === 'ADMIN' || data.role === 'SUPERADMIN',
                isObrero: data.role === 'OBRERO',
                accessTier: data.role === 'SUPERADMIN' ? 'ROOT' : data.role === 'ADMIN' ? 'MANAGEMENT' : 'OPERATIVE',
                grantedAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
              },
            });
          });
          setUsersList(list);
          setIsRefreshing(false);
          return;
        }
      }

      // Consulta de contingencia al endpoint de backend SSoT
      const res = await fetch('/api/listUsers');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.users)) {
          setUsersList(data.users);
        }
      }
    } catch (e) {
      console.warn('Error sincronizando usuarios:', e);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Suscripción reactiva en tiempo real (WebSockets / Firestore onSnapshot)
  useEffect(() => {
    if (!db) {
      syncUsers();
      return;
    }

    const unsub = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const fetchedUsers: ProvisionedUser[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          fetchedUsers.push({
            uid: docSnap.id,
            email: data.email || '',
            displayName: data.displayName || 'Usuario sin nombre',
            role: (data.role as 'SUPERADMIN' | 'ADMIN' | 'OBRERO') || 'OBRERO',
            claims: data.claims || {
              role: data.role || 'OBRERO',
              isSuperAdmin: data.role === 'SUPERADMIN',
              isAdmin: data.role === 'ADMIN' || data.role === 'SUPERADMIN',
              isObrero: data.role === 'OBRERO',
              accessTier: data.role === 'SUPERADMIN' ? 'ROOT' : data.role === 'ADMIN' ? 'MANAGEMENT' : 'OPERATIVE',
              grantedAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
            },
          });
        });
        setUsersList(fetchedUsers);
      },
      (error) => {
        console.warn('Error en el observador en tiempo real de usuarios:', error);
        syncUsers();
      }
    );

    return () => unsub();
  }, [syncUsers]);

  const handleDeleteUser = (userUid: string, userDisplayName: string) => {
    setUserToDelete({ uid: userUid, name: userDisplayName });
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    const { uid, name } = userToDelete;
    setUserToDelete(null);
    try {
      if (db) {
        await deleteDoc(doc(db, 'users', uid));
        notify(`Cuenta de "${name}" revocada y eliminada con éxito.`);
      }
    } catch (err: any) {
      notify(`Error al eliminar usuario: ${err.message}`, 'error');
    }
  };

  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !displayName.trim()) {
      notify('Por favor complete el nombre y correo del usuario.', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      // Invocación autoritativa al Backend IAM (/api/createUserAccount)
      const response = await fetch('/api/createUserAccount', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer SUPERADMIN:${userProfile?.uid || 'superadmin'}`,
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password || 'Apure2026*',
          displayName: displayName.trim(),
          role: role,
          callerUid: userProfile?.uid,
          callerEmail: userProfile?.email,
          callerRole: userProfile?.role || 'SUPERADMIN',
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Error al procesar la creación física del usuario en el servidor.');
      }

      const newUser: ProvisionedUser = {
        uid: data.uid,
        email: data.email || email.trim().toLowerCase(),
        displayName: data.displayName || displayName.trim(),
        role: data.role || role,
        claims: data.claims || {
          role,
          isSuperAdmin: role === 'SUPERADMIN',
          isAdmin: role === 'ADMIN' || role === 'SUPERADMIN',
          isObrero: role === 'OBRERO',
          accessTier: role === 'SUPERADMIN' ? 'ROOT' : role === 'ADMIN' ? 'MANAGEMENT' : 'OPERATIVE',
          grantedAt: new Date().toISOString(),
        },
      };

      // Actualización exclusiva de la interfaz solo tras éxito canónico verificado del backend
      setUsersList((prev) => {
        if (prev.some((u) => u.uid === data.uid)) return prev;
        return [newUser, ...prev];
      });

      notify(`Usuario "${displayName.trim()}" aprovisionado con éxito en Firebase Identity Platform con rol ${role}.`);

      // Reset fields
      setEmail('');
      setDisplayName('');
      setPassword('');
      setRole('OBRERO');
    } catch (err: any) {
      console.error('[SuperAdminDashboard] Error en aprovisionamiento backend IAM:', err);
      notify(err.message || 'Error al aprovisionar la cuenta en el servidor.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Role details helper
  const getRoleBadge = (userRole: 'SUPERADMIN' | 'ADMIN' | 'OBRERO') => {
    switch (userRole) {
      case 'SUPERADMIN':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 font-bold">
            <Crown className="w-3 h-3 text-purple-400" /> SUPERADMIN
          </span>
        );
      case 'ADMIN':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-bold">
            <Briefcase className="w-3 h-3 text-blue-400" /> ADMIN
          </span>
        );
      case 'OBRERO':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">
            <HardHat className="w-3 h-3 text-amber-400" /> OBRERO
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-5 right-5 z-50 animate-fadeIn">
          <div
            className={`px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-semibold border ${
              notification.type === 'success'
                ? 'bg-purple-950 border-purple-500 text-purple-200'
                : 'bg-red-950 border-red-500 text-red-200'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{notification.text}</span>
          </div>
        </div>
      )}

      {/* Header IAM */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-purple-950/80 border border-purple-700/60 flex items-center justify-center text-purple-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              SuperAdmin IAM Dashboard (Gestión de Roles & Custom Claims)
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-purple-950 text-purple-300 border border-purple-700">
              Fase 2 Activa
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Aprovisionamiento centralizado de credenciales con asignación criptográfica de Custom Claims: SUPERADMIN, ADMIN, OBRERO.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-2xl font-mono text-xs text-slate-300">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Autoridad: <strong>{userProfile?.displayName || 'Ruben Rojas'}</strong></span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ==================================================== */}
        {/* PANEL DE CREACIÓN DE USUARIO (3 ROLES EXPLÍCITOS) */}
        {/* ==================================================== */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-purple-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                Crear Cuenta de Usuario
              </h3>
            </div>
            <span className="text-[10px] font-mono bg-purple-950 text-purple-300 px-2 py-0.5 rounded">
              Cloud Function: createUserAccount
            </span>
          </div>

          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs text-slate-300 font-semibold">
                Nombre Completo / Cargo Operativo
              </label>
              <input
                type="text"
                required
                value={displayName}
                placeholder="Ej. Juan Pérez - Encargado de Corral"
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-300 font-semibold">
                Correo Electrónico de Acceso
              </label>
              <input
                type="email"
                required
                value={email}
                placeholder="operario@puroapure.com"
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-300 font-semibold">
                Contraseña Temporal
              </label>
              <input
                type="password"
                value={password}
                placeholder="Apure2026* (por defecto)"
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
              />
              <p className="text-[10px] text-slate-500">Dejar en blanco para usar la clave institucional estándar.</p>
            </div>

            {/* SELECTOR EXPLÍCITO DE LOS 3 ROLES */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="text-xs text-slate-200 font-bold flex items-center justify-between">
                <span>Jerarquía de Permisos (Rol Asignado)</span>
                <span className="text-[10px] text-purple-400 font-mono">Custom Claim</span>
              </label>

              <div className="grid grid-cols-3 gap-2">
                {/* 1. SUPERADMIN */}
                <button
                  type="button"
                  onClick={() => setRole('SUPERADMIN')}
                  className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-1.5 ${
                    role === 'SUPERADMIN'
                      ? 'bg-purple-950 border-purple-500 text-purple-200 ring-2 ring-purple-500/50'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <Crown className="w-5 h-5 text-purple-400" />
                  <span className="text-[11px] font-bold">SUPERADMIN</span>
                  <span className="text-[9px] text-slate-400 leading-tight">Acceso Total + Schemas</span>
                </button>

                {/* 2. ADMIN */}
                <button
                  type="button"
                  onClick={() => setRole('ADMIN')}
                  className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-1.5 ${
                    role === 'ADMIN'
                      ? 'bg-blue-950 border-blue-500 text-blue-200 ring-2 ring-blue-500/50'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <Briefcase className="w-5 h-5 text-blue-400" />
                  <span className="text-[11px] font-bold">ADMIN</span>
                  <span className="text-[9px] text-slate-400 leading-tight">Finanzas & Inventario</span>
                </button>

                {/* 3. OBRERO */}
                <button
                  type="button"
                  onClick={() => setRole('OBRERO')}
                  className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-1.5 ${
                    role === 'OBRERO'
                      ? 'bg-amber-950 border-amber-500 text-amber-200 ring-2 ring-amber-500/50'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <HardHat className="w-5 h-5 text-amber-400" />
                  <span className="text-[11px] font-bold">OBRERO</span>
                  <span className="text-[9px] text-slate-400 leading-tight">Solo Operativa Campo</span>
                </button>
              </div>

              {/* Explicación del Rol Seleccionado */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-300">
                {role === 'SUPERADMIN' && (
                  <div>
                    <strong className="text-purple-400">SUPERADMIN:</strong> Acceso ilimitado (CRUD global) en todas las colecciones, motor de esquemas dinámicos (`system_schemas`), telemetría y saneamiento root.
                  </div>
                )}
                {role === 'ADMIN' && (
                  <div>
                    <strong className="text-blue-400">ADMIN:</strong> Gestión completa de inventarios, lotes y finanzas bimonetarias BCV. Acceso denegado a la configuración de esquemas dinámicos.
                  </div>
                )}
                {role === 'OBRERO' && (
                  <div>
                    <strong className="text-amber-400">OBRERO:</strong> Solo lectura de existencias y registro de pesajes / consumos diarios e ingreso de materia prima. <strong>Bloqueo total a paneles financieros y balances.</strong>
                  </div>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-2xl transition shadow-lg shadow-purple-950 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Aprovisionando en Cloud Function...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Aprovisionar Usuario con Custom Claims</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* ==================================================== */}
        {/* CATÁLOGO DE USUARIOS Y CLAIMS ACTIVOS */}
        {/* ==================================================== */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                  Cuentas Aprovisionadas & Tokens con Custom Claims
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={syncUsers}
                  disabled={isRefreshing}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-mono flex items-center gap-1 transition"
                  title="Forzar sincronización inmediata con Firestore y Backend"
                >
                  <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-purple-400' : ''}`} />
                  <span>Sincronizar</span>
                </button>
                <span className="text-[10px] font-mono bg-purple-950 text-purple-300 border border-purple-800 px-2 py-0.5 rounded">
                  Total: {usersList.length}
                </span>
              </div>
            </div>

            <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
              {usersList.length === 0 ? (
                <div className="p-8 text-center bg-slate-950/60 rounded-2xl border border-dashed border-slate-800 space-y-2">
                  <Users className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs text-slate-400">No hay cuentas adicionales aprovisionadas.</p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    Utilice el formulario contiguo para aprovisionar un nuevo ADMIN u OBRERO.
                  </p>
                </div>
              ) : (
                usersList.map((usr) => (
                  <div
                    key={usr.uid}
                    className="p-4 bg-slate-950 border border-slate-800 hover:border-purple-800/60 rounded-2xl space-y-2 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-white tracking-tight flex items-center gap-2">
                          <span>{usr.displayName}</span>
                          {getRoleBadge(usr.role)}
                        </h4>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">{usr.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono px-2 py-1 rounded bg-slate-900 text-slate-400 border border-slate-800">
                          Tier: {usr.claims?.accessTier || 'OPERATIVE'}
                        </span>
                        {usr.email !== 'rdrj.mppd@gmail.com' && (
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(usr.uid, usr.displayName)}
                            className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/40 transition"
                            title="Revocar y eliminar usuario"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Claims Inyectados */}
                    <div className="pt-2 border-t border-slate-900 flex flex-wrap gap-1 font-mono text-[9px]">
                      <span className="px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
                        role: &quot;{usr.claims?.role || usr.role}&quot;
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                        isSuperAdmin: {String(usr.claims?.isSuperAdmin ?? (usr.role === 'SUPERADMIN'))}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                        isAdmin: {String(usr.claims?.isAdmin ?? (usr.role === 'ADMIN' || usr.role === 'SUPERADMIN'))}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                        isObrero: {String(usr.claims?.isObrero ?? (usr.role === 'OBRERO'))}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="p-3.5 bg-purple-950/20 border border-purple-900/40 rounded-2xl text-[11px] text-purple-300 flex items-start gap-2">
            <Terminal className="w-4 h-4 shrink-0 text-purple-400 mt-0.5" />
            <span>
              <strong>Validación Estricta en Backend:</strong> Cualquier invocación a <code>/api/createUserAccount</code> efectuada sin un token de nivel <code>SUPERADMIN</code> es rechazada inmediatamente con código HTTP 403 Forbidden.
            </span>
          </div>
        </div>
      </div>

      {/* Modal Nativo de Confirmación de Eliminación (AI Studio Iframe Safe) */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-red-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Revocar y Eliminar Cuenta</h3>
                <p className="text-xs text-slate-400">Acción permanente e irreversible</p>
              </div>
            </div>
            <p className="text-sm text-slate-300">
              ¿Está seguro de revocar permanentemente los accesos y eliminar la cuenta de <strong className="text-white">{userToDelete.name}</strong>?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 transition text-sm font-semibold min-h-[44px] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteUser}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white transition text-sm font-semibold shadow-lg shadow-red-900/40 min-h-[44px] cursor-pointer flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar Cuenta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
