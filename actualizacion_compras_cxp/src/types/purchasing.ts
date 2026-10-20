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
