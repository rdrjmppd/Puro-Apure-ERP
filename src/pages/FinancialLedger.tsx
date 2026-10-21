import React, { useState, useEffect, useMemo } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import {
  DualEntity,
  PaymentRecord,
  PaymentMode,
  FinancialImpactType,
  DualEntityRole,
  ContribuyenteEspecialType,
  PerfilFiscal,
  MarkToMarketResult,
  BillingInvoice,
  InvoiceItem,
  isIncomeImpact,
  isExpenseImpact,
  ModalidadTransaccion,
  MetodoPago,
  TipoPresentacion,
  DetalleProductoFactura,
  CreditoConfig,
  PaymentReconciliation,
  TipoImpactoConciliacion,
  InstallmentScheduleItem,
} from '../types/finance';
import { BiologicalBatch } from '../types/inventory';
import { FinanceService, calculateInstallmentSchedule } from '../services/financeService';
import { InventoryService } from '../services/inventoryService';
import { centsRound } from '../services/financialAnalyticsService';
import { PrintableInvoiceModal } from '../components/PrintableInvoiceModal';
import { BookkeepingTab } from '../components/finance/BookkeepingTab';
import { BillingTab } from '../components/finance/BillingTab';
import { DualEntitiesTab } from '../components/finance/DualEntitiesTab';
import { ReconciliationTab } from '../components/finance/ReconciliationTab';
import { MarkToMarketTab } from '../components/finance/MarkToMarketTab';

// Desacoplamiento de módulo pesado mediante Dynamic Import & Lazy Loading
const FinancialIntelligenceDashboard = React.lazy(() =>
  import('../components/FinancialIntelligenceDashboard').then((m) => ({
    default: m.FinancialIntelligenceDashboard,
  }))
);
const PurchasesPayablesTab = React.lazy(() =>
  import('../components/finance/purchasing/PurchasesPayablesTab').then((m) => ({
    default: m.PurchasesPayablesTab,
  }))
);
import { ModuleErrorBoundary } from '../components/ModuleErrorBoundary';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Clock,
  Building2,
  Users,
  CreditCard,
  Plus,
  RefreshCw,
  Sliders,
  AlertTriangle,
  ArrowRightLeft,
  FileSpreadsheet,
  Calendar,
  Check,
  X,
  Lock,
  FileText,
  Printer,
  WifiOff,
  Phone,
  MapPin,
  ShieldCheck,
  Sparkles,
  Scale,
  Receipt,
  CheckCheck,
} from 'lucide-react';

export const IMPACT_CONFIG: Record<
  FinancialImpactType,
  {
    label: string;
    shortLabel: string;
    flow: 'INGRESO' | 'EGRESO';
    badgeClass: string;
    borderClass: string;
    bgLightClass: string;
    description: string;
    categoryGroup: string;
  }
> = {
  INGRESO_VENTA: {
    label: 'Ingreso por Venta (Facturación / Cobro Clientes)',
    shortLabel: 'Ingreso Venta',
    flow: 'INGRESO',
    badgeClass: 'bg-emerald-950 text-emerald-300 border-emerald-700',
    borderClass: 'border-emerald-500',
    bgLightClass: 'bg-emerald-500/10 text-emerald-400',
    description: 'Cobro por ventas y despachos de lotes avícolas, cerdos en pie o canales beneficiadas.',
    categoryGroup: 'Ingresos Operativos',
  },
  EGRESO_PROVEEDOR: {
    label: 'Egreso a Proveedor (Materia Prima / Alimento)',
    shortLabel: 'Egreso Proveedor',
    flow: 'EGRESO',
    badgeClass: 'bg-rose-950 text-rose-300 border-rose-700',
    borderClass: 'border-rose-500',
    bgLightClass: 'bg-rose-500/10 text-rose-400',
    description: 'Pagos por alimento concentrado, pollas iniciadoras, lechones, materias primas y medicamentos.',
    categoryGroup: 'Egresos Operativos',
  },
  EGRESO_NOMINA: {
    label: 'Egreso por Nómina (Sueldos y Jornales de Campo)',
    shortLabel: 'Egreso Nómina',
    flow: 'EGRESO',
    badgeClass: 'bg-amber-950 text-amber-300 border-amber-700',
    borderClass: 'border-amber-500',
    bgLightClass: 'bg-amber-500/10 text-amber-400',
    description: 'Pago de sueldos, jornales de operarios de granja, horas extras y cesta tickets.',
    categoryGroup: 'Egresos Laborales',
  },
  EGRESO_HONORARIOS: {
    label: 'Egreso por Honorarios Profesionales',
    shortLabel: 'Honorarios',
    flow: 'EGRESO',
    badgeClass: 'bg-indigo-950 text-indigo-300 border-indigo-700',
    borderClass: 'border-indigo-500',
    bgLightClass: 'bg-indigo-500/10 text-indigo-400',
    description: 'Servicios de médicos veterinarios especialistas, regentes sanitarios y auditoría contable.',
    categoryGroup: 'Egresos Profesionales',
  },
  EGRESO_SERVICIOS: {
    label: 'Egreso por Servicios Operativos / Fletes y Gasoil',
    shortLabel: 'Servicios / Fletes',
    flow: 'EGRESO',
    badgeClass: 'bg-cyan-950 text-cyan-300 border-cyan-700',
    borderClass: 'border-cyan-500',
    bgLightClass: 'bg-cyan-500/10 text-cyan-400',
    description: 'Fletes de ganado/aves, suministro de gasoil, electricidad, telecomunicaciones y mantenimiento.',
    categoryGroup: 'Egresos Operativos',
  },
  EGRESO_IMPUESTOS: {
    label: 'Egreso Tributario / Retenciones SENIAT y Alcaldía',
    shortLabel: 'Tributos SENIAT',
    flow: 'EGRESO',
    badgeClass: 'bg-fuchsia-950 text-fuchsia-300 border-fuchsia-700',
    borderClass: 'border-fuchsia-500',
    bgLightClass: 'bg-fuchsia-500/10 text-fuchsia-400',
    description: 'Retenciones de IVA (75%/100%), anticipos de ISLR y solvencias municipales en San Fernando de Apure.',
    categoryGroup: 'Egresos Fiscales',
  },
  INGRESO: {
    label: 'Ingreso Operativo General',
    shortLabel: 'Ingreso General',
    flow: 'INGRESO',
    badgeClass: 'bg-emerald-950 text-emerald-300 border-emerald-700',
    borderClass: 'border-emerald-500',
    bgLightClass: 'bg-emerald-500/10 text-emerald-400',
    description: 'Flujo de entrada general.',
    categoryGroup: 'Ingresos Operativos',
  },
  EGRESO: {
    label: 'Egreso Operativo General',
    shortLabel: 'Egreso General',
    flow: 'EGRESO',
    badgeClass: 'bg-rose-950 text-rose-300 border-rose-700',
    borderClass: 'border-rose-500',
    bgLightClass: 'bg-rose-500/10 text-rose-400',
    description: 'Flujo de salida general.',
    categoryGroup: 'Egresos Operativos',
  },
};

export const FinancialLedger: React.FC = () => {
  const { userProfile, isAdmin } = useAuth();

  // Active Sub-tab
  const [activeTab, setActiveTab] = useState<
    'LIBRO_CONTABLE' | 'FACTURACION' | 'ENTIDADES_DUALES' | 'CONCILIACION_PAGOS' | 'MARK_TO_MARKET' | 'INTELIGENCIA_FINANCIERA' | 'COMPRAS_CXP'
  >('LIBRO_CONTABLE');

  // Real-time Data
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [entities, setEntities] = useState<DualEntity[]>([]);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [reconciliations, setReconciliations] = useState<PaymentReconciliation[]>([]);
  const [batches, setBatches] = useState<BiologicalBatch[]>([]);
  const [bcvRate, setBcvRate] = useState<number>(0);
  const [isSyncingBcv, setIsSyncingBcv] = useState(false);
  const [rateSource, setRateSource] = useState<string>('Banco Central de Venezuela');
  const [isRateStale, setIsRateStale] = useState<boolean>(false);

  // Mark-to-Market Manual Input Cell
  const [manualRateInput, setManualRateInput] = useState<number>(0);

  // Modal de Tolerancia Offline (Fase 2)
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [offlineCachedRate, setOfflineCachedRate] = useState<number>(0);

  // Modals & Expanders
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEntityModal, setShowEntityModal] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [showReconciliationModal, setShowReconciliationModal] = useState(false);
  const [selectedInvoiceForPrint, setSelectedInvoiceForPrint] = useState<BillingInvoice | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const [showCrossClearingModal, setShowCrossClearingModal] = useState(false);
  const [selectedEntityForClearing, setSelectedEntityForClearing] = useState<DualEntity | null>(null);
  const [crossClearingAmount, setCrossClearingAmount] = useState<number>(0);

  // Reconciliation Form State (Fase 3 & 4 Conciliación y Cruce de Cuentas)
  const [recDate, setRecDate] = useState(new Date().toISOString().split('T')[0]);
  const [recModalidad, setRecModalidad] = useState<ModalidadTransaccion>('CONTADO');
  const [recMetodoPago, setRecMetodoPago] = useState<MetodoPago>('TRANSFERENCIA');
  const [recBancoPlataforma, setRecBancoPlataforma] = useState('Banco de Venezuela');
  const [recNumeroReferencia, setRecNumeroReferencia] = useState('');
  const [recClienteNombre, setRecClienteNombre] = useState('');
  const [recClienteRif, setRecClienteRif] = useState('');
  const [recFacturaId, setRecFacturaId] = useState('');
  const [recLoteId, setRecLoteId] = useState('');
  const [recMonedaRecibida, setRecMonedaRecibida] = useState<'VES' | 'USD'>('USD');
  const [recMontoRecibido, setRecMontoRecibido] = useState<number>(0);
  const [recTipoImpacto, setRecTipoImpacto] = useState<TipoImpactoConciliacion>('INGRESO_HOY');
  const [recObservaciones, setRecObservaciones] = useState('');
  const [recFiltroEstado, setRecFiltroEstado] = useState<'TODOS' | 'CONCILIADO' | 'PENDIENTE'>('TODOS');

  // New Payment Form State (Fase 1 y 2 Spec-Driven)
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payModalidad, setPayModalidad] = useState<ModalidadTransaccion>('CONTADO');
  const [payMode, setPayMode] = useState<MetodoPago>('TRANSFERENCIA');
  const [payPlatform, setPayPlatform] = useState('Banco de Venezuela');
  const [payReference, setPayReference] = useState('');
  const [payIdDoc, setPayIdDoc] = useState('');
  const [paySelectedEntityId, setPaySelectedEntityId] = useState('');
  const [payEntityName, setPayEntityName] = useState('');
  const [payCity, setPayCity] = useState('San Fernando de Apure');
  const [payLinkedInvoice, setPayLinkedInvoice] = useState('');
  const [payImpact, setPayImpact] = useState<FinancialImpactType>('INGRESO_VENTA');
  const [payAmountUSD, setPayAmountUSD] = useState<number>(0);
  const [payAmountVES, setPayAmountVES] = useState<number>(0);
  // Campos de crédito para pago
  const [payLlevaInicial, setPayLlevaInicial] = useState<boolean>(false);
  const [payMetodoPagoInicial, setPayMetodoPagoInicial] = useState<MetodoPago>('TRANSFERENCIA');
  const [payDiasFinanciamiento, setPayDiasFinanciamiento] = useState<number>(30);
  const [payFrecuenciaPago, setPayFrecuenciaPago] = useState<string>('QUINCENAL');
  const [payNumeroCuotas, setPayNumeroCuotas] = useState<number>(2);
  // Campos de producto / biomasa para pago
  const [paySelectedBatchId, setPaySelectedBatchId] = useState<string>('');
  const [payTipoPresentacion, setPayTipoPresentacion] = useState<TipoPresentacion>('VIVO');
  const [payCantidadKg, setPayCantidadKg] = useState<number>(0);
  const [payCantidadUnidades, setPayCantidadUnidades] = useState<number>(0);
  const [payInventoryError, setPayInventoryError] = useState<string | null>(null);

  // New Entity Form State (CRM/VRM & Perfil Fiscal SENIAT)
  const [entName, setEntName] = useState('');
  const [entRif, setEntRif] = useState('');
  const [entRoles, setEntRoles] = useState<DualEntityRole[]>(['CLIENTE']);
  const [entCity, setEntCity] = useState('San Fernando de Apure');
  const [entAddress, setEntAddress] = useState('');
  const [entPhone, setEntPhone] = useState('');
  const [entBalanceUSD, setEntBalanceUSD] = useState<number>(0);
  const [entRegimenIva, setEntRegimenIva] = useState<'GENERAL' | 'EXENTO' | 'RETENCION_75' | 'RETENCION_100'>('GENERAL');
  const [entContribuyenteEspecial, setEntContribuyenteEspecial] = useState<ContribuyenteEspecialType>('ORDINARIO');

  // New Invoice Proforma Form State (Fase 1 y 2 Spec-Driven)
  const [invCustomerName, setInvCustomerName] = useState('');
  const [invCustomerRif, setInvCustomerRif] = useState('');
  const [invCustomerPhone, setInvCustomerPhone] = useState('');
  const [invCustomerAddress, setInvCustomerAddress] = useState('');
  const [invSelectedBatchId, setInvSelectedBatchId] = useState('');
  const [invDueDate, setInvDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [invNotes, setInvNotes] = useState('');
  // Modalidad y Crédito Proforma
  const [invModalidad, setInvModalidad] = useState<ModalidadTransaccion>('CONTADO');
  const [invMetodoPago, setInvMetodoPago] = useState<MetodoPago>('TRANSFERENCIA');
  const [invLlevaInicial, setInvLlevaInicial] = useState<boolean>(false);
  const [invMetodoPagoInicial, setInvMetodoPagoInicial] = useState<MetodoPago>('TRANSFERENCIA');
  const [invMontoInicialUSD, setInvMontoInicialUSD] = useState<number>(0);
  const [invDiasFinanciamiento, setInvDiasFinanciamiento] = useState<number>(30);
  const [invFrecuenciaPago, setInvFrecuenciaPago] = useState<string>('QUINCENAL');
  const [invNumeroCuotas, setInvNumeroCuotas] = useState<number>(2);
  // Detalle de Producto Biológico
  const [invTipoPresentacion, setInvTipoPresentacion] = useState<TipoPresentacion>('VIVO');
  const [invCantidadKg, setInvCantidadKg] = useState<number>(0);
  const [invCantidadUnidades, setInvCantidadUnidades] = useState<number>(0);
  const [invInventoryError, setInvInventoryError] = useState<string | null>(null);

  // Manual BCV rate update modal/popover
  const [editingRate, setEditingRate] = useState(false);
  const [tempBcvRate, setTempBcvRate] = useState<number>(0);

  // Feedback Notification
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Timeout guard helper para prevenir bloqueos de red en getDoc
  const getDocWithTimeout = (docRef: any, timeoutMs = 5000) => {
    return Promise.race([
      getDoc(docRef),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT_GETDOC')), timeoutMs)
      ),
    ]);
  };

  // Candado Estricto de Inventario: Validación Asíncrona para Emisión de Proformas (Debounce 250ms)
  useEffect(() => {
    if (!invSelectedBatchId) {
      setInvInventoryError(null);
      return;
    }

    let isMounted = true;
    const timer = setTimeout(async () => {
      try {
        const snap = (await getDocWithTimeout(doc(db, 'batches', invSelectedBatchId), 5000)) as any;
        if (!isMounted) return;
        const b = snap.exists() ? (snap.data() as BiologicalBatch) : batches.find((x) => x.id === invSelectedBatchId);
        if (!b) {
          setInvInventoryError('Operación denegada: Lote biológico no encontrado en la base de datos.');
          return;
        }

        if (b.status === 'FINALIZADO') {
          setInvInventoryError('Operación denegada: El lote biológico seleccionado ya se encuentra FINALIZADO.');
          return;
        }

        const isAvian = b.species === 'AVICOLA';
        const merma = b.deduccionMermaKg ?? b.shrinkageDeductionKg ?? 0;
        const availableKg = isAvian
          ? (b.grossWeightKg || 0)
          : (b.netWeightKg || Math.max(0, (b.grossWeightKg || 0) - merma));
        const availableUnits = b.currentCount || 0;

        if (availableKg <= 0 && availableUnits <= 0) {
          setInvInventoryError(`Operación denegada: El lote ${b.code || invSelectedBatchId} está agotado (0 kg y 0 animales disponibles).`);
          return;
        }

        if (invCantidadKg <= 0 && invCantidadUnidades <= 0) {
          setInvInventoryError('Debe especificar una cantidad a facturar (en kg o unidades/animales).');
          return;
        }

        if (invCantidadKg > 0 && invCantidadKg > availableKg) {
          setInvInventoryError(
            `Operación denegada: Existencia insuficiente en lote (Solicitado: ${invCantidadKg.toLocaleString()} kg • Disponible: ${availableKg.toLocaleString()} kg).`
          );
          return;
        }

        if (invCantidadUnidades > 0 && invCantidadUnidades > availableUnits) {
          setInvInventoryError(
            `Operación denegada: Existencia insuficiente en lote (Solicitado: ${invCantidadUnidades.toLocaleString()} unidades • Disponible: ${availableUnits.toLocaleString()} animales).`
          );
          return;
        }

        setInvInventoryError(null);
      } catch (err) {
        console.warn('Error en validación asíncrona de inventario (fallback a memoria local):', err);
        const local = batches.find((x) => x.id === invSelectedBatchId);
        if (local) {
          const isAvian = local.species === 'AVICOLA';
          const merma = local.deduccionMermaKg ?? local.shrinkageDeductionKg ?? 0;
          const availableKg = isAvian
            ? (local.grossWeightKg || 0)
            : (local.netWeightKg || Math.max(0, (local.grossWeightKg || 0) - merma));
          const availableUnits = local.currentCount || 0;

          if (availableKg <= 0 && availableUnits <= 0) {
            setInvInventoryError(`Operación denegada: El lote ${local.code} está agotado.`);
            return;
          }
          if (invCantidadKg <= 0 && invCantidadUnidades <= 0) {
            setInvInventoryError('Debe especificar una cantidad a facturar.');
            return;
          }
          if (invCantidadKg > 0 && invCantidadKg > availableKg) {
            setInvInventoryError(
              `Operación denegada: Existencia insuficiente en lote (Disponible: ${availableKg.toLocaleString()} kg).`
            );
            return;
          }
          if (invCantidadUnidades > 0 && invCantidadUnidades > availableUnits) {
            setInvInventoryError(
              `Operación denegada: Existencia insuficiente en lote (Disponible: ${availableUnits.toLocaleString()} unidades).`
            );
            return;
          }
        }
        setInvInventoryError(null);
      }
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [invSelectedBatchId, invCantidadKg, invCantidadUnidades, batches]);

  // Candado Estricto de Inventario: Validación Asíncrona para Asiento de Pago (Debounce 250ms)
  useEffect(() => {
    if (!paySelectedBatchId) {
      setPayInventoryError(null);
      return;
    }

    let isMounted = true;
    const timer = setTimeout(async () => {
      try {
        const snap = (await getDocWithTimeout(doc(db, 'batches', paySelectedBatchId), 5000)) as any;
        if (!isMounted) return;
        const b = snap.exists() ? (snap.data() as BiologicalBatch) : batches.find((x) => x.id === paySelectedBatchId);
        if (!b) {
          setPayInventoryError('Operación denegada: Lote biológico no encontrado.');
          return;
        }

        const isAvian = b.species === 'AVICOLA';
        const merma = b.deduccionMermaKg ?? b.shrinkageDeductionKg ?? 0;
        const availableKg = isAvian
          ? (b.grossWeightKg || 0)
          : (b.netWeightKg || Math.max(0, (b.grossWeightKg || 0) - merma));
        const availableUnits = b.currentCount || 0;

        if (availableKg <= 0 && availableUnits <= 0) {
          setPayInventoryError(`Operación denegada: El lote ${b.code || paySelectedBatchId} está agotado.`);
          return;
        }

        if (payCantidadKg > 0 && payCantidadKg > availableKg) {
          setPayInventoryError(
            `Operación denegada: Existencia insuficiente en lote (Solicitado: ${payCantidadKg.toLocaleString()} kg • Disponible: ${availableKg.toLocaleString()} kg).`
          );
          return;
        }

        if (payCantidadUnidades > 0 && payCantidadUnidades > availableUnits) {
          setPayInventoryError(
            `Operación denegada: Existencia insuficiente en lote (Solicitado: ${payCantidadUnidades.toLocaleString()} cabezas • Disponible: ${availableUnits.toLocaleString()} animales).`
          );
          return;
        }

        setPayInventoryError(null);
      } catch {
        setPayInventoryError(null);
      }
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [paySelectedBatchId, payCantidadKg, payCantidadUnidades, batches]);

  useEffect(() => {
    FinanceService.fetchLatestBcvRate().then((r) => {
      setBcvRate(r);
      setTempBcvRate(r);
      setManualRateInput(centsRound(r * 1.05));
    });

    const unsubRate = FinanceService.subscribeLatestRateDetails((details) => {
      setBcvRate(details.rate);
      setTempBcvRate(details.rate);
      setRateSource(details.source);
      setIsRateStale(details.isStale);
    });

    const unsubPayments = FinanceService.subscribePayments((pList) => {
      setPayments(pList);
    });

    const unsubEntities = FinanceService.subscribeDualEntities((eList) => {
      setEntities(eList);
    });

    const unsubInvoices = FinanceService.subscribeInvoices((iList) => {
      setInvoices(iList);
    });

    const unsubBatches = InventoryService.subscribeBatches((bList) => {
      setBatches(bList);
    });

    const unsubReconciliations = FinanceService.subscribeReconciliations((rList) => {
      setReconciliations(rList);
    });

    return () => {
      unsubRate();
      unsubPayments();
      unsubEntities();
      unsubInvoices();
      unsubBatches();
      unsubReconciliations();
    };
  }, []);

  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 6000);
  };

  // Recalculate VES when USD changes or vice versa in payment form
  const handleAmountUSDChange = (usd: number) => {
    setPayAmountUSD(usd);
    setPayAmountVES(centsRound(usd * bcvRate));
  };

  const handleAmountVESChange = (ves: number) => {
    setPayAmountVES(ves);
    if (bcvRate > 0) {
      setPayAmountUSD(centsRound(ves / bcvRate));
    }
  };

  // Flow Cards Calculations
  const flowCards = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayPayments = payments.filter((p) => p.date === today);

    const totalTodayUSD = todayPayments.reduce((acc, p) => {
      return isIncomeImpact(p.impactType) ? acc + p.amountUSD : acc - p.amountUSD;
    }, 0);

    const totalTodayVES = todayPayments.reduce((acc, p) => {
      return isIncomeImpact(p.impactType) ? acc + p.amountVES : acc - p.amountVES;
    }, 0);

    const reconciledPayments = payments.filter((p) => p.isReconciled);
    const pendingPayments = payments.filter((p) => !p.isReconciled);

    const reconciledUSD = reconciledPayments.reduce((acc, p) => acc + p.amountUSD, 0);
    const pendingUSD = pendingPayments.reduce((acc, p) => acc + p.amountUSD, 0);

    const totalIncomeUSD = payments.filter((p) => isIncomeImpact(p.impactType)).reduce((acc, p) => acc + p.amountUSD, 0);
    const totalIncomeVES = payments.filter((p) => isIncomeImpact(p.impactType)).reduce((acc, p) => acc + p.amountVES, 0);
    const totalExpenseUSD = payments.filter((p) => isExpenseImpact(p.impactType)).reduce((acc, p) => acc + p.amountUSD, 0);
    const totalExpenseVES = payments.filter((p) => isExpenseImpact(p.impactType)).reduce((acc, p) => acc + p.amountVES, 0);

    return {
      todayUSD: totalTodayUSD,
      todayVES: totalTodayVES,
      reconciledUSD,
      reconciledCount: reconciledPayments.length,
      pendingUSD,
      pendingCount: pendingPayments.length,
      totalIncomeUSD,
      totalIncomeVES,
      totalExpenseUSD,
      totalExpenseVES,
      netCashUSD: totalIncomeUSD - totalExpenseUSD,
      netCashVES: totalIncomeVES - totalExpenseVES,
    };
  }, [payments, bcvRate]);

  // Mark to market revaluation simulation
  const markToMarketRows = useMemo(() => {
    return FinanceService.calculateMarkToMarket(payments, manualRateInput);
  }, [payments, manualRateInput]);

  // Handle Dual Entity Selection for Payment Form
  const handleSelectEntityForPayment = (entityId: string) => {
    setPaySelectedEntityId(entityId);
    if (!entityId) return;
    const found = entities.find((e) => e.id === entityId);
    if (found) {
      setPayEntityName(found.razonSocial || found.name);
      setPayIdDoc(found.identificacionFiscal || found.rifCedula);
      if (found.city) setPayCity(found.city);
      if (found.roles.includes('CLIENTE') && !found.roles.includes('PROVEEDOR')) {
        setPayImpact('INGRESO_VENTA');
      } else if (found.roles.includes('PROVEEDOR') && !found.roles.includes('CLIENTE')) {
        setPayImpact('EGRESO_PROVEEDOR');
      }
    }
  };

  // Handle Payment Submit
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payReference.trim() || payAmountUSD <= 0) {
      notify('Por favor indique la referencia bancaria y un monto válido en USD.', 'error');
      return;
    }

    if (payInventoryError) {
      notify(payInventoryError, 'error');
      return;
    }

    const isCredito = payModalidad === 'CREDITO';
    const detalleProducto = paySelectedBatchId ? {
      tipoPresentacion: payTipoPresentacion,
      cantidadKg: Number(payCantidadKg),
      cantidadUnidades: Number(payCantidadUnidades),
      loteId: paySelectedBatchId,
    } : undefined;

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const effectiveRate = payDate !== todayStr
        ? await FinanceService.fetchBcvRateForDate(payDate)
        : (bcvRate > 0 ? bcvRate : 1);

      const safeUSD = centsRound(Number(payAmountUSD));
      const safeVES = centsRound(Number(payAmountVES));

      await FinanceService.registerPayment(
        {
          date: payDate,
          paymentMode: payMode,
          platform: payPlatform,
          reference: payReference.trim().toUpperCase(),
          idDocument: payIdDoc.trim().toUpperCase(),
          entityId: paySelectedEntityId || undefined,
          entityName: payEntityName.trim() || 'Consumidor Final',
          city: payCity.trim(),
          linkedInvoice: payLinkedInvoice.trim(),
          impactType: payImpact,
          amountUSD: safeUSD,
          amountVES: safeVES,
          bcvRate: effectiveRate,
          isReconciled: false,
          modalidadTransaccion: payModalidad,
          llevaInicial: isCredito ? payLlevaInicial : undefined,
          metodoPagoInicial: isCredito && payLlevaInicial ? payMetodoPagoInicial : undefined,
          diasFinanciamiento: isCredito ? Number(payDiasFinanciamiento) : undefined,
          frecuenciaPago: isCredito ? payFrecuenciaPago : undefined,
          numeroCuotas: isCredito ? Number(payNumeroCuotas) : undefined,
          detalleProducto,
        },
        userProfile?.uid || 'user'
      );

      setShowPaymentModal(false);
      setPayReference('');
      setPayAmountUSD(0);
      setPayAmountVES(0);
      setPayLinkedInvoice('');
      setPaySelectedEntityId('');
      setPayEntityName('');
      setPayIdDoc('');
      setPaySelectedBatchId('');
      setPayCantidadKg(0);
      setPayCantidadUnidades(0);
      setPayInventoryError(null);
      notify('Asiento financiero bimonetario registrado exitosamente.');
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Error al registrar asiento.', 'error');
    }
  };

  // Handle Invoice Creation
  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invCustomerName.trim() || !invCustomerRif.trim()) {
      notify('Ingrese el nombre y RIF del cliente para la proforma.', 'error');
      return;
    }

    if (invInventoryError) {
      notify(invInventoryError, 'error');
      return;
    }

    const targetBatch = batches.find((b) => b.id === invSelectedBatchId);
    let items: InvoiceItem[] = [];
    let detalleProducto: DetalleProductoFactura | undefined = undefined;

    if (targetBatch) {
      const isAvian = targetBatch.species === 'AVICOLA';
      const gross = invCantidadKg > 0 ? centsRound(Number(invCantidadKg)) : centsRound(targetBatch.grossWeightKg || 0);
      const shrinkage = isAvian ? 0 : (targetBatch.deduccionMermaKg ?? targetBatch.shrinkageDeductionKg ?? 0);
      const net = isAvian ? gross : Math.max(0, centsRound(gross - shrinkage));
      const unitPrice = isAvian
        ? (targetBatch.precioFacturableUsdPorKg ?? targetBatch.unitPriceUSDPerKg ?? 0)
        : (targetBatch.precioFacturableNetoUsdPorKg ?? targetBatch.unitPriceUSDPerKg ?? 0);
      const subtotalUSD = centsRound(net * unitPrice);
      const subtotalVES = centsRound(subtotalUSD * bcvRate);
      const units = invCantidadUnidades > 0 ? Number(invCantidadUnidades) : (targetBatch.currentCount || 0);

      items.push({
        id: `item_${Date.now()}`,
        description: `Venta Lote Biológico ${targetBatch.code} (${targetBatch.species} • ${invTipoPresentacion})`,
        species: targetBatch.species,
        batchCode: targetBatch.code,
        grossWeightKg: gross,
        shrinkageKg: shrinkage,
        netWeightKg: net,
        unitPriceUSD: unitPrice,
        subtotalUSD,
        subtotalVES,
        loteId: targetBatch.id,
        tipoPresentacion: invTipoPresentacion,
      });

      detalleProducto = {
        tipoPresentacion: invTipoPresentacion,
        cantidadKg: gross,
        cantidadUnidades: units,
        loteId: targetBatch.id,
        descripcion: `Lote ${targetBatch.code} (${targetBatch.species})`,
        precioUnitarioUSD: unitPrice,
        especie: targetBatch.species,
      };
    } else {
      // General Agricultural item
      const unitPrice = 4.0;
      const net = invCantidadKg > 0 ? centsRound(Number(invCantidadKg)) : 1000;
      const subtotalUSD = centsRound(net * unitPrice);
      const subtotalVES = centsRound(subtotalUSD * bcvRate);
      items.push({
        id: `item_${Date.now()}`,
        description: 'Venta de Productos Agropecuarios Generales',
        netWeightKg: net,
        unitPriceUSD: unitPrice,
        subtotalUSD,
        subtotalVES,
        tipoPresentacion: invTipoPresentacion,
      });
    }

    const totalUSD = centsRound(items.reduce((acc, item) => acc + item.subtotalUSD, 0));
    const totalVES = centsRound(totalUSD * bcvRate);

    const isCredito = invModalidad === 'CREDITO';
    const saldoPendienteUSD = isCredito
      ? (invLlevaInicial ? Math.max(0, centsRound(totalUSD - (invMontoInicialUSD || 0))) : totalUSD)
      : 0;

    const cuotasAmortizacion = isCredito && saldoPendienteUSD > 0
      ? calculateInstallmentSchedule(
          saldoPendienteUSD,
          Number(invNumeroCuotas) || 1,
          invFrecuenciaPago,
          invDueDate,
          bcvRate
        )
      : undefined;

    const invoiceNumber = `PRO-2026-${String(invoices.length + 1).padStart(4, '0')}`;
    const newInvoice: BillingInvoice = {
      id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      invoiceNumber,
      date: new Date().toISOString().split('T')[0],
      dueDate: invDueDate,
      customerName: invCustomerName.trim(),
      customerRif: invCustomerRif.trim().toUpperCase(),
      customerPhone: invCustomerPhone.trim(),
      customerAddress: invCustomerAddress.trim(),
      items,
      totalUSD,
      totalVES,
      bcvRateApplied: bcvRate,
      paymentStatus: isCredito ? 'PENDIENTE' : 'PAGADO',
      notes: invNotes.trim(),
      createdAt: Date.now(),
      updatedBy: userProfile?.uid || 'user',
      modalidadTransaccion: invModalidad,
      metodoPago: invMetodoPago,
      llevaInicial: isCredito ? invLlevaInicial : undefined,
      metodoPagoInicial: isCredito && invLlevaInicial ? invMetodoPagoInicial : undefined,
      montoInicialUSD: isCredito && invLlevaInicial ? Number(invMontoInicialUSD) : undefined,
      diasFinanciamiento: isCredito ? Number(invDiasFinanciamiento) : undefined,
      frecuenciaPago: isCredito ? invFrecuenciaPago : undefined,
      numeroCuotas: isCredito ? Number(invNumeroCuotas) : undefined,
      saldoPendienteUSD,
      cuotasAmortizacion,
      detalleProducto,
    };

    try {
      const batchDeduction = targetBatch
        ? {
            loteId: targetBatch.id,
            cantidadKg: invCantidadKg > 0 ? centsRound(Number(invCantidadKg)) : centsRound(targetBatch.grossWeightKg || 0),
            cantidadUnidades: invCantidadUnidades > 0 ? Number(invCantidadUnidades) : (targetBatch.currentCount || 0),
          }
        : undefined;

      await FinanceService.saveInvoiceWithInventoryDeduction(newInvoice, batchDeduction);
      setShowInvoiceForm(false);
      setSelectedInvoiceForPrint(newInvoice);
      setIsPrintModalOpen(true);
      notify(`Proforma ${invoiceNumber} generada y biomasa descontada exitosamente (${invModalidad}).`);
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Error al guardar factura.', 'error');
    }
  };

  // Handle Dual Entity Submit
  const handleSaveEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    const razonSocialVal = entName.trim();
    const idFiscalVal = entRif.trim().toUpperCase();
    const telefonoVal = entPhone.trim();
    const direccionVal = entAddress.trim();

    if (!razonSocialVal) {
      notify('La Razón Social oficial es obligatoria.', 'error');
      return;
    }
    if (!idFiscalVal) {
      notify('La Identificación Fiscal (RIF o Cédula) es obligatoria.', 'error');
      return;
    }
    if (!telefonoVal) {
      notify('El Teléfono de Contacto fiscal es obligatorio.', 'error');
      return;
    }
    if (!direccionVal) {
      notify('La Dirección Fiscal declarada ante el SENIAT es obligatoria.', 'error');
      return;
    }
    if (entRoles.length === 0) {
      notify('Debe seleccionar al menos un Rol operativo (Cliente o Proveedor).', 'error');
      return;
    }

    const entId = `ent_${idFiscalVal.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    try {
      await FinanceService.saveDualEntity(
        {
          id: entId,
          name: razonSocialVal,
          razonSocial: razonSocialVal,
          rifCedula: idFiscalVal,
          identificacionFiscal: idFiscalVal,
          roles: entRoles,
          city: (entCity || 'San Fernando de Apure').trim(),
          address: direccionVal,
          direccionFiscal: direccionVal,
          phone: telefonoVal,
          telefonoContacto: telefonoVal,
          balanceUSD: centsRound(Number(entBalanceUSD)),
          balanceVES: centsRound(Number(entBalanceUSD) * bcvRate),
          balancePorCobrarUSD: entRoles.includes('CLIENTE') && entBalanceUSD > 0 ? centsRound(entBalanceUSD) : 0,
          balancePorPagarUSD: entRoles.includes('PROVEEDOR') && entBalanceUSD < 0 ? centsRound(Math.abs(entBalanceUSD)) : 0,
          perfilFiscal: {
            regimenIva: entRegimenIva,
            contribuyenteEspecial: entContribuyenteEspecial,
            direccionFiscal: direccionVal,
            telefonoContacto: telefonoVal,
          },
        },
        userProfile?.uid || 'user'
      );

      setShowEntityModal(false);
      setEntName('');
      setEntRif('');
      setEntAddress('');
      setEntPhone('');
      setEntCity('San Fernando de Apure');
      setEntBalanceUSD(0);
      setEntRegimenIva('GENERAL');
      setEntContribuyenteEspecial('ORDINARIO');
      notify(`Entidad "${razonSocialVal}" (${idFiscalVal}) registrada con perfil fiscal SENIAT.`);
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Error al guardar entidad.', 'error');
    }
  };

  // Handle Account Cross-Clearing (Cruce de Cuentas)
  const handleExecuteCrossClearing = async () => {
    if (!selectedEntityForClearing || crossClearingAmount <= 0) return;
    try {
      await FinanceService.applyAccountCrossClearing(
        selectedEntityForClearing.id,
        crossClearingAmount,
        userProfile?.uid || 'user'
      );
      setShowCrossClearingModal(false);
      setSelectedEntityForClearing(null);
      setCrossClearingAmount(0);
      notify(`Cruce de cuentas ejecutado por $${crossClearingAmount} USD.`);
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Error en cruce de cuentas.', 'error');
    }
  };

  // Submódulo de Conciliación de Pagos (Fase 3 & 4)
  const handleOpenReconciliation = (invoice?: BillingInvoice) => {
    if (invoice) {
      setRecFacturaId(invoice.id);
      setRecClienteNombre(invoice.customerName);
      setRecClienteRif(invoice.customerRif);
      setRecModalidad(invoice.modalidadTransaccion || 'CREDITO');
      setRecMetodoPago(invoice.metodoPago || 'TRANSFERENCIA');
      const pendingUsd = invoice.saldoPendienteUSD !== undefined && invoice.saldoPendienteUSD > 0
        ? invoice.saldoPendienteUSD
        : invoice.totalUSD;
      setRecMontoRecibido(pendingUsd);
      setRecMonedaRecibida('USD');
      if (invoice.detalleProducto?.loteId) {
        setRecLoteId(invoice.detalleProducto.loteId);
      } else {
        setRecLoteId('');
      }
      setRecTipoImpacto(invoice.modalidadTransaccion === 'CREDITO' ? 'INGRESO_EXTEMPORANEO' : 'INGRESO_HOY');
    } else {
      setRecFacturaId('');
      setRecClienteNombre('');
      setRecClienteRif('');
      setRecModalidad('CONTADO');
      setRecMetodoPago('TRANSFERENCIA');
      setRecMontoRecibido(0);
      setRecMonedaRecibida('USD');
      setRecLoteId('');
      setRecTipoImpacto('INGRESO_HOY');
    }
    setRecDate(new Date().toISOString().split('T')[0]);
    setRecNumeroReferencia('');
    setRecBancoPlataforma('Banco de Venezuela');
    setRecObservaciones('');
    setShowReconciliationModal(true);
  };

  const handleSaveReconciliation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recClienteNombre.trim()) {
      notify('El nombre del cliente o razón social es obligatorio.', 'error');
      return;
    }
    if (recMontoRecibido <= 0) {
      notify('El monto recibido debe ser mayor a cero.', 'error');
      return;
    }
    if (!recNumeroReferencia.trim()) {
      notify('El número de referencia bancaria o soporte de pago es obligatorio.', 'error');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const effectiveRate = recDate !== todayStr
      ? await FinanceService.fetchBcvRateForDate(recDate)
      : (bcvRate > 0 ? bcvRate : 1);
    const rate = effectiveRate > 0 ? effectiveRate : 1;

    const montoUSD = recMonedaRecibida === 'USD'
      ? centsRound(recMontoRecibido)
      : centsRound(recMontoRecibido / rate);
    const montoVES = recMonedaRecibida === 'VES'
      ? centsRound(recMontoRecibido)
      : centsRound(montoUSD * rate);

    const targetInvoice = invoices.find((inv) => inv.id === recFacturaId);

    // Deducción atómica de deuda sobre la proforma / factura
    if (targetInvoice) {
      const prevPending = targetInvoice.saldoPendienteUSD !== undefined ? targetInvoice.saldoPendienteUSD : targetInvoice.totalUSD;
      const newPending = Math.max(0, centsRound(prevPending - montoUSD));
      const newPaymentStatus = newPending <= 0.01 ? 'PAGADO' : 'PENDIENTE';

      // Actualizar amortización de cuotas si la proforma tiene cronograma
      let updatedCuotas = targetInvoice.cuotasAmortizacion;
      if (updatedCuotas && updatedCuotas.length > 0) {
        let remainingPaymentUSD = montoUSD;
        updatedCuotas = updatedCuotas.map((cuota) => {
          if (cuota.estado === 'PENDIENTE' && remainingPaymentUSD > 0) {
            if (remainingPaymentUSD >= cuota.montoUSD) {
              remainingPaymentUSD = centsRound(remainingPaymentUSD - cuota.montoUSD);
              return { ...cuota, estado: 'PAGADO' as const };
            }
          }
          return cuota;
        });
      }

      await FinanceService.saveInvoice({
        ...targetInvoice,
        saldoPendienteUSD: newPending,
        paymentStatus: newPaymentStatus,
        cuotasAmortizacion: updatedCuotas,
      });
    }

    // Creación del registro en payment_reconciliations con snapshot inmutable
    const recId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newReconciliation: PaymentReconciliation = {
      id: recId,
      fecha: recDate,
      modalidad: recModalidad,
      metodoPago: recMetodoPago,
      bancoPlataforma: recBancoPlataforma,
      numeroReferencia: recNumeroReferencia.trim(),
      clienteNombre: recClienteNombre.trim(),
      clienteRif: recClienteRif.trim().toUpperCase(),
      facturaId: recFacturaId || 'DIRECTO',
      facturaNumero: targetInvoice?.invoiceNumber || (recFacturaId ? recFacturaId : 'DIRECTO'),
      loteId: recLoteId || undefined,
      monedaRecibida: recMonedaRecibida,
      montoRecibido: recMontoRecibido,
      tasaBcv: rate,
      montoUSD,
      montoVES,
      tipoImpacto: recTipoImpacto,
      estado: 'CONCILIADO',
      observaciones: recObservaciones.trim(),
      snapshot: {
        frozenRate: rate,
        frozenUSD: montoUSD,
        frozenVES: montoVES,
        capturedAt: new Date().toISOString(),
        source: 'Motor Conciliación Dual v3.0 (ACID Snapshot)',
      },
      createdAt: Date.now(),
      createdBy: userProfile?.uid || 'user',
    };

    try {
      await FinanceService.saveReconciliation(newReconciliation);
      await FinanceService.registerPayment(
        {
          date: recDate,
          paymentMode: recMetodoPago,
          platform: recBancoPlataforma,
          reference: recNumeroReferencia.trim().toUpperCase(),
          idDocument: recClienteRif.trim().toUpperCase(),
          entityName: recClienteNombre.trim(),
          city: 'San Fernando de Apure',
          linkedInvoice: targetInvoice?.invoiceNumber || (recFacturaId ? recFacturaId : 'CONCILIACION'),
          impactType: recTipoImpacto === 'RETENCION_FISCAL' ? 'EGRESO_IMPUESTOS' : 'INGRESO_VENTA',
          amountUSD: montoUSD,
          amountVES: montoVES,
          bcvRate: rate,
          isReconciled: true,
          modalidadTransaccion: recModalidad,
          detalleProducto: targetInvoice?.detalleProducto,
        },
        userProfile?.uid || 'user'
      );
      setShowReconciliationModal(false);
      notify(`Conciliación de pago ${recNumeroReferencia} procesada exitosamente ($${montoUSD} USD / Bs. ${montoVES}).`);
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Error al registrar conciliación.', 'error');
    }
  };

  const handleUpdateOfficialRate = async () => {
    if (tempBcvRate <= 0) return;
    await FinanceService.updateBcvRate(tempBcvRate, userProfile?.displayName || 'Admin');
    setEditingRate(false);
    notify(`Tasa oficial BCV actualizada a ${tempBcvRate.toFixed(4)} VES/USD.`);
  };

  const handleForceSyncBcv = async () => {
    setIsSyncingBcv(true);
    let watchdogTimer: NodeJS.Timeout | null = null;

    try {
      const syncTaskPromise = FinanceService.syncBcvRateNow();

      const watchdogPromise = new Promise<never>((_, reject) => {
        watchdogTimer = setTimeout(() => {
          const timeoutErr: any = new Error('TIMEOUT_UI');
          timeoutErr.message = 'TIMEOUT_UI: El tiempo de espera máximo de sincronización (8000ms) ha expirado.';
          timeoutErr.cachedRate = bcvRate;
          reject(timeoutErr);
        }, 8000);
      });

      const res = await Promise.race([syncTaskPromise, watchdogPromise]);

      if (res.success) {
        setBcvRate(res.rate);
        setTempBcvRate(res.rate);
        setManualRateInput(Number((res.rate * 1.05).toFixed(2)));
        setRateSource(res.source);
        setIsRateStale(res.isStale);
        notify(`Tasa oficial sincronizada exitosamente: ${res.rate.toFixed(4)} Bs./USD (${res.source}).`);
      } else {
        notify(`Aviso cambiario: ${res.error || 'Usando cotización en caché.'}`, 'error');
      }
    } catch (e: any) {
      const cached = e?.cachedRate || bcvRate;
      setOfflineCachedRate(cached);
      setShowOfflineModal(true);
      if (e?.message?.includes('TIMEOUT_UI')) {
        notify('Tiempo de espera agotado. Se restablece la visualización con la última tasa en caché.', 'error');
      }
    } finally {
      if (watchdogTimer) {
        clearTimeout(watchdogTimer);
      }
      setIsSyncingBcv(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Modal Desconectado / Contingencia Obligatorio */}
      {showOfflineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-amber-500/50 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-950/80 border border-amber-500/40 flex items-center justify-center mx-auto text-amber-400">
              <WifiOff className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Sin conexión o tiempo de espera agotado
              </h3>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                No se pudo completar la consulta en vivo con el Banco Central. La plataforma restablece la visualización utilizando de forma segura la última tasa certificada en caché local (IndexedDB) para garantizar la continuidad operativa.
              </p>
            </div>
            <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 text-left space-y-1">
              <div className="text-[11px] text-slate-400 font-medium">Cotización Oficial en Respaldo:</div>
              <div className="font-mono text-lg font-bold text-emerald-400">
                {offlineCachedRate.toFixed(4)} <span className="text-xs text-slate-400 font-normal">VES/USD</span>
              </div>
              <div className="text-[10px] text-slate-500">
                Fuente: IndexedDB Local Cache • Modo Offline-First Activo
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowOfflineModal(false)}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-2xl transition border border-slate-700 active:scale-95"
            >
              Entendido y Continuar
            </button>
          </div>
        </div>
      )}

      {/* Printable Invoice Modal */}
      <PrintableInvoiceModal
        invoice={selectedInvoiceForPrint}
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
      />

      {/* Toast Feedback */}
      {notification && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between text-xs font-medium border shadow-xl animate-fadeIn ${
            notification.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
              : 'bg-red-950/80 border-red-500/50 text-red-200'
          }`}
        >
          <span>{notification.text}</span>
          <button onClick={() => setNotification(null)} className="text-slate-400">✕</button>
        </div>
      )}

      {/* Header and BCV Exchange Engine Banner */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Consolidación Contable Bimonetaria y Facturación
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-emerald-950 text-emerald-400 border border-emerald-800">
              Fase 4 Activa
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Libro contable bimonetario (USD / Bs.) • Tasa BCV activa • Proformas de facturación y comprobantes fiscales imprimibles.
          </p>
        </div>

        {/* BCV Tasa Oficial Feeder Widget */}
        <div className="flex items-center gap-3 bg-slate-900 border border-slate-700/80 p-2.5 rounded-2xl shadow-sm">
          <div className="text-left">
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-slate-400">
              <span
                className={`w-2 h-2 rounded-full ${
                  isRateStale ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'
                }`}
              />
              <span>Tasa Oficial BCV</span>
              {isRateStale && (
                <span className="text-[9px] font-mono text-amber-400 bg-amber-950/80 px-1 rounded">
                  En Caché
                </span>
              )}
            </div>
            <div className="font-mono text-base font-bold text-emerald-400">
              {bcvRate.toFixed(4)}{' '}
              <span className="text-[10px] font-normal text-slate-400">VES/USD</span>
            </div>
            <div className="text-[9px] text-slate-400 truncate max-w-[140px]" title={rateSource}>
              {rateSource}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleForceSyncBcv}
              disabled={isSyncingBcv}
              title="Sincronizar tasa oficial en vivo con el Banco Central"
              className="p-2 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 text-xs transition disabled:opacity-50 flex items-center gap-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingBcv ? 'animate-spin' : ''}`} />
              <span className="text-[10px] font-semibold hidden sm:inline">Sincronizar</span>
            </button>

            {isAdmin && (
              <button
                onClick={() => setEditingRate(!editingRate)}
                title="Ajustar cotización oficial manualmente"
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
              >
                <DollarSign className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal / Popover para actualizar tasa oficial */}
      {editingRate && (
        <div className="p-4 bg-slate-900 border border-emerald-500/40 rounded-2xl flex flex-wrap items-center gap-3 text-xs animate-fadeIn">
          <span className="text-slate-300 font-semibold">Ajuste manual de cotización BCV:</span>
          <input
            type="number"
            step="0.0001"
            value={tempBcvRate}
            onChange={(e) => setTempBcvRate(Number(e.target.value))}
            className="w-36 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-white font-mono outline-none"
          />
          <button
            onClick={handleUpdateOfficialRate}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold"
          >
            Guardar Tasa Manual
          </button>
          <button
            onClick={handleForceSyncBcv}
            disabled={isSyncingBcv}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-xl font-medium flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3 h-3 ${isSyncingBcv ? 'animate-spin' : ''}`} />
            Auto-Consultar BCV
          </button>
          <button
            onClick={() => setEditingRate(false)}
            className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-xl"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Tarjetas Visuales de Consolidación Bimonetaria */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Ingresos */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider">Ingresos Totales</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400">
            ${flowCards.totalIncomeUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs font-mono text-slate-400 mt-1">
            Bs. {flowCards.totalIncomeVES.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[10px] text-slate-500 mt-2">Cobros validados en sistema</p>
        </div>

        {/* Total Egresos */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider">Egresos Totales</span>
            <TrendingDown className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-xl font-bold font-mono text-red-400">
            ${flowCards.totalExpenseUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs font-mono text-slate-400 mt-1">
            Bs. {flowCards.totalExpenseVES.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[10px] text-slate-500 mt-2">Pagos a proveedores e insumos</p>
        </div>

        {/* Flujo Neto de Caja */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider">Flujo Neto de Caja</span>
            <DollarSign className="w-4 h-4 text-cyan-400" />
          </div>
          <div className={`text-xl font-bold font-mono ${flowCards.netCashUSD >= 0 ? 'text-cyan-300' : 'text-red-400'}`}>
            ${flowCards.netCashUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs font-mono text-slate-400 mt-1">
            Bs. {flowCards.netCashVES.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[10px] text-slate-500 mt-2">Balance neto disponible</p>
        </div>

        {/* Proformas & Facturas Emitidas */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider">Proformas Emitidas</span>
            <FileText className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-300">
            {invoices.length}{' '}
            <span className="text-xs font-normal text-slate-400">documentos</span>
          </div>
          <div className="text-xs font-mono text-slate-400 mt-1">
            ${invoices.reduce((a, b) => a + b.totalUSD, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
          </div>
          <p className="text-[10px] text-slate-500 mt-2">Regímenes Avícola y Porcino</p>
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-2 p-1 bg-slate-900 border border-slate-800 rounded-2xl flex-wrap">
        <button
          onClick={() => setActiveTab('LIBRO_CONTABLE')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
            activeTab === 'LIBRO_CONTABLE'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Libro Contable Bimonetario</span>
          <span className="text-[10px] bg-slate-950 px-1.5 py-0.2 rounded text-emerald-300 font-mono">
            {payments.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('FACTURACION')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
            activeTab === 'FACTURACION'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Facturación &amp; Proformas</span>
          <span className="text-[10px] bg-slate-950 px-1.5 py-0.2 rounded text-amber-300 font-mono">
            {invoices.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('ENTIDADES_DUALES')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
            activeTab === 'ENTIDADES_DUALES'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>CRM / VRM Dual &amp; Cruce</span>
          <span className="text-[10px] bg-slate-950 px-1.5 py-0.2 rounded text-cyan-300 font-mono">
            {entities.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('CONCILIACION_PAGOS')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
            activeTab === 'CONCILIACION_PAGOS'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Receipt className="w-3.5 h-3.5 text-purple-400" />
          <span>Conciliación de Pagos</span>
          <span className="text-[10px] bg-slate-950 px-1.5 py-0.2 rounded text-purple-300 font-mono">
            {reconciliations.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('MARK_TO_MARKET')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
            activeTab === 'MARK_TO_MARKET'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Simulador Mark-to-Market</span>
        </button>

        <button
          onClick={() => setActiveTab('INTELIGENCIA_FINANCIERA')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
            activeTab === 'INTELIGENCIA_FINANCIERA'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span>Inteligencia Financiera (P&amp;L / Balance)</span>
        </button>

        <button
          onClick={() => setActiveTab('COMPRAS_CXP')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
            activeTab === 'COMPRAS_CXP'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Receipt className="w-3.5 h-3.5 text-emerald-400" />
          <span>Compras, CxP &amp; Gastos</span>
          <span className="text-[10px] bg-slate-950 px-1.5 py-0.2 rounded text-emerald-300 font-mono">
            Nuevo
          </span>
        </button>
      </div>

      {/* ==================================================== */}
      {/* SUB-TAB 1: LIBRO CONTABLE BIMONETARIO */}
      {/* ==================================================== */}
      {activeTab === 'LIBRO_CONTABLE' && (
        <BookkeepingTab
          payments={payments}
          onNewEntry={() => setShowPaymentModal(true)}
        />
      )}

      {/* ==================================================== */}
      {/* SUB-TAB 2: FACTURACIÓN & PROFORMAS FISCALES */}
      {/* ==================================================== */}
      {activeTab === 'FACTURACION' && (
        <div className="space-y-4">
          {/* Formulario Modal de Emisión de Proforma */}
          {showInvoiceForm && (
            <form onSubmit={handleCreateInvoice} className="p-6 bg-slate-900 border border-slate-700 rounded-3xl space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-400" />
                  <span>Emisión de Proforma / Comprobante Fiscal Bimonetario</span>
                </h3>
                <span className="text-xs font-mono text-emerald-400 font-bold bg-emerald-950 px-2.5 py-1 rounded-lg border border-emerald-800">
                  Tasa BCV Activa: {bcvRate.toFixed(4)} Bs./USD
                </span>
              </div>

              {/* Selector de Modalidad Comercial (Contado vs Crédito) */}
              <div className="p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-slate-200 font-bold text-xs uppercase tracking-wider flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-amber-400" />
                    <span>Modalidad de la Transacción Comercial</span>
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">
                    {invModalidad === 'CREDITO' ? 'Venta a Crédito / Financiamiento' : 'Pago Inmediato de Contado'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setInvModalidad('CONTADO')}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                      invModalidad === 'CONTADO'
                        ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200 shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full border border-emerald-400 flex items-center justify-center">
                      {invModalidad === 'CONTADO' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                    </span>
                    <span>De Contado</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInvModalidad('CREDITO')}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                      invModalidad === 'CREDITO'
                        ? 'bg-blue-950/80 border-blue-500 text-blue-200 shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full border border-blue-400 flex items-center justify-center">
                      {invModalidad === 'CREDITO' && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                    </span>
                    <span>A Crédito (Financiamiento)</span>
                  </button>
                </div>

                {/* Métodos de Pago Extendidos */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1 text-xs">
                      {invModalidad === 'CREDITO' ? 'Método de Pago para Liquidación' : 'Método de Pago Acordado'}
                    </label>
                    <select
                      value={invMetodoPago}
                      onChange={(e) => setInvMetodoPago(e.target.value as MetodoPago)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 text-xs outline-none focus:border-amber-500"
                    >
                      <option value="TRANSFERENCIA">Transferencia Bancaria Nacional</option>
                      <option value="PAGO_MOVIL">Pago Móvil Interbancario (Bs.)</option>
                      <option value="EFECTIVO_USD">Efectivo Divisas ($ USD)</option>
                      <option value="EFECTIVO_VES">Efectivo Bolívares (Bs. VES)</option>
                      <option value="BINANCE_USDT">Binance Pay (USDT / Cripto)</option>
                      <option value="INTERNACIONAL">Transferencia Internacional (Swift / Zelle)</option>
                      <option value="CL">Carta de Crédito / Liquidación Comercial (CL)</option>
                      <option value="CRUCE_CUENTAS">Cruce de Cuentas Dual (Cliente/Proveedor)</option>
                      <option value="RETENCION">Retención SENIAT Fiscal / Comprobante</option>
                    </select>
                  </div>

                  {invModalidad === 'CREDITO' && (
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1 text-xs">Frecuencia de Cuotas</label>
                      <select
                        value={invFrecuenciaPago}
                        onChange={(e) => setInvFrecuenciaPago(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 text-xs outline-none focus:border-blue-500"
                      >
                        <option value="SEMANAL">Cuotas Semanales</option>
                        <option value="QUINCENAL">Cuotas Quincenales</option>
                        <option value="MENSUAL">Cuotas Mensuales</option>
                        <option value="UNICO">Pago Único al Vencimiento</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* Submódulo Condicional de Financiamiento a Crédito */}
                {invModalidad === 'CREDITO' && (
                  <div className="p-3 bg-blue-950/40 border border-blue-800/60 rounded-xl space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-900/40 pb-2">
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-blue-200 font-semibold">
                        <input
                          type="checkbox"
                          checked={invLlevaInicial}
                          onChange={(e) => setInvLlevaInicial(e.target.checked)}
                          className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700"
                        />
                        <span>¿Lleva Inicial / Anticipo de Venta?</span>
                      </label>
                      {invLlevaInicial && (
                        <span className="text-[10px] text-blue-300 bg-blue-900/50 px-2 py-0.5 rounded border border-blue-700">
                          Inicial Requerida
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      {invLlevaInicial && (
                        <div>
                          <label className="block text-slate-300 font-semibold mb-1">Monto Inicial ($ USD)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={invMontoInicialUSD}
                            onChange={(e) => setInvMontoInicialUSD(Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-white font-mono"
                          />
                        </div>
                      )}
                      {invLlevaInicial && (
                        <div>
                          <label className="block text-slate-300 font-semibold mb-1">Método de Pago Inicial</label>
                          <select
                            value={invMetodoPagoInicial}
                            onChange={(e) => setInvMetodoPagoInicial(e.target.value as MetodoPago)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-slate-100"
                          >
                            <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                            <option value="PAGO_MOVIL">Pago Móvil</option>
                            <option value="EFECTIVO_USD">Efectivo USD</option>
                            <option value="EFECTIVO_VES">Efectivo VES</option>
                            <option value="BINANCE_USDT">Binance USDT</option>
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="block text-slate-300 font-semibold mb-1">Días de Financiamiento</label>
                        <input
                          type="number"
                          min="1"
                          max="180"
                          value={invDiasFinanciamiento}
                          onChange={(e) => setInvDiasFinanciamiento(Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-300 font-semibold mb-1">Número de Cuotas</label>
                        <input
                          type="number"
                          min="1"
                          max="24"
                          value={invNumeroCuotas}
                          onChange={(e) => setInvNumeroCuotas(Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-white font-mono"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Datos del Cliente y Plazos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Nombre / Razón Social Cliente</label>
                  <input
                    type="text"
                    required
                    value={invCustomerName}
                    onChange={(e) => setInvCustomerName(e.target.value)}
                    placeholder="Ej. Distribuidora Avícola Central C.A."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">RIF / Cédula del Cliente</label>
                  <input
                    type="text"
                    required
                    value={invCustomerRif}
                    onChange={(e) => setInvCustomerRif(e.target.value)}
                    placeholder="Ej. J-12345678-9"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none uppercase font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={invCustomerPhone}
                    onChange={(e) => setInvCustomerPhone(e.target.value)}
                    placeholder="Ej. +58 412-1234567"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Fecha de Vencimiento</label>
                  <input
                    type="date"
                    required
                    value={invDueDate}
                    onChange={(e) => setInvDueDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none font-mono"
                  />
                </div>
              </div>

              {/* Vinculación Estricta con Inventario Biológico (Candado de Inventario) */}
              <div className="p-4 bg-slate-950/90 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-slate-200 font-bold text-xs uppercase tracking-wider flex items-center gap-2">
                    <Scale className="w-4 h-4 text-emerald-400" />
                    <span>Vinculación con Inventario Biológico (Respaldo Físico)</span>
                  </label>
                  <span className="text-[10px] text-slate-400">
                    Candado anti-ventas sin existencia real
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Lote Biológico a Facturar
                    </label>
                    <select
                      value={invSelectedBatchId}
                      onChange={(e) => {
                        const batchId = e.target.value;
                        setInvSelectedBatchId(batchId);
                        const b = batches.find((x) => x.id === batchId);
                        if (b) {
                          const isAvian = b.species === 'AVICOLA';
                          const availKg = isAvian ? b.grossWeightKg : (b.netWeightKg || Math.max(0, b.grossWeightKg - (b.deduccionMermaKg || 17.5)));
                          setInvCantidadKg(availKg);
                          setInvCantidadUnidades(b.currentCount);
                        } else {
                          setInvCantidadKg(0);
                          setInvCantidadUnidades(0);
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none focus:border-emerald-500 font-mono"
                    >
                      <option value="">Seleccione lote con existencia en granja...</option>
                      {batches.filter((b) => b.status === 'ACTIVO').map((b) => {
                        const isAvian = b.species === 'AVICOLA';
                        const rate = isAvian ? (b.precioFacturableUsdPorKg ?? 4.0) : (b.precioFacturableNetoUsdPorKg ?? 6.0);
                        const availKg = isAvian ? b.grossWeightKg : (b.netWeightKg || Math.max(0, b.grossWeightKg - (b.deduccionMermaKg || 17.5)));
                        return (
                          <option key={b.id} value={b.id}>
                            {b.code} — {b.species} ({availKg.toLocaleString()} kg disp. • {b.currentCount} animales • ${rate.toFixed(2)}/kg)
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Tipo de Presentación</label>
                    <select
                      value={invTipoPresentacion}
                      onChange={(e) => setInvTipoPresentacion(e.target.value as TipoPresentacion)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none"
                    >
                      <option value="VIVO">En Pie / Peso Vivo en Granja</option>
                      <option value="EMPACADO">Empacado / Beneficiado en Canal</option>
                    </select>
                  </div>
                </div>

                {/* Cantidades a Facturar */}
                {invSelectedBatchId && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Cantidad en Kilogramos (Kg)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={invCantidadKg}
                        onChange={(e) => setInvCantidadKg(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold"
                        placeholder="Kg a despachar"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Cantidad de Animales / Cabezas</label>
                      <input
                        type="number"
                        min="0"
                        value={invCantidadUnidades}
                        onChange={(e) => setInvCantidadUnidades(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold"
                        placeholder="N° de unidades"
                      />
                    </div>
                  </div>
                )}

                {/* ALERTA VISUAL: Candado Estricto de Inventario */}
                {invInventoryError && (
                  <div className="p-3 bg-red-950/90 border-2 border-red-500 rounded-xl text-red-200 text-xs flex items-center gap-2.5 font-bold animate-pulse">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                    <div className="flex-1">
                      <span className="block text-red-300 uppercase tracking-wide text-[11px]">
                        Operación denegada: Existencia insuficiente en lote
                      </span>
                      <span className="text-[11px] font-normal text-red-200">
                        {invInventoryError}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1 text-xs">Dirección Fiscal del Cliente</label>
                <input
                  type="text"
                  value={invCustomerAddress}
                  onChange={(e) => setInvCustomerAddress(e.target.value)}
                  placeholder="Ej. Zona Industrial I, Barquisimeto, Estado Lara"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1 text-xs">Notas de Facturación / Términos de Entrega</label>
                <input
                  type="text"
                  value={invNotes}
                  onChange={(e) => setInvNotes(e.target.value)}
                  placeholder="Ej. Flete incluido en puerta de granja. Pago contra recepción a tasa oficial BCV."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowInvoiceForm(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={Boolean(invInventoryError)}
                  className={`px-5 py-2 rounded-xl font-semibold text-xs shadow-md flex items-center gap-1.5 transition ${
                    invInventoryError
                      ? 'bg-slate-800 text-slate-500 border border-red-900 cursor-not-allowed opacity-60'
                      : 'bg-amber-600 hover:bg-amber-500 text-white'
                  }`}
                >
                  <Printer className="w-4 h-4" />
                  <span>Emitir y Previsualizar Comprobante</span>
                </button>
              </div>
            </form>
          )}

          {/* Tabla de Proformas Emitidas Desacoplada */}
          <BillingTab
            invoices={invoices}
            onNewInvoice={() => setShowInvoiceForm(true)}
            onPrintInvoice={(inv) => {
              setSelectedInvoiceForPrint(inv);
              setIsPrintModalOpen(true);
            }}
            onOpenReconciliation={handleOpenReconciliation}
          />
        </div>
      )}

      {/* ==================================================== */}
      {/* SUB-TAB 3: ENTIDADES DUALES & CRUCE DE CUENTAS */}
      {/* ==================================================== */}
      {activeTab === 'ENTIDADES_DUALES' && (
        <DualEntitiesTab
          entities={entities}
          onNewEntity={() => setShowEntityModal(true)}
          onOpenCrossClearing={(e) => {
            setSelectedEntityForClearing(e);
            setCrossClearingAmount(Math.abs(e.balanceUSD));
            setShowCrossClearingModal(true);
          }}
          onSelectEntityForPayment={(id) => {
            handleSelectEntityForPayment(id);
            setShowPaymentModal(true);
          }}
        />
      )}

      {/* ==================================================== */}
      {/* SUB-TAB: CONCILIACIÓN DE PAGOS Y CRUCE CRM/BRM */}
      {/* ==================================================== */}
      {activeTab === 'CONCILIACION_PAGOS' && (
        <ReconciliationTab
          reconciliations={reconciliations}
          recFiltroEstado={recFiltroEstado}
          setRecFiltroEstado={setRecFiltroEstado}
          onOpenReconciliation={() => handleOpenReconciliation()}
          entities={entities}
          invoices={invoices}
          bcvRate={bcvRate}
        />
      )}

      {/* ==================================================== */}
      {/* SUB-TAB 4: SIMULADOR MARK-TO-MARKET */}
      {/* ==================================================== */}
      {activeTab === 'MARK_TO_MARKET' && (
        <MarkToMarketTab
          manualRateInput={manualRateInput}
          setManualRateInput={setManualRateInput}
          markToMarketRows={markToMarketRows}
        />
      )}

      {/* ==================================================== */}
      {/* SUB-TAB 5: INTELIGENCIA FINANCIERA (P&L Y BALANCE GENERAL) */}
      {/* ==================================================== */}
      {activeTab === 'INTELIGENCIA_FINANCIERA' && (
        <React.Suspense
          fallback={
            <div className="p-12 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
              <div className="text-xs font-medium">Cargando motor de Inteligencia Financiera...</div>
              <div className="text-[10px] text-slate-500 font-mono">Desacoplamiento modular en ejecución (Code-Splitting)</div>
            </div>
          }
        >
          <FinancialIntelligenceDashboard
            payments={payments}
            entities={entities}
            batches={batches}
            bcvRate={bcvRate}
          />
        </React.Suspense>
      )}

      {/* ==================================================== */}
      {/* SUB-TAB 6: COMPRAS Y CUENTAS POR PAGAR (CxP) */}
      {/* ==================================================== */}
      {activeTab === 'COMPRAS_CXP' && (
        <ModuleErrorBoundary moduleName="Compras, Cuentas por Pagar (CxP) y Gastos">
          <React.Suspense
            fallback={
              <div className="p-12 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center gap-3 text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                <div className="text-xs font-medium">Cargando módulo de Compras, CxP y Gastos...</div>
                <div className="text-[10px] text-slate-500 font-mono">Cuentas por pagar, términos de proveedores y alarmas de insumos</div>
              </div>
            }
          >
            <PurchasesPayablesTab
              userId={userProfile?.uid || 'anonymous'}
              userRole={userProfile?.role || 'ADMIN'}
            />
          </React.Suspense>
        </ModuleErrorBoundary>
      )}

      {/* Modal Nuevo Asiento Contable Bimonetario Refactorizado */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <form
            onSubmit={handleSavePayment}
            className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-3xl p-6 space-y-4 text-xs animate-fadeIn max-h-[92vh] overflow-y-auto shadow-2xl"
          >
            {/* Header del Modal */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Nuevo Asiento Contable Bimonetario
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Registro contable dual oficial con snapshot criptográfico BCV
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            {/* Selector de Clasificación de Impacto Contable (6 Categorías) */}
            <div className="space-y-2">
              <label className="block text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                Clasificación de Impacto Financiero
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={payImpact}
                  onChange={(e) => setPayImpact(e.target.value as FinancialImpactType)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 font-medium outline-none focus:border-emerald-500 transition col-span-1 sm:col-span-2"
                >
                  <optgroup label="─── INGRESOS OPERATIVOS ───">
                    <option value="INGRESO_VENTA">🟢 INGRESO: Venta / Comercialización de Lotes y Aves</option>
                  </optgroup>
                  <optgroup label="─── EGRESOS OPERATIVOS Y PRODUCTIVOS ───">
                    <option value="EGRESO_PROVEEDOR">🔴 EGRESO: Proveedores (Materia Prima / Alimento / Aves)</option>
                    <option value="EGRESO_SERVICIOS">🔵 EGRESO: Servicios Operativos (Fletes, Gasoil, Electricidad)</option>
                  </optgroup>
                  <optgroup label="─── EGRESOS LABORALES Y PROFESIONALES ───">
                    <option value="EGRESO_NOMINA">🟠 EGRESO: Nómina de Personal (Sueldos y Jornales)</option>
                    <option value="EGRESO_HONORARIOS">🟣 EGRESO: Honorarios Profesionales (Veterinarios, Asesores)</option>
                  </optgroup>
                  <optgroup label="─── EGRESOS FISCALES Y TRIBUTARIOS ───">
                    <option value="EGRESO_IMPUESTOS">🟪 EGRESO: Tributos, Impuestos y Retenciones SENIAT</option>
                  </optgroup>
                </select>
              </div>

              {/* Indicador Dinámico Visual de Impacto */}
              {(() => {
                const currentConfig = IMPACT_CONFIG[payImpact] || IMPACT_CONFIG.INGRESO_VENTA;
                const isIncome = currentConfig.flow === 'INGRESO';
                return (
                  <div
                    className={`p-3 rounded-2xl border ${currentConfig.borderClass} ${currentConfig.bgLightClass} transition-all space-y-1`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold flex items-center gap-1.5 text-xs text-white">
                        <span>{isIncome ? '🟢' : '🔴'}</span>
                        <span>{currentConfig.label}</span>
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${currentConfig.badgeClass}`}
                      >
                        {isIncome ? '+ ENTRADA DE FONDOS' : '- SALIDA DE FONDOS'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      {currentConfig.description}
                    </p>
                  </div>
                );
              })()}
            </div>

            {/* Vinculación con Entidad Dual (CRM / VRM) */}
            <div className="p-3.5 bg-slate-950/60 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-slate-300 font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Entidad Asociada (CRM / VRM)</span>
                </label>
                <span className="text-[10px] text-slate-400">
                  {entities.length} entidades disponibles
                </span>
              </div>

              <div>
                <select
                  value={paySelectedEntityId}
                  onChange={(e) => handleSelectEntityForPayment(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none focus:border-cyan-500 transition"
                >
                  <option value="">-- Entrada Manual (Sin vincular a entidad registrada) --</option>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      [{e.roles.join(' / ')}] {e.razonSocial || e.name} ({e.identificacionFiscal || e.rifCedula})
                    </option>
                  ))}
                </select>
              </div>

              {/* Ficha Fiscal Dinámica si se selecciona entidad */}
              {(() => {
                const selectedEntity = entities.find((e) => e.id === paySelectedEntityId);
                if (!selectedEntity) return null;
                return (
                  <div className="p-3 bg-slate-900/90 border border-slate-700 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Perfil Fiscal & Tributario SENIAT</span>
                      </span>
                      <div className="flex items-center gap-1">
                        {selectedEntity.roles.map((r) => (
                          <span
                            key={r}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                              r === 'CLIENTE'
                                ? 'bg-blue-950 text-blue-300 border border-blue-800'
                                : 'bg-amber-950 text-amber-300 border border-amber-800'
                            }`}
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                      <div>
                        <span className="text-slate-500 block">Identificación:</span>
                        <span className="text-slate-200 font-mono font-semibold">
                          {selectedEntity.identificacionFiscal || selectedEntity.rifCedula}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Régimen IVA:</span>
                        <span className="text-cyan-300 font-semibold">
                          {selectedEntity.perfilFiscal?.regimenIva || 'GENERAL'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Contribuyente:</span>
                        <span className="text-slate-200 font-semibold">
                          {selectedEntity.perfilFiscal?.contribuyenteEspecial || 'ORDINARIO'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Retención IVA:</span>
                        <span className="text-amber-300 font-semibold">
                          {selectedEntity.perfilFiscal?.porcentajeRetencionIva !== undefined
                            ? `${selectedEntity.perfilFiscal.porcentajeRetencionIva}%`
                            : 'N/A'}
                        </span>
                      </div>
                    </div>

                    {(selectedEntity.telefonoContacto || selectedEntity.phone || selectedEntity.direccionFiscal || selectedEntity.address) && (
                      <div className="pt-1.5 border-t border-slate-800 flex flex-wrap gap-x-4 text-[10px] text-slate-400">
                        {(selectedEntity.telefonoContacto || selectedEntity.phone) && (
                          <span>📞 Tel: {selectedEntity.telefonoContacto || selectedEntity.phone}</span>
                        )}
                        {(selectedEntity.direccionFiscal || selectedEntity.address) && (
                          <span>📍 Dir: {selectedEntity.direccionFiscal || selectedEntity.address}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Campos de Nombre e Identificación */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Razón Social / Nombre</label>
                  <input
                    type="text"
                    required
                    value={payEntityName}
                    onChange={(e) => setPayEntityName(e.target.value)}
                    placeholder="Ej. Matadero Frigorífico San Fernando"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">RIF o Cédula</label>
                  <input
                    type="text"
                    required
                    value={payIdDoc}
                    onChange={(e) => setPayIdDoc(e.target.value)}
                    placeholder="Ej. J-12345678-9 o V-12345678"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none uppercase font-mono focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>

            {/* Datos Operativos de la Transacción */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Fecha de Operación</label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none font-mono focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Método de Pago</label>
                <select
                  value={payMode}
                  onChange={(e) => setPayMode(e.target.value as PaymentMode)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none focus:border-emerald-500"
                >
                  <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                  <option value="PAGO_MOVIL">Pago Móvil Interbancario</option>
                  <option value="EFECTIVO">Efectivo Divisas ($) / Bolívares (Bs.)</option>
                  <option value="ZELLE">Zelle / Transferencia Internacional</option>
                  <option value="OTRO">Otro Instrumento Financiero</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Banco / Plataforma Emisora</label>
                <input
                  type="text"
                  required
                  value={payPlatform}
                  onChange={(e) => setPayPlatform(e.target.value)}
                  placeholder="Ej. Banco de Venezuela / Banesco / Zelle"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">N° de Referencia / Comprobante</label>
                <input
                  type="text"
                  required
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                  placeholder="Ej. REF-884920"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none uppercase font-mono focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Ciudad / Sede</label>
                <input
                  type="text"
                  required
                  value={payCity}
                  onChange={(e) => setPayCity(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Factura o Lote Asociado (Opcional)</label>
                <input
                  type="text"
                  value={payLinkedInvoice}
                  onChange={(e) => setPayLinkedInvoice(e.target.value)}
                  placeholder="Ej. PRO-2026-001 o LOTE-AV-01"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none uppercase font-mono focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Conversión Bimonetaria Simultánea e Inalterada */}
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 block">
                  Conversión Bimonetaria Simultánea
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-emerald-950/80 border border-emerald-800/80 text-[10px] text-emerald-300 font-mono font-bold">
                  Tasa BCV: {bcvRate.toFixed(4)} Bs/$
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Importe en Dólares ($ USD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={payAmountUSD}
                    onChange={(e) => handleAmountUSDChange(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold text-sm outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Contravalor en Bolívares (Bs. VES)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={payAmountVES}
                    onChange={(e) => handleAmountVESChange(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-cyan-300 font-mono font-bold text-sm outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-500 italic">
                * El cálculo bimonetario congela el contravalor con la tasa oficial BCV ({bcvRate.toFixed(4)}) en un snapshot inmutable.
              </p>
            </div>

            {/* Acciones del Formulario */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg shadow-emerald-950/50 transition flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Asentar en Libro Bimonetario</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Nueva Entidad Dual (CRM / VRM) con Perfilamiento Fiscal SENIAT */}
      {showEntityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveEntity}
            className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-3xl p-6 sm:p-7 space-y-5 text-xs text-slate-200 shadow-2xl animate-fadeIn my-8"
          >
            {/* Header del Modal */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-cyan-950/70 border border-cyan-800 text-cyan-400">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Alta y Perfilamiento Fiscal de Entidad Dual (CRM / VRM)
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Registro canónico en Firestore con atributos fiscales venezolanos SENIAT y soporte bimonetario.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEntityModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {/* Selector Dinámico de Roles Operativos */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
              <label className="block text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                Roles de la Entidad en el Ecosistema Agroindustrial <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                    entRoles.includes('CLIENTE')
                      ? 'bg-cyan-950/40 border-cyan-700 text-cyan-200'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={entRoles.includes('CLIENTE')}
                    onChange={(e) => {
                      if (e.target.checked) setEntRoles([...entRoles, 'CLIENTE']);
                      else setEntRoles(entRoles.filter((r) => r !== 'CLIENTE'));
                    }}
                    className="mt-0.5 rounded text-cyan-500 focus:ring-0"
                  />
                  <div>
                    <span className="font-bold text-xs block text-white">Cliente (CRM)</span>
                    <span className="text-[10px] text-slate-400">
                      Cuentas por Cobrar, facturación de proformas, venta avícola y porcina.
                    </span>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                    entRoles.includes('PROVEEDOR')
                      ? 'bg-amber-950/40 border-amber-700 text-amber-200'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={entRoles.includes('PROVEEDOR')}
                    onChange={(e) => {
                      if (e.target.checked) setEntRoles([...entRoles, 'PROVEEDOR']);
                      else setEntRoles(entRoles.filter((r) => r !== 'PROVEEDOR'));
                    }}
                    className="mt-0.5 rounded text-amber-500 focus:ring-0"
                  />
                  <div>
                    <span className="font-bold text-xs block text-white">Proveedor (VRM)</span>
                    <span className="text-[10px] text-slate-400">
                      Cuentas por Pagar, insumos biológicos, alimentos concentrados, servicios.
                    </span>
                  </div>
                </label>
              </div>

              {entRoles.includes('CLIENTE') && entRoles.includes('PROVEEDOR') && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-purple-950/60 border border-purple-800 text-purple-200 text-[11px] animate-fadeIn">
                  <ArrowRightLeft className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>
                    <strong>Entidad Dual Activa:</strong> Esta entidad opera simultáneamente como cliente y proveedor. Habilita liquidación por compensación (*Account Cross-Clearing*).
                  </span>
                </div>
              )}
            </div>

            {/* Grid de Formulario de Perfil Fiscal */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Razón Social */}
              <div className="space-y-1 sm:col-span-2">
                <label className="block text-slate-300 font-semibold">
                  Razón Social Oficial <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Agropecuaria & Distribuidora San Fernando C.A."
                  value={entName}
                  onChange={(e) => setEntName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 outline-none"
                />
                <span className="text-[10px] text-slate-500 block">
                  Denominación legal registrada ante el Registro Mercantil.
                </span>
              </div>

              {/* Identificación Fiscal */}
              <div className="space-y-1">
                <label className="block text-slate-300 font-semibold">
                  Identificación Fiscal (RIF o Cédula) <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. J-31459876-0 o V-14829102"
                  value={entRif}
                  onChange={(e) => setEntRif(e.target.value.toUpperCase())}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 font-mono font-bold uppercase placeholder:text-slate-600 focus:border-cyan-500 outline-none"
                />
                <span className="text-[10px] text-slate-500 block">
                  Formato RIF: J-, G-, V-, E- o Cédula de Identidad.
                </span>
              </div>

              {/* Teléfono de Contacto Fiscal */}
              <div className="space-y-1">
                <label className="block text-slate-300 font-semibold">
                  Teléfono de Contacto Fiscal <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-emerald-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    required
                    placeholder="+58 414-1234567"
                    value={entPhone}
                    onChange={(e) => setEntPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 pl-9 pr-3 text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 outline-none font-mono"
                  />
                </div>
                <span className="text-[10px] text-slate-500 block">
                  Contacto directo de cobranza y confirmación de pagos.
                </span>
              </div>

              {/* Dirección Fiscal Oficial */}
              <div className="space-y-1 sm:col-span-2">
                <label className="block text-slate-300 font-semibold">
                  Dirección Fiscal Declarada SENIAT <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-cyan-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    required
                    placeholder="Ej. Zona Industrial San Fernando, Galpón 4, San Fernando de Apure, Estado Apure"
                    value={entAddress}
                    onChange={(e) => setEntAddress(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 pl-9 pr-3 text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 outline-none"
                  />
                </div>
                <span className="text-[10px] text-slate-500 block">
                  Domicilio tributario oficial para emisión de comprobantes y retenciones.
                </span>
              </div>

              {/* Ciudad / Municipio */}
              <div className="space-y-1">
                <label className="block text-slate-300 font-semibold">
                  Ciudad o Municipio
                </label>
                <input
                  type="text"
                  placeholder="San Fernando de Apure"
                  value={entCity}
                  onChange={(e) => setEntCity(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 outline-none"
                />
              </div>

              {/* Tipo de Contribuyente SENIAT */}
              <div className="space-y-1">
                <label className="block text-slate-300 font-semibold">
                  Tipo de Contribuyente SENIAT
                </label>
                <select
                  value={entContribuyenteEspecial}
                  onChange={(e) => setEntContribuyenteEspecial(e.target.value as ContribuyenteEspecialType)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:border-cyan-500 outline-none"
                >
                  <option value="ORDINARIO">Contribuyente Ordinario</option>
                  <option value="ESPECIAL">Contribuyente Especial (Designado SENIAT)</option>
                  <option value="FORMAL">Contribuyente Formal</option>
                </select>
              </div>

              {/* Régimen de IVA */}
              <div className="space-y-1">
                <label className="block text-slate-300 font-semibold">
                  Régimen de IVA
                </label>
                <select
                  value={entRegimenIva}
                  onChange={(e) => setEntRegimenIva(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:border-cyan-500 outline-none"
                >
                  <option value="GENERAL">Régimen General (16%)</option>
                  <option value="RETENCION_75">Sujeto a Retención 75% IVA</option>
                  <option value="RETENCION_100">Sujeto a Retención 100% IVA</option>
                  <option value="EXENTO">Exento / Actividad Agropecuaria Primaria</option>
                </select>
              </div>

              {/* Saldo Inicial de Apertura */}
              <div className="space-y-1">
                <label className="block text-slate-300 font-semibold">
                  Saldo Inicial Consolidado (USD $)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={entBalanceUSD}
                  onChange={(e) => setEntBalanceUSD(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 font-mono font-bold focus:border-cyan-500 outline-none"
                />
                <span className="text-[10px] text-slate-400 block font-mono">
                  Equivalente: Bs. {((entBalanceUSD || 0) * bcvRate).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Aviso DevSecOps */}
            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center gap-2.5 text-[11px] text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Registro autenticado DevSecOps: Se aplican reglas de seguridad ABAC en Firestore y control estricto de roles.
              </span>
            </div>

            {/* Acciones del Formulario */}
            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowEntityModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/40 transition flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>Guardar Entidad con Perfil Fiscal</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Compensación de Cuentas (Account Cross-Clearing) */}
      {showCrossClearingModal && selectedEntityForClearing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-slate-900 border border-purple-800/80 rounded-3xl p-6 space-y-4 text-xs text-slate-200 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-950 border border-purple-800 text-purple-400">
                  <ArrowRightLeft className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Compensación de Cuentas (Cross-Clearing)
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Extinción de deudas recíprocas para entidad dual.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCrossClearingModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Entidad Dual:</span>
                <span className="font-bold text-white text-sm">
                  {selectedEntityForClearing.razonSocial || selectedEntityForClearing.name}
                </span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-400">RIF / Cédula:</span>
                <span className="font-mono text-cyan-300 font-bold">
                  {selectedEntityForClearing.identificacionFiscal || selectedEntityForClearing.rifCedula}
                </span>
              </div>
              <div className="flex justify-between items-center text-[11px] pt-2 border-t border-slate-800">
                <span className="text-slate-400">Saldo Neto Actual:</span>
                <span className={`font-mono font-bold ${selectedEntityForClearing.balanceUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  ${selectedEntityForClearing.balanceUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} (Bs. {selectedEntityForClearing.balanceVES.toLocaleString(undefined, { minimumFractionDigits: 2 })})
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-slate-300 font-semibold">
                Monto a Compensar en USD ($):
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={Math.abs(selectedEntityForClearing.balanceUSD) || undefined}
                value={crossClearingAmount}
                onChange={(e) => setCrossClearingAmount(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-100 font-mono font-bold text-sm focus:border-purple-500 outline-none"
              />
              <span className="text-[10px] text-slate-400 block font-mono">
                Equivalente a compensar en Bs.: ${(crossClearingAmount * bcvRate).toLocaleString(undefined, { minimumFractionDigits: 2 })} (Tasa BCV: {bcvRate.toFixed(4)})
              </span>
            </div>

            <p className="text-[11px] text-slate-400 bg-purple-950/30 border border-purple-900/50 p-3 rounded-xl">
              Al ejecutar la compensación, se reduce tanto el saldo por cobrar como el saldo por pagar de forma simétrica en el libro mayor bimonetario.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowCrossClearingModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteCrossClearing}
                disabled={crossClearingAmount <= 0}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold transition flex items-center gap-1.5 shadow-lg shadow-purple-950/50"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Ejecutar Compensación</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal: Conciliación de Pagos / Abono a Crédito (Fase 3 & 4) */}
      {showReconciliationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveReconciliation}
            className="bg-slate-900 border border-purple-500/50 rounded-3xl p-6 max-w-xl w-full shadow-2xl space-y-4 my-8 animate-fadeIn"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-950 text-purple-400 flex items-center justify-center border border-purple-800">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Registrar Conciliación de Pago / Abono
                  </h3>
                  <span className="text-[10px] text-slate-400">
                    Cruce atómico contra facturación y libro mayor bimonetario
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReconciliationModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Selector de Factura a Conciliar */}
            <div className="space-y-1">
              <label className="block text-slate-300 font-semibold text-xs">
                Vincular a Factura / Proforma (Opcional):
              </label>
              <select
                value={recFacturaId}
                onChange={(e) => {
                  const id = e.target.value;
                  setRecFacturaId(id);
                  const found = invoices.find((inv) => inv.id === id);
                  if (found) {
                    setRecClienteNombre(found.customerName);
                    setRecClienteRif(found.customerRif);
                    setRecModalidad(found.modalidadTransaccion || 'CREDITO');
                    setRecMetodoPago(found.metodoPago || 'TRANSFERENCIA');
                    const saldo = found.saldoPendienteUSD !== undefined && found.saldoPendienteUSD > 0
                      ? found.saldoPendienteUSD
                      : found.totalUSD;
                    setRecMontoRecibido(saldo);
                    if (found.detalleProducto?.loteId) setRecLoteId(found.detalleProducto.loteId);
                  }
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 text-xs outline-none focus:border-purple-500 font-mono"
              >
                <option value="">Cobranza directa / Sin factura asociada</option>
                {invoices.map((inv) => {
                  const saldo = inv.saldoPendienteUSD !== undefined ? inv.saldoPendienteUSD : inv.totalUSD;
                  return (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} — {inv.customerName} (Pendiente: ${saldo.toFixed(2)} USD • Total: ${inv.totalUSD.toFixed(2)} USD)
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Datos del Cliente */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Cliente / Razón Social</label>
                <input
                  type="text"
                  required
                  value={recClienteNombre}
                  onChange={(e) => setRecClienteNombre(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-purple-500 font-sans"
                  placeholder="Nombre o Empresa"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">RIF / Cédula</label>
                <input
                  type="text"
                  required
                  value={recClienteRif}
                  onChange={(e) => setRecClienteRif(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-purple-500 font-mono"
                  placeholder="J-12345678-9"
                />
              </div>
            </div>

            {/* Parámetros de Transacción */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Fecha de Cobro</label>
                <input
                  type="date"
                  required
                  value={recDate}
                  onChange={(e) => setRecDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Modalidad</label>
                <select
                  value={recModalidad}
                  onChange={(e) => setRecModalidad(e.target.value as ModalidadTransaccion)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none"
                >
                  <option value="CONTADO">Contado</option>
                  <option value="CREDITO">Crédito</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Impacto Contable</label>
                <select
                  value={recTipoImpacto}
                  onChange={(e) => setRecTipoImpacto(e.target.value as TipoImpactoConciliacion)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none font-mono text-[11px]"
                >
                  <option value="INGRESO_HOY">Ingreso Hoy (Venta Directa)</option>
                  <option value="INGRESO_EXTEMPORANEO">Ingreso Extemporáneo (Cobro de Crédito)</option>
                  <option value="CRUCE_CUENTAS">Cruce de Cuentas (Compensación)</option>
                  <option value="RETENCION_FISCAL">Retención Fiscal SENIAT</option>
                </select>
              </div>
            </div>

            {/* Método de Pago y Banco */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Método de Pago</label>
                <select
                  value={recMetodoPago}
                  onChange={(e) => setRecMetodoPago(e.target.value as MetodoPago)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-purple-500"
                >
                  <option value="TRANSFERENCIA">Transferencia Bancaria Nacional</option>
                  <option value="PAGO_MOVIL">Pago Móvil Interbancario (Bs.)</option>
                  <option value="EFECTIVO_USD">Efectivo Divisas ($ USD)</option>
                  <option value="EFECTIVO_VES">Efectivo Bolívares (Bs. VES)</option>
                  <option value="BINANCE_USDT">Binance Pay (USDT / Cripto)</option>
                  <option value="INTERNACIONAL">Transferencia Internacional (Zelle / Swift)</option>
                  <option value="CL">Carta de Crédito / Liquidación (CL)</option>
                  <option value="CRUCE_CUENTAS">Cruce de Cuentas Dual</option>
                  <option value="RETENCION">Retención SENIAT</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Banco o Plataforma</label>
                <input
                  type="text"
                  required
                  value={recBancoPlataforma}
                  onChange={(e) => setRecBancoPlataforma(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-purple-500"
                  placeholder="ej. Banco de Venezuela / Mercantil / Banesco"
                />
              </div>
            </div>

            {/* Referencia Bancaria y Lote */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">N° Referencia / Comprobante</label>
                <input
                  type="text"
                  required
                  value={recNumeroReferencia}
                  onChange={(e) => setRecNumeroReferencia(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-purple-500 font-mono"
                  placeholder="ej. REF-98372645"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Lote Biológico Asociado (Opcional)</label>
                <select
                  value={recLoteId}
                  onChange={(e) => setRecLoteId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none font-mono"
                >
                  <option value="">Sin lote específico</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} ({b.species} - Días {b.daysInCycle})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Moneda y Montos Bimonetarios */}
            <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Moneda Recibida</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRecMonedaRecibida('USD')}
                      className={`py-1.5 px-3 rounded-lg border text-xs font-semibold font-mono transition ${
                        recMonedaRecibida === 'USD'
                          ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      Dólares ($ USD)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecMonedaRecibida('VES')}
                      className={`py-1.5 px-3 rounded-lg border text-xs font-semibold font-mono transition ${
                        recMonedaRecibida === 'VES'
                          ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      Bolívares (Bs. VES)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Monto Recibido ({recMonedaRecibida})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={recMontoRecibido}
                    onChange={(e) => setRecMontoRecibido(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-white font-mono font-bold text-sm outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Conversión en Vivo con BCV */}
              <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Tasa Oficial BCV: {bcvRate.toFixed(4)} VES/USD</span>
                <span className="font-bold text-emerald-400">
                  Equivalente:{' '}
                  {recMonedaRecibida === 'USD'
                    ? `Bs. ${(recMontoRecibido * bcvRate).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                    : `$ ${(bcvRate > 0 ? recMontoRecibido / bcvRate : 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD`}
                </span>
              </div>
            </div>

            {/* Observaciones */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1 text-xs">Observaciones / Notas Fiscales</label>
              <textarea
                rows={2}
                value={recObservaciones}
                onChange={(e) => setRecObservaciones(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white text-xs outline-none focus:border-purple-500"
                placeholder="Detalle adicional sobre la conciliación o comprobante de retención..."
              />
            </div>

            {/* Botones de Acción */}
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowReconciliationModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={recMontoRecibido <= 0 || !recNumeroReferencia.trim()}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-lg shadow-purple-950/50"
              >
                <CheckCheck className="w-4 h-4" />
                <span>Procesar y Conciliar Pago</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
