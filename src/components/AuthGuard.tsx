/**
 * Puro Apure ERP - AuthGuard & ABAC Route / Module Protector
 * Gobierna el acceso a URLs y módulos según el rol (SUPERADMIN, ADMIN, OBRERO)
 * 
 * Reglas Estrictas:
 * 1. OBRERO: Bloquea 'Dashboard Financiero', 'Big Data' (Analítica/EBITDA), 'Constructor de Esquemas'
 *    y 'Gobernanza IAM'. Redirige a su panel operativo base ('INVENTARIOS').
 * 2. ADMIN: Bloquea 'Constructor de Esquemas' (SchemaBuilder exclusivo de SuperAdmin).
 * 3. SUPERADMIN: Acceso irrestricto a todas las rutas y módulos.
 */

import React from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, Loader2, Lock, ArrowRight } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  redirectToLogin?: () => void;
  // Validación granular opcional por ruta/módulo
  requiredRole?: 'SUPERADMIN' | 'ADMIN' | 'OBRERO' | 'AUTHENTICATED';
  disallowedRoles?: ('SUPERADMIN' | 'ADMIN' | 'OBRERO' | 'USUARIO')[];
  resourceName?: string;
  onRedirectToDefault?: () => void;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({
  children,
  fallback,
  redirectToLogin,
  requiredRole = 'AUTHENTICATED',
  disallowedRoles = [],
  resourceName = 'Módulo Protegido',
  onRedirectToDefault,
}) => {
  const { currentUser, userProfile, loading, isSuperAdmin, isAdmin, isObrero, role } = useAuth();

  React.useEffect(() => {
    if (!loading && !currentUser) {
      if (redirectToLogin) {
        redirectToLogin();
      } else if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.history.pushState({}, '', '/login');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }
  }, [loading, currentUser, redirectToLogin]);

  // Pantalla de carga
  if (loading) {
    return (
      fallback || (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200">
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-2xl">
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            <div>
              <h2 className="text-base font-semibold tracking-wide uppercase text-slate-100">
                Puro Apure ERP Security Guard
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Verificando políticas de acceso ABAC y jerarquía IAM...
              </p>
            </div>
          </div>
        </div>
      )
    );
  }

  // 1. Usuario no autenticado: Bloqueo total
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-3xl p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 mx-auto flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white tracking-tight">Acceso Privado Restringido</h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            AuthGuard ha bloqueado la carga de la vista. Se requiere una sesión activa autorizada en el ERP.
          </p>
          <a
            href="/login"
            onClick={(e) => {
              e.preventDefault();
              if (redirectToLogin) redirectToLogin();
            }}
            className="inline-block w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs transition-colors shadow-lg shadow-emerald-950"
          >
            Ir al Portal de Identificación
          </a>
        </div>
      </div>
    );
  }

  // 2. Control de Acceso Basado en Atributos (ABAC) & Jerarquía de Roles
  let isAccessDenied = false;
  let denialReason = '';

  // Regla A: Si el rol está en disallowedRoles
  if (disallowedRoles.includes(role)) {
    isAccessDenied = true;
    denialReason = `El rol "${role}" no tiene autorización para acceder a ${resourceName}.`;
  }

  // Regla B: Validación por nivel de rol requerido
  if (requiredRole === 'SUPERADMIN' && !isSuperAdmin) {
    isAccessDenied = true;
    denialReason = `El recurso "${resourceName}" es de acceso exclusivo para SUPERADMIN.`;
  } else if (requiredRole === 'ADMIN' && !isAdmin) {
    isAccessDenied = true;
    denialReason = `El recurso "${resourceName}" requiere privilegios administrativos (ADMIN o SUPERADMIN).`;
  }

  // Renderizado de Bloqueo por Permisos Insuficientes
  if (isAccessDenied) {
    return (
      <div className="p-8 max-w-lg mx-auto my-12 bg-slate-900 border border-purple-800/40 rounded-3xl text-center space-y-4 shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-purple-950/80 border border-purple-500/40 text-purple-400 mx-auto flex items-center justify-center">
          <Lock className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-red-950 border border-red-800 text-red-300 font-bold uppercase">
            Acceso Denegado por AuthGuard (ABAC)
          </span>
          <h3 className="text-base font-bold text-white tracking-tight mt-2">
            Restricción de Perímetro: {resourceName}
          </h3>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed font-sans">
          {denialReason}
        </p>
        <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 text-left space-y-1 font-mono text-[11px] text-slate-400">
          <div><strong className="text-slate-300">Usuario:</strong> {userProfile?.email}</div>
          <div><strong className="text-slate-300">Rol Activo:</strong> <span className="text-purple-400 font-bold">{role}</span></div>
          <div><strong className="text-slate-300">Nivel de Acceso:</strong> {isSuperAdmin ? 'ROOT' : isAdmin ? 'MANAGEMENT' : isObrero ? 'OPERATIVE (Campo)' : 'GUEST'}</div>
        </div>

        {onRedirectToDefault && (
          <button
            onClick={onRedirectToDefault}
            className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-purple-950 active:scale-95"
          >
            <span>Retornar a mi Panel Operativo Base</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  // Usuario autorizado
  return <>{children}</>;
};

/**
 * HOC variant of AuthGuard
 */
export function withAuthGuard<P extends object>(
  Component: React.ComponentType<P>,
  options?: {
    fallback?: React.ReactNode;
    requiredRole?: 'SUPERADMIN' | 'ADMIN' | 'OBRERO' | 'AUTHENTICATED';
    disallowedRoles?: ('SUPERADMIN' | 'ADMIN' | 'OBRERO' | 'USUARIO')[];
    resourceName?: string;
  }
): React.FC<P> {
  return function ProtectedRoute(props: P) {
    return (
      <AuthGuard
        fallback={options?.fallback}
        requiredRole={options?.requiredRole}
        disallowedRoles={options?.disallowedRoles}
        resourceName={options?.resourceName}
      >
        <Component {...props} />
      </AuthGuard>
    );
  };
}
