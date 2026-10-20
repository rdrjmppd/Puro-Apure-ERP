/**
 * Ecosistema Financiero, CRM/VRM y Motor Cambiario Histórico
 * Fase 4: Consolidación Contable Bimonetaria y Facturación Oficial Proforma
 */

export type DualEntityRole = 'CLIENTE' | 'PROVEEDOR';

export type ContribuyenteEspecialType = 'ORDINARIO' | 'ESPECIAL' | 'FORMAL';

export interface PerfilFiscal {
  regimenIva: 'GENERAL' | 'EXENTO' | 'RETENCION_75' | 'RETENCION_100';
  contribuyenteEspecial: ContribuyenteEspecialType;
  porcentajeRetencionIva?: number; // Ej. 75, 100%
  porcentajeRetencionIslr?: number; // Ej. 1, 2, 3, 5%
  direccionFiscal?: string;
  emailFacturacion?: string;
  telefonoContacto?: string;
}

export interface DualEntity {
  id: string;
  name: string;
  razonSocial?: string; // Razón Social oficial
  rifCedula: string; // RIF (J-...) o Cédula (V-...)
  identificacionFiscal?: string; // RIF o Cédula fiscal
  roles: DualEntityRole[]; // Permite ['CLIENTE'], ['PROVEEDOR'], o ['CLIENTE', 'PROVEEDOR'] para cruce de cuentas
  city: string;
  address: string;
  direccionFiscal?: string; // Dirección fiscal para declaraciones
  phone: string;
  telefonoContacto?: string; // Teléfono de contacto fiscal
  balanceUSD: number; // Saldo neto consolidado en USD (positivo = por cobrar, negativo = por pagar)
  balanceVES: number;
  balancePorCobrarUSD?: number; // Subtotal activo (cuentas por cobrar de clientes)
  balancePorPagarUSD?: number; // Subtotal pasivo (cuentas por pagar a proveedores)
  balancePorCobrarVES?: number;
  balancePorPagarVES?: number;
  perfilFiscal?: PerfilFiscal; // Perfil fiscal y tributario venezolano SENIAT
  lastUpdatedTimestamp: number;
}

/**
 * Modalidad de Transacción Comercial
 */
export type ModalidadTransaccion = 'CONTADO' | 'CREDITO';

/**
 * Métodos de Pago Extendidos (Fase 1 Spec-Driven)
 */
export type MetodoPago =
  | 'TRANSFERENCIA'
  | 'PAGO_MOVIL'
  | 'EFECTIVO_VES'
  | 'EFECTIVO_USD'
  | 'BINANCE_USDT'
  | 'INTERNACIONAL'
  | 'CL'
  | 'CRUCE_CUENTAS'
  | 'RETENCION'
  | 'EFECTIVO' // Compatibilidad
  | 'ZELLE'    // Compatibilidad
  | 'OTRO';    // Compatibilidad

export type PaymentMode = MetodoPago;

/**
 * Presentación de Producto en Comercialización de Biomasa
 */
export type TipoPresentacion = 'VIVO' | 'EMPACADO';

/**
 * Nodo de Detalle de Producto Vinculado a Inventario Biológico (Fase 1)
 */
export interface DetalleProductoFactura {
  tipoPresentacion: TipoPresentacion; // 'VIVO' | 'EMPACADO'
  cantidadKg: number;
  cantidadUnidades: number;
  loteId: string; // Referencia al lote biológico (Single Source of Truth)
  descripcion?: string;
  precioUnitarioUSD?: number;
  especie?: 'AVICOLA' | 'PORCINO';
}

/**
 * Configuración Financiera de Crédito (Fase 1)
 */
export interface CreditoConfig {
  llevaInicial: boolean;
  metodoPagoInicial?: MetodoPago;
  montoInicialUSD?: number;
  montoInicialVES?: number;
  diasFinanciamiento: number;
  frecuenciaPago: string; // ej. SEMANAL, QUINCENAL, MENSUAL, UNICO
  numeroCuotas: number;
  saldoFinanciadoUSD?: number;
}

/**
 * Taxonomía Contable de Impacto Financiero
 */
export type FinancialImpactType =
  | 'INGRESO_VENTA'
  | 'EGRESO_PROVEEDOR'
  | 'EGRESO_NOMINA'
  | 'EGRESO_HONORARIOS'
  | 'EGRESO_SERVICIOS'
  | 'EGRESO_IMPUESTOS'
  | 'INGRESO' // Compatibilidad transicional
  | 'EGRESO'; // Compatibilidad transicional

export interface PaymentDataSnapshot {
  frozenRate: number; // Tasa oficial congelada
  frozenUSD: number; // Monto exacto congelado en USD
  frozenVES: number; // Monto exacto congelado en VES
  capturedAt: string; // ISO Timestamp de congelamiento
  source: string;
}

/**
 * Ledger de Pagos y Asientos Contables (accounting_entries)
 */
export interface PaymentRecord {
  id: string;
  date: string; // YYYY-MM-DD
  paymentMode: PaymentMode;
  platform: string; // Banco Central, Banesco, Venezuela, Mercantil, Zelle, etc.
  reference: string; // Número de confirmación bancaria
  idDocument: string; // RIF o Cédula
  entityId?: string;
  entityName: string;
  city: string;
  linkedInvoice: string; // Código de factura o lote biológico
  impactType: FinancialImpactType; // INGRESO (Cobro) o EGRESO (Pago a proveedor)
  amountUSD: number;
  amountVES: number;
  bcvRate: number; // Tasa snapshot congelada
  isReconciled: boolean; // Conciliado en banco
  reconciledAt?: string;
  snapshot: PaymentDataSnapshot;
  createdAt: number;
  updatedBy: string;

  // Expansión Fase 1: Parámetros de Modalidad y Crédito
  modalidadTransaccion?: ModalidadTransaccion;
  llevaInicial?: boolean;
  metodoPagoInicial?: MetodoPago;
  diasFinanciamiento?: number;
  frecuenciaPago?: string;
  numeroCuotas?: number;
  detalleProducto?: DetalleProductoFactura;
  creditoConfig?: CreditoConfig;
}

export type AccountingEntry = PaymentRecord;

export interface BcvRateRecord {
  date: string;
  rateUSD_VES: number;
  timestamp: number;
  source: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  species?: 'AVICOLA' | 'PORCINO';
  batchCode?: string;
  grossWeightKg?: number;
  shrinkageKg?: number;
  netWeightKg: number;
  unitPriceUSD: number;
  subtotalUSD: number;
  subtotalVES: number;
  loteId?: string;
  tipoPresentacion?: TipoPresentacion;
}

/**
 * Esquema de Proformas y Facturas Fiscales (proformas / billing_invoices)
 * Enriquecido en Fase 1 con Modalidad, Crédito y Detalle de Biomasa
 */
export interface BillingInvoice {
  id: string;
  invoiceNumber: string; // Ej. PRO-2026-001
  date: string;
  dueDate: string;
  customerName: string;
  customerRif: string;
  customerPhone?: string;
  customerAddress?: string;
  customerId?: string;
  items: InvoiceItem[];
  totalUSD: number;
  totalVES: number;
  bcvRateApplied: number;
  paymentStatus: 'PENDIENTE' | 'PAGADO' | 'PARCIAL' | 'ANULADO';
  notes?: string;
  createdAt: number;
  updatedBy: string;

  // Expansión Fase 1 (Spec-Driven)
  modalidadTransaccion?: ModalidadTransaccion; // 'CONTADO' | 'CREDITO'
  metodoPago?: MetodoPago;
  // Campos de Crédito
  llevaInicial?: boolean;
  metodoPagoInicial?: MetodoPago;
  montoInicialUSD?: number;
  diasFinanciamiento?: number;
  frecuenciaPago?: string;
  numeroCuotas?: number;
  saldoPendienteUSD?: number;
  cuotasAmortizacion?: InstallmentScheduleItem[];
  // Nodo de Detalle de Producto
  detalleProducto?: DetalleProductoFactura;
}

export type ProformaInvoice = BillingInvoice;

/**
 * Tipos de Impacto para Conciliación de Pagos (Fase 1 / Fase 4)
 */
export type TipoImpactoConciliacion =
  | 'INGRESO_HOY'
  | 'INGRESO_EXTEMPORANEO'
  | 'CRUCE_CUENTAS'
  | 'RETENCION_FISCAL';

/**
 * Esquema de Base de Datos para Conciliación de Pagos (payment_reconciliations)
 * Soporta deducción atómica de deudas y cruce CRM/BRM
 */
export interface PaymentReconciliation {
  id: string;
  fecha: string; // YYYY-MM-DD
  modalidad: ModalidadTransaccion; // 'CONTADO' | 'CREDITO'
  metodoPago: MetodoPago;
  bancoPlataforma?: string;
  numeroReferencia?: string;
  clienteNombre: string;
  clienteRif: string;
  clienteId?: string;
  facturaId: string; // ID de Factura o Proforma asociada
  facturaNumero?: string;
  loteId?: string; // Lote de biomasa asociado
  monedaRecibida: 'VES' | 'USD';
  montoRecibido: number;
  tasaBcv: number; // Tasa oficial del momento (vigente o histórica)
  montoUSD: number; // Monto calculado en USD
  montoVES: number; // Monto calculado en VES
  tipoImpacto: TipoImpactoConciliacion;
  estado: 'CONCILIADO' | 'PENDIENTE';
  observaciones?: string;
  snapshot?: PaymentDataSnapshot;
  createdAt: number;
  createdBy: string;
}

export interface InstallmentScheduleItem {
  cuotaNumero: number;
  fechaVencimiento: string;
  montoUSD: number;
  montoVES: number;
  tasaBcv: number;
  estado: 'PENDIENTE' | 'PAGADO';
}

export interface MarkToMarketResult {
  paymentId: string;
  reference: string;
  date: string;
  entityName: string;
  originalAmountUSD: number;
  originalAmountVES: number;
  frozenRate: number;
  simulatedRate: number;
  revaluedAmountUSD: number;
  revaluedAmountVES: number;
  devaluationDeltaUSD: number;
  devaluationDeltaVES: number;
  devaluationPercentage: number;
}

/**
 * Normaliza y determina si un tipo de impacto contable corresponde a un Ingreso (Entrada) o Egreso (Salida)
 */
export function isIncomeImpact(impact: FinancialImpactType): boolean {
  return impact === 'INGRESO' || impact === 'INGRESO_VENTA';
}

export function isExpenseImpact(impact: FinancialImpactType): boolean {
  return !isIncomeImpact(impact);
}

export const FINANCIAL_IMPACT_LABELS: Record<FinancialImpactType, string> = {
  INGRESO_VENTA: 'Ingreso por Venta (Comercialización)',
  EGRESO_PROVEEDOR: 'Egreso a Proveedor (Materia Prima / Insumos)',
  EGRESO_NOMINA: 'Egreso por Nómina (Personal Fijo)',
  EGRESO_HONORARIOS: 'Egreso por Honorarios Profesionales',
  EGRESO_SERVICIOS: 'Egreso por Servicios Operativos / Logística',
  EGRESO_IMPUESTOS: 'Egreso Tributario / Retenciones SENIAT',
  INGRESO: 'Ingreso Operativo General',
  EGRESO: 'Egreso Operativo General',
};

