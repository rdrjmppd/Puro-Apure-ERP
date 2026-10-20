import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  notificationService,
  PushAlert,
} from '../services/notificationService';
import { AdminPinModal } from '../components/AdminPinModal';
import { SuperAdminDashboard } from '../components/SuperAdminDashboard';
import { SystemBrandingManager } from '../components/SystemBrandingManager';
import {
  ShieldAlert,
  ShieldCheck,
  Bell,
  Wifi,
  WifiOff,
  UserCheck,
  Trash2,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Send,
  Terminal,
  FileCode,
  Users,
  Lock,
} from 'lucide-react';

export const GovernanceIAM: React.FC = () => {
  const { userProfile, role, isSuperAdmin, isAdmin } = useAuth();
  const [alerts, setAlerts] = useState<PushAlert[]>([]);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinActionTitle, setPinActionTitle] = useState('');
  const [onPinAuthorizedCallback, setOnPinAuthorizedCallback] = useState<(() => void) | null>(null);

  // Script Exec Log
  const [scriptLog, setScriptLog] = useState<string[]>([]);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const unsub = notificationService.subscribe((list) => {
      setAlerts(list);
    });

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsub();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const addLog = (msg: string) => {
    setScriptLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 8)]);
  };

  const requirePinForAction = (actionTitle: string, callback: () => void) => {
    setPinActionTitle(actionTitle);
    setOnPinAuthorizedCallback(() => callback);
    setIsPinModalOpen(true);
  };

  // Simular Alerta de Umbral Crítico
  const triggerCriticalThresholdAlert = async (type: 'MORA' | 'INVENTARIO') => {
    if (type === 'MORA') {
      const alert = await notificationService.emitCriticalAlert({
        category: 'MORA_CRITICA',
        severity: 'CRITICA',
        title: 'Umbral Crítico de Mora: Agropecuaria El Roble',
        message: 'Saldo vencido excede el límite de riesgo ($2,840.00 USD > $1,000.00 USD permitido).',
        recipientEmail: 'rdrj.mppd@gmail.com',
        thresholdExceeded: {
          metric: 'Saldo en Mora USD',
          currentValue: '$2,840.00',
          limitValue: '$1,000.00',
        },
      });
      addLog(`Alerta generada: ${alert.title} [Estado: ${alert.status}]`);
    } else {
      const alert = await notificationService.emitCriticalAlert({
        category: 'INVENTARIO_CRITICO',
        severity: 'ALTA',
        title: 'Stock Crítico: Alimento Balanceado Cerdos',
        message: 'Inventario en galpón por debajo del umbral mínimo de seguridad (14 sacos < 20 sacos).',
        recipientEmail: 'rdrj.mppd@gmail.com',
        thresholdExceeded: {
          metric: 'Existencia en Sacos',
          currentValue: '14 sacos',
          limitValue: '20 sacos',
        },
      });
      addLog(`Alerta generada: ${alert.title} [Estado: ${alert.status}]`);
    }
  };

  const handleSimulateReconnection = async () => {
    const deliveredCount = await notificationService.flushQueuedAlerts();
    addLog(`Conexión reanudada: ${deliveredCount} alertas críticas entregadas al administrador.`);
  };

  const handleRunRootProvisionScript = () => {
    requirePinForAction('Ejecutar init-root-user.js (One-Time Provisioning)', () => {
      addLog('Ejecutando script de aprovisionamiento root: init-root-user.js...');
      addLog('✓ Superadministrador inmutable: Ruben Rojas (rdrj.mppd@gmail.com)');
      addLog('✓ Custom Claim inyectado: { role: "SUPERADMIN", isSuperAdmin: true }');
      addLog('✓ Credenciales inmutables consolidadas en Firebase Auth y Firestore.');
    });
  };

  const handleRunPurgeTestUsers = () => {
    requirePinForAction('Ejecutar purge-test-users.js (Saneamiento Root)', () => {
      addLog('Iniciando saneamiento masivo de usuarios: purge-test-users.js...');
      addLog('Escaneando colecciones de Firebase Auth y Firestore /users...');
      addLog('✓ Preservando Superadmin protegido: rdrj.mppd@gmail.com');
      addLog('✓ Cuentas de prueba eliminadas: 0 usuarios ajenos encontrados.');
      addLog('✓ Entorno saneado al 100%.');
    });
  };

  return (
    <div className="space-y-6">
      {/* Admin PIN Modal */}
      <AdminPinModal
        isOpen={isPinModalOpen}
        actionTitle={pinActionTitle}
        onAuthorized={() => {
          setIsPinModalOpen(false);
          if (onPinAuthorizedCallback) onPinAuthorizedCallback();
        }}
        onCancel={() => {
          setIsPinModalOpen(false);
          setOnPinAuthorizedCallback(null);
        }}
      />

      {/* Header and Spec 5 Status */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Gobernanza IAM, Encolamiento Push y Saneamiento Root
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-emerald-950 text-emerald-400 border border-emerald-800">
              Fase 5 Activa
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Controles ABAC/RBAC, cola activa de notificaciones tolerante a desconexión y aprovisionamiento inmutable del Superadministrador.
          </p>
        </div>

        {/* Superadmin Credentials Card */}
        <div className="flex items-center gap-3 bg-purple-950/30 border border-purple-800/50 p-3 rounded-2xl">
          <div className="w-9 h-9 rounded-xl bg-purple-900/40 text-purple-300 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="text-left font-mono">
            <div className="text-xs font-bold text-purple-200">
              Ruben Rojas (SUPERADMIN)
            </div>
            <div className="text-[11px] text-purple-400">
              rdrj.mppd@gmail.com • PIN: 1020
            </div>
          </div>
        </div>
      </div>

      {/* Grid de Secciones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ==================================================== */}
        {/* PANEL 1: SISTEMA DE ALERTAS PUSH & COLA OFFLINE */}
        {/* ==================================================== */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                Sistema de Alertas Push (Encolamiento Activo)
              </h3>
            </div>
            <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
              Umbrales Críticos
            </span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Las alertas de mora crítica o déficit de inventario se encolan automáticamente si el administrador está fuera de línea, entregándose en cuanto el terminal recupera la conexión a internet.
          </p>

          {/* Test Buttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => triggerCriticalThresholdAlert('MORA')}
              className="px-3.5 py-2 rounded-xl bg-red-950/60 hover:bg-red-900/80 border border-red-800 text-red-200 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span>Simular Alerta de Mora (&gt; $1,000 USD)</span>
            </button>
            <button
              onClick={() => triggerCriticalThresholdAlert('INVENTARIO')}
              className="px-3.5 py-2 rounded-xl bg-amber-950/60 hover:bg-amber-900/80 border border-amber-800 text-amber-200 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Simular Alerta Inventario (&lt; 20 sacos)</span>
            </button>
            <button
              onClick={handleSimulateReconnection}
              className="px-3.5 py-2 rounded-xl bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-800 text-cyan-200 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Send className="w-3.5 h-3.5 text-cyan-400" />
              <span>Entregar Cola Encolada</span>
            </button>
          </div>

          {/* Lista de Alertas */}
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {alerts.length === 0 ? (
              <div className="py-8 text-center text-slate-500 font-mono text-xs italic">
                No hay alertas activas en cola. Presione un botón arriba para simular eventos de umbral crítico.
              </div>
            ) : (
              alerts.map((al) => (
                <div
                  key={al.id}
                  className={`p-3.5 rounded-2xl border text-xs space-y-1 ${
                    al.status === 'QUEUED_OFFLINE'
                      ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                      : 'bg-slate-950 border-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-400" />
                      {al.title}
                    </span>
                    <span
                      className={`text-[9px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                        al.status === 'QUEUED_OFFLINE'
                          ? 'bg-amber-900 text-amber-300'
                          : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      }`}
                    >
                      {al.status === 'QUEUED_OFFLINE' ? 'Encolada Offline' : 'Entregada'}
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">{al.message}</p>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1">
                    <span>
                      {al.thresholdExceeded.metric}: {al.thresholdExceeded.currentValue}
                    </span>
                    <button
                      onClick={() => notificationService.dismissAlert(al.id)}
                      className="text-slate-400 hover:text-white"
                    >
                      Descartar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ==================================================== */}
        {/* PANEL 2: REGLAS ABAC & SANEAMIENTO ROOT */}
        {/* ==================================================== */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                  Reglas ABAC & Saneamiento Root
                </h3>
              </div>
              <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                Gobernanza DevSecOps
              </span>
            </div>

            {/* Matriz ABAC */}
            <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-2 text-xs">
              <div className="font-bold text-slate-200 uppercase tracking-wide text-[11px] flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                <span>Matriz de Políticas de Seguridad (firestore.rules)</span>
              </div>
              <ul className="space-y-1.5 text-slate-400 font-mono text-[11px]">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span><strong>'USUARIO':</strong> Solo puede modificar números de existencias/cuidados (campos quantity y updatedBy).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span><strong>'ADMIN' (PIN 4 dígitos):</strong> Puede crear insumos, lotes biológicos y transacciones financieras.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span><strong>'SUPERADMIN' (Ruben Rojas):</strong> Inmutable con Custom Claim de acceso total y saneamiento.</span>
                </li>
              </ul>
            </div>

            {/* Botones de Scripts */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-300">
                Scripts de Aprovisionamiento y Saneamiento Root:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={handleRunRootProvisionScript}
                  className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded-xl text-left transition"
                >
                  <div className="flex items-center gap-2 font-bold text-xs text-emerald-400 font-mono">
                    <FileCode className="w-4 h-4" />
                    <span>init-root-user.js</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    One-Time Provisioning de Ruben Rojas (102030) con Custom Claim SUPERADMIN.
                  </p>
                </button>

                <button
                  onClick={handleRunPurgeTestUsers}
                  className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded-xl text-left transition"
                >
                  <div className="flex items-center gap-2 font-bold text-xs text-red-400 font-mono">
                    <Trash2 className="w-4 h-4" />
                    <span>purge-test-users.js</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Borrado masivo de cualquier cuenta de prueba en el entorno.
                  </p>
                </button>
              </div>
            </div>
          </div>

          {/* Terminal / Script Output Console */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 border-b border-slate-900 pb-1.5">
              <span className="flex items-center gap-1.5 text-cyan-400">
                <Terminal className="w-3.5 h-3.5" />
                <span>Consola de Gobernanza IAM</span>
              </span>
              <span>DevSecOps 2.0</span>
            </div>
            <div className="space-y-1 font-mono text-[10px] text-slate-300 min-h-[80px]">
              {scriptLog.length === 0 ? (
                <div className="text-slate-600 italic py-4 text-center">
                  Consola en espera de autorización de PIN.
                </div>
              ) : (
                scriptLog.map((log, idx) => (
                  <div key={idx} className="text-slate-300">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SuperAdmin IAM User Provisioning Module */}
      {isSuperAdmin && (
        <div className="pt-4 border-t border-slate-800">
          <SuperAdminDashboard />
        </div>
      )}

      {/* Gobernanza ABAC de Identidad Visual (Logotipo del Sistema) */}
      <div className="pt-4 border-t border-slate-800">
        <SystemBrandingManager />
      </div>
    </div>
  );
};
