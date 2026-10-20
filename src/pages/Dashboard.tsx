import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useBrand } from '../context/BrandContext';
import {
  offlineSyncEngine,
  SyncEngineStatus,
} from '../services/offlineSyncEngine';
import { InventoryManagement } from './InventoryManagement';
import { FinancialLedger } from './FinancialLedger';
import { FinancialAnalytics } from './FinancialAnalytics';
import { GovernanceIAM } from './GovernanceIAM';
import { DevSecOpsAudit } from './DevSecOpsAudit';
import { ConsolidatedExecutiveDashboard } from '../components/ConsolidatedExecutiveDashboard';
import { UserOperationalManualModal } from '../components/UserOperationalManualModal';
import { SchemaBuilder } from '../components/SchemaBuilder';
import { HumanResourcesDashboard } from './HumanResourcesDashboard';
import { AuthGuard } from '../components/AuthGuard';
import { QAAutomationModal } from '../components/QAAutomationModal';
import { FloatingAIAssistant } from '../components/FloatingAIAssistant';
import { useStartupAlerts } from '../hooks/useStartupAlerts';
import { StartupAlertsModal } from '../components/StartupAlertsModal';
import { FinanceService } from '../services/financeService';
import { DualEntity, BillingInvoice } from '../types/finance';

const WhatsAppWebCloneView = React.lazy(() =>
  import('../components/crm/WhatsAppWebCloneView').then((m) => ({ default: m.WhatsAppWebCloneView }))
);
const LectorComprobanteOCRModal = React.lazy(() =>
  import('../components/finanzas/LectorComprobanteOCRModal').then((m) => ({ default: m.LectorComprobanteOCRModal }))
);
import {
  LogOut,
  RefreshCw,
  Wifi,
  WifiOff,
  Database,
  Cpu,
  Shield,
  ShieldCheck,
  Layers,
  CheckCircle2,
  HardDrive,
  Activity,
  PlusCircle,
  FileCode2,
  Package,
  DollarSign,
  BarChart3,
  ShieldAlert,
  Zap,
  Menu,
  X,
  Sun,
  Moon,
  Maximize,
  Minimize,
  Sprout,
  LayoutDashboard,
  BookOpen,
  Users,
  MessageSquare,
  Upload,
  AlertTriangle,
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { userProfile, handleSignOut, role, isSuperAdmin } = useAuth();
  const { theme, toggleTheme, isFullscreen, toggleFullscreen } = useTheme();
  const { logoUrl, openUploadModal, isCustom } = useBrand();
  const [activeModule, setActiveModule] = useState<'PANEL_CONTROL' | 'INVENTARIOS' | 'FINANZAS' | 'CRM' | 'RRHH' | 'ANALITICA' | 'GOBERNANZA' | 'AUDITORIA' | 'TELEMETRIA' | 'ESQUEMAS'>('PANEL_CONTROL');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showQAModal, setShowQAModal] = useState(false);

  // Estados de CRM y Lector OCR Forense flotante
  const [crmOcrModalOpen, setCrmOcrModalOpen] = useState(false);
  const [crmOcrImageDataUrl, setCrmOcrImageDataUrl] = useState<string | null>(null);
  const [crmOcrClientPhone, setCrmOcrClientPhone] = useState<string | undefined>(undefined);
  const [crmEntities, setCrmEntities] = useState<DualEntity[]>([]);
  const [crmInvoices, setCrmInvoices] = useState<BillingInvoice[]>([]);
  const [crmBcvRate, setCrmBcvRate] = useState<number>(1);
  const [syncStatus, setSyncStatus] = useState<SyncEngineStatus>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    pendingCount: 0,
    lastSyncTime: null,
    nextSyncCountdownSeconds: 0,
    totalSavedBytes: 0,
    isDebouncing: false,
    lastActivityTimestamp: null,
    mode: 'IDLE_QUIESCENT',
  });
  const [testLog, setTestLog] = useState<string[]>([]);
  const [isPurging, setIsPurging] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const confirmTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hook de Alarmas de Inicio (Insumos Críticos & Cuentas por Pagar)
  const {
    digest,
    isModalOpen: isAlertsModalOpen,
    openModal: openAlertsModal,
    closeModal: closeAlertsModal,
    snooze24h: snoozeAlerts24h,
    totalAlertCount,
    hasCriticalAlert,
    isObrero,
  } = useStartupAlerts({ userRole: role });

  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    // ABAC Guard: Obrero no tiene acceso a módulos ejecutivos/financieros, CRM, RRHH ni a schemas
    // Si su activeModule apunta a uno restringido, redirigirlo inmediatamente a su panel base
    if (role === 'OBRERO' && (activeModule === 'PANEL_CONTROL' || activeModule === 'FINANZAS' || activeModule === 'CRM' || activeModule === 'RRHH' || activeModule === 'ANALITICA' || activeModule === 'ESQUEMAS' || activeModule === 'GOBERNANZA')) {
      setActiveModule('INVENTARIOS');
    }
    // Admin no tiene acceso a SchemaBuilder
    if (!isSuperAdmin && activeModule === 'ESQUEMAS') {
      setActiveModule('INVENTARIOS');
    }
  }, [role, isSuperAdmin, activeModule]);

  // Cargar entidades duales e invoices para el enriquecimiento y cruce directo en CRM / WhatsApp
  useEffect(() => {
    const unsubE = FinanceService.subscribeDualEntities(setCrmEntities);
    const unsubI = FinanceService.subscribeInvoices(setCrmInvoices);
    const unsubR = FinanceService.subscribeLatestRate((r) => {
      if (r > 0) setCrmBcvRate(r);
    });
    return () => {
      unsubE();
      unsubI();
      unsubR();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = offlineSyncEngine.subscribe((status) => {
      setSyncStatus(status);
    });
    const handleCustomNav = (e: any) => {
      if (e.detail) {
        setActiveModule(e.detail);
      }
    };
    window.addEventListener('agroerp:navigate', handleCustomNav);
    return () => {
      unsubscribe();
      window.removeEventListener('agroerp:navigate', handleCustomNav);
    };
  }, []);

  const handleManualFlush = async () => {
    const result = await offlineSyncEngine.flushQueue();
    addLog(`Sincronización manual forzada: ${result.syncedCount} elementos procesados en batch, ${result.errors} errores.`);
  };

  const handleTestEnqueue = async () => {
    const docId = `item_${Date.now()}`;
    await offlineSyncEngine.enqueueMutation(
      'inventory',
      docId,
      'SET',
      {
        id: docId,
        category: 'INSUMO',
        name: `Prueba Alimento Balanceado Lote #${Math.floor(Math.random() * 1000)}`,
        quantity: 50,
        unit: 'sacos',
        unitCostUSD: 40.0,
        lastUpdatedTimestamp: Date.now(),
        updatedBy: userProfile?.uid || 'offline_worker',
      },
      { device: 'Android Low-RAM Emulator', bufferStrategy: 'lz_compress' }
    );
    addLog(`Mutación local agregada: ${docId}. Debounce activado: cuenta regresiva de 30s iniciada.`);
  };

  const handleSimulateTyping = () => {
    offlineSyncEngine.recordActivity();
    addLog('Tipeo en formulario registrado: Debounce reiniciado a 30s. Subida postergada.');
  };

  const addLog = (msg: string) => {
    setTestLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 7)]);
  };

  const onSignOutClick = async () => {
    // Si aún no está en modo confirmación, activar estado de advertencia visual reactiva
    if (!confirmSignOut) {
      setConfirmSignOut(true);
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
      // Auto-revertir tras 5 segundos si el usuario no pulsa el segundo toque
      confirmTimeoutRef.current = setTimeout(() => {
        setConfirmSignOut(false);
      }, 5000);
      return;
    }

    // Segundo toque confirmado en la UI (Bypass absoluto de sandbox iframe y diálogos nativos)
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    setConfirmSignOut(false);
    setIsPurging(true);
    try {
      await handleSignOut();
    } catch (err) {
      console.error('[Dashboard] Error al ejecutar handleSignOut:', err);
      setIsPurging(false);
    }
  };

  const isObreroUser = role === 'OBRERO';

  const allNavModules = [
    { id: 'PANEL_CONTROL' as const, label: 'Panel Ejecutivo', icon: LayoutDashboard, badge: 'Fase 5', color: 'emerald', restrictedToObrero: true },
    { id: 'INVENTARIOS' as const, label: 'Biomasa & Lotes', icon: Package, badge: 'Operativo', color: 'emerald', restrictedToObrero: false },
    { id: 'FINANZAS' as const, label: 'Finanzas BCV', icon: DollarSign, badge: 'Fase 4', color: 'emerald', restrictedToObrero: true },
    { id: 'CRM' as const, label: 'CRM & WhatsApp', icon: MessageSquare, badge: 'En Vivo', color: 'emerald', restrictedToObrero: true },
    { id: 'RRHH' as const, label: 'Talento Humano', icon: Users, badge: 'Nómina', color: 'blue', restrictedToObrero: true },
    { id: 'ANALITICA' as const, label: 'EBITDA & Export.', icon: BarChart3, badge: 'Big Data', color: 'emerald', restrictedToObrero: true },
    { id: 'GOBERNANZA' as const, label: 'Gobernanza IAM', icon: ShieldAlert, badge: 'Seguridad', color: 'purple', restrictedToObrero: true },
    ...(isSuperAdmin
      ? [{ id: 'ESQUEMAS' as const, label: 'Constructor Esquemas', icon: Layers, badge: 'SuperAdmin', color: 'purple', restrictedToObrero: true }]
      : []),
    { id: 'AUDITORIA' as const, label: 'Auditoría & Estrés', icon: Zap, badge: 'DevSecOps', color: 'amber', restrictedToObrero: true },
    { id: 'TELEMETRIA' as const, label: 'Telemetría Sync', icon: Activity, badge: 'Offline', color: 'cyan', restrictedToObrero: false },
  ];

  const navModules = allNavModules.filter((m) => !isObreroUser || !m.restrictedToObrero);

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-200 ${
      theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
    }`}>
      {/* Field Operations & Induction Manual Modal */}
      <UserOperationalManualModal
        isOpen={showManualModal}
        onClose={() => setShowManualModal(false)}
      />

      {/* Top Navigation Bar with Mobile-First Adaptations */}
      <header className={`border-b sticky top-0 z-40 px-4 sm:px-6 py-3 flex items-center justify-between backdrop-blur transition-colors ${
        theme === 'dark' ? 'bg-slate-900/95 border-slate-800' : 'bg-white/95 border-slate-200 shadow-sm'
      }`}>
        <div className="flex items-center gap-3">
          {/* Mobile hamburger button (Touch target 44x44px) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú de navegación'}
            className={`md:hidden w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border transition active:scale-95 ${
              theme === 'dark'
                ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
            }`}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

          {/* Corporate Brand Identity - Logotipo Oficial Full Color (Dinámico y Reemplazable) */}
          <div className="flex items-center gap-3">
            <div
              onClick={openUploadModal}
              title="Haz clic para cargar o cambiar el logotipo desde tu equipo"
              className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200/90 shadow-sm flex items-center justify-center shrink-0 cursor-pointer hover:border-emerald-500 hover:shadow-md transition-all group relative"
            >
              <img
                src={logoUrl}
                alt="Puro Apure Logotipo Oficial"
                className="w-[100px] sm:w-[115px] min-w-[90px] h-auto object-contain block"
                loading="eager"
              />
              <span className="absolute -top-1 -right-1 p-1 rounded-full bg-emerald-600 text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                <Upload className="w-2.5 h-2.5" />
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-extrabold tracking-tight font-heading">
                  Puro Apure ERP
                </h1>
                <span className="hidden xs:inline-block text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                  Agroindustrial Pro
                </span>
              </div>
              <p className={`text-[11px] font-mono hidden sm:block ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                Gestión Bimonetaria y Trazabilidad Biológica • Offline-First PWA
              </p>
            </div>
          </div>
        </div>

        {/* Global Controls & Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Theme switcher (Touch target 44x44px) */}
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
            aria-label="Cambiar tema de color"
            className={`w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border transition active:scale-95 ${
              theme === 'dark'
                ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700'
                : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200 shadow-sm'
            }`}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Native Fullscreen button (Touch target 44x44px) */}
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Salir de Pantalla Completa' : 'Modo Pantalla Completa'}
            aria-label="Alternar pantalla completa"
            className={`w-11 h-11 min-w-[44px] min-h-[44px] hidden xs:flex items-center justify-center rounded-xl border transition active:scale-95 ${
              theme === 'dark'
                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200 shadow-sm'
            }`}
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>

          {/* Quick Start / Field Manual button (Touch target 44x44px) */}
          <button
            type="button"
            onClick={() => setShowManualModal(true)}
            title="Manual Operativo de Campo & Guía Rápida"
            aria-label="Abrir manual de operaciones de campo"
            className={`w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border transition active:scale-95 ${
              theme === 'dark'
                ? 'bg-slate-800 border-slate-700 text-emerald-400 hover:bg-slate-700'
                : 'bg-slate-100 border-slate-300 text-emerald-700 hover:bg-slate-200 shadow-sm'
            }`}
          >
            <BookOpen className="w-5 h-5" />
          </button>

          {/* Botón de Alarmas de Inicio (Insumos & CxP) */}
          {totalAlertCount > 0 && (
            <button
              type="button"
              onClick={openAlertsModal}
              title={`Alertas de Insumos y Vencimientos Activas (${totalAlertCount})`}
              aria-label="Abrir centro de alertas y recordatorios"
              className={`w-11 h-11 min-w-[44px] min-h-[44px] relative flex items-center justify-center rounded-xl border transition active:scale-95 ${
                hasCriticalAlert
                  ? 'bg-red-950/70 border-red-700 text-red-400 hover:bg-red-900/60 shadow-lg shadow-red-950/50'
                  : 'bg-amber-950/70 border-amber-700 text-amber-400 hover:bg-amber-900/60 shadow-lg shadow-amber-950/50'
              }`}
            >
              <AlertTriangle className={`w-5 h-5 ${hasCriticalAlert ? 'animate-pulse' : ''}`} />
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-red-600 text-white shadow">
                {totalAlertCount}
              </span>
            </button>
          )}

          {/* Cargar / Reemplazar Logotipo desde Equipo (Touch target 44x44px) */}
          <button
            type="button"
            onClick={openUploadModal}
            title={isCustom ? 'Reemplazar logotipo corporativo cargado' : 'Cargar logotipo desde este equipo'}
            aria-label="Cargar logotipo desde equipo"
            className={`w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border transition active:scale-95 ${
              isCustom
                ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-400 hover:bg-emerald-900/60 shadow-sm'
                : theme === 'dark'
                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:text-emerald-400 hover:bg-slate-700'
                : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-emerald-600 hover:bg-slate-200 shadow-sm'
            }`}
          >
            <Upload className="w-5 h-5" />
          </button>

          {/* Online/Offline Status Indicator */}
          <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono ${
            theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            {syncStatus.isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">ONLINE</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-amber-600 dark:text-amber-400 font-semibold">OFFLINE</span>
              </>
            )}
          </div>

          {/* User Profile Badge */}
          <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
            theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="w-6 h-6 rounded-lg bg-emerald-800 text-emerald-100 flex items-center justify-center text-xs font-bold">
              {userProfile?.displayName?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="text-left">
              <span className="text-xs font-semibold block leading-tight">
                {userProfile?.displayName || 'Operador'}
              </span>
              <span className="text-[10px] font-mono text-emerald-500 uppercase font-bold">
                {role}
              </span>
            </div>
          </div>

          {/* SignOut Button (Touch target min 44x44px - Reactive Dual-State Bypass) */}
          <button
            onClick={onSignOutClick}
            disabled={isPurging}
            title={confirmSignOut ? 'Haz clic de nuevo para confirmar cierre de sesión y purga' : 'Cerrar sesión y purgar IndexedDB'}
            aria-label="Cerrar sesión"
            className={`h-11 min-h-[44px] px-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all duration-200 active:scale-95 ${
              isPurging
                ? 'bg-amber-950/60 border border-amber-600/60 text-amber-300 cursor-wait'
                : confirmSignOut
                ? 'bg-red-600 hover:bg-red-700 text-white border border-red-400 shadow-lg shadow-red-900/60 animate-pulse font-bold'
                : 'bg-red-950/40 hover:bg-red-900/60 border border-red-700/50 text-red-300 hover:text-white'
            }`}
          >
            {isPurging ? (
              <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
            ) : confirmSignOut ? (
              <AlertTriangle className="w-4 h-4 text-white animate-bounce" />
            ) : (
              <LogOut className="w-4 h-4 text-red-400" />
            )}
            <span className="hidden sm:inline">
              {isPurging
                ? 'Purgando...'
                : confirmSignOut
                ? '¿Confirmar salida?'
                : 'Salir'}
            </span>
          </button>
        </div>
      </header>

      {/* Mobile Drawer Navigation (Overlay for Smartphones) */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer Content */}
          <div className={`relative w-4/5 max-w-sm h-full shadow-2xl flex flex-col p-6 z-10 transition-colors ${
            theme === 'dark' ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'
          }`}>
            <div className="flex items-center justify-between pb-4 border-b border-slate-700/40 mb-4">
              <div className="flex items-center gap-2.5">
                <div
                  onClick={() => {
                    setMobileMenuOpen(false);
                    openUploadModal();
                  }}
                  title="Haz clic para cargar el logotipo desde tu equipo"
                  className="px-2 py-1 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center shrink-0 cursor-pointer hover:border-emerald-500 transition"
                >
                  <img
                    src={logoUrl}
                    alt="Puro Apure Logotipo Oficial"
                    className="w-[95px] min-w-[90px] h-auto object-contain block"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/puro_apure_logo.png';
                    }}
                  />
                </div>
                <div>
                  <span className="font-bold text-sm font-heading block">Puro Apure ERP</span>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      openUploadModal();
                    }}
                    className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-1 font-semibold hover:underline cursor-pointer"
                  >
                    <Upload className="w-2.5 h-2.5" />
                    <span>{isCustom ? 'Cambiar Logo' : 'Cargar Logo'}</span>
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-slate-700 text-slate-400 hover:text-white"
                aria-label="Cerrar menú"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Mobile User Profile Details */}
            <div className={`p-3 rounded-2xl mb-4 border ${
              theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}>
              <div className="text-xs font-semibold">{userProfile?.displayName || 'Operador'}</div>
              <div className="text-[11px] font-mono text-slate-400 truncate">{userProfile?.email}</div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold">
                  ROL: {role}
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {syncStatus.isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>

            {/* Navigation Options for Mobile Field Workers */}
            <div className="flex-1 space-y-2 overflow-y-auto">
              {navModules.map((mod) => {
                const Icon = mod.icon;
                const isActive = activeModule === mod.id;
                return (
                  <button
                    key={mod.id}
                    onClick={() => {
                      setActiveModule(mod.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full min-h-[48px] px-4 py-3 rounded-xl text-left flex items-center justify-between transition-all active:scale-98 font-bold text-xs ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40'
                        : theme === 'dark'
                        ? 'bg-slate-950/60 text-slate-300 hover:bg-slate-800 border border-slate-800'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-emerald-500'}`} />
                      <span>{mod.label}</span>
                    </div>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {mod.badge}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Mobile Drawer Footer with Touch SignOut */}
            <div className="pt-4 border-t border-slate-700/40 space-y-3 text-center">
              <button
                onClick={onSignOutClick}
                disabled={isPurging}
                className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition active:scale-95 ${
                  isPurging
                    ? 'bg-amber-950/60 border border-amber-600/60 text-amber-300 cursor-wait'
                    : confirmSignOut
                    ? 'bg-red-600 hover:bg-red-700 text-white border border-red-400 shadow-lg shadow-red-900/60 animate-pulse font-bold'
                    : 'bg-red-950/40 hover:bg-red-900/60 border border-red-700/50 text-red-300 hover:text-white'
                }`}
              >
                {isPurging ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                ) : confirmSignOut ? (
                  <AlertTriangle className="w-4 h-4 text-white" />
                ) : (
                  <LogOut className="w-4 h-4 text-red-400" />
                )}
                <span>
                  {isPurging
                    ? 'Purgando almacenamiento...'
                    : confirmSignOut
                    ? 'Toca de nuevo para confirmar salida'
                    : 'Cerrar Sesión'}
                </span>
              </button>
              <p className="text-[10px] font-mono text-slate-500">
                Derechos de desarrollo reservados a AR Group 2026
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main View Area */}
      <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* Desktop Module Selector Tabs (Horizontal with Touch Targets) */}
        <div className={`hidden md:flex items-center justify-between p-2 rounded-2xl border transition-colors ${
          theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center gap-1.5 flex-wrap">
            {navModules.map((mod) => {
              const Icon = mod.icon;
              const isActive = activeModule === mod.id;
              return (
                <button
                  key={mod.id}
                  onClick={() => setActiveModule(mod.id)}
                  className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/30'
                      : theme === 'dark'
                      ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{mod.label}</span>
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                    isActive ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-800/80 text-slate-400'
                  }`}>
                    {mod.badge}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-400 pr-2">
            <span>Motor de Sincronía:</span>
            {syncStatus.mode === 'DEBOUNCING' ? (
              <span className="text-amber-500 font-bold animate-pulse">
                Debounce: {syncStatus.nextSyncCountdownSeconds}s
              </span>
            ) : syncStatus.mode === 'SYNCING' ? (
              <span className="text-cyan-500 font-bold animate-spin">
                Transmitiendo...
              </span>
            ) : (
              <span className="text-emerald-500 font-bold">
                Reposo (0 Cuota)
              </span>
            )}
          </div>
        </div>

        {/* Phase 5: Consolidated Executive Dashboard View */}
        {activeModule === 'PANEL_CONTROL' && (
          <ConsolidatedExecutiveDashboard
            onNavigateToModule={(mod) => {
              if (
                mod === 'INVENTARIOS' ||
                mod === 'FINANZAS' ||
                (mod as string) === 'RRHH' ||
                mod === 'ANALITICA' ||
                mod === 'GOBERNANZA' ||
                mod === 'AUDITORIA' ||
                mod === 'TELEMETRIA'
              ) {
                setActiveModule(mod as any);
              }
            }}
          />
        )}

        {/* Phase 6: DevSecOps Audit & Stress Test View */}
        {activeModule === 'AUDITORIA' && <DevSecOpsAudit />}

        {/* Phase 5: Governance IAM View */}
        {activeModule === 'GOBERNANZA' && <GovernanceIAM />}

        {/* Dynamic Schema Engine for Superadmin - Bloqueado para ADMIN y OBRERO */}
        {activeModule === 'ESQUEMAS' && (
          <AuthGuard
            requiredRole="SUPERADMIN"
            resourceName="Constructor de Esquemas (SchemaBuilder)"
            onRedirectToDefault={() => setActiveModule('INVENTARIOS')}
          >
            <SchemaBuilder />
          </AuthGuard>
        )}

        {/* Phase 4: Financial Analytics View - Bloqueado para OBRERO */}
        {activeModule === 'ANALITICA' && (
          <AuthGuard
            requiredRole="ADMIN"
            disallowedRoles={['OBRERO']}
            resourceName="Big Data & Analítica Financiera (EBITDA)"
            onRedirectToDefault={() => setActiveModule('INVENTARIOS')}
          >
            <FinancialAnalytics />
          </AuthGuard>
        )}

        {/* Phase 3: Financial Ecosystem View - Bloqueado para OBRERO */}
        {activeModule === 'FINANZAS' && (
          <AuthGuard
            requiredRole="ADMIN"
            disallowedRoles={['OBRERO']}
            resourceName="Dashboard Financiero & Flujo de Caja BCV"
            onRedirectToDefault={() => setActiveModule('INVENTARIOS')}
          >
            <FinancialLedger />
          </AuthGuard>
        )}

        {/* CRM & Clon de WhatsApp Web en Vivo - Bloqueado para OBRERO */}
        {activeModule === 'CRM' && (
          <AuthGuard
            requiredRole="ADMIN"
            disallowedRoles={['OBRERO']}
            resourceName="CRM & WhatsApp Web en Vivo"
            onRedirectToDefault={() => setActiveModule('INVENTARIOS')}
          >
            <React.Suspense
              fallback={
                <div className="flex items-center justify-center min-h-[400px] text-emerald-400 gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span className="text-sm font-semibold">Cargando WhatsApp Web CRM...</span>
                </div>
              }
            >
              <WhatsAppWebCloneView
                entities={crmEntities}
                invoices={crmInvoices}
                bcvRate={crmBcvRate}
                onAnalyzeReceiptOCR={(dataUrl, contact) => {
                  setCrmOcrImageDataUrl(dataUrl);
                  setCrmOcrClientPhone(contact?.telefonoE164);
                  setCrmOcrModalOpen(true);
                }}
                onNavigateToFinance={() => setActiveModule('FINANZAS')}
              />
            </React.Suspense>
          </AuthGuard>
        )}

        {/* Phase 2: Human Resources View - Bloqueado para OBRERO (Exclusivo ADMIN/SUPERADMIN) */}
        {activeModule === 'RRHH' && (
          <AuthGuard
            requiredRole="ADMIN"
            disallowedRoles={['OBRERO']}
            resourceName="Gestión de Talento Humano & Nómina"
            onRedirectToDefault={() => setActiveModule('INVENTARIOS')}
          >
            <HumanResourcesDashboard />
          </AuthGuard>
        )}

        {/* Phase 2: Active Module View */}
        {activeModule === 'INVENTARIOS' && (
          <InventoryManagement onNavigateToFinance={() => setActiveModule('FINANZAS')} />
        )}

        {/* Phase 1: Telemetry & Engine View */}
        {activeModule === 'TELEMETRIA' && (
          <div className="space-y-6">
            {/* Phase Verification Banner */}
            <div className="p-4 sm:p-5 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-semibold text-emerald-100">
                    Fase 2: Optimización de Telemetría y Sincronización Inteligente por Debounce
                  </h2>
                  <p className="text-xs text-emerald-300/80 mt-0.5">
                    Intervalo ciego fijo destruido • Algoritmo de Debounce de 30s condicionado a inactividad del usuario • Erradicación de saturación de cuotas en Firebase.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-900/40 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Estado: Debounce Activo & Compilado
                </span>
              </div>
            </div>

            {/* Debounce & Batch Synchronization Engine Telemetry Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {/* Card 1: Debounce Status */}
              <div className={`p-5 rounded-2xl border relative overflow-hidden ${
                theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
              }`}>
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="font-semibold uppercase tracking-wider">Algoritmo Debounce</span>
                  <HardDrive className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-3xl font-extrabold font-mono">
                  {syncStatus.mode === 'DEBOUNCING' ? (
                    <span className="text-amber-500">{syncStatus.nextSyncCountdownSeconds}s</span>
                  ) : syncStatus.mode === 'SYNCING' ? (
                    <span className="text-cyan-500 text-2xl">Transmitiendo</span>
                  ) : (
                    <span className="text-emerald-500 text-2xl">Reposo</span>
                  )}
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-1000 ease-linear ${
                      syncStatus.mode === 'DEBOUNCING' ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{
                      width: syncStatus.mode === 'DEBOUNCING'
                        ? `${((30 - syncStatus.nextSyncCountdownSeconds) / 30) * 100}%`
                        : syncStatus.mode === 'SYNCING'
                        ? '100%'
                        : '0%',
                    }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 font-mono mt-2">
                  {syncStatus.mode === 'DEBOUNCING'
                    ? 'Subida pospuesta: se enviará 30s tras última edición'
                    : 'Sin mutaciones pendientes. Cuotas de Firebase en reposo'}
                </p>
              </div>

              {/* Card 2: Pending Mutations in IndexedDB */}
              <div className={`p-5 rounded-2xl border relative overflow-hidden ${
                theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
              }`}>
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="font-semibold uppercase tracking-wider">Cola Local</span>
                  <Database className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-3xl font-extrabold font-mono text-amber-500">
                  {syncStatus.pendingCount}
                </div>
                <p className="text-[10px] text-slate-400 font-mono mt-3">
                  Mutaciones pendientes en IndexedDB
                </p>
                {syncStatus.isSyncing && (
                  <div className="inline-flex items-center gap-1.5 text-xs text-amber-400 mt-1">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Transmitiendo lote...</span>
                  </div>
                )}
              </div>

              {/* Card 3: Compression Optimization */}
              <div className={`p-5 rounded-2xl border relative overflow-hidden ${
                theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
              }`}>
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="font-semibold uppercase tracking-wider">Ahorro Datos</span>
                  <Cpu className="w-4 h-4 text-cyan-500" />
                </div>
                <div className="text-3xl font-extrabold font-mono text-cyan-500">
                  {(syncStatus.totalSavedBytes / 1024).toFixed(1)} <span className="text-base font-normal">KB</span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono mt-3">
                  Compresión delta en ráfagas batch
                </p>
              </div>

              {/* Card 4: Last Flush Timestamp */}
              <div className={`p-5 rounded-2xl border relative overflow-hidden ${
                theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
              }`}>
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="font-semibold uppercase tracking-wider">Última Sincronía</span>
                  <CheckCircle2 className="w-4 h-4 text-purple-500" />
                </div>
                <div className="text-lg font-bold font-mono text-slate-300 mt-1 truncate">
                  {syncStatus.lastSyncTime
                    ? new Date(syncStatus.lastSyncTime).toLocaleTimeString()
                    : 'Sin ejecuciones'}
                </div>
                <p className="text-[10px] text-slate-400 font-mono mt-3">
                  {syncStatus.lastSyncTime
                    ? 'Transmisión confirmada por Firebase'
                    : 'Esperando primer ciclo batch'}
                </p>
              </div>
            </div>

            {/* Interactive Operations Console for Mobile & Field QA */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Batch Action Buttons */}
              <div className={`border rounded-3xl p-6 space-y-4 ${
                theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
              }`}>
                <div className="border-b border-slate-700/50 pb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider">
                    Panel de Inyección &amp; Stress Test
                  </h3>
                  <span className="text-xs font-mono text-slate-400">
                    Controles de Emulación
                  </span>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  Pruebe el aislamiento de red insertando mutaciones en segundo plano. La cola de IndexedDB acumula las operaciones y las despacha de manera indivisible cada 30 segundos.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    onClick={handleTestEnqueue}
                    className="flex-1 min-h-[44px] py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-md shadow-emerald-950/30"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>+ Encolar Mutación (Inicia 30s)</span>
                  </button>

                  <button
                    onClick={handleSimulateTyping}
                    className="min-h-[44px] py-3 px-4 rounded-xl bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/50 text-amber-200 font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95"
                    title="Simula que el usuario sigue escribiendo en un formulario, reseteando el Debounce a 30s"
                  >
                    <Activity className="w-4 h-4 text-amber-400" />
                    <span>Simular Tipeo (Reset 30s)</span>
                  </button>

                  <button
                    onClick={handleManualFlush}
                    disabled={syncStatus.isSyncing}
                    className="min-h-[44px] py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${syncStatus.isSyncing ? 'animate-spin text-emerald-400' : ''}`} />
                    <span>Forzar Batch Flush</span>
                  </button>

                  <button
                    onClick={() => setShowQAModal(true)}
                    className="min-h-[44px] py-3 px-4 rounded-xl bg-cyan-950/70 hover:bg-cyan-900/80 border border-cyan-500/60 text-cyan-300 font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-md shadow-cyan-950/40"
                    title="Ejecutar suite de pruebas de automatización E2E para certificar resiliencia de red y cálculos zootécnicos/financieros"
                  >
                    <ShieldCheck className="w-4 h-4 text-cyan-400" />
                    <span>Suite QA E2E</span>
                  </button>
                </div>
              </div>

              {/* Event Log Output */}
              <div className={`border rounded-3xl p-6 flex flex-col justify-between ${
                theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
              }`}>
                <div>
                  <div className="flex items-center justify-between border-b border-slate-700/50 pb-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-cyan-500" />
                      <h3 className="text-sm font-bold uppercase tracking-wider">
                        Registro de Eventos de Cola Concurrente
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono text-cyan-500 font-bold">
                      Buffer Activo
                    </span>
                  </div>

                  <div className="space-y-2 min-h-[140px]">
                    {testLog.length === 0 ? (
                      <div className="text-xs text-slate-400 font-mono italic py-8 text-center">
                        Sin eventos recientes en la cola. Presione "+ Encolar" para probar la inserción local en IndexedDB y la agrupación por lotes.
                      </div>
                    ) : (
                      testLog.map((log, index) => (
                        <div
                          key={index}
                          className="text-xs font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-slate-300"
                        >
                          {log}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>Límite Batch Firestore: 400 docs / ráfaga</span>
                  <span>Intervalo: 30.000 ms</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Global QA Automation E2E Modal */}
      <QAAutomationModal
        isOpen={showQAModal}
        onClose={() => setShowQAModal(false)}
        theme={theme}
      />

      {/* Modal Emergente de Alertas y Recordatorios al Inicio */}
      <StartupAlertsModal
        isOpen={isAlertsModalOpen}
        onClose={closeAlertsModal}
        onSnooze24h={snoozeAlerts24h}
        digest={digest}
        isObrero={isObrero}
        onNavigateToPurchasing={() => setActiveModule('FINANZAS')}
      />

      {/* Asistente de IA Flotante Mobile-First Context-Aware */}
      <FloatingAIAssistant
        currentModule={activeModule}
        userRole={role}
      />

      {/* Modal de Lectura Forense OCR invocado directamente desde WhatsApp Web */}
      {crmOcrModalOpen && (
        <React.Suspense fallback={null}>
          <LectorComprobanteOCRModal
            isOpen={crmOcrModalOpen}
            onClose={() => {
              setCrmOcrModalOpen(false);
              setCrmOcrImageDataUrl(null);
              setCrmOcrClientPhone(undefined);
            }}
            initialImageDataUrl={crmOcrImageDataUrl}
            initialClientPhone={crmOcrClientPhone}
            entities={crmEntities}
            invoices={crmInvoices}
            bcvRate={crmBcvRate}
            onPaymentReconciled={() => {
              addLog('Pago conciliado y cruzado exitosamente desde WhatsApp CRM.');
            }}
          />
        </React.Suspense>
      )}

      {/* Global Inmutable App Shell Footer */}
      <footer className={`w-full text-center py-4 px-6 text-xs font-mono border-t mt-auto transition-colors ${
        theme === 'dark'
          ? 'bg-slate-900/60 border-slate-800 text-slate-500'
          : 'bg-white border-slate-200 text-slate-600 shadow-inner'
      }`}>
        Derechos de desarrollo reservados a AR Group 2026
      </footer>
    </div>
  );
};
