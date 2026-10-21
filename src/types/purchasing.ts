/**
 * Ecosistema de Compras, Cuentas por Pagar (CxP) y Niveles Críticos de Insumos
 * Puro Apure ERP - Módulo Financiero / Compras
 */

import { PaymentDataSnapshot } from './finance';

// ============================================================================
// 1. CONDICIONES COMERCIALES DE PROVEEDORES (supplier_terms/{entityId})
// ============================================================================

export type PeriodicidadMora = 'DIARIA' | 'SEMANAL' | 'MENSUAL' | 'UNICA';

export interface SupplierTerms {
  entityId: string;               // ID canónico en dual_entities (rol PROVEEDOR)
  diasCalle: number;              // Días de crédito estándar asignados (0 = contado)
  diasGracia: number;             // Días tras vencimiento antes de disparar penalizaciones
  diasAnticipacionAlerta: number; // Días de antelación para advertencia amarilla
  aplicaMora: boolean;            // Si el proveedor impone recargos por mora
  tasaMoraPorcentaje: number;     // Porcentaje de recargo (0..100)
  periodicidadMora: PeriodicidadMora;
  penalizacionFijaUSD: number;    // Cargo fijo punitivo único (ej. $10 o $25)
  notaRiesgoManual: string;       // Nota de advertencia contractual para el recordatorio
  updatedAt: number;
  updatedBy: string;
}

// ============================================================================
// 2. FACTURACIÓN DE COMPRAS Y CUENTAS POR PAGAR (purchase_invoices/{id})
// ============================================================================

export type EstadoPagoCxP = 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'ANULADA';

export interface PurchaseItem {
  id: string;
  inventoryItemId?: string;      // ID en inventory/{id} si es insumo rastreable
  descripcion: string;
  cantidad: number;
  unidad: 'kg' | 'sacos' | 'unidades' | 'litros' | 'toneladas';
  costoUnitarioUSD: number;
  subtotalUSD: number;           // centsRound(cantidad * costoUnitarioUSD)
  ingresaAInventario: boolean;   // Si true, suma automáticamente al stock en inventario
}

export interface LateFeeAdjustment {
  id: string;
  fecha: string;                 // YYYY-MM-DD
  montoUSD: number;
  motivo: string;
  aplicadoPor: string;
  timestamp: number;
}

export interface PurchaseInvoice {
  id: string;
  idempotencyKey: string;        // Previene duplicación accidental en reintentos
  numeroFacturaProveedor: string;// Número oficial de factura o nota de entrega
  numeroControl?: string;        // Número de control SENIAT si aplica
  proveedorId: string;           // Referencia a dual_entities/{id}
  proveedorNombre: string;
  proveedorRif: string;
  fechaEmision: string;          // YYYY-MM-DD (fecha fiscal)
  fechaVencimiento: string;      // YYYY-MM-DD (calculada: emisión + días calle)
  modalidad: 'CONTADO' | 'CREDITO';
  items: PurchaseItem[];
  totalUSD: number;              // Monto base original
  totalVES: number;              // Monto base original en Bolívares
  tasaBcv: number;               // Tasa oficial histórica de fechaEmision
  snapshot: PaymentDataSnapshot; // Snapshot criptográfico inmutable
  saldoPendienteUSD: number;     // Saldo actual por liquidar
  estadoPago: EstadoPagoCxP;
  condicionesAplicadas: Pick<
    SupplierTerms,
    'diasCalle' | 'diasGracia' | 'aplicaMora' | 'tasaMoraPorcentaje' | 'periodicidadMora' | 'penalizacionFijaUSD'
  >;
  notaRiesgoManual?: string;     // Nota específica de esta factura
  ajustesMora?: LateFeeAdjustment[]; // Recargos por mora aplicados manualmente
  inventarioAplicado: boolean;   // Si los ítems ya impactaron el stock físico
  pagosIds: string[];            // IDs de payments vinculados
  createdAt: number;
  createdBy: string;
  anuladaMotivo?: string;
}

// ============================================================================
// 3. NIVELES CRÍTICOS Y ALARMAS DE INSUMOS (supply_alert_configs/{inventoryItemId})
// ============================================================================

export interface SupplyAlertConfig {
  inventoryItemId: string;       // Referencia a inventory/{id} (category = INSUMO)
  activo: boolean;
  puntoCritico: number;          // Nivel de existencia física umbral ROJO (en unidad nativa)
  porcentajeAmarillo: number;    // % de colchón por encima del punto crítico (AMARILLO)
  consumoDiarioEstimado?: number;// Consumo diario promedio en unidad nativa
  proveedorPreferidoId?: string; // Proveedor recomendado en dual_entities
  notaReorden?: string;          // Instrucción operativa de reabastecimiento
  updatedAt: number;
  updatedBy: string;
}

// ============================================================================
// 4. ENTIDADES CALCULADAS Y ALARMAS EN MEMORIA
// ============================================================================

export type NivelAlarma = 'VERDE' | 'AMARILLO' | 'ROJO';

export type EstadoVencimiento = 'AL_DIA' | 'POR_VENCER' | 'VENCE_HOY' | 'EN_GRACIA' | 'VENCIDA';

export interface InsumoAlertEvaluation {
  itemId: string;
  nombreInsumo: string;
  unidad: string;
  existenciaActual: number;
  puntoCritico: number;
  umbralAmarillo: number;        // puntoCritico * (1 + porcentajeAmarillo / 100)
  nivel: NivelAlarma;
  diasCobertura?: number;        // existenciaActual / consumoDiarioEstimado
  esAltaRotacionCritica: boolean;// Si quedan <= 3 días de cobertura
  proveedorPreferidoNombre?: string;
  notaReorden?: string;
}

export interface PayableInvoiceEvaluation {
  facturaId: string;
  numeroFacturaProveedor: string;
  proveedorId: string;
  proveedorNombre: string;
  proveedorRif: string;
  fechaEmision: string;
  fechaVencimiento: string;
  diasRestantes: number;         // > 0 por vencer, 0 vence hoy, < 0 vencida
  estadoVencimiento: EstadoVencimiento;
  saldoPendienteUSD: number;
  saldoPendienteVES: number;
  aplicaMora: boolean;
  tasaMoraPorcentaje: number;
  periodicidadMora: PeriodicidadMora;
  penalizacionFijaUSD: number;
  moraProyectadaUSD: number;     // Monto estimado acumulado de recargo
  riesgoTotalUSD: number;        // saldoPendienteUSD + moraProyectadaUSD + penalizacionFijaUSD
  notaRiesgoManual?: string;
}

export interface StartupAlertDigest {
  timestamp: number;
  fechaLocal: string;
  insumosCriticosRojos: InsumoAlertEvaluation[];
  insumosAlertaAmarillos: InsumoAlertEvaluation[];
  facturasVencidasRojas: PayableInvoiceEvaluation[];
  facturasPorVencerAmarillas: PayableInvoiceEvaluation[];
  totalDeudaVencidaUSD: number;
  totalMoraRiesgoUSD: number;
  tieneAlertasCriticas: boolean;
  tieneAlertasModeradas: boolean;
}

// ============================================================================
// 5. GASTOS OPERATIVOS, MATERIALES, EQUIPOS E HISTÓRICO RETROACTIVO (gastos_operativos/{id})
// ============================================================================

export type GastoTipoRegistro = 'OPERATIVO_ACTUAL' | 'HISTORICO_RETROACTIVO';

export type GastoCategoria =
  | 'CONSTRUCCION_INFRAESTRUCTURA' // Materiales de construcción, tuberías, mallas, pintura, cemento
  | 'EQUIPOS_TECNOLOGIA'          // Computadoras, UPS, routers, cables, impresoras, switches
  | 'PAPELERIA_OFICINA'           // Papel, bolígrafos, carpetas, suministros administrativos
  | 'HERRAMIENTAS_OPERATIVAS'     // Taladros, bombas auxiliares, herramientas de mano, discos
  | 'MANTENIMIENTO_SERVICIOS'     // Reparaciones mecánicas, plomería, electricidad, servicios técnicos
  | 'PAGO_PROVEEDORES_HISTORICO'  // Pagos pasados a proveedores de insumos o servicios
  | 'PAGO_EMPLEADOS_MANO_OBRA'    // Pagos pasados a personal, jornales, cuadrillas o nómina
  | 'GASTOS_OPERATIVOS_GENERALES';// Consumibles diarios, aseo, logística y misceláneos

export type GastoNaturaleza = 'OPEX' | 'CAPEX';

export type GastoMetodoPago =
  | 'EFECTIVO_USD'
  | 'EFECTIVO_VES'
  | 'PAGO_MOVIL'
  | 'TRANSFERENCIA_VES'
  | 'ZELLE'
  | 'BINANCE_USDT'
  | 'TRANSFERENCIA_USD';

export interface OperatingExpense {
  id: string;                      // EXP-YYYYMMDD-XXXXX
  idempotencyKey: string;
  tipoRegistro: GastoTipoRegistro; // 'OPERATIVO_ACTUAL' | 'HISTORICO_RETROACTIVO'
  fecha: string;                   // YYYY-MM-DD (fecha real en que ocurrió el gasto)
  categoria: GastoCategoria;
  naturaleza: GastoNaturaleza;     // OPEX vs CAPEX
  concepto: string;                // Título descriptivo (ej. 'Compra de Router y Cableado Galpón 2')
  descripcionDetallada: string;   // Descripción exacta, justificación y desglose del gasto
  
  // Factura o Comprobante (OPCIONAL en Histórico, obligatorio en Presente si aplica)
  numeroComprobante?: string;      // Opcional en gastos pasados ('S/F' o número real)
  tieneComprobanteFisico: boolean;
  comprobanteUrl?: string;         // Imagen o PDF adjunto opcional
  
  // Proveedor o Beneficiario
  proveedorComercio: string;       // Ferretería, tienda, nombre de empleado o proveedor
  proveedorRifCedula?: string;
  proveedorEntityId?: string;      // Enlace opcional a dual_entities (BRM)
  
  // Aritmética Bimonetaria Exacta (centsRound)
  montoUSD: number;                // SSoT: Monto referenciado en Dólares del momento del pago
  montoVES?: number;               // Monto en Bolívares si se conoce
  tasaBcv?: number;                // Tasa oficial aplicada en la fecha (opcional en históricos)
  
  metodoPago: GastoMetodoPago;
  cuentaOrigen?: string;           // 'Caja Chica', 'Fondo Histórico', 'Banco Banesco', etc.
  estadoPago: 'PAGADO' | 'PENDIENTE_REEMBOLSO';
  
  // Cruce Opcional con Lotes Históricos
  loteHistoricoVinculadoId?: string; // Si se desea imputar a un lote de aves/cerdos específico
  esGastoEstructuralEmpresa: boolean;// Si es un gasto global de la empresa (no atribuible a un solo lote)
  
  responsableNombre?: string;      // Quién autorizó o ejecutó el desembolso
  asientoContableId?: string;      // ID en financial_ledger
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

// Resumen del Cruce Histórico Consolidado (Camadas Pasadas vs Gastos Históricos)
export interface HistoricalConsolidatedPnl {
  totalIngresosCamadasUSD: number;       // Sumatoria de ingresos de lotes_historicos
  totalCostosCamadasUSD: number;         // Sumatoria de costos directos de lotes_historicos
  totalGananciasCamadasUSD: number;      // Sumatoria utilidad neta de lotes_historicos (Aves + Cerdos)
  totalGastosHistoricosUSD: number;      // Sumatoria de gastos_operativos (HISTORICO_RETROACTIVO)
  totalGastosOpexUSD: number;            // OPEX acumulado
  totalGastosCapexUSD: number;           // CAPEX acumulado (activos, tecnología)
  desgloseGastosPorCategoria: Record<GastoCategoria, number>;
  utilidadNetaConsolidadaUSD: number;    // Ganancias Camadas - Gastos Históricos
  margenRentabilidadReal: number;        // (Utilidad Consolidada / Ingresos Camadas) * 100
  conteoCamadas: number;
  conteoGastos: number;
}
