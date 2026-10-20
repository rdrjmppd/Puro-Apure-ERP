import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useBrand } from '../context/BrandContext';
import { Lock, Mail, ShieldCheck, AlertCircle, Wifi, WifiOff, Sprout, Sun, Moon, Maximize, Minimize } from 'lucide-react';

interface LoginProps {
  onNavigateToDashboard?: () => void;
}

export const Login: React.FC<LoginProps> = ({ onNavigateToDashboard }) => {
  const { loginWithCredentials, loginWithGoogle, isConfigured } = useAuth();
  const { theme, toggleTheme, isFullscreen, toggleFullscreen } = useTheme();
  const { logoUrl } = useBrand();

  // STRICT REQUIREMENT: Formulario en blanco sin autocompletado ni cuentas de prueba
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('Debe ingresar manualmente tanto el correo electrónico como la clave de acceso.');
      return;
    }

    setIsSubmitting(true);
    try {
      await loginWithCredentials(email.trim(), password);
      if (onNavigateToDashboard) {
        onNavigateToDashboard();
      } else {
        window.history.pushState({}, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido al autenticar credenciales.';
      if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password') || msg.includes('auth/user-not-found')) {
        setErrorMessage('Credenciales inválidas. Ingrese el correo y la contraseña correctos.');
      } else if (msg.includes('auth/network-request-failed')) {
        setErrorMessage('Sin conexión al servidor central. Verifique la conectividad de red local.');
      } else if (msg.includes('auth/configuration-not-found') || msg.includes('auth/operation-not-allowed')) {
        setErrorMessage('Proveedor no activado en Firebase: Habilite "Correo electrónico/contraseña" en Firebase Console > Authentication > Sign-in method, o acceda con las credenciales de Superadministrador.');
      } else {
        setErrorMessage(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await loginWithGoogle();
      if (onNavigateToDashboard) {
        onNavigateToDashboard();
      } else {
        window.history.pushState({}, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Fallo en la autenticación federada.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col justify-between items-center p-4 relative overflow-hidden transition-colors duration-200 ${
      theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
    }`}>
      {/* Background industrial grid pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#166534_1px,transparent_1px)] [background-size:24px_24px] opacity-15 pointer-events-none" />

      {/* Top action bar: Status + Theme Switcher + Fullscreen */}
      <div className="w-full max-w-md flex items-center justify-between z-20 pt-2 pb-4">
        {/* Connection status badge */}
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs ${
          theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-white border-slate-300 text-slate-700 shadow-sm'
        }`}>
          {isOnline ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-500" />
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-medium">Enlace Activo</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-mono text-amber-600 dark:text-amber-400 font-medium">Modo Offline Local</span>
            </>
          )}
        </div>

        {/* Accessibility & Visual Controls */}
        <div className="flex items-center gap-2">
          {/* Theme switcher button (Touch target 44x44px) */}
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
            aria-label="Cambiar tema de color"
            className={`w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border transition-all active:scale-95 ${
              theme === 'dark'
                ? 'bg-slate-900 border-slate-800 text-amber-400 hover:bg-slate-800'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-200 shadow-sm'
            }`}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Fullscreen button (Touch target 44x44px) */}
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Salir de Pantalla Completa' : 'Modo Pantalla Completa'}
            aria-label="Alternar pantalla completa"
            className={`w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border transition-all active:scale-95 ${
              theme === 'dark'
                ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-200 shadow-sm'
            }`}
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <div className="w-full max-w-md relative z-10 my-auto">
        {/* Brand Header con Logotipo Oficial (Strictly Read-Only / SSoT) */}
        <div className="text-center mb-6">
          <div className="inline-block">
            {/* Contenedor Área de Respeto sobre fondo Blanco (#FFFFFF) */}
            <div className="inline-block p-7 sm:p-8 rounded-3xl bg-white shadow-2xl border border-slate-200/90 mb-3">
              <img
                src={logoUrl}
                alt="Puro Apure Logotipo Oficial Full Color"
                className="w-52 sm:w-60 min-w-[180px] h-auto object-contain mx-auto block select-none"
                loading="eager"
                onError={(e) => {
                  e.currentTarget.src = '/puro_apure_logo.png';
                }}
              />
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-heading text-slate-900 dark:text-white">
            Puro Apure ERP
          </h1>
          <p className="text-xs uppercase tracking-widest text-[#13381B] dark:text-[#EAD2B2] font-bold mt-1 font-body">
            Gestión Bimonetaria y Trazabilidad Biológica
          </p>
          <div className={`mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-md border ${
            theme === 'dark' ? 'bg-slate-900/90 text-slate-300 border-slate-800' : 'bg-white text-slate-700 border-slate-300 shadow-sm'
          }`}>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Entorno Restrictivo Spec-Driven • Offline-First PWA</span>
          </div>
        </div>

        {/* Login Card */}
        <div className={`backdrop-blur border rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 ${
          theme === 'dark' ? 'bg-slate-900/95 border-slate-800' : 'bg-white border-slate-200 shadow-xl'
        }`}>
          <div className={`border-b pb-4 ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
            <h2 className="text-base font-semibold">
              Autenticación de Operador
            </h2>
            <p className={`text-xs mt-0.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
              Ingrese manualmente sus credenciales. Autocompletado deshabilitado.
            </p>
          </div>

          {!isConfigured && (
            <div className="p-4 rounded-2xl bg-amber-950/60 border border-amber-500/50 text-amber-200 text-xs space-y-2 animate-fadeIn">
              <div className="flex items-center gap-2 font-bold text-amber-300">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Configuración de Firebase Requerida (DevSecOps)</span>
              </div>
              <p className="text-[11px] text-amber-300/80 leading-relaxed font-mono">
                Faltan variables de entorno en el cliente. Inserte las claves reales (ej. <code className="bg-amber-900/60 px-1 py-0.5 rounded text-amber-100">NEXT_PUBLIC_FIREBASE_API_KEY</code>) en los secretos de Google AI Studio o en su archivo <code className="bg-amber-900/60 px-1 py-0.5 rounded text-amber-100">.env.local</code> para activar la autenticación en vivo.
              </p>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-start gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed font-mono">{errorMessage}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Identificador / Correo Corporativo
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operador@agroindustria.local"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 transition outline-none font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Clave de Seguridad
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 transition outline-none font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-semibold rounded-xl text-sm shadow-lg shadow-emerald-900/30 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Validando en Servidor / Caché...</span>
                </>
              ) : (
                <span>Validar y Entrar al Sistema</span>
              )}
            </button>
          </form>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-slate-900 px-3 text-slate-500 font-mono">
                O acceso federado
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium rounded-xl text-xs transition duration-150 flex items-center justify-center gap-2.5 disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Iniciar con Identidad de Dominio Google</span>
          </button>

          {/* Infrastructure Security Seal */}
          <div className="pt-2 text-center border-t border-slate-800/80">
            <span className="text-[10px] text-slate-500 font-mono block">
              AES-256 Client-Side Token Isolation • IndexedDB Native Cache Enabled
            </span>
          </div>
        </div>
      </div>

      {/* Global Static Footer */}
      <footer className="w-full text-center py-4 text-xs font-mono text-slate-500 z-20">
        Derechos de desarrollo reservados a AR Group 2026
      </footer>
    </div>
  );
};
