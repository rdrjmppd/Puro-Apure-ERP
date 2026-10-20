/**
 * Test de Certificación Matemática y Aritmética de Centavos (centsRound / round2)
 * Fase 1: Esquema Dual (Pollos y Cerdos) y Motor de Rentabilidad Real Acumulada
 */

import {
  calculateHistoricalBatchBalance,
  calculateCumulativeBusinessProfitability,
  centsRound,
  round2,
} from '../src/services/financialAnalyticsService';
import { HistoricalBatchRecord } from '../src/types/inventory';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FALLO: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ OK: ${message}`);
  }
}

console.log('=== INICIANDO CERTIFICACIÓN MATEMÁTICA FASE 1 ===\n');

// 1. Caso Vacío (Candado Antialucinaciones - Strict Mocks Ban)
console.log('--- 1. Caso Vacío / Base de Datos en Cero ---');
const emptyProfitability = calculateCumulativeBusinessProfitability([]);
assert(emptyProfitability.consolidated.totalBatches === 0, 'Total lotes consolidados es 0');
assert(emptyProfitability.consolidated.totalInvestedUSD === 0, 'Inversión total consolidada es 0.00');
assert(emptyProfitability.consolidated.netProfitUSD === 0, 'Utilidad neta consolidada es 0.00');
assert(emptyProfitability.consolidated.roiPercentage === 0, 'ROI consolidado es 0.00%');
assert(emptyProfitability.consolidated.profitMarginPercentage === 0, 'Margen de venta consolidado es 0.00%');
assert(emptyProfitability.avian.totalBatches === 0, 'Lotes avícolas es 0');
assert(emptyProfitability.porcine.totalBatches === 0, 'Lotes porcinos es 0');

// 2. Caso Camada de Pollos (Línea Avícola)
console.log('\n--- 2. Camada de Pollos (Línea Avícola) ---');
const avianBatch: HistoricalBatchRecord = {
  id: 'CAM-POLLOS-2025-01',
  codigoLoteHistorico: 'CAM-POLLOS-2025-01',
  especie: 'AVICOLA',
  tipoOrigenHistorico: 'COMPRA_ADQUISICION',
  sexoParvadaPiara: 'MIXTO',
  lineaGeneticaRaza: 'Cobb 500',
  fechaInicioLote: '2025-01-10',
  fechaBeneficioCierre: '2025-02-17',
  cantidadAnimalesInicial: 1000,
  diasNacidosInicio: 1,
  pesoGlobalInicialKg: 42.0,
  montoPagadoCompraUsd: 800.0,
  costoAlimentosUsd: 1400.0,
  cantidadSacosOKilosAlimento: 35,
  costoVacunasUsd: 120.0,
  costoOtrosInsumosUsd: 80.0,
  costoManoObraCuidadoresUsd: 200.0,
  costoVeterinarioCertificacionesUsd: 50.0,
  mortalidadTotalAnimales: 40,
  edadBeneficioDias: 38,
  pesoGlobalBrutoCierreKg: 2300.0,
  mermaTotalBeneficioKg: 0,
  pesoGlobalNetoVendibleKg: 2300.0,
  precioVentaPorKgUsd: 1.85,
  montoTotalVentaUsd: 4255.0,
  createdTimestamp: Date.now(),
  updatedTimestamp: Date.now(),
  createdBy: 'test_admin',
};

const avianBalance = calculateHistoricalBatchBalance(avianBatch);
assert(avianBalance.animalesBeneficiados === 960, 'Pollos beneficiados: 960');
assert(avianBalance.porcentajeMortalidad === 4.0, 'Mortalidad avícola: 4.00%');
assert(avianBalance.porcentajeSupervivencia === 96.0, 'Supervivencia avícola: 96.00%');
assert(avianBalance.diasEfectivosEnGranja === 37, 'Días efectivos en granja: 37 días');
assert(avianBalance.gananciaPesoBrutoKg === 2258.0, 'Ganancia peso bruto: 2,258.00 kg');
assert(avianBalance.costoMantenimientoOperativoUsd === 1850.0, 'Costo mantenimiento: $1,850.00');
assert(avianBalance.inversionTotalCamadaUsd === 2650.0, 'Inversión total camada: $2,650.00');
assert(avianBalance.costoProduccionPorKgVendibleUsd === 1.15, 'Costo por kg vendible: $1.15');
assert(avianBalance.costoProduccionPorAnimalBeneficiadoUsd === 2.76, 'Costo por pollo beneficiado: $2.76');
assert(avianBalance.utilidadNetaRealUsd === 1605.0, 'Utilidad neta real: $1,605.00');
assert(avianBalance.porcentajeGananciaRealROI === 60.57, 'ROI % Real Avícola: 60.57%');
assert(avianBalance.margenRentabilidadVentasPorcentaje === 37.72, 'Margen ventas avícola: 37.72%');

// 3. Caso Parida de Cerdos con Deducción de Merma (Línea Porcina)
console.log('\n--- 3. Parida de Cerdos con Merma Post-Mortem (Línea Porcina) ---');
const porcineBatch: HistoricalBatchRecord = {
  id: 'PAR-CERDOS-2025-01',
  codigoLoteHistorico: 'PAR-CERDOS-2025-01',
  especie: 'PORCINO',
  tipoOrigenHistorico: 'PARIDA_NACIMIENTO_GRANJA',
  sexoParvadaPiara: 'MIXTO',
  lineaGeneticaRaza: 'Landrace x Pietrain',
  fechaInicioLote: '2025-01-01',
  fechaBeneficioCierre: '2025-05-31',
  cantidadAnimalesInicial: 12,
  diasNacidosInicio: 0,
  pesoGlobalInicialKg: 18.0,
  montoPagadoCompraUsd: 0.0, // Nacimiento interno en granja
  costoAlimentosUsd: 1200.0,
  cantidadSacosOKilosAlimento: 30,
  costoVacunasUsd: 150.0,
  costoOtrosInsumosUsd: 50.0,
  costoManoObraCuidadoresUsd: 180.0,
  costoVeterinarioCertificacionesUsd: 70.0,
  mortalidadTotalAnimales: 1,
  edadBeneficioDias: 150,
  pesoGlobalBrutoCierreKg: 1210.0,
  mermaTotalBeneficioKg: 198.0, // 11 cerdos x 18 kg merma post-mortem
  pesoGlobalNetoVendibleKg: 1012.0, // 1,210 - 198 = 1,012 kg
  precioVentaPorKgUsd: 2.60,
  montoTotalVentaUsd: 2631.20,
  createdTimestamp: Date.now(),
  updatedTimestamp: Date.now(),
  createdBy: 'test_admin',
};

const porcineBalance = calculateHistoricalBatchBalance(porcineBatch);
assert(porcineBalance.animalesBeneficiados === 11, 'Cerdos beneficiados: 11');
assert(porcineBalance.porcentajeMortalidad === 8.33, 'Mortalidad porcina: 8.33%');
assert(porcineBalance.porcentajeSupervivencia === 91.67, 'Supervivencia porcina: 91.67%');
assert(porcineBalance.diasEfectivosEnGranja === 150, 'Días en granja: 150');
assert(porcineBalance.inversionTotalCamadaUsd === 1650.0, 'Inversión total parida: $1,650.00');
assert(porcineBalance.costoProduccionPorKgVendibleUsd === 1.63, 'Costo por kg vendible porcino: $1.63');
assert(porcineBalance.costoProduccionPorAnimalBeneficiadoUsd === 150.0, 'Costo por cerdo beneficiado: $150.00');
assert(porcineBalance.utilidadNetaRealUsd === 981.20, 'Utilidad neta real porcina: $981.20');
assert(porcineBalance.porcentajeGananciaRealROI === 59.47, 'ROI % Real Porcino: 59.47%');
assert(porcineBalance.margenRentabilidadVentasPorcentaje === 37.29, 'Margen ventas porcino: 37.29%');

// 4. Consolidado Acumulado del Negocio Hasta Ahora
console.log('\n--- 4. Rentabilidad Real Acumulada del Negocio Hasta Ahora ---');
const cumulative = calculateCumulativeBusinessProfitability([avianBatch, porcineBatch]);

assert(cumulative.consolidated.totalBatches === 2, 'Total lotes: 2');
assert(cumulative.consolidated.totalAnimalsInitial === 1012, 'Total animales iniciales: 1,012');
assert(cumulative.consolidated.totalAnimalsBenefited === 971, 'Total animales beneficiados: 971');
assert(cumulative.consolidated.totalInvestedUSD === 4300.0, 'Inversión total consolidada: $4,300.00');
assert(cumulative.consolidated.totalSalesUSD === 6886.20, 'Ventas totales consolidadas: $6,886.20');
assert(cumulative.consolidated.netProfitUSD === 2586.20, 'Utilidad neta consolidada: $2,586.20');
assert(cumulative.consolidated.roiPercentage === 60.14, 'ROI Real Global Consolidado: 60.14%');
assert(cumulative.consolidated.profitMarginPercentage === 37.56, 'Margen Neto Global Consolidado: 37.56%');
assert(cumulative.consolidated.totalKgVendible === 3312.0, 'Total Kg Vendibles: 3,312.00 kg');

assert(cumulative.porcine.totalShrinkageKg === 198.0, 'Merma porcina acumulada: 198.00 kg');
assert(cumulative.avian.totalInvestedUSD === 2650.0, 'Inversión acumulada avícola: $2,650.00');
assert(cumulative.avian.netProfitUSD === 1605.0, 'Utilidad neta acumulada avícola: $1,605.00');
assert(cumulative.porcine.totalInvestedUSD === 1650.0, 'Inversión acumulada porcina: $1,650.00');
assert(cumulative.porcine.netProfitUSD === 981.20, 'Utilidad neta acumulada porcina: $981.20');

console.log('\n======================================================');
console.log('🎯 TODAS LAS PRUEBAS MATEMÁTICAS PASARON CON ÉXITO 100%');
console.log('======================================================');
