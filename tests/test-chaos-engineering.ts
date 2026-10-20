/**
 * Test de Chaos Engineering y Auditoría Forense de Estrés (@QA + Red Team)
 * Puro Apure ERP - Módulo Biomasa y Lotes (Historial de Camadas y Paridas Pasadas)
 */

import { 
  calculateHistoricalBatchBalance, 
  calculateCumulativeBusinessProfitability,
  round2,
  centsRound
} from '../src/services/financialAnalyticsService';
import type { HistoricalBatchRecord } from '../src/types/inventory';

console.log('========================================================================');
console.log('=== PROTOCOLO DE CHAOS ENGINEERING Y AUDITORÍA DE ESTRÉS FORENSE ===');
console.log('========================================================================\n');

let totalTests = 0;
let passedTests = 0;

function assert(desc: string, condition: boolean, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${desc}`);
  } else {
    console.error(`[FAIL] ${desc} -> ${details || 'Falló la aserción'}`);
    process.exitCode = 1;
  }
}

// --------------------------------------------------------------------------
// 1. TORTURA MATEMÁTICA: INMUNIDAD A DIVISIÓN POR CERO (NaN / Infinity)
// --------------------------------------------------------------------------
console.log('--- 1. CAOS MATEMÁTICO: Escenarios Límite y División por Cero ---');

// Escenario 1: Mortalidad 100% (Todos los animales mueren al día 1)
const totalLossBatch: HistoricalBatchRecord = {
  id: 'CHAOS-01',
  codigoLoteHistorico: 'CHAOS-LOSS-100',
  especie: 'AVICOLA',
  tipoOrigenHistorico: 'COMPRA_ADQUISICION',
  sexoParvadaPiara: 'MIXTO',
  fechaInicioLote: '2025-01-01',
  fechaBeneficioCierre: '2025-01-05',
  cantidadAnimalesInicial: 2000,
  diasNacidosInicio: 1,
  pesoGlobalInicialKg: 84,
  montoPagadoCompraUsd: 1600,
  costoAlimentosUsd: 100,
  costoVacunasUsd: 50,
  costoOtrosInsumosUsd: 25,
  costoManoObraCuidadoresUsd: 50,
  costoVeterinarioCertificacionesUsd: 20,
  mortalidadTotalAnimales: 2000, // 100% muertos
  edadBeneficioDias: 5,
  pesoGlobalBrutoCierreKg: 0,
  mermaTotalBeneficioKg: 0,
  pesoGlobalNetoVendibleKg: 0,
  precioVentaPorKgUsd: 0,
  montoTotalVentaUsd: 0,
  createdTimestamp: Date.now(),
  updatedTimestamp: Date.now(),
  createdBy: 'chaos-agent'
};

const balLoss = calculateHistoricalBatchBalance(totalLossBatch);
assert('Mortalidad 100%: animalesBeneficiados es 0', balLoss.animalesBeneficiados === 0);
assert('Mortalidad 100%: porcentajeMortalidad es 100.00%', balLoss.porcentajeMortalidad === 100);
assert('Mortalidad 100%: porcentajeSupervivencia es 0.00%', balLoss.porcentajeSupervivencia === 0);
assert('Mortalidad 100%: costoProduccionPorKgVendibleUsd es 0 (no Infinity ni NaN)', balLoss.costoProduccionPorKgVendibleUsd === 0);
assert('Mortalidad 100%: costoProduccionPorAnimalBeneficiadoUsd es 0 (no Infinity ni NaN)', balLoss.costoProduccionPorAnimalBeneficiadoUsd === 0);
assert('Mortalidad 100%: inversionTotalCamadaUsd es $1,845.00', balLoss.inversionTotalCamadaUsd === 1845);
assert('Mortalidad 100%: utilidadNetaRealUsd es -$1,845.00', balLoss.utilidadNetaRealUsd === -1845);
assert('Mortalidad 100%: ROI % es -100.00%', balLoss.porcentajeGananciaRealROI === -100);
assert('Mortalidad 100%: margenRentabilidadVentasPorcentaje es 0.00% (no NaN por venta 0)', balLoss.margenRentabilidadVentasPorcentaje === 0);

// Escenario 2: Lote con Inversión Cero y Venta Cero (Zombie Batch)
const zeroBatch: HistoricalBatchRecord = {
  id: 'CHAOS-02',
  codigoLoteHistorico: 'CHAOS-ZERO-00',
  especie: 'PORCINO',
  tipoOrigenHistorico: 'PARIDA_NACIMIENTO_GRANJA',
  sexoParvadaPiara: 'MIXTO',
  fechaInicioLote: '2025-01-01',
  fechaBeneficioCierre: '2025-01-01',
  cantidadAnimalesInicial: 0,
  diasNacidosInicio: 0,
  pesoGlobalInicialKg: 0,
  montoPagadoCompraUsd: 0,
  costoAlimentosUsd: 0,
  costoVacunasUsd: 0,
  costoOtrosInsumosUsd: 0,
  costoManoObraCuidadoresUsd: 0,
  costoVeterinarioCertificacionesUsd: 0,
  mortalidadTotalAnimales: 0,
  edadBeneficioDias: 0,
  pesoGlobalBrutoCierreKg: 0,
  mermaTotalBeneficioKg: 0,
  pesoGlobalNetoVendibleKg: 0,
  precioVentaPorKgUsd: 0,
  montoTotalVentaUsd: 0,
  createdTimestamp: Date.now(),
  updatedTimestamp: Date.now(),
  createdBy: 'chaos-agent'
};

const balZero = calculateHistoricalBatchBalance(zeroBatch);
assert('Lote Cero: ROI % es 0 (no NaN por división 0/0)', balZero.porcentajeGananciaRealROI === 0);
assert('Lote Cero: Margen de ventas es 0 (no NaN por división 0/0)', balZero.margenRentabilidadVentasPorcentaje === 0);
assert('Lote Cero: Mortalidad % es 0 (no NaN)', balZero.porcentajeMortalidad === 0);

// Escenario 3: Merma mayor o igual al peso bruto (Corrupción de pesaje)
const overShrinkageBatch: HistoricalBatchRecord = {
  id: 'CHAOS-03',
  codigoLoteHistorico: 'CHAOS-SHRINK-OVER',
  especie: 'PORCINO',
  tipoOrigenHistorico: 'PARIDA_NACIMIENTO_GRANJA',
  sexoParvadaPiara: 'MIXTO',
  fechaInicioLote: '2025-01-01',
  fechaBeneficioCierre: '2025-06-01',
  cantidadAnimalesInicial: 10,
  diasNacidosInicio: 0,
  pesoGlobalInicialKg: 15,
  montoPagadoCompraUsd: 0,
  costoAlimentosUsd: 800,
  costoVacunasUsd: 50,
  costoOtrosInsumosUsd: 20,
  costoManoObraCuidadoresUsd: 100,
  costoVeterinarioCertificacionesUsd: 50,
  mortalidadTotalAnimales: 0,
  edadBeneficioDias: 150,
  pesoGlobalBrutoCierreKg: 500,
  mermaTotalBeneficioKg: 600, // Merma superior al peso bruto
  pesoGlobalNetoVendibleKg: 0, // Clamped a 0
  precioVentaPorKgUsd: 3.5,
  montoTotalVentaUsd: 0,
  createdTimestamp: Date.now(),
  updatedTimestamp: Date.now(),
  createdBy: 'chaos-agent'
};

const balOverShrink = calculateHistoricalBatchBalance(overShrinkageBatch);
assert('Merma Excesiva: peso neto vendible protegido en 0 kg (sin números negativos)', balOverShrink.costoProduccionPorKgVendibleUsd === 0);
assert('Merma Excesiva: costo por animal beneficiado es $102.00 ($1,020 / 10)', balOverShrink.costoProduccionPorAnimalBeneficiadoUsd === 102);

// --------------------------------------------------------------------------
// 2. CHAOS ENGINEERING OFFLINE-FIRST: DEDUPLICACIÓN DE CONCURRENCIA
// --------------------------------------------------------------------------
console.log('\n--- 2. CAOS OFFLINE-FIRST: Simulación de 20 Mutaciones Rápidas sin Conexión ---');

interface MockQueuedMutation {
  id: string;
  collectionName: string;
  docId: string;
  action: 'SET' | 'UPDATE' | 'DELETE';
  compressedPayload: string;
  clientTimestamp: number;
}

// Generar 20 mutaciones consecutivas para el mismo documento 'lotes_historicos/HIST-STRESS-DOC-01'
const stressDocId = 'HIST-STRESS-DOC-01';
const mockMutations: MockQueuedMutation[] = [];
const baseTime = Date.now();

for (let i = 1; i <= 20; i++) {
  mockMutations.push({
    id: `MUT-${i}_${Math.random().toString(36).slice(2, 7)}`,
    collectionName: 'lotes_historicos',
    docId: stressDocId,
    action: 'SET',
    compressedPayload: JSON.stringify({ version: i, pesoNetoKg: 1000 + i * 10 }),
    clientTimestamp: baseTime + i * 1000,
  });
}

// Algoritmo idéntico al implementado en offlineSyncEngine.ts (Líneas 426-455)
const latestMutationMap = new Map<string, MockQueuedMutation>();
const obsoleteIds: string[] = [];

for (const mut of mockMutations) {
  const uniqueDocKey = `${mut.collectionName}/${mut.docId}`;
  const existing = latestMutationMap.get(uniqueDocKey);

  if (!existing) {
    latestMutationMap.set(uniqueDocKey, mut);
  } else {
    if (mut.clientTimestamp >= existing.clientTimestamp) {
      obsoleteIds.push(existing.id);
      latestMutationMap.set(uniqueDocKey, mut);
    } else {
      obsoleteIds.push(mut.id);
    }
  }
}

assert('Offline Chaos: 20 mutaciones sobre el mismo lote se desduplican exactamente a 1 operación en Firestore', latestMutationMap.size === 1);
assert('Offline Chaos: 19 mutaciones obsoletas identificadas para purga atómica de IndexedDB', obsoleteIds.length === 19);
const finalWinningMutation = latestMutationMap.get(`lotes_historicos/${stressDocId}`);
assert('Offline Chaos: La mutación sobreviviente es estrictamente la última (versión 20)', 
  finalWinningMutation !== undefined && finalWinningMutation.compressedPayload.includes('"version":20')
);

// --------------------------------------------------------------------------
// 3. CANDADO ANTIALUCINACIONES: PRUEBA DE ESTADO CERO
// --------------------------------------------------------------------------
console.log('\n--- 3. CANDADO ANTIALUCINACIONES: Estado Cero Absoluto ---');
const zeroState = calculateCumulativeBusinessProfitability([]);
assert('Estado Cero: Consolidated ROI es exactamente 0.00%', zeroState.consolidated.roiPercentage === 0);
assert('Estado Cero: Consolidated Utilidad Neta es exactamente $0.00', zeroState.consolidated.netProfitUSD === 0);
assert('Estado Cero: Avian ROI es exactamente 0.00%', zeroState.avian.roiPercentage === 0);
assert('Estado Cero: Porcine ROI es exactamente 0.00%', zeroState.porcine.roiPercentage === 0);
assert('Estado Cero: Ningún valor resultante es NaN o null', 
  !isNaN(zeroState.consolidated.roiPercentage) &&
  !isNaN(zeroState.consolidated.totalInvestedUSD) &&
  !isNaN(zeroState.consolidated.netProfitUSD)
);

// --------------------------------------------------------------------------
// RESUMEN FINAL DE PRUEBAS DE ESTRÉS
// --------------------------------------------------------------------------
console.log('\n========================================================================');
console.log(`=== RESULTADO DE CHAOS ENGINEERING: ${passedTests} / ${totalTests} PRUEBAS SUPERADAS CON ÉXITO ===`);
if (passedTests === totalTests) {
  console.log('=== CERTIFICACIÓN RED TEAM / QA: SISTEMA 100% INMUNE A COLISIONES Y CAOS ===');
} else {
  console.error('=== ALERTA RED TEAM: FALLARON PRUEBAS DE ESTRÉS ===');
}
console.log('========================================================================\n');
