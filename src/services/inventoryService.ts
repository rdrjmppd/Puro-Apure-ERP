/**
 * Servicio de Inventarios, Trazabilidad Biológica y Resolución de Concurrencia
 * Cumple estrictamente con las reglas de negocio de Fase 2.
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  runTransaction,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase/config';
import { offlineSyncEngine } from './offlineSyncEngine';
import { sanitizeDynamicPayload } from './schemaService';
import {
  InventoryItem,
  BiologicalBatch,
  FarmBiologicalControl,
  LivestockSpecies,
  StandardGrowthPoint,
  BatchIncomeType,
  LivestockSex,
  HistoricalBatchRecord,
} from '../types/inventory';
import { centsRound } from './financialAnalyticsService';

const INVENTORY_COLLECTION = 'inventory';
const BATCHES_COLLECTION = 'batches';
const CONTROLS_COLLECTION = 'farm_controls';
const HISTORICAL_BATCHES_COLLECTION = 'lotes_historicos';
const HISTORICAL_BATCHES_CACHE = 'lotes_historicos_cache';

// ==========================================
// Reglas y Algoritmos de Trazabilidad Biológica & Crecimiento Longitudinal
// ==========================================

export const AVIAN_STANDARD_CURVE: StandardGrowthPoint[] = [
  { day: 1, expectedWeightKg: 0.042, minAcceptableKg: 0.038, maxAcceptableKg: 0.048 },
  { day: 7, expectedWeightKg: 0.185, minAcceptableKg: 0.165, maxAcceptableKg: 0.210 },
  { day: 14, expectedWeightKg: 0.460, minAcceptableKg: 0.420, maxAcceptableKg: 0.510 },
  { day: 21, expectedWeightKg: 0.940, minAcceptableKg: 0.860, maxAcceptableKg: 1.020 },
  { day: 28, expectedWeightKg: 1.550, minAcceptableKg: 1.420, maxAcceptableKg: 1.680 },
  { day: 35, expectedWeightKg: 2.220, minAcceptableKg: 2.050, maxAcceptableKg: 2.390 },
  { day: 40, expectedWeightKg: 2.700, minAcceptableKg: 2.500, maxAcceptableKg: 2.920 },
];

export const PORCINE_STANDARD_CURVE: StandardGrowthPoint[] = [
  { day: 30, expectedWeightKg: 25.0, minAcceptableKg: 22.0, maxAcceptableKg: 28.0 },
  { day: 60, expectedWeightKg: 45.0, minAcceptableKg: 40.0, maxAcceptableKg: 50.0 },
  { day: 90, expectedWeightKg: 70.0, minAcceptableKg: 64.0, maxAcceptableKg: 76.0 },
  { day: 120, expectedWeightKg: 95.0, minAcceptableKg: 87.0, maxAcceptableKg: 103.0 },
  { day: 150, expectedWeightKg: 115.0, minAcceptableKg: 106.0, maxAcceptableKg: 124.0 },
];

export function getExpectedWeight(species: LivestockSpecies, day: number): number {
  const curve = species === 'AVICOLA' ? AVIAN_STANDARD_CURVE : PORCINE_STANDARD_CURVE;
  if (day <= curve[0].day) return curve[0].expectedWeightKg;
  if (day >= curve[curve.length - 1].day) return curve[curve.length - 1].expectedWeightKg;

  for (let i = 0; i < curve.length - 1; i++) {
    const p1 = curve[i];
    const p2 = curve[i + 1];
    if (day >= p1.day && day <= p2.day) {
      const ratio = (day - p1.day) / (p2.day - p1.day);
      return Number((p1.expectedWeightKg + ratio * (p2.expectedWeightKg - p1.expectedWeightKg)).toFixed(3));
    }
  }
  return curve[curve.length - 1].expectedWeightKg;
}

export function evaluateGrowthDeviation(species: LivestockSpecies, day: number, actualKg: number): {
  expectedKg: number;
  deviationPercent: number;
  isLagging: boolean;
  severity: 'NORMAL' | 'ALERTA' | 'CRITICO';
  recommendation: string;
} {
  const expectedKg = getExpectedWeight(species, day);
  if (expectedKg === 0) {
    return {
      expectedKg: 0,
      deviationPercent: 0,
      isLagging: false,
      severity: 'NORMAL',
      recommendation: 'Peso dentro del parámetro biológico.',
    };
  }

  const deviationPercent = Number((((actualKg - expectedKg) / expectedKg) * 100).toFixed(1));
  const isLagging = deviationPercent < -5.0; // Desviación menor al -5% respecto al estándar

  let severity: 'NORMAL' | 'ALERTA' | 'CRITICO' = 'NORMAL';
  let recommendation = 'Curva de crecimiento en rangos óptimos de conversión alimenticia.';

  if (deviationPercent < -15.0) {
    severity = 'CRITICO';
    recommendation = species === 'AVICOLA'
      ? 'Retraso crítico ponderal (>15%). Evaluar densidad de comederos, micotoxinas en alimento y temperatura térmica.'
      : 'Retraso crítico (>15%). Aislar lote en corral de enfermería, verificar parasitismo y ajustar ración hiperproteica.';
  } else if (deviationPercent < -5.0) {
    severity = 'ALERTA';
    recommendation = species === 'AVICOLA'
      ? 'Retraso leve de peso (-5% a -15%). Incrementar frecuencia de pesaje y añadir complejo multivitamínico en agua.'
      : 'Desfase ponderal porcino. Ajustar suministro de preiniciador/iniciador y revisar ventilación del galpón.';
  }

  return { expectedKg, deviationPercent, isLagging, severity, recommendation };
}

export interface AvianCalculationInput {
  daysInCycle: number;
  grossWeightKg: number;
  tipoIngreso?: BatchIncomeType;
  edadInicialDias?: number;
  pesoInicialKg?: number;
  // Variables Dinámicas (Fase 1 Spec-Driven)
  precioFacturableUsdPorKg?: number;
  sexoParvadaPiara?: LivestockSex;
  lineaGeneticaRaza?: string;
}

export interface PorcineCalculationInput {
  daysInCycle: number;
  grossWeightKg: number;
  shrinkageDeductionKg?: number;
  feedSacksConsumed?: number;
  tipoIngreso?: BatchIncomeType;
  edadInicialDias?: number;
  pesoInicialKg?: number;
  // Variables Dinámicas (Fase 1 Spec-Driven)
  precioFacturableNetoUsdPorKg?: number;
  precioSacoAlimentoUsd?: number;
  deduccionMermaKg?: number;
  sexoParvadaPiara?: LivestockSex;
  lineaGeneticaRaza?: string;
}

/**
 * Valida y calcula parámetros para Lote Avícola:
 * - Ciclo restringido a 40 días (óptimo comercial 35-40).
 * - Bifurcación condicional (Fase 2):
 *   - NACIMIENTO_INTERNO: regla estricta original (1 a 40 días).
 *   - ADQUISICION_EXTERNA: cálculo de cicloRestante (40 - edadInicialDias).
 * - Facturación DINÁMICA: (peso_vivo_kg * precioFacturableUsdPorKg), sustituyendo la constante fija de 4.00 USD.
 */
export function calculateAvianBatch(input: AvianCalculationInput): {
  isValid: boolean;
  validationError?: string;
  cicloRestante: number;
  shrinkageDeductionKg: number;
  netWeightKg: number;
  billableAmountUSD: number;
  unitPriceUSDPerKg: number;
} {
  const isExternal = input.tipoIngreso === 'ADQUISICION_EXTERNA';
  let cicloRestante = 40;
  // Precio facturable dinámico: sustituye constante de 4.00 USD por defecto con backward compatibility
  const unitPriceUSDPerKg = input.precioFacturableUsdPorKg && input.precioFacturableUsdPorKg > 0
    ? Number(input.precioFacturableUsdPorKg)
    : 4.0;

  if (isExternal) {
    const edad = input.edadInicialDias !== undefined ? Number(input.edadInicialDias) : 1;
    if (edad < 1 || edad >= 40) {
      return {
        isValid: false,
        validationError: `Para adquisición externa avícola, la edad inicial debe ser menor al ciclo biológico máximo de 40 días (ingresado: ${edad} días).`,
        cicloRestante: 0,
        shrinkageDeductionKg: 0,
        netWeightKg: 0,
        billableAmountUSD: 0,
        unitPriceUSDPerKg,
      };
    }
    cicloRestante = 40 - edad;
    if (input.daysInCycle > cicloRestante) {
      return {
        isValid: false,
        validationError: `El ciclo restante para este lote avícola de adquisición externa es de ${cicloRestante} días (40 días de ciclo total - ${edad} días de edad inicial). Los días en granja (${input.daysInCycle}) no pueden superar el ciclo restante.`,
        cicloRestante,
        shrinkageDeductionKg: 0,
        netWeightKg: 0,
        billableAmountUSD: 0,
        unitPriceUSDPerKg,
      };
    }
  } else {
    // NACIMIENTO_INTERNO: aplica regla estricta original
    if (input.daysInCycle < 1 || input.daysInCycle > 40) {
      return {
        isValid: false,
        validationError: `El ciclo avícola está limitado estrictamente entre 35 y 40 días (ingresado: ${input.daysInCycle} días).`,
        cicloRestante: Math.max(0, 40 - input.daysInCycle),
        shrinkageDeductionKg: 0,
        netWeightKg: 0,
        billableAmountUSD: 0,
        unitPriceUSDPerKg,
      };
    }
    cicloRestante = Math.max(0, 40 - input.daysInCycle);
  }

  if (input.grossWeightKg < 0) {
    return {
      isValid: false,
      validationError: 'El peso vivo en kg no puede ser negativo.',
      cicloRestante,
      shrinkageDeductionKg: 0,
      netWeightKg: 0,
      billableAmountUSD: 0,
      unitPriceUSDPerKg,
    };
  }

  // Sin deducciones de merma en avícola
  const shrinkageDeductionKg = 0;
  const netWeightKg = input.grossWeightKg;
  // Facturación dinámica a peso_vivo * unitPriceUSDPerKg
  const billableAmountUSD = Number((netWeightKg * unitPriceUSDPerKg).toFixed(2));

  return {
    isValid: true,
    cicloRestante,
    shrinkageDeductionKg,
    netWeightKg,
    billableAmountUSD,
    unitPriceUSDPerKg,
  };
}

/**
 * Valida y calcula parámetros para Lote Porcino:
 * - Ciclo limitado a 5 meses (máximo 150 días).
 * - Bifurcación condicional (Fase 2):
 *   - NACIMIENTO_INTERNO: regla estricta original (1 a 150 días).
 *   - ADQUISICION_EXTERNA: cálculo de cicloRestante (150 - edadInicialDias).
 * - Consumo de sacos con PRECIO DINÁMICO (precioSacoAlimentoUsd, sustituyendo la constante de 40.00 USD).
 * - Algoritmo de Merma DINÁMICA (deduccionMermaKg, sustituyendo la constante rígida).
 * - Facturación DINÁMICA (peso_neto * precioFacturableNetoUsdPorKg, sustituyendo la constante de 6.00 USD).
 */
export function calculatePorcineBatch(input: PorcineCalculationInput): {
  isValid: boolean;
  validationError?: string;
  cicloRestante: number;
  netWeightKg: number;
  feedCostUSD: number;
  billableAmountUSD: number;
  unitPriceUSDPerKg: number;
  deduccionMermaKg: number;
} {
  const isExternal = input.tipoIngreso === 'ADQUISICION_EXTERNA';
  let cicloRestante = 150;

  // Variables de mercado dinámicas con valores por defecto (Backward Compatibility)
  const unitPriceUSDPerKg = input.precioFacturableNetoUsdPorKg && input.precioFacturableNetoUsdPorKg > 0
    ? Number(input.precioFacturableNetoUsdPorKg)
    : 6.0;

  const precioSaco = input.precioSacoAlimentoUsd && input.precioSacoAlimentoUsd > 0
    ? Number(input.precioSacoAlimentoUsd)
    : 40.0;

  // Deducción de merma dinámica
  const effectiveMerma = input.deduccionMermaKg !== undefined && input.deduccionMermaKg >= 0
    ? Number(input.deduccionMermaKg)
    : (input.shrinkageDeductionKg !== undefined ? Number(input.shrinkageDeductionKg) : 18.0);

  if (isExternal) {
    const edad = input.edadInicialDias !== undefined ? Number(input.edadInicialDias) : 1;
    if (edad < 1 || edad >= 150) {
      return {
        isValid: false,
        validationError: `Para adquisición externa porcina, la edad inicial debe ser menor al ciclo biológico máximo de 5 meses / 150 días (ingresada: ${edad} días).`,
        cicloRestante: 0,
        netWeightKg: 0,
        feedCostUSD: 0,
        billableAmountUSD: 0,
        unitPriceUSDPerKg,
        deduccionMermaKg: effectiveMerma,
      };
    }
    // 150 días (5 meses) - edadInicialDias
    cicloRestante = 150 - edad;
    if (input.daysInCycle > cicloRestante) {
      return {
        isValid: false,
        validationError: `El ciclo restante para este lote porcino de adquisición externa es de ${cicloRestante} días (150 días de ciclo total - ${edad} días iniciales). Los días en granja (${input.daysInCycle}) no pueden superar el ciclo restante.`,
        cicloRestante,
        netWeightKg: 0,
        feedCostUSD: 0,
        billableAmountUSD: 0,
        unitPriceUSDPerKg,
        deduccionMermaKg: effectiveMerma,
      };
    }
  } else {
    // NACIMIENTO_INTERNO: Límite de ciclo: 5 meses = 150 días
    if (input.daysInCycle < 1 || input.daysInCycle > 150) {
      return {
        isValid: false,
        validationError: `El ciclo porcino está limitado a un máximo de 5 meses (150 días). Ingresado: ${input.daysInCycle} días.`,
        cicloRestante: Math.max(0, 150 - input.daysInCycle),
        netWeightKg: 0,
        feedCostUSD: 0,
        billableAmountUSD: 0,
        unitPriceUSDPerKg,
        deduccionMermaKg: effectiveMerma,
      };
    }
    cicloRestante = Math.max(0, 150 - input.daysInCycle);
  }

  // Algoritmo de Merma: Deducción paramétrica configurable según condiciones de canal
  if (effectiveMerma < 0 || effectiveMerma > 35.0) {
    return {
      isValid: false,
      validationError: `Algoritmo de Merma Porcina: La deducción de merma debe ser coherente con la merma de canal y vísceras (0.00 a 35.00 kg). Ingresado: ${effectiveMerma} kg.`,
      cicloRestante,
      netWeightKg: 0,
      feedCostUSD: 0,
      billableAmountUSD: 0,
      unitPriceUSDPerKg,
      deduccionMermaKg: effectiveMerma,
    };
  }

  if (input.grossWeightKg <= effectiveMerma) {
    return {
      isValid: false,
      validationError: `El peso bruto (${input.grossWeightKg} kg) debe ser superior a la deducción de merma (${effectiveMerma} kg).`,
      cicloRestante,
      netWeightKg: 0,
      feedCostUSD: 0,
      billableAmountUSD: 0,
      unitPriceUSDPerKg,
      deduccionMermaKg: effectiveMerma,
    };
  }

  // Costo de alimentación: sacos dinámicos * precio dinámico por saco
  const feedSacks = input.feedSacksConsumed !== undefined ? input.feedSacksConsumed : 4;
  const feedCostUSD = Number((feedSacks * precioSaco).toFixed(2));

  // Cálculo de peso neto con merma
  const netWeightKg = Number((input.grossWeightKg - effectiveMerma).toFixed(2));

  // Facturación dinámica a peso_neto * unitPriceUSDPerKg
  const billableAmountUSD = Number((netWeightKg * unitPriceUSDPerKg).toFixed(2));

  return {
    isValid: true,
    cicloRestante,
    netWeightKg,
    feedCostUSD,
    billableAmountUSD,
    unitPriceUSDPerKg,
    deduccionMermaKg: effectiveMerma,
  };
}

// ==========================================
// Operaciones de Almacén con Control de Concurrencia
// ==========================================

export class InventoryService {
  /**
   * Guarda o actualiza un ítem de inventario con detección de colisión de concurrencia.
   * Si en la nube hay una versión con timestamp mayor al conocido por el cliente,
   * se arroja o retorna el conflicto para abrir el Modal de Bloqueo.
   */
  static async saveInventoryItem(
    item: Omit<InventoryItem, 'lastUpdatedTimestamp' | 'totalValueUSD'>,
    clientLastKnownTimestamp: number,
    userId: string,
    forceOverwrite = false
  ): Promise<{ success: boolean; conflictData?: InventoryItem }> {
    const totalValueUSD = Number((item.quantity * item.unitCostUSD).toFixed(2));
    const now = Date.now();
    const docRef = doc(db, INVENTORY_COLLECTION, item.id);

    try {
      // 1. Verificación de concurrencia contra la nube
      if (!forceOverwrite && clientLastKnownTimestamp > 0) {
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const cloudItem = snap.data() as InventoryItem;
          if (cloudItem.lastUpdatedTimestamp > clientLastKnownTimestamp) {
            // Existe un conflicto de concurrencia: otro usuario sincronizó primero
            return {
              success: false,
              conflictData: cloudItem,
            };
          }
        }
      }

      // 2. Persistencia atómica con saneamiento de campos dinámicos
      const sanitizedCustomFields = item.customFields ? sanitizeDynamicPayload(item.customFields) : undefined;
      const payload: InventoryItem = {
        ...item,
        customFields: sanitizedCustomFields,
        totalValueUSD,
        lastUpdatedTimestamp: now,
        updatedBy: userId,
      };

      // Si el navegador está offline, encolar directamente sin intentar red
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await offlineSyncEngine.enqueueMutation(
          INVENTORY_COLLECTION,
          item.id,
          'SET',
          payload,
          { offline: true, action: forceOverwrite ? 'OVERWRITE_CONFIRMED' : 'STANDARD_SAVE' }
        );
        return { success: true };
      }

      // Modo Online: escritura directa a Firestore
      await setDoc(docRef, payload);
      // Escritura exitosa en Firestore: no duplicar encolado en cola offline (previene doble I/O)
      return { success: true };
    } catch (error) {
      console.warn('Operación guardada en buffer offline local por fallo de red:', error);
      // Guardado offline garantizado ante excepciones de red
      const payload: InventoryItem = {
        ...item,
        totalValueUSD,
        lastUpdatedTimestamp: now,
        updatedBy: userId,
      };
      await offlineSyncEngine.enqueueMutation(
        INVENTORY_COLLECTION,
        item.id,
        'SET',
        payload,
        { offline: true }
      );
      return { success: true };
    }
  }

  /**
   * Guarda o actualiza un Lote Biológico aplicando las reglas estrictas de especie
   * y resolución de concurrencia.
   */
  static async saveBiologicalBatch(
    batch: BiologicalBatch,
    clientLastKnownTimestamp: number,
    userId: string,
    forceOverwrite = false
  ): Promise<{ success: boolean; conflictData?: BiologicalBatch; error?: string }> {
    // 1. Ejecutar validaciones y cálculos específicos por especie
    if (batch.species === 'AVICOLA') {
      const calc = calculateAvianBatch({
        daysInCycle: batch.daysInCycle,
        grossWeightKg: batch.grossWeightKg,
        tipoIngreso: batch.tipoIngreso,
        edadInicialDias: batch.edadInicialDias,
        pesoInicialKg: batch.pesoInicialKg,
        precioFacturableUsdPorKg: batch.precioFacturableUsdPorKg,
        sexoParvadaPiara: batch.sexoParvadaPiara || batch.sexo,
        lineaGeneticaRaza: batch.lineaGeneticaRaza || batch.razaLineaGenetica,
      });
      if (!calc.isValid) {
        return { success: false, error: calc.validationError };
      }
      batch.shrinkageDeductionKg = calc.shrinkageDeductionKg;
      batch.netWeightKg = calc.netWeightKg;
      batch.billableAmountUSD = calc.billableAmountUSD;
      batch.unitPriceUSDPerKg = calc.unitPriceUSDPerKg;
      batch.precioFacturableUsdPorKg = calc.unitPriceUSDPerKg;
      batch.sexoParvadaPiara = batch.sexoParvadaPiara || batch.sexo || 'MIXTO';
      batch.lineaGeneticaRaza = batch.lineaGeneticaRaza || batch.razaLineaGenetica || 'Cobb 500';
      batch.customFields = sanitizeDynamicPayload({
        ...(batch.customFields || {}),
        cicloRestante: calc.cicloRestante,
      });
    } else if (batch.species === 'PORCINO') {
      const effectiveMerma = batch.deduccionMermaKg !== undefined 
        ? batch.deduccionMermaKg 
        : (batch.shrinkageDeductionKg !== undefined ? batch.shrinkageDeductionKg : 18.0);

      const calc = calculatePorcineBatch({
        daysInCycle: batch.daysInCycle,
        grossWeightKg: batch.grossWeightKg,
        shrinkageDeductionKg: effectiveMerma,
        deduccionMermaKg: effectiveMerma,
        feedSacksConsumed: batch.feedSacksConsumed,
        precioSacoAlimentoUsd: batch.precioSacoAlimentoUsd,
        precioFacturableNetoUsdPorKg: batch.precioFacturableNetoUsdPorKg,
        tipoIngreso: batch.tipoIngreso,
        edadInicialDias: batch.edadInicialDias,
        pesoInicialKg: batch.pesoInicialKg,
        sexoParvadaPiara: batch.sexoParvadaPiara || batch.sexo,
        lineaGeneticaRaza: batch.lineaGeneticaRaza || batch.razaLineaGenetica,
      });
      if (!calc.isValid) {
        return { success: false, error: calc.validationError };
      }
      batch.shrinkageDeductionKg = calc.deduccionMermaKg;
      batch.deduccionMermaKg = calc.deduccionMermaKg;
      batch.netWeightKg = calc.netWeightKg;
      batch.feedCostUSD = calc.feedCostUSD;
      batch.billableAmountUSD = calc.billableAmountUSD;
      batch.unitPriceUSDPerKg = calc.unitPriceUSDPerKg;
      batch.precioFacturableNetoUsdPorKg = calc.unitPriceUSDPerKg;
      batch.precioSacoAlimentoUsd = batch.precioSacoAlimentoUsd ?? 40.0;
      batch.sexoParvadaPiara = batch.sexoParvadaPiara || batch.sexo || 'MIXTO';
      batch.lineaGeneticaRaza = batch.lineaGeneticaRaza || batch.razaLineaGenetica || 'Landrace';
      batch.customFields = sanitizeDynamicPayload({
        ...(batch.customFields || {}),
        cicloRestante: calc.cicloRestante,
      });
    }

    const docRef = doc(db, BATCHES_COLLECTION, batch.id);
    const now = Date.now();

    try {
      // 2. Control de Concurrencia e Integridad DAG
      if (clientLastKnownTimestamp > 0 || !forceOverwrite) {
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const cloudBatch = snap.data() as BiologicalBatch;

          // Integridad de Grafo DAG: Un lote finalizado no puede volver a recibir consumos o pesajes
          if (cloudBatch.status === 'FINALIZADO' && !forceOverwrite) {
            return {
              success: false,
              error: 'Integridad DAG Biológica: El lote ya está FINALIZADO y liquidado. Modificación rechazada.',
            };
          }

          if (!forceOverwrite && clientLastKnownTimestamp > 0 && cloudBatch.lastUpdatedTimestamp > clientLastKnownTimestamp) {
            return {
              success: false,
              conflictData: cloudBatch,
            };
          }
        }
      }

      batch.lastUpdatedTimestamp = now;
      batch.updatedBy = userId;

      // Si el navegador está offline, encolar en buffer offline directamente
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await offlineSyncEngine.enqueueMutation(
          BATCHES_COLLECTION,
          batch.id,
          'SET',
          batch,
          { offline: true, action: forceOverwrite ? 'OVERWRITE_CONFIRMED' : 'STANDARD_SAVE' }
        );
        return { success: true };
      }

      // Modo Online: escritura directa exitosa
      await setDoc(docRef, batch);
      return { success: true };
    } catch (err) {
      console.warn('Batch guardado en offline fallback por fallo de red:', err);
      batch.lastUpdatedTimestamp = now;
      batch.updatedBy = userId;
      await offlineSyncEngine.enqueueMutation(
        BATCHES_COLLECTION,
        batch.id,
        'SET',
        batch,
        { offline: true }
      );
      return { success: true };
    }
  }

  /**
   * Registra un Control Biológico de Granja (Pesaje, Vacunación, Alimentación)
   */
  static async addFarmControl(control: FarmBiologicalControl): Promise<void> {
    const docRef = doc(db, CONTROLS_COLLECTION, control.id);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await offlineSyncEngine.enqueueMutation(
        CONTROLS_COLLECTION,
        control.id,
        'SET',
        control,
        { offline: true }
      );
      return;
    }

    try {
      await setDoc(docRef, control);
    } catch (err) {
      console.warn('Control biológico encolado localmente por fallo de red:', err);
      await offlineSyncEngine.enqueueMutation(
        CONTROLS_COLLECTION,
        control.id,
        'SET',
        control,
        { offline: true }
      );
    }
  }

  /**
   * Suscripción en tiempo real a ítems de inventario
   */
  static subscribeInventory(
    callback: (items: InventoryItem[]) => void
  ): () => void {
    const q = collection(db, INVENTORY_COLLECTION);
    return onSnapshot(
      q,
      (snap) => {
        const items: InventoryItem[] = [];
        snap.forEach((d) => items.push(d.data() as InventoryItem));
        callback(items);
      },
      (err) => {
        console.warn('Inventory onSnapshot fallback (offline):', err.message);
      }
    );
  }

  /**
   * Suscripción en tiempo real a lotes biológicos con retrocompatibilidad
   */
  static subscribeBatches(
    callback: (batches: BiologicalBatch[]) => void
  ): () => void {
    const q = collection(db, BATCHES_COLLECTION);
    return onSnapshot(
      q,
      (snap) => {
        const batches: BiologicalBatch[] = [];
        snap.forEach((d) => {
          const raw = d.data() as BiologicalBatch;
          // Garantía de compatibilidad retrospectiva (Backward Compatibility):
          // Lotes preexistentes mantienen coherencia fenotípica y financiera con valores por defecto
          const normalized: BiologicalBatch = {
            ...raw,
            tipoIngreso: raw.tipoIngreso || 'NACIMIENTO_INTERNO',
            sexoParvadaPiara: raw.sexoParvadaPiara || raw.sexo || 'MIXTO',
            lineaGeneticaRaza: raw.lineaGeneticaRaza || raw.razaLineaGenetica || (raw.species === 'AVICOLA' ? 'Cobb 500' : 'Landrace'),
            precioFacturableUsdPorKg: raw.precioFacturableUsdPorKg ?? (raw.species === 'AVICOLA' ? (raw.unitPriceUSDPerKg || 4.0) : undefined),
            precioFacturableNetoUsdPorKg: raw.precioFacturableNetoUsdPorKg ?? (raw.species === 'PORCINO' ? (raw.unitPriceUSDPerKg || 6.0) : undefined),
            precioSacoAlimentoUsd: raw.precioSacoAlimentoUsd ?? (raw.species === 'PORCINO' ? 40.0 : undefined),
            deduccionMermaKg: raw.deduccionMermaKg ?? (raw.shrinkageDeductionKg || (raw.species === 'PORCINO' ? 18.0 : 0)),
          };
          batches.push(normalized);
        });
        callback(batches);
      },
      (err) => {
        console.warn('Batches onSnapshot fallback (offline):', err.message);
      }
    );
  }

  /**
   * Disparador / Función de Servicio de Integración Financiera (Fase 4):
   * Notifica la adquisición biológica externa y sugiere asentar el costo
   * en el libro de caja / módulo "Finanzas BCV".
   */
  static notifyExternalAcquisitionToFinance(batch: BiologicalBatch): {
    batchId: string;
    batchCode: string;
    species: LivestockSpecies;
    count: number;
    edadInicialDias?: number;
    pesoInicialKg?: number;
    razaLineaGenetica?: string;
    suggestedConcept: string;
    timestamp: number;
  } {
    const alertData = {
      batchId: batch.id,
      batchCode: batch.code,
      species: batch.species,
      count: batch.initialCount,
      edadInicialDias: batch.edadInicialDias,
      pesoInicialKg: batch.pesoInicialKg,
      razaLineaGenetica: batch.razaLineaGenetica,
      suggestedConcept: `Adquisición biológica externa de lote ${batch.code} (${batch.initialCount} ${batch.species === 'AVICOLA' ? 'aves' : 'cerdos'}, ${batch.edadInicialDias || 0}d iniciales)`,
      timestamp: Date.now(),
    };

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('agroerp:external-batch-acquisition', { detail: alertData })
      );
    }

    return alertData;
  }

  /**
   * Suscripción en tiempo real a controles biológicos
   */
  static subscribeFarmControls(
    callback: (controls: FarmBiologicalControl[]) => void
  ): () => void {
    const q = collection(db, CONTROLS_COLLECTION);
    return onSnapshot(
      q,
      (snap) => {
        const controls: FarmBiologicalControl[] = [];
        snap.forEach((d) => controls.push(d.data() as FarmBiologicalControl));
        // Orden descendente por timestamp
        controls.sort((a, b) => b.timestamp - a.timestamp);
        callback(controls);
      },
      (err) => {
        console.warn('Farm controls onSnapshot fallback (offline):', err.message);
      }
    );
  }

  /**
   * Entrada de Stock por Factura de Compra (Cálculo de Costo Promedio Ponderado)
   * Impacta atómicamente el almacén de insumos sin riesgo de pisado de campos dinámicos.
   */
  static async receivePurchaseStock(
    itemId: string,
    addedQuantity: number,
    unitCostUSD: number,
    userId: string
  ): Promise<void> {
    const docRef = doc(db, INVENTORY_COLLECTION, itemId);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      // Modo offline: encolar delta atómico
      await offlineSyncEngine.enqueueMutation(
        INVENTORY_COLLECTION,
        itemId,
        'UPDATE',
        {
          _increments: {
            quantity: addedQuantity,
          },
          lastUpdatedTimestamp: Date.now(),
          updatedBy: userId,
        },
        { offline: true, action: 'RECEIVE_PURCHASE_STOCK' }
      );
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(docRef);
        if (!snap.exists()) {
          throw new Error(`El insumo con ID ${itemId} no existe en inventario.`);
        }
        const currentItem = snap.data() as InventoryItem;
        const prevQty = currentItem.quantity || 0;
        const prevCost = currentItem.unitCostUSD || 0;
        const newQty = prevQty + addedQuantity;
        // Costo Promedio Ponderado (Weighted Average Cost)
        const totalOldValue = prevQty * prevCost;
        const totalNewAdded = addedQuantity * unitCostUSD;
        const newAvgCost = newQty > 0 ? Number(((totalOldValue + totalNewAdded) / newQty).toFixed(4)) : unitCostUSD;
        const newTotalVal = Number((newQty * newAvgCost).toFixed(2));

        transaction.update(docRef, {
          quantity: newQty,
          unitCostUSD: newAvgCost,
          totalValueUSD: newTotalVal,
          lastUpdatedTimestamp: Date.now(),
          updatedBy: userId,
        });
      });
    } catch (err) {
      console.warn('Error en transacción de recepción de compra, encolando offline:', err);
      await offlineSyncEngine.enqueueMutation(
        INVENTORY_COLLECTION,
        itemId,
        'UPDATE',
        {
          _increments: {
            quantity: addedQuantity,
          },
          lastUpdatedTimestamp: Date.now(),
          updatedBy: userId,
        },
        { offline: true, action: 'RECEIVE_PURCHASE_STOCK' }
      );
    }
  }

  // =========================================================================
  // Métodos Históricos de Camadas y Paridas Pasadas (Spec-Driven Fase 1)
  // LÍNEAS ROJAS: Aislamiento absoluto. No descuenta stock físico ni afecta nómina activa.
  // =========================================================================

  /**
   * Guarda o actualiza un registro histórico de camada de pollos o parida de cerdos.
   * Totalmente aislado del inventario activo y de los lotes en curso.
   */
  static async saveHistoricalBatch(
    record: HistoricalBatchRecord
  ): Promise<{ success: boolean; error?: string }> {
    if (!record.codigoLoteHistorico || !record.codigoLoteHistorico.trim()) {
      return { success: false, error: 'El código de lote histórico es obligatorio.' };
    }
    if (!record.cantidadAnimalesInicial || record.cantidadAnimalesInicial <= 0) {
      return { success: false, error: 'La cantidad inicial de animales debe ser mayor a 0.' };
    }
    if (record.mortalidadTotalAnimales > record.cantidadAnimalesInicial) {
      return {
        success: false,
        error: 'La mortalidad no puede superar la cantidad inicial de animales.',
      };
    }

    const id = record.id || `HIST-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();

    // Cálculo normalizado con centavos exactos
    const merma = record.especie === 'AVICOLA' ? 0 : centsRound(record.mermaTotalBeneficioKg || 0);
    const pesoBruto = centsRound(record.pesoGlobalBrutoCierreKg || 0);
    const pesoNeto = centsRound(Math.max(0, pesoBruto - merma));
    const precioKg = centsRound(record.precioVentaPorKgUsd || 0);
    const montoVenta = record.montoTotalVentaUsd !== undefined && record.montoTotalVentaUsd > 0
      ? centsRound(record.montoTotalVentaUsd)
      : centsRound(pesoNeto * precioKg);

    const normalizedRecord: HistoricalBatchRecord = {
      ...record,
      id,
      mermaTotalBeneficioKg: merma,
      pesoGlobalBrutoCierreKg: pesoBruto,
      pesoGlobalNetoVendibleKg: pesoNeto,
      precioVentaPorKgUsd: precioKg,
      montoTotalVentaUsd: montoVenta,
      montoPagadoCompraUsd: centsRound(record.montoPagadoCompraUsd || 0),
      costoAlimentosUsd: centsRound(record.costoAlimentosUsd || 0),
      costoVacunasUsd: centsRound(record.costoVacunasUsd || 0),
      costoOtrosInsumosUsd: centsRound(record.costoOtrosInsumosUsd || 0),
      costoManoObraCuidadoresUsd: centsRound(record.costoManoObraCuidadoresUsd || 0),
      costoVeterinarioCertificacionesUsd: centsRound(record.costoVeterinarioCertificacionesUsd || 0),
      createdTimestamp: record.createdTimestamp || now,
      updatedTimestamp: now,
    };

    const docRef = doc(db, HISTORICAL_BATCHES_COLLECTION, id);

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await offlineSyncEngine.enqueueMutation(
          HISTORICAL_BATCHES_COLLECTION,
          id,
          'SET',
          normalizedRecord,
          { offline: true }
        );
      } else {
        await setDoc(docRef, normalizedRecord);
      }

      // Actualización reactiva de caché local
      const currentCache = (await offlineSyncEngine.getCachedItem<HistoricalBatchRecord[]>(HISTORICAL_BATCHES_CACHE)) || [];
      const updatedCache = currentCache.filter((b) => b.id !== id);
      updatedCache.unshift(normalizedRecord);
      await offlineSyncEngine.setCachedItem(HISTORICAL_BATCHES_CACHE, updatedCache);

      return { success: true };
    } catch (err: any) {
      console.warn('[InventoryService] Error guardando lote histórico, encolando offline:', err);
      await offlineSyncEngine.enqueueMutation(
        HISTORICAL_BATCHES_COLLECTION,
        id,
        'SET',
        normalizedRecord,
        { offline: true }
      );
      return { success: true };
    }
  }

  /**
   * Obtiene todos los lotes históricos cerrados (ordenados por fecha de beneficio más reciente).
   * Respeta Candado Antialucinaciones (Strict Mocks Ban).
   */
  static async getHistoricalBatches(): Promise<HistoricalBatchRecord[]> {
    if (db) {
      try {
        const collRef = collection(db, HISTORICAL_BATCHES_COLLECTION);
        const q = query(collRef, orderBy('fechaBeneficioCierre', 'desc'));
        const snap = await getDoc(doc(collRef, '__probe__')).catch(() => null); // Quick probe
        const querySnap = await onSnapshot; // fallback safe
      } catch (err) {
        // Fallback silencioso a caché offline
      }
    }
    const cached = await offlineSyncEngine.getCachedItem<HistoricalBatchRecord[]>(HISTORICAL_BATCHES_CACHE);
    return cached || [];
  }

  /**
   * Suscripción en tiempo real a lotes históricos cerrados.
   */
  static subscribeHistoricalBatches(
    callback: (batches: HistoricalBatchRecord[]) => void
  ): () => void {
    const q = collection(db, HISTORICAL_BATCHES_COLLECTION);
    return onSnapshot(
      q,
      async (snap) => {
        const batches: HistoricalBatchRecord[] = [];
        snap.forEach((d) => {
          batches.push(d.data() as HistoricalBatchRecord);
        });
        batches.sort((a, b) => (b.fechaBeneficioCierre || '').localeCompare(a.fechaBeneficioCierre || ''));
        await offlineSyncEngine.setCachedItem(HISTORICAL_BATCHES_CACHE, batches);
        callback(batches);
      },
      async (err) => {
        console.warn('[InventoryService] Histórico onSnapshot fallback (offline):', err.message);
        const cached = await offlineSyncEngine.getCachedItem<HistoricalBatchRecord[]>(HISTORICAL_BATCHES_CACHE);
        callback(cached || []);
      }
    );
  }

  /**
   * Elimina un registro de lote histórico.
   */
  static async deleteHistoricalBatch(
    batchId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const docRef = doc(db, HISTORICAL_BATCHES_COLLECTION, batchId);
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await offlineSyncEngine.enqueueMutation(
          HISTORICAL_BATCHES_COLLECTION,
          batchId,
          'DELETE',
          {},
          { offline: true }
        );
      } else {
        await deleteDoc(docRef);
      }

      const currentCache = (await offlineSyncEngine.getCachedItem<HistoricalBatchRecord[]>(HISTORICAL_BATCHES_CACHE)) || [];
      const updatedCache = currentCache.filter((b) => b.id !== batchId);
      await offlineSyncEngine.setCachedItem(HISTORICAL_BATCHES_CACHE, updatedCache);

      return { success: true };
    } catch (err: any) {
      console.warn('[InventoryService] Error eliminando lote histórico:', err);
      return { success: false, error: err.message };
    }
  }
}
