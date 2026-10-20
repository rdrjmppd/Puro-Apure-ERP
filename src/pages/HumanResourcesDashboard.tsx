/**
 * Puro Apure ERP - Módulo de Gestión de Talento Humano y Rendimiento Operativo
 * Interfaz de Gestión (UI) y Enrutamiento Protegido ABAC (Fase 2)
 * 
 * Acceso Exclusivo: ADMIN y SUPERADMIN (OBRERO denegado)
 * Data Tables duales: Nómina Fija y Honorarios Profesionales
 * Estadísticas vinculadas en tiempo real al documento centralizado hr_stats
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBrand } from '../context/BrandContext';
import {
  HumanResourceRecord,
  NominaFijaEmployee,
  HonorariosEmployee,
  HRStats,
  ContractType,
  EmployeeStatus,
  PaymentFrequency,
  HRDepartment,
  BiologicalBatch,
  FarmBiologicalControl,
  PaymentMode,
} from '../types';
import { HumanResourcesService } from '../services/humanResourcesService';
import { InventoryService } from '../services/inventoryService';
import { FinanceService } from '../services/financeService';
import { OperationalKPIs } from '../components/OperationalKPIs';
import { CORPORATE_HEADER_CONFIG } from '../utils/documentAssets';
import { generateCorporatePdfHtml, printOrExportPdfHtml } from '../utils/pdfTemplateEngine';
import {
  Users,
  UserPlus,
  Briefcase,
  DollarSign,
  Calendar,
  AlertCircle,
  Trash2,
  Edit3,
  CheckCircle,
  Search,
  Filter,
  Phone,
  Mail,
  Building2,
  Clock,
  X,
  FileText,
  BadgeCheck,
  Shield,
  Layers,
  Activity,
  CreditCard,
  Send,
  Printer,
  Download,
} from 'lucide-react';

const DEPARTMENTS: { value: HRDepartment; label: string }[] = [
  { value: 'PRODUCCION_AVICOLA', label: 'Producción Avícola (Galpones)' },
  { value: 'PRODUCCION_PORCINA', label: 'Producción Porcina (Piaras)' },
  { value: 'PLANTA_ALIMENTOS', label: 'Planta de Alimentos Balanceados' },
  { value: 'MANTENIMIENTO', label: 'Mantenimiento & Maquinaria' },
  { value: 'VETERINARIA', label: 'Salud Animal & Bioseguridad' },
  { value: 'LOGISTICA', label: 'Logística & Despacho' },
  { value: 'ADMINISTRACION', label: 'Administración & Finanzas' },
  { value: 'OTRO', label: 'Servicios Generales' },
];

export const HumanResourcesDashboard: React.FC = () => {
  const { userProfile, isAdmin, isSuperAdmin } = useAuth();
  const { logoUrl } = useBrand();

  // Estados de datos en tiempo real
  const [employees, setEmployees] = useState<HumanResourceRecord[]>([]);
  const [stats, setStats] = useState<HRStats>({
    id: 'hr_stats',
    activeNominaFijaCount: 0,
    activeHonorariosCount: 0,
    totalActiveCount: 0,
    totalInactiveCount: 0,
    totalMonthlyNominaUSD: 0,
    totalMonthlyHonorariosUSD: 0,
    lastUpdatedTimestamp: Date.now(),
    lastUpdatedBy: 'system',
  });

  // Estados de filtrado y búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('TODOS');
  const [selectedStatus, setSelectedStatus] = useState<string>('TODOS');
  const [activeTab, setActiveTab] = useState<'NOMINA_FIJA' | 'HONORARIOS_PROFESIONALES' | 'KPIS_OPERATIVOS'>('NOMINA_FIJA');

  // Datos zootécnicos para correlación Big Data
  const [batches, setBatches] = useState<BiologicalBatch[]>([]);
  const [controls, setControls] = useState<FarmBiologicalControl[]>([]);

  // Tasa Oficial BCV para Integración Bimonetaria (Fase 4)
  const [bcvRate, setBcvRate] = useState<number>(0);

  // Estado del Modal de Pago Bimonetario a Finanzas BCV (Trigger Fase 4)
  const [payingEmployee, setPayingEmployee] = useState<HumanResourceRecord | null>(null);
  const [payAmountUSD, setPayAmountUSD] = useState<number>(0);
  const [payMode, setPayMode] = useState<PaymentMode>('TRANSFERENCIA');
  const [payPlatform, setPayPlatform] = useState<string>('Banco de Venezuela Nómina');
  const [payConcept, setPayConcept] = useState<string>('');
  const [isDispatchingPayment, setIsDispatchingPayment] = useState<boolean>(false);

  // Estado del Recibo/Comprobante de Pago Imprimible (Fase 4)
  const [paymentReceipt, setPaymentReceipt] = useState<{
    record: any;
    employee: HumanResourceRecord;
  } | null>(null);

  // Estado del Modal de Empleado (Creación / Edición)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<HumanResourceRecord | null>(null);

  // Campos del formulario
  const [formTipoContrato, setFormTipoContrato] = useState<ContractType>('NOMINA_FIJA');
  const [formCedula, setFormCedula] = useState('');
  const [formNombre, setFormNombre] = useState('');
  const [formCargo, setFormCargo] = useState('');
  const [formDepartamento, setFormDepartamento] = useState<HRDepartment>('PRODUCCION_AVICOLA');
  const [formStatus, setFormStatus] = useState<EmployeeStatus>('ACTIVO');
  const [formTelefono, setFormTelefono] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formObservaciones, setFormObservaciones] = useState('');

  // Campos específicos: Nómina Fija
  const [formSueldoBaseUSD, setFormSueldoBaseUSD] = useState<number>(350);
  const [formAportesParafiscalesUSD, setFormAportesParafiscalesUSD] = useState<number>(45);
  const [formFechaIngreso, setFormFechaIngreso] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Campos específicos: Honorarios Profesionales
  const [formTarifaServicioUSD, setFormTarifaServicioUSD] = useState<number>(500);
  const [formFrecuenciaPago, setFormFrecuenciaPago] = useState<PaymentFrequency>('MENSUAL');
  const [formDescripcionServicio, setFormDescripcionServicio] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Suscripción reactiva al montar
  useEffect(() => {
    const unsubEmployees = HumanResourcesService.subscribeEmployees((list) => {
      setEmployees(list);
    });

    const unsubStats = HumanResourcesService.subscribeHRStats((s) => {
      setStats(s);
    });

    const unsubBatches = InventoryService.subscribeBatches((bList) => {
      setBatches(bList);
    });

    const unsubControls = InventoryService.subscribeFarmControls((cList) => {
      setControls(cList);
    });

    FinanceService.fetchLatestBcvRate().then((r) => {
      if (r > 0) setBcvRate(r);
    });

    const unsubRate = FinanceService.subscribeLatestRate((r) => {
      if (r > 0) setBcvRate(r);
    });

    return () => {
      unsubEmployees();
      unsubStats();
      unsubBatches();
      unsubControls();
      unsubRate();
    };
  }, []);

  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 5000);
  };

  // Abrir modal para dispensar pago bimonetario (Trigger Fase 4)
  const handleOpenPayModal = (emp: HumanResourceRecord) => {
    setPayingEmployee(emp);
    const defaultAmount =
      emp.tipoContrato === 'NOMINA_FIJA'
        ? (emp.sueldoBaseUSD || 0) + (emp.aportesParafiscalesUSD || 0)
        : emp.tarifaServicioUSD || 0;

    setPayAmountUSD(defaultAmount);
    setPayMode('TRANSFERENCIA');
    setPayPlatform('Banco de Venezuela Nómina');
    setPayConcept(
      emp.tipoContrato === 'NOMINA_FIJA'
        ? `Pago de Nómina Mensual - ${emp.nombreCompleto} (${emp.cargo})`
        : `Liquidación de Honorarios Profesionales - ${emp.nombreCompleto} (${emp.cargo})`
    );
  };

  // Confirmar y despachar asiento de egreso a Finanzas BCV (Fase 4)
  const handleConfirmDispatchPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingEmployee) return;

    if (payAmountUSD <= 0) {
      notify('El monto a liquidar debe ser mayor a 0 USD.', 'error');
      return;
    }

    setIsDispatchingPayment(true);
    const res = await HumanResourcesService.dispatchHRPaymentToFinance(
      payingEmployee,
      payAmountUSD,
      bcvRate,
      payMode,
      payPlatform,
      payConcept,
      userProfile?.displayName || 'admin'
    );
    setIsDispatchingPayment(false);

    if (res.success && res.paymentRecord) {
      const amountVES = (payAmountUSD * bcvRate).toLocaleString('es-VE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      notify(
        `Egreso contable asentado en Finanzas BCV: $${payAmountUSD.toFixed(2)} USD (Bs. ${amountVES}) • Ref: ${res.paymentRecord.reference}.`
      );
      setPaymentReceipt({ record: res.paymentRecord, employee: payingEmployee });
      setPayingEmployee(null);
    } else {
      notify(res.error || 'Error registrando egreso en Finanzas BCV.', 'error');
    }
  };

  // Generar / Previsualizar Comprobante de Pago Oficial para cualquier trabajador
  const handleGenerateReceipt = (emp: HumanResourceRecord) => {
    const amount =
      emp.tipoContrato === 'NOMINA_FIJA'
        ? (emp.sueldoBaseUSD || 0) + (emp.aportesParafiscalesUSD || 0)
        : emp.tarifaServicioUSD || 0;
    const ref = `REC-${emp.cedula.replace(/[^0-9]/g, '') || Date.now()}-${Date.now().toString().slice(-4)}`;
    setPaymentReceipt({
      employee: emp,
      record: {
        id: `rec_${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        paymentMode: 'TRANSFERENCIA',
        platform: 'Banco de Venezuela Nómina',
        reference: ref,
        idDocument: emp.cedula,
        entityName: emp.nombreCompleto,
        city: 'San Fernando de Apure',
        linkedInvoice: `HR_${emp.tipoContrato}_${emp.id}`,
        impactType: 'EGRESO',
        amountUSD: Number(amount.toFixed(2)),
        amountVES: Number((amount * bcvRate).toFixed(2)),
        bcvRate,
        isReconciled: true,
      },
    });
  };

  // Abrir modal para nuevo trabajador
  const handleOpenNewModal = (defaultType?: ContractType) => {
    setEditingEmployee(null);
    setFormTipoContrato(defaultType || (activeTab === 'KPIS_OPERATIVOS' ? 'NOMINA_FIJA' : activeTab));
    setFormCedula('');
    setFormNombre('');
    setFormCargo('');
    setFormDepartamento('PRODUCCION_AVICOLA');
    setFormStatus('ACTIVO');
    setFormTelefono('');
    setFormEmail('');
    setFormObservaciones('');
    setFormSueldoBaseUSD(350);
    setFormAportesParafiscalesUSD(45);
    setFormFechaIngreso(new Date().toISOString().split('T')[0]);
    setFormTarifaServicioUSD(500);
    setFormFrecuenciaPago('MENSUAL');
    setFormDescripcionServicio('');
    setFormError(null);
    setIsModalOpen(true);
  };

  // Abrir modal para editar
  const handleOpenEditModal = (emp: HumanResourceRecord) => {
    setEditingEmployee(emp);
    setFormTipoContrato(emp.tipoContrato);
    setFormCedula(emp.cedula);
    setFormNombre(emp.nombreCompleto);
    setFormCargo(emp.cargo);
    setFormDepartamento(emp.departamento);
    setFormStatus(emp.status);
    setFormTelefono(emp.telefono || '');
    setFormEmail(emp.email || '');
    setFormObservaciones(emp.observaciones || '');

    if (emp.tipoContrato === 'NOMINA_FIJA') {
      setFormSueldoBaseUSD(emp.sueldoBaseUSD);
      setFormAportesParafiscalesUSD(emp.aportesParafiscalesUSD);
      setFormFechaIngreso(emp.fechaIngreso);
    } else {
      setFormTarifaServicioUSD(emp.tarifaServicioUSD);
      setFormFrecuenciaPago(emp.frecuenciaPago);
      setFormDescripcionServicio(emp.descripcionServicio);
    }

    setFormError(null);
    setIsModalOpen(true);
  };

  // Guardar trabajador (Creación o Edición)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validaciones base obligatorias
    if (!formCedula.trim()) {
      setFormError('La Cédula o Identificación Nacional es obligatoria.');
      return;
    }
    if (!formNombre.trim()) {
      setFormError('El Nombre Completo es obligatorio.');
      return;
    }
    if (!formCargo.trim()) {
      setFormError('El Cargo o Puesto Laboral es obligatorio.');
      return;
    }

    // Validaciones según discriminador
    if (formTipoContrato === 'NOMINA_FIJA') {
      if (isNaN(formSueldoBaseUSD) || formSueldoBaseUSD <= 0) {
        setFormError('El Sueldo Base (USD) debe ser mayor a 0.');
        return;
      }
      if (isNaN(formAportesParafiscalesUSD) || formAportesParafiscalesUSD < 0) {
        setFormError('Los Aportes Parafiscales (USD) deben ser mayores o iguales a 0.');
        return;
      }
      if (!formFechaIngreso) {
        setFormError('La Fecha de Ingreso es obligatoria.');
        return;
      }
    } else {
      if (isNaN(formTarifaServicioUSD) || formTarifaServicioUSD <= 0) {
        setFormError('La Tarifa de Servicio (USD) debe ser mayor a 0.');
        return;
      }
      if (!formDescripcionServicio.trim()) {
        setFormError('La Descripción del Servicio Profesional es obligatoria.');
        return;
      }
    }

    setIsSubmitting(true);

    const recordId =
      editingEmployee?.id ||
      `hr_${formCedula.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString(36)}`;

    let recordToSave: HumanResourceRecord;

    if (formTipoContrato === 'NOMINA_FIJA') {
      const fixedEmp: NominaFijaEmployee = {
        id: recordId,
        cedula: formCedula.trim().toUpperCase(),
        nombreCompleto: formNombre.trim(),
        cargo: formCargo.trim(),
        departamento: formDepartamento,
        tipoContrato: 'NOMINA_FIJA',
        status: formStatus,
        telefono: formTelefono.trim() || undefined,
        email: formEmail.trim() || undefined,
        observaciones: formObservaciones.trim() || undefined,
        sueldoBaseUSD: Number(formSueldoBaseUSD),
        aportesParafiscalesUSD: Number(formAportesParafiscalesUSD),
        fechaIngreso: formFechaIngreso,
        createdAt: editingEmployee?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastUpdatedTimestamp: Date.now(),
        updatedBy: userProfile?.displayName || userProfile?.email || 'admin',
      };
      recordToSave = fixedEmp;
    } else {
      const honorariosEmp: HonorariosEmployee = {
        id: recordId,
        cedula: formCedula.trim().toUpperCase(),
        nombreCompleto: formNombre.trim(),
        cargo: formCargo.trim(),
        departamento: formDepartamento,
        tipoContrato: 'HONORARIOS_PROFESIONALES',
        status: formStatus,
        telefono: formTelefono.trim() || undefined,
        email: formEmail.trim() || undefined,
        observaciones: formObservaciones.trim() || undefined,
        tarifaServicioUSD: Number(formTarifaServicioUSD),
        frecuenciaPago: formFrecuenciaPago,
        descripcionServicio: formDescripcionServicio.trim(),
        createdAt: editingEmployee?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastUpdatedTimestamp: Date.now(),
        updatedBy: userProfile?.displayName || userProfile?.email || 'admin',
      };
      recordToSave = honorariosEmp;
    }

    const res = await HumanResourcesService.saveEmployee(
      recordToSave,
      !editingEmployee,
      editingEmployee || undefined,
      userProfile?.displayName || 'admin'
    );

    setIsSubmitting(false);

    if (res.success) {
      setIsModalOpen(false);
      notify(
        editingEmployee
          ? `Expediente de ${recordToSave.nombreCompleto} actualizado.`
          : `Trabajador ${recordToSave.nombreCompleto} registrado exitosamente.`
      );
    } else {
      setFormError(res.error || 'Error al persistir expediente.');
    }
  };

  // Alternar Estatus (Activar / Desactivar)
  const handleToggleStatus = async (emp: HumanResourceRecord) => {
    const newStatus: EmployeeStatus = emp.status === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    const updated = { ...emp, status: newStatus };
    const res = await HumanResourcesService.saveEmployee(
      updated,
      false,
      emp,
      userProfile?.displayName || 'admin'
    );
    if (res.success) {
      notify(
        `Estatus de ${emp.nombreCompleto} cambiado a ${newStatus}.`
      );
    } else {
      notify(res.error || 'Error al actualizar estatus.', 'error');
    }
  };

  // Eliminar expediente
  const handleDelete = async (emp: HumanResourceRecord) => {
    if (
      !confirm(
        `¿Eliminar definitivamente el expediente de ${emp.nombreCompleto} (${emp.cedula})?\nEsta acción ajustará los contadores atómicos en hr_stats.`
      )
    ) {
      return;
    }

    const res = await HumanResourcesService.deleteEmployee(emp, userProfile?.displayName || 'admin');
    if (res.success) {
      notify(`Expediente de ${emp.nombreCompleto} eliminado.`);
    } else {
      notify(res.error || 'Error al eliminar.', 'error');
    }
  };

  // Filtrado de Nómina Fija
  const filteredNominaFija = useMemo(() => {
    return employees
      .filter((e) => e.tipoContrato === 'NOMINA_FIJA')
      .filter((e) => {
        const matchesSearch =
          e.nombreCompleto.toLowerCase().includes(searchTerm.toLowerCase()) ||
          e.cedula.toLowerCase().includes(searchTerm.toLowerCase()) ||
          e.cargo.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesDept = selectedDept === 'TODOS' || e.departamento === selectedDept;
        const matchesStatus = selectedStatus === 'TODOS' || e.status === selectedStatus;
        return matchesSearch && matchesDept && matchesStatus;
      }) as NominaFijaEmployee[];
  }, [employees, searchTerm, selectedDept, selectedStatus]);

  // Filtrado de Honorarios Profesionales
  const filteredHonorarios = useMemo(() => {
    return employees
      .filter((e) => e.tipoContrato === 'HONORARIOS_PROFESIONALES')
      .filter((e) => {
        const matchesSearch =
          e.nombreCompleto.toLowerCase().includes(searchTerm.toLowerCase()) ||
          e.cedula.toLowerCase().includes(searchTerm.toLowerCase()) ||
          e.cargo.toLowerCase().includes(searchTerm.toLowerCase()) ||
          e.descripcionServicio.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesDept = selectedDept === 'TODOS' || e.departamento === selectedDept;
        const matchesStatus = selectedStatus === 'TODOS' || e.status === selectedStatus;
        return matchesSearch && matchesDept && matchesStatus;
      }) as HonorariosEmployee[];
  }, [employees, searchTerm, selectedDept, selectedStatus]);

  // ABAC Guard adicional a nivel de vista
  if (!isAdmin && !isSuperAdmin) {
    return (
      <div className="p-8 max-w-lg mx-auto my-12 bg-slate-900 border border-red-800/40 rounded-3xl text-center space-y-4 shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-red-950/80 border border-red-500/40 text-red-400 mx-auto flex items-center justify-center">
          <Shield className="w-7 h-7" />
        </div>
        <h3 className="text-base font-bold text-white tracking-tight">Acceso Confidencial Restringido (ABAC)</h3>
        <p className="text-xs text-slate-300 leading-relaxed">
          El módulo de Gestión de Talento Humano y Nómina contiene información salarial reservada. Se requiere perfil administrativo (ADMIN o SUPERADMIN) para operar en este perímetro.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Toast de Retroalimentación */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between text-xs font-medium border shadow-xl animate-fadeIn ${
            feedback.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
              : 'bg-red-950/80 border-red-500/50 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Banner Principal de Cabecera con KPIs Atómicos desde hr_stats */}
      <div className="p-5 sm:p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  Gestión de Talento Humano & Nómina
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-950 border border-blue-800 text-blue-300 font-bold uppercase">
                  ABAC Protegido
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Puro Apure ERP • Catálogo de Nómina Fija, Servicios Profesionales y Contadores Atómicos en Tiempo Real.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenNewModal('NOMINA_FIJA')}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-blue-950/40 active:scale-95"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Nuevo Trabajador</span>
            </button>
          </div>
        </div>

        {/* Tarjetas de Métricas desde hr_stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 pt-2">
          {/* Total Activos */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Fuerza Laboral Activa</span>
              <BadgeCheck className="w-4 h-4 text-emerald-400" />
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white font-mono">{stats.totalActiveCount}</span>
              <span className="text-xs text-slate-400">trabajadores</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-1">
              {stats.totalInactiveCount} desincorporados en archivo
            </span>
          </div>

          {/* Nómina Fija */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider flex items-center justify-between">
              <span>Nómina Fija</span>
              <Building2 className="w-4 h-4 text-blue-400" />
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-blue-300 font-mono">{stats.activeNominaFijaCount}</span>
              <span className="text-xs text-slate-400">empleados</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-mono mt-1 font-semibold">
              ${stats.totalMonthlyNominaUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD/mes
            </span>
          </div>

          {/* Honorarios Profesionales */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider flex items-center justify-between">
              <span>Servicios Independientes</span>
              <Briefcase className="w-4 h-4 text-purple-400" />
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-purple-300 font-mono">{stats.activeHonorariosCount}</span>
              <span className="text-xs text-slate-400">contratos</span>
            </div>
            <span className="text-[10px] text-purple-300 font-mono mt-1 font-semibold">
              ${stats.totalMonthlyHonorariosUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD/mes
            </span>
          </div>

          {/* Carga Salarial Total */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-900/40 flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
              <span>Carga Laboral Consolidada</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-emerald-300 font-mono">
                ${(stats.totalMonthlyNominaUSD + stats.totalMonthlyHonorariosUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs text-emerald-500 font-bold">USD</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-1">
              Sincronizado vía FieldValue.increment()
            </span>
          </div>
        </div>
      </div>

      {/* Controles de Navegación por Pestañas y Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-slate-900 border border-slate-800 rounded-2xl">
        {/* Pestañas Duales de Contrato */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('NOMINA_FIJA')}
            className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'NOMINA_FIJA'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-950/50'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Nómina Fija</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-950 text-blue-300 font-mono">
              {stats.activeNominaFijaCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('HONORARIOS_PROFESIONALES')}
            className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'HONORARIOS_PROFESIONALES'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            <span>Servicios Independientes</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-950 text-purple-300 font-mono">
              {stats.activeHonorariosCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('KPIS_OPERATIVOS')}
            className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'KPIS_OPERATIVOS'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-950/50'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Motor de KPIs Operativos</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-950 text-amber-300 font-mono">
              Big Data
            </span>
          </button>
        </div>

        {/* Buscador y Filtros */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por cédula, nombre o cargo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500 font-sans"
            />
          </div>

          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-300 outline-none focus:border-blue-500"
          >
            <option value="TODOS">Todos los Deptos.</option>
            {DEPARTMENTS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-300 outline-none focus:border-blue-500"
          >
            <option value="TODOS">Todos los Estatus</option>
            <option value="ACTIVO">Activos</option>
            <option value="INACTIVO">Inactivos</option>
            <option value="SUSPENDIDO">Suspendidos</option>
          </select>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* DATA TABLE 1: NÓMINA FIJA (Personal Permanente) */}
      {/* ========================================================================= */}
      {activeTab === 'NOMINA_FIJA' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl space-y-3">
          {/* Encabezado con Totales Directos de hr_stats */}
          <div className="p-4 sm:p-5 bg-slate-950/70 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                <Building2 className="w-4 h-4 text-blue-400" />
                <span>Nómina Fija Agroindustrial</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Personal bajo relación de dependencia con sueldo base y parafiscales (SSO, INCES, Banavih).
              </p>
            </div>
            <div className="flex items-center gap-3 font-mono text-xs">
              <span className="px-3 py-1 rounded-xl bg-blue-950/80 border border-blue-800 text-blue-300">
                <strong>{stats.activeNominaFijaCount}</strong> activos en nómina
              </span>
              <span className="px-3 py-1 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-300 font-bold">
                Masa Salarial: ${stats.totalMonthlyNominaUSD.toFixed(2)} USD/mes
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 uppercase tracking-wider text-[11px] text-slate-400 border-b border-slate-800 font-mono">
                <tr>
                  <th className="py-3 px-4 font-semibold">Cédula / Identificación</th>
                  <th className="py-3 px-4 font-semibold">Trabajador & Cargo</th>
                  <th className="py-3 px-4 font-semibold">Departamento</th>
                  <th className="py-3 px-4 font-semibold">Fecha Ingreso</th>
                  <th className="py-3 px-4 font-semibold">Sueldo Base</th>
                  <th className="py-3 px-4 font-semibold">Parafiscales</th>
                  <th className="py-3 px-4 font-semibold">Costo Total Mensual</th>
                  <th className="py-3 px-4 font-semibold">Estatus</th>
                  <th className="py-3 px-4 font-semibold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredNominaFija.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-500 font-sans italic">
                      No se encontraron trabajadores en Nómina Fija con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredNominaFija.map((emp) => {
                    const totalCosto = emp.sueldoBaseUSD + emp.aportesParafiscalesUSD;
                    return (
                      <tr key={emp.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3.5 px-4 font-bold text-white tracking-wide">
                          {emp.cedula}
                        </td>
                        <td className="py-3.5 px-4 font-sans">
                          <div className="font-bold text-slate-100">{emp.nombreCompleto}</div>
                          <div className="text-[11px] text-blue-400 font-mono flex items-center gap-1">
                            <Briefcase className="w-3 h-3" />
                            <span>{emp.cargo}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-sans text-slate-300">
                          <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-[11px]">
                            {DEPARTMENTS.find((d) => d.value === emp.departamento)?.label || emp.departamento}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-400">
                          {emp.fechaIngreso}
                        </td>
                        <td className="py-3.5 px-4 text-slate-200 font-bold">
                          ${emp.sueldoBaseUSD.toFixed(2)} USD
                        </td>
                        <td className="py-3.5 px-4 text-amber-400">
                          +${emp.aportesParafiscalesUSD.toFixed(2)} USD
                        </td>
                        <td className="py-3.5 px-4 text-emerald-400 font-bold text-sm">
                          ${totalCosto.toFixed(2)} USD
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-sans ${
                              emp.status === 'ACTIVO'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : emp.status === 'SUSPENDIDO'
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : 'bg-red-950 text-red-300 border border-red-800'
                            }`}
                          >
                            {emp.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenPayModal(emp)}
                              title="Dispensar Pago Mensual (Asiento en Finanzas BCV)"
                              className="p-1.5 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-800/60 text-emerald-300 transition"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleGenerateReceipt(emp)}
                              title="Generar Comprobante Oficial de Pago Imprimible"
                              className="p-1.5 rounded-lg bg-blue-950/70 hover:bg-blue-900 border border-blue-800/60 text-blue-300 transition"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenEditModal(emp)}
                              title="Editar Expediente"
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleToggleStatus(emp)}
                              title={emp.status === 'ACTIVO' ? 'Desactivar Empleado' : 'Reactivar Empleado'}
                              className={`p-1.5 rounded-lg transition ${
                                emp.status === 'ACTIVO'
                                  ? 'bg-amber-950/60 hover:bg-amber-900 text-amber-300'
                                  : 'bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300'
                              }`}
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(emp)}
                              title="Eliminar Expediente"
                              className="p-1.5 rounded-lg bg-red-950/60 hover:bg-red-900 text-red-300 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DATA TABLE 2: SERVICIOS INDEPENDIENTES (Honorarios Profesionales) */}
      {/* ========================================================================= */}
      {activeTab === 'HONORARIOS_PROFESIONALES' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl space-y-3">
          {/* Encabezado con Totales Directos de hr_stats */}
          <div className="p-4 sm:p-5 bg-slate-950/70 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                <Briefcase className="w-4 h-4 text-purple-400" />
                <span>Honorarios Profesionales & Servicios Independientes</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Médicos veterinarios, asesores agronómicos, contratistas mecánicos y peritajes técnicos externos.
              </p>
            </div>
            <div className="flex items-center gap-3 font-mono text-xs">
              <span className="px-3 py-1 rounded-xl bg-purple-950/80 border border-purple-800 text-purple-300">
                <strong>{stats.activeHonorariosCount}</strong> contratos vigentes
              </span>
              <span className="px-3 py-1 rounded-xl bg-purple-950/80 border border-purple-800 text-purple-300 font-bold">
                Inversión Estimada: ${stats.totalMonthlyHonorariosUSD.toFixed(2)} USD/mes
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 uppercase tracking-wider text-[11px] text-slate-400 border-b border-slate-800 font-mono">
                <tr>
                  <th className="py-3 px-4 font-semibold">Cédula / RIF</th>
                  <th className="py-3 px-4 font-semibold">Profesional & Cargo</th>
                  <th className="py-3 px-4 font-semibold">Departamento</th>
                  <th className="py-3 px-4 font-semibold">Descripción del Servicio</th>
                  <th className="py-3 px-4 font-semibold">Frecuencia Pago</th>
                  <th className="py-3 px-4 font-semibold">Tarifa Pactada</th>
                  <th className="py-3 px-4 font-semibold">Estatus</th>
                  <th className="py-3 px-4 font-semibold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredHonorarios.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-500 font-sans italic">
                      No se encontraron contratos de Servicios Independientes con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredHonorarios.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 font-bold text-white tracking-wide">
                        {emp.cedula}
                      </td>
                      <td className="py-3.5 px-4 font-sans">
                        <div className="font-bold text-slate-100">{emp.nombreCompleto}</div>
                        <div className="text-[11px] text-purple-400 font-mono flex items-center gap-1">
                          <Briefcase className="w-3 h-3" />
                          <span>{emp.cargo}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-sans text-slate-300">
                        <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-[11px]">
                          {DEPARTMENTS.find((d) => d.value === emp.departamento)?.label || emp.departamento}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-sans text-slate-300 max-w-xs truncate" title={emp.descripcionServicio}>
                        {emp.descripcionServicio}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-sans">
                          {emp.frecuenciaPago}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-purple-300 font-bold text-sm">
                        ${emp.tarifaServicioUSD.toFixed(2)} USD
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-sans ${
                            emp.status === 'ACTIVO'
                              ? 'bg-purple-950 text-purple-300 border border-purple-800'
                              : 'bg-red-950 text-red-300 border border-red-800'
                          }`}
                        >
                          {emp.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenPayModal(emp)}
                            title="Dispensar Pago / Honorarios (Asiento en Finanzas BCV)"
                            className="p-1.5 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-800/60 text-emerald-300 transition"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleGenerateReceipt(emp)}
                            title="Generar Comprobante Oficial de Honorarios Imprimible"
                            className="p-1.5 rounded-lg bg-purple-950/70 hover:bg-purple-900 border border-purple-800/60 text-purple-300 transition"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(emp)}
                            title="Editar Contrato"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(emp)}
                            title={emp.status === 'ACTIVO' ? 'Desactivar Contrato' : 'Reactivar Contrato'}
                            className={`p-1.5 rounded-lg transition ${
                              emp.status === 'ACTIVO'
                                ? 'bg-amber-950/60 hover:bg-amber-900 text-amber-300'
                                : 'bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300'
                            }`}
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(emp)}
                            title="Eliminar Contrato"
                            className="p-1.5 rounded-lg bg-red-950/60 hover:bg-red-900 text-red-300 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-PANEL DE ANALÍTICA: MOTOR DE KPIS OPERATIVOS (BIG DATA) (Fase 3) */}
      {/* ========================================================================= */}
      {activeTab === 'KPIS_OPERATIVOS' && (
        <OperationalKPIs
          employees={employees}
          hrStats={stats}
          batches={batches}
          controls={controls}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL DE DISPERSIÓN DE PAGO BIMONETARIO A FINANZAS BCV (TRIGGER FASE 4) */}
      {/* ========================================================================= */}
      {payingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn overflow-y-auto">
          <div className="bg-slate-900 border border-emerald-500/50 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    Dispersión de Pago & Asiento en Finanzas BCV
                  </h3>
                  <span className="text-[11px] text-emerald-400 font-mono">
                    Trigger Bimonetario Automático • Tasa Oficial: {bcvRate.toFixed(4)} Bs./USD
                  </span>
                </div>
              </div>
              <button
                onClick={() => setPayingEmployee(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Ficha Resumen del Beneficiario */}
            <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Beneficiario / Trabajador:</span>
                <span className="font-bold text-white">{payingEmployee.nombreCompleto}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300 font-mono">
                <span className="text-slate-400">Cédula / RIF:</span>
                <span className="text-slate-200">{payingEmployee.cedula}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Modalidad Contractual:</span>
                <span className="px-2 py-0.5 rounded bg-slate-800 font-mono text-[10px] text-blue-300">
                  {payingEmployee.tipoContrato === 'NOMINA_FIJA'
                    ? 'Nómina Fija (Dependiente)'
                    : 'Honorarios Profesionales'}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Cargo / Departamento:</span>
                <span className="text-slate-300">{payingEmployee.cargo}</span>
              </div>
            </div>

            <form onSubmit={handleConfirmDispatchPayment} className="space-y-4">
              {/* Conversión Bimonetaria en Tiempo Real */}
              <div className="p-4 bg-emerald-950/30 border border-emerald-800/60 rounded-2xl space-y-3 text-xs">
                <div className="flex items-center justify-between text-emerald-400 font-bold">
                  <span className="flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4" />
                    <span>Monto a Liquidar (USD)</span>
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    Tasa BCV: {bcvRate.toFixed(4)} Bs.
                  </span>
                </div>

                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={payAmountUSD}
                    onChange={(e) => setPayAmountUSD(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-emerald-700 rounded-xl pl-8 pr-3 py-2.5 text-white font-mono text-base font-bold outline-none"
                  />
                </div>

                {/* Banner de Contravalor en Bolívares */}
                <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between font-mono">
                  <span className="text-slate-400 text-[11px]">Contravalor en Bolívares:</span>
                  <span className="text-emerald-400 font-bold text-sm">
                    {(payAmountUSD * bcvRate).toLocaleString('es-VE', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    Bs.
                  </span>
                </div>
              </div>

              {/* Parámetros Bancarios y Concepto */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Modalidad de Pago
                  </label>
                  <select
                    value={payMode}
                    onChange={(e) => setPayMode(e.target.value as PaymentMode)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none"
                  >
                    <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                    <option value="PAGO_MOVIL">Pago Móvil C2P</option>
                    <option value="EFECTIVO">Efectivo en Divisas</option>
                    <option value="ZELLE">Zelle / Transferencia USD</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Plataforma / Banco Emisor
                  </label>
                  <input
                    type="text"
                    required
                    value={payPlatform}
                    onChange={(e) => setPayPlatform(e.target.value)}
                    placeholder="Banco de Venezuela / Banesco"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-slate-300 font-semibold mb-1">
                    Concepto del Asiento en Libro de Finanzas BCV *
                  </label>
                  <input
                    type="text"
                    required
                    value={payConcept}
                    onChange={(e) => setPayConcept(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none"
                  />
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setPayingEmployee(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isDispatchingPayment}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-emerald-950/50"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {isDispatchingPayment
                      ? 'Asentando Egreso...'
                      : 'Confirmar Egreso en Finanzas BCV'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL REACTIVO: ALTA Y EDICIÓN DE EXPEDIENTE LABORAL */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-2xl w-full space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    {editingEmployee ? 'Editar Expediente de Talento Humano' : 'Alta de Personal / Contratista'}
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Puro Apure ERP • Gestión y Metadatos Laborales
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-950/80 border border-red-500 text-red-200 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="space-y-4">
              {/* Conmutador de Tipo de Contrato (Discriminador Estricto) */}
              <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                <label className="block text-slate-300 font-semibold text-xs">
                  Modalidad Contractual (Campo Discriminador)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormTipoContrato('NOMINA_FIJA')}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                      formTipoContrato === 'NOMINA_FIJA'
                        ? 'bg-blue-950 border-blue-500 text-blue-200 shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Building2 className="w-4 h-4" />
                    <span>Nómina Fija (Dependiente)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormTipoContrato('HONORARIOS_PROFESIONALES')}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                      formTipoContrato === 'HONORARIOS_PROFESIONALES'
                        ? 'bg-purple-950 border-purple-500 text-purple-200 shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Briefcase className="w-4 h-4" />
                    <span>Honorarios Profesionales (Independiente)</span>
                  </button>
                </div>
              </div>

              {/* Datos Identificatorios Comunes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Cédula / Identificación Nacional *
                  </label>
                  <input
                    type="text"
                    required
                    value={formCedula}
                    onChange={(e) => setFormCedula(e.target.value)}
                    placeholder="Ej. V-18456123"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono uppercase outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={formNombre}
                    onChange={(e) => setFormNombre(e.target.value)}
                    placeholder="Ej. Carlos Eduardo Mendoza"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Cargo / Especialidad Laboral *
                  </label>
                  <input
                    type="text"
                    required
                    value={formCargo}
                    onChange={(e) => setFormCargo(e.target.value)}
                    placeholder="Ej. Galponero Jefe / Veterinario Residente"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Departamento de Asignación *
                  </label>
                  <select
                    value={formDepartamento}
                    onChange={(e) => setFormDepartamento(e.target.value as HRDepartment)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-blue-500"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Teléfono de Contacto
                  </label>
                  <input
                    type="text"
                    value={formTelefono}
                    onChange={(e) => setFormTelefono(e.target.value)}
                    placeholder="+58 414 1234567"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Estatus del Expediente
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as EmployeeStatus)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-blue-500"
                  >
                    <option value="ACTIVO">Activo (Vigente)</option>
                    <option value="INACTIVO">Inactivo (Desincorporado)</option>
                    <option value="SUSPENDIDO">Suspendido Temporalmente</option>
                  </select>
                </div>
              </div>

              {/* CAMPOS CONDICIONALES: NÓMINA FIJA */}
              {formTipoContrato === 'NOMINA_FIJA' && (
                <div className="p-4 bg-blue-950/30 border border-blue-800/60 rounded-2xl space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-300">
                    <Building2 className="w-4 h-4 text-blue-400" />
                    <span>Campos Obligatorios de Nómina Fija</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Sueldo Base (USD/mes) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        required
                        value={formSueldoBaseUSD}
                        onChange={(e) => setFormSueldoBaseUSD(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-blue-700 rounded-xl p-2.5 text-white font-mono outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Aportes Parafiscales (USD/mes) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={formAportesParafiscalesUSD}
                        onChange={(e) => setFormAportesParafiscalesUSD(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-blue-700 rounded-xl p-2.5 text-white font-mono outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Fecha de Ingreso *
                      </label>
                      <input
                        type="date"
                        required
                        value={formFechaIngreso}
                        onChange={(e) => setFormFechaIngreso(e.target.value)}
                        className="w-full bg-slate-950 border border-blue-700 rounded-xl p-2.5 text-white font-mono outline-none"
                      />
                    </div>
                  </div>

                  <div className="text-[11px] font-mono text-emerald-400 bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex justify-between">
                    <span>Costo Mensual Consolidado:</span>
                    <strong>${(Number(formSueldoBaseUSD) + Number(formAportesParafiscalesUSD)).toFixed(2)} USD/mes</strong>
                  </div>
                </div>
              )}

              {/* CAMPOS CONDICIONALES: HONORARIOS PROFESIONALES */}
              {formTipoContrato === 'HONORARIOS_PROFESIONALES' && (
                <div className="p-4 bg-purple-950/30 border border-purple-800/60 rounded-2xl space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-purple-300">
                    <Briefcase className="w-4 h-4 text-purple-400" />
                    <span>Campos Obligatorios de Honorarios Profesionales</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Tarifa de Servicio (USD) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        required
                        value={formTarifaServicioUSD}
                        onChange={(e) => setFormTarifaServicioUSD(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-purple-700 rounded-xl p-2.5 text-white font-mono outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Frecuencia de Pago *
                      </label>
                      <select
                        value={formFrecuenciaPago}
                        onChange={(e) => setFormFrecuenciaPago(e.target.value as PaymentFrequency)}
                        className="w-full bg-slate-950 border border-purple-700 rounded-xl p-2.5 text-white outline-none"
                      >
                        <option value="MENSUAL">Mensual</option>
                        <option value="QUINCENAL">Quincenal</option>
                        <option value="SEMANAL">Semanal</option>
                        <option value="POR_OBRA">Por Obra / Informe</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-slate-300 font-semibold mb-1">
                        Descripción Detallada del Servicio Profesional *
                      </label>
                      <textarea
                        rows={2}
                        required
                        value={formDescripcionServicio}
                        onChange={(e) => setFormDescripcionServicio(e.target.value)}
                        placeholder="Ej. Auditoría de conversión alimenticia, toma de muestras sanguíneas en galpones y asesoría sanitaria quincenal."
                        className="w-full bg-slate-950 border border-purple-700 rounded-xl p-2.5 text-white outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Botones de Acción */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-blue-950/50"
                >
                  <BadgeCheck className="w-4 h-4" />
                  <span>{isSubmitting ? 'Guardando...' : editingEmployee ? 'Actualizar Expediente' : 'Registrar Trabajador'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL / COMPROBANTE OFICIAL DE PAGO BIMONETARIO IMPRIMIBLE (Fase 4) */}
      {/* ========================================================================= */}
      {paymentReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn overflow-y-auto">
          <div className="relative bg-white text-slate-900 border border-slate-300 rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl my-6 overflow-hidden">
            {/* Marca de Agua Central Oficial (Opacidad 0.09 y Bloqueo de Puntero) */}
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 overflow-hidden"
              aria-hidden="true"
            >
              <img
                src={logoUrl}
                alt=""
                className="w-[420px] max-w-[85%] h-auto object-contain select-none pointer-events-none"
                style={{ opacity: 0.09 }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = '/puro_apure_logo.png';
                }}
              />
            </div>

            {/* Contenedor Superior con Capa Z-10 */}
            <div className="relative z-10 space-y-6">
              {/* Header del Comprobante con Logo Full Color */}
              <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
                <div>
                  <div className="p-1 rounded-xl bg-white border border-slate-200/90 shadow-sm shrink-0 mb-2 inline-block">
                    <img
                      src={logoUrl}
                      alt="Puro Apure ERP Logotipo Oficial Full Color"
                      className="w-[110px] min-w-[90px] h-auto object-contain block"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = '/puro_apure_logo.png';
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-800 block">
                    {CORPORATE_HEADER_CONFIG.tradeName} • {CORPORATE_HEADER_CONFIG.companyName}
                  </span>
                  <h2 className="text-xl font-extrabold text-slate-900 tracking-tight mt-0.5 font-heading">
                    COMPROBANTE OFICIAL DE LIQUIDACIÓN DE PAGO
                  </h2>
                  <p className="text-xs text-slate-600 font-mono mt-0.5">
                    RIF: {CORPORATE_HEADER_CONFIG.rif} • {CORPORATE_HEADER_CONFIG.headquartersAddress}
                  </p>
                </div>
                <button
                  onClick={() => setPaymentReceipt(null)}
                  className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl border border-slate-200 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

            {/* Referencia y Fecha */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">N° de Referencia:</span>
                <strong className="text-slate-900">{paymentReceipt.record.reference}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Fecha de Liquidación:</span>
                <span className="text-slate-800">{paymentReceipt.record.date}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Estado Contable:</span>
                <span className="text-emerald-700 font-bold">ASENTADO (EGRESO)</span>
              </div>
            </div>

            {/* Datos del Beneficiario */}
            <div className="space-y-2 text-xs">
              <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-600" />
                <span>Datos del Trabajador / Beneficiario</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <span className="text-slate-500">Nombre Completo:</span>{' '}
                  <strong className="text-slate-900">{paymentReceipt.employee.nombreCompleto}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Cédula / RIF:</span>{' '}
                  <strong className="font-mono text-slate-900">{paymentReceipt.employee.cedula}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Cargo / Especialidad:</span>{' '}
                  <span className="text-slate-800">{paymentReceipt.employee.cargo}</span>
                </div>
                <div>
                  <span className="text-slate-500">Departamento:</span>{' '}
                  <span className="text-slate-800">{paymentReceipt.employee.departamento.replace('_', ' ')}</span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-500">Régimen Contractual:</span>{' '}
                  <span className="font-semibold text-slate-900">
                    {paymentReceipt.employee.tipoContrato === 'NOMINA_FIJA'
                      ? 'Nómina Fija (Relación de Dependencia Laboral)'
                      : `Honorarios Profesionales (${paymentReceipt.employee.descripcionServicio})`}
                  </span>
                </div>
              </div>
            </div>

            {/* Liquidación Bimonetaria Oficial */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                <span>Desglose Bimonetario & Tasa BCV Oficial</span>
              </h4>
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-3 font-mono text-xs">
                <div className="flex justify-between items-center text-slate-700">
                  <span>Monto Base en Divisas:</span>
                  <span className="text-base font-bold text-slate-900">
                    ${paymentReceipt.record.amountUSD.toFixed(2)} USD
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-600 border-t border-emerald-100 pt-2">
                  <span>Tasa Oficial BCV Aplicada:</span>
                  <span className="font-bold text-emerald-900">
                    {paymentReceipt.record.bcvRate.toFixed(4)} Bs. / USD
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-900 border-t-2 border-emerald-300 pt-2 text-sm font-extrabold">
                  <span>Total Liquidado en Bolívares (VES):</span>
                  <span className="text-emerald-700 text-lg">
                    Bs. {paymentReceipt.record.amountVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-slate-500 border-t border-emerald-100 pt-2 font-sans">
                  <span>Método & Banco Emisor:</span>
                  <span className="font-semibold text-slate-700">
                    {paymentReceipt.record.platform} ({paymentReceipt.record.paymentMode})
                  </span>
                </div>
              </div>
            </div>

            {/* Firmas de Conformidad */}
            <div className="pt-6 border-t border-slate-200 grid grid-cols-2 gap-8 text-center text-xs font-mono">
              <div className="space-y-6">
                <div className="border-b border-slate-400 h-8 mx-auto w-4/5" />
                <div>
                  <strong className="block text-slate-900">Firma del Beneficiario</strong>
                  <span className="text-[10px] text-slate-500">C.I.: {paymentReceipt.employee.cedula}</span>
                </div>
              </div>
              <div className="space-y-6">
                <div className="border-b border-slate-400 h-8 mx-auto w-4/5" />
                <div>
                  <strong className="block text-slate-900">Administración & RRHH</strong>
                  <span className="text-[10px] text-slate-500">Puro Apure ERP • Sello de Auditoría</span>
                </div>
              </div>
            </div>

            {/* Acciones */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
              <span className="text-[10px] font-mono text-slate-500">
                Id Transacción: {paymentReceipt.record.id || paymentReceipt.record.reference}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!paymentReceipt) return;
                    const { employee, record } = paymentReceipt;
                    const frequency = 'frecuenciaPago' in employee ? (employee as any).frecuenciaPago : 'QUINCENAL';
                    const contentHtml = `
                      <div style="background-color: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 8px; padding: 14px; margin-bottom: 18px;">
                        <div style="font-size: 8.5pt; font-weight: 800; color: #065F46; text-transform: uppercase; margin-bottom: 8px;">Datos del Trabajador / Beneficiario</div>
                        <table style="margin: 0; font-size: 8pt;">
                          <tr>
                            <td style="width: 25%; font-weight: 700; color: #64748B;">Nombres y Apellidos:</td>
                            <td style="font-weight: 800; color: #0F172A;">${employee.nombreCompleto}</td>
                            <td style="width: 25%; font-weight: 700; color: #64748B;">Cédula de Identidad:</td>
                            <td style="font-weight: 800; font-family: monospace;">${employee.cedula}</td>
                          </tr>
                          <tr>
                            <td style="font-weight: 700; color: #64748B;">Cargo / Puesto:</td>
                            <td>${employee.cargo}</td>
                            <td style="font-weight: 700; color: #64748B;">Departamento:</td>
                            <td>${employee.departamento.replace('_', ' ')}</td>
                          </tr>
                          <tr>
                            <td style="font-weight: 700; color: #64748B;">Modalidad Laboral:</td>
                            <td>${employee.tipoContrato === 'NOMINA_FIJA' ? 'Nómina Fija Agropecuaria' : 'Honorarios Profesionales'}</td>
                            <td style="font-weight: 700; color: #64748B;">Frecuencia de Pago:</td>
                            <td>${frequency}</td>
                          </tr>
                        </table>
                      </div>

                      <div style="background-color: #ECFDF5; border: 1.5px solid #065F46; border-radius: 8px; padding: 14px; margin-bottom: 18px;">
                        <div style="font-size: 8.5pt; font-weight: 800; color: #065F46; text-transform: uppercase; margin-bottom: 8px;">Liquidación Monetaria</div>
                        <table style="margin: 0; font-size: 8.5pt;">
                          <tr>
                            <td style="font-weight: 700;">Monto Liquidado (USD):</td>
                            <td class="right" style="font-weight: 900; font-size: 11pt; color: #065F46; font-family: monospace;">$${record.amountUSD.toFixed(2)} USD</td>
                          </tr>
                          <tr>
                            <td style="font-weight: 700;">Tasa Oficial BCV Aplicada:</td>
                            <td class="right" style="font-weight: 800; font-family: monospace;">Bs. ${record.bcvRateApplied.toFixed(4)} / USD</td>
                          </tr>
                          <tr class="bold-row">
                            <td style="font-weight: 900;">IMPORTE TOTAL PAGADO (VES):</td>
                            <td class="right" style="font-weight: 900; font-size: 12pt; color: #0F172A; font-family: monospace;">Bs. ${record.amountVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          </tr>
                          <tr>
                            <td style="color: #64748B;">Vía y Modo de Pago:</td>
                            <td class="right" style="font-weight: 700;">${record.platform} (${record.paymentMode})</td>
                          </tr>
                          <tr>
                            <td style="color: #64748B;">Número de Referencia:</td>
                            <td class="right" style="font-family: monospace; font-weight: 800;">${record.reference}</td>
                          </tr>
                        </table>
                      </div>
                    `;

                    const html = generateCorporatePdfHtml({
                      documentTitle: 'Comprobante de Liquidación de Pago',
                      documentSubtitle: 'Constancia Oficial de Asentamiento de Haberes Agroindustriales',
                      documentFolio: record.reference || record.id,
                      issueDate: record.date,
                      bcvRate: record.bcvRateApplied,
                      metaItems: [
                        { label: 'Referencia', value: record.reference },
                        { label: 'Fecha Liquidación', value: record.date },
                        { label: 'Beneficiario', value: employee.nombreCompleto },
                        { label: 'Cédula', value: employee.cedula },
                        { label: 'Importe USD', value: `$${record.amountUSD.toFixed(2)} USD`, highlight: true },
                        { label: 'Importe VES', value: `Bs. ${record.amountVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
                      ],
                      contentHtml,
                      showSignatures: true,
                      signatureLabels: [`Firma del Trabajador (C.I. ${employee.cedula})`, 'Administración y Talento Humano Puro Apure'],
                      notes: [
                        'Comprobante emitido de conformidad con la legislación laboral agropecuaria vigente en la República Bolivariana de Venezuela.',
                        'El beneficiario certifica haber percibido conforme los conceptos salariales y liquidaciones asentadas.',
                      ],
                    });
                    printOrExportPdfHtml(html);
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir PDF Oficial</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentReceipt(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  );
};
