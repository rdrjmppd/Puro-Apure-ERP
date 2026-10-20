/**
 * Puro Apure ERP - Módulo de Gestión de Talento Humano y Rendimiento Operativo
 * Esquemas de Datos (Data Schemas) en Cloud Firestore
 */

export type ContractType = 'NOMINA_FIJA' | 'HONORARIOS_PROFESIONALES';

export type EmployeeStatus = 'ACTIVO' | 'INACTIVO' | 'SUSPENDIDO';

export type PaymentFrequency = 'SEMANAL' | 'QUINCENAL' | 'MENSUAL' | 'POR_OBRA';

export type HRDepartment =
  | 'PRODUCCION_AVICOLA'
  | 'PRODUCCION_PORCINA'
  | 'MANTENIMIENTO'
  | 'ADMINISTRACION'
  | 'VETERINARIA'
  | 'LOGISTICA'
  | 'PLANTA_ALIMENTOS'
  | 'OTRO';

export interface BaseEmployeeRecord {
  id: string;
  cedula: string;
  nombreCompleto: string;
  cargo: string;
  departamento: HRDepartment;
  tipoContrato: ContractType;
  status: EmployeeStatus;
  telefono?: string;
  email?: string;
  observaciones?: string;
  createdAt: string;
  updatedAt: string;
  lastUpdatedTimestamp: number;
  updatedBy: string;
}

/**
 * Personal bajo Nómina Fija
 * Exige campos obligatorios: sueldoBaseUSD, aportesParafiscalesUSD y fechaIngreso
 */
export interface NominaFijaEmployee extends BaseEmployeeRecord {
  tipoContrato: 'NOMINA_FIJA';
  sueldoBaseUSD: number;
  aportesParafiscalesUSD: number;
  fechaIngreso: string; // Formato ISO YYYY-MM-DD
}

/**
 * Personal bajo Honorarios Profesionales / Servicios Independientes
 * Exige campos obligatorios: tarifaServicioUSD, frecuenciaPago y descripcionServicio
 */
export interface HonorariosEmployee extends BaseEmployeeRecord {
  tipoContrato: 'HONORARIOS_PROFESIONALES';
  tarifaServicioUSD: number;
  frecuenciaPago: PaymentFrequency;
  descripcionServicio: string;
}

/**
 * Unión discriminada estricta por tipo de contrato
 */
export type HumanResourceRecord = NominaFijaEmployee | HonorariosEmployee;

/**
 * Documento de Metadatos Centralizado (hr_stats)
 * Utiliza Contadores Atómicos (FieldValue.increment()) para mantener
 * en tiempo real las cantidades exactas y la masa salarial estimada.
 */
export interface HRStats {
  id: 'hr_stats';
  activeNominaFijaCount: number;
  activeHonorariosCount: number;
  totalActiveCount: number;
  totalInactiveCount: number;
  totalMonthlyNominaUSD: number;
  totalMonthlyHonorariosUSD: number;
  lastUpdatedTimestamp: number;
  lastUpdatedBy: string;
}

/**
 * Estructura de Registro de Pago de Nómina para Integración Financiera (Fase 4)
 */
export interface HRPaymentDispatch {
  id: string;
  employeeId: string;
  employeeName: string;
  cedula: string;
  tipoContrato: ContractType;
  concept: string;
  amountUSD: number;
  amountVES: number;
  bcvRateApplied: number;
  paymentDate: string;
  dispatchedAt: number;
  dispatchedBy: string;
  financialLedgerRef?: string;
}
