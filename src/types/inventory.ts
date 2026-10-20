/**
 * Tipos de datos para Gestión de Inventarios y Trazabilidad Biológica Global
 * Fase 3: Bifurcación de Inventario Vivo (Porcino vs. Avícola) y Control Longitudinal de Peso
 */

export type InventoryCategory = 'INSUMO' | 'BIOMASA_VIVA';

export type InsumoSubtype = 'ALIMENTO' | 'POLLITOS' | 'VITAMINAS' | 'CAL' | 'OTRO';

export type LivestockSpecies = 'AVICOLA' | 'PORCINO';

export type BatchIncomeType = 'NACIMIENTO_INTERNO' | 'ADQUISICION_EXTERNA';

export type LivestockSex = 'MACHO' | 'HEMBRA' | 'MIXTO';

export interface InventoryItem {
  id: string;
  category: InventoryCategory;
  name: string;
  subtype?: InsumoSubtype;
  quantity: number;
  unit: 'kg' | 'sacos' | 'unidades' | 'litros' | 'toneladas';
  unitCostUSD: number;
  totalValueUSD: number;
  lastUpdatedTimestamp: number;
  updatedBy: string;
  notes?: string;
  customFields?: Record<string, any>;
}

export interface BiologicalBatch {
  id: string;
  code: string;
  species: LivestockSpecies;
  status: 'ACTIVO' | 'FINALIZADO';
  initialCount: number;
  currentCount: number;
  startDate: string; // YYYY-MM-DD
  endDate?: string;

  // Trazabilidad de Origen (Fase 1 Spec-Driven)
  tipoIngreso: BatchIncomeType; // 'NACIMIENTO_INTERNO' | 'ADQUISICION_EXTERNA'
  edadInicialDias?: number;     // Solo si ADQUISICION_EXTERNA
  pesoInicialKg?: number;       // Peso al momento del ingreso
  
  // Variables Biológicas Fenotípicas (Fase 1 Spec-Driven)
  sexoParvadaPiara?: LivestockSex; // Enum: 'MACHO' | 'HEMBRA' | 'MIXTO'
  lineaGeneticaRaza?: string;      // ej. Cobb 500, Ross 308 (Avícola) o Landrace, Pietrain, Duroc (Porcino)

  // Compatibilidad retrospectiva con campos preexistentes
  sexo?: LivestockSex;
  razaLineaGenetica?: string;

  // Lógica Avícola (35 - 40 días) / Porcino (hasta 150 días)
  daysInCycle: number;

  // Variables Dinámicas de Mercado y Merma (Erradicación de Constantes)
  // Mercado Avícola Dinámico: sustituye constante de 4.00 USD/kg
  precioFacturableUsdPorKg?: number;

  // Mercado Porcino Dinámico: sustituye constantes de 6.00 USD/kg, 40.00 USD/saco y merma fija
  precioFacturableNetoUsdPorKg?: number;
  precioSacoAlimentoUsd?: number;
  deduccionMermaKg?: number;

  // Pesaje y Merma
  grossWeightKg: number; // Peso bruto o vivo total en kg del lote
  shrinkageDeductionKg: number; // Deducción merma (0 para avícola; dinámico 15-20 kg para porcino)
  netWeightKg: number; // peso_neto = peso_bruto - shrinkageDeductionKg

  // Alimentación e Insumos
  feedSacksConsumed: number; // Para porcino: dinámico a precioSacoAlimentoUsd
  feedCostUSD: number;

  // Facturación Oficial
  // Avícola: peso_vivo_kg * precioFacturableUsdPorKg
  // Porcino: peso_neto * precioFacturableNetoUsdPorKg
  unitPriceUSDPerKg: number;
  billableAmountUSD: number;

  // Control de Concurrencia
  lastUpdatedTimestamp: number;
  updatedBy: string;
  customFields?: Record<string, any>;
}

/**
 * DTO Específico para Lotes Avícolas (Cloud Firestore: lotes_avicolas)
 * Diseñado con variables fenotípicas y de mercado desvinculadas de constantes rígidas.
 */
export interface LoteAvicolaDTO extends BiologicalBatch {
  species: 'AVICOLA';
  sexoParvadaPiara: LivestockSex;
  lineaGeneticaRaza: string;
  precioFacturableUsdPorKg: number;
}

/**
 * DTO Específico para Lotes Porcinos (Cloud Firestore: lotes_porcinos)
 * Diseñado con variables fenotípicas y de mercado desvinculadas de constantes rígidas.
 */
export interface LotePorcinoDTO extends BiologicalBatch {
  species: 'PORCINO';
  sexoParvadaPiara: LivestockSex;
  lineaGeneticaRaza: string;
  precioFacturableNetoUsdPorKg: number;
  precioSacoAlimentoUsd: number;
  deduccionMermaKg: number;
}

// Alias de conveniencia para la arquitectura de persistencia
export type LotesAvicolas = LoteAvicolaDTO;
export type LotesPorcinos = LotePorcinoDTO;

export type BiologicalControlType = 'PESAJE' | 'VACUNACION' | 'ALIMENTACION';

export interface FarmBiologicalControl {
  id: string;
  batchId: string;
  batchCode: string;
  species: LivestockSpecies;
  type: BiologicalControlType;
  date: string; // YYYY-MM-DD
  metricValue: number; // kg promedio para pesaje, dosis para vacunación, sacos para alimentación
  metricUnit: string;
  productOrVaccineName?: string;
  responsibleWorker: string;
  observations: string;
  timestamp: number;
}

export interface StandardGrowthPoint {
  day: number;
  expectedWeightKg: number;
  minAcceptableKg: number;
  maxAcceptableKg: number;
}

export interface WeightRecordAnalysis {
  date: string;
  dayInCycle: number;
  actualWeightKg: number;
  expectedWeightKg: number;
  deviationPercent: number;
  isLagging: boolean;
  worker: string;
  observations: string;
}

export interface ConcurrencyConflict {
  entityType: 'INVENTORY' | 'BATCH';
  entityId: string;
  entityName: string;
  fieldDifferences: {
    field: string;
    label: string;
    cloudValue: unknown;
    localValue: unknown;
  }[];
  cloudTimestamp: number;
  cloudUpdatedBy: string;
  localTimestamp: number;
  onConfirmOverwrite: () => Promise<void>;
  onCancel: () => void;
}

// ==========================================
// Módulo Histórico de Camadas y Paridas Pasadas
// Spec-Driven Development: Esquema Dual Avícola & Porcino
// ==========================================

export type HistoricalBatchOriginType = 'COMPRA_ADQUISICION' | 'PARIDA_NACIMIENTO_GRANJA';

export interface HistoricalBatchRecord {
  id: string;
  codigoLoteHistorico: string; // ej. "CAM-POLLOS-2025-01" o "PAR-CERDOS-2025-01"
  especie: LivestockSpecies; // 'AVICOLA' | 'PORCINO'
  tipoOrigenHistorico: HistoricalBatchOriginType; // 'COMPRA_ADQUISICION' | 'PARIDA_NACIMIENTO_GRANJA'
  sexoParvadaPiara: LivestockSex; // 'MACHO' | 'HEMBRA' | 'MIXTO'
  lineaGeneticaRaza?: string;
  fechaInicioLote: string; // ISO Date YYYY-MM-DD
  fechaBeneficioCierre: string; // ISO Date YYYY-MM-DD

  // Recepción, Parida o Compra Inicial
  cantidadAnimalesInicial: number;
  diasNacidosInicio: number; // 0 si fue parida en granja
  pesoGlobalInicialKg: number;
  montoPagadoCompraUsd: number; // 0.00 si fue parida interna

  // Costos Consolidados de Inversión y Mantenimiento
  costoAlimentosUsd: number;
  cantidadSacosOKilosAlimento?: number;
  costoVacunasUsd: number;
  costoOtrosInsumosUsd: number;
  costoManoObraCuidadoresUsd: number;
  costoVeterinarioCertificacionesUsd: number;

  // Métricas de Producción, Mortalidad, Merma y Beneficio
  mortalidadTotalAnimales: number; // Validar <= cantidadAnimalesInicial
  edadBeneficioDias: number; // Días de edad al beneficio
  pesoGlobalBrutoCierreKg: number;
  mermaTotalBeneficioKg: number; // 0 para pollos; configurable en cerdos (ej. 15-20 kg/cerdo)
  pesoGlobalNetoVendibleKg: number; // pesoGlobalBrutoCierreKg - mermaTotalBeneficioKg

  // Retorno Comercial y Cierre
  precioVentaPorKgUsd: number;
  montoTotalVentaUsd: number;

  // Auditoría y Metadatos
  createdTimestamp: number;
  updatedTimestamp: number;
  createdBy: string;
  notas?: string;
  customFields?: Record<string, any>;
}

export interface HistoricalBatchCalculatedBalance {
  animalesBeneficiados: number;
  porcentajeMortalidad: number;
  porcentajeSupervivencia: number;
  diasEfectivosEnGranja: number;
  gananciaPesoBrutoKg: number;
  costoMantenimientoOperativoUsd: number;
  inversionTotalCamadaUsd: number;
  costoProduccionPorKgVendibleUsd: number;
  costoProduccionPorAnimalBeneficiadoUsd: number;
  utilidadNetaRealUsd: number;
  porcentajeGananciaRealROI: number; // ROI % sobre inversión total
  margenRentabilidadVentasPorcentaje: number; // Margen % sobre facturación
}

export interface HistoricalSpeciesProfitabilityMetrics {
  totalBatches: number;
  totalAnimalsInitial: number;
  totalAnimalsBenefited: number;
  averageSurvivalRate: number;
  totalInvestedUSD: number;
  totalSalesUSD: number;
  netProfitUSD: number;
  roiPercentage: number;
  profitMarginPercentage: number;
  totalKgVendible: number;
  averageCostPerKgVendibleUSD: number;
  totalShrinkageKg?: number;
}

export interface CumulativeBusinessProfitability {
  avian: HistoricalSpeciesProfitabilityMetrics;
  porcine: HistoricalSpeciesProfitabilityMetrics;
  consolidated: {
    totalBatches: number;
    totalAnimalsInitial: number;
    totalAnimalsBenefited: number;
    totalInvestedUSD: number;
    totalSalesUSD: number;
    netProfitUSD: number;
    roiPercentage: number;
    profitMarginPercentage: number;
    totalKgVendible: number;
  };
}

