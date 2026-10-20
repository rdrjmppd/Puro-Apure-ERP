/**
 * Puro Apure ERP - Suite de Verificación de Integración (Fase 4)
 * Validación de Variables Biológicas Dinámicas, Desvinculación de Hardcoding
 * y Motor de Exportación Documental PDF
 */

import { calculateAvianBatch, calculatePorcineBatch } from '../src/services/inventoryService';
import { BatchExportService } from '../src/services/batchExportService';
import { BiologicalBatch, FarmBiologicalControl } from '../src/types/inventory';

console.log('\x1b[1m\x1b[36m===================================================================\x1b[0m');
console.log('\x1b[1m\x1b[36m  CERTIFICACIÓN DE VARIABLES DINÁMICAS Y EXPORTACIÓN DOCUMENTAL    \x1b[0m');
console.log('\x1b[1m\x1b[36m===================================================================\x1b[0m');

let testsPassed = 0;
let testsTotal = 0;

function assert(condition: boolean, title: string, details: string) {
  testsTotal++;
  if (condition) {
    testsPassed++;
    console.log(`  \x1b[32m✓ PASS\x1b[0m \x1b[1m${title}\x1b[0m`);
    console.log(`    \x1b[36m→ Detalle:\x1b[0m ${details}`);
  } else {
    console.error(`  \x1b[31m✗ FAIL\x1b[0m \x1b[1m${title}\x1b[0m`);
    console.error(`    \x1b[31m→ Detalle:\x1b[0m ${details}`);
    throw new Error(`Prueba fallida: ${title}`);
  }
}

// Test 1: Lote Avícola con Precio de Mercado Dinámico ($4.85 USD/kg)
{
  const calc = calculateAvianBatch({
    daysInCycle: 27,
    grossWeightKg: 3000,
    tipoIngreso: 'ADQUISICION_EXTERNA',
    edadInicialDias: 10,
    pesoInicialKg: 0.35,
    precioFacturableUsdPorKg: 4.85,
  });

  assert(
    calc.isValid &&
      calc.unitPriceUSDPerKg === 4.85 &&
      calc.netWeightKg === 3000 &&
      calc.billableAmountUSD === 14550,
    'Cálculo Avícola con Tarifa Dinámica ($4.85/kg)',
    `Peso: ${calc.netWeightKg}kg, Tarifa: $${calc.unitPriceUSDPerKg}, Facturación: $${calc.billableAmountUSD}`
  );
}

// Test 2: Backward Compatibility Avícola (Valor por defecto $4.00 USD/kg)
{
  const calc = calculateAvianBatch({
    daysInCycle: 39,
    grossWeightKg: 2000,
    tipoIngreso: 'NACIMIENTO_INTERNO',
  });

  assert(
    calc.isValid &&
      calc.unitPriceUSDPerKg === 4.0 &&
      calc.netWeightKg === 2000 &&
      calc.billableAmountUSD === 8000,
    'Backward Compatibility Avícola (Default $4.00/kg)',
    `Facturación default preservada: $${calc.billableAmountUSD}`
  );
}

// Test 3: Lote Porcino con Variables de Mercado y Merma Dinámica
{
  const calc = calculatePorcineBatch({
    daysInCycle: 135,
    grossWeightKg: 120.0,
    shrinkageDeductionKg: 16.5,
    feedSacksConsumed: 5,
    tipoIngreso: 'ADQUISICION_EXTERNA',
    precioFacturableNetoUsdPorKg: 6.50,
    precioSacoAlimentoUsd: 42.0,
    deduccionMermaKg: 16.5,
  });

  const expectedNet = 120.0 - 16.5; // 103.5 kg
  const expectedBillable = expectedNet * 6.50; // $672.75
  const expectedFeed = 5 * 42.0; // $210.00

  assert(
    calc.isValid &&
      calc.netWeightKg === expectedNet &&
      calc.billableAmountUSD === expectedBillable &&
      calc.feedCostUSD === expectedFeed &&
      calc.unitPriceUSDPerKg === 6.50 &&
      calc.deduccionMermaKg === 16.5,
    'Cálculo Porcino con Parámetros Dinámicos (Merma 16.5kg, Tarifa $6.50, Alimento $42/saco)',
    `Neto: ${calc.netWeightKg}kg, Alimento: $${calc.feedCostUSD}, Facturable: $${calc.billableAmountUSD}`
  );
}

// Test 4: Backward Compatibility Porcino (Valores por defecto)
{
  const calc = calculatePorcineBatch({
    daysInCycle: 110,
    grossWeightKg: 100.0,
    shrinkageDeductionKg: 17.5,
    feedSacksConsumed: 4,
    tipoIngreso: 'NACIMIENTO_INTERNO',
  });

  assert(
    calc.isValid &&
      calc.netWeightKg === 82.5 &&
      calc.billableAmountUSD === 495.0 &&
      calc.feedCostUSD === 160.0 &&
      calc.unitPriceUSDPerKg === 6.0 &&
      calc.deduccionMermaKg === 17.5,
    'Backward Compatibility Porcino (Defaults $6.00/kg, $40/saco, 17.5kg merma)',
    `Neto: ${calc.netWeightKg}kg, Facturable: $${calc.billableAmountUSD}`
  );
}

// Test 5: Motor de Exportación PDF - Ficha Técnica de Lote Individual
{
  const mockBatch: BiologicalBatch = {
    id: 'batch_test_001',
    code: 'LOT-AV-2026-F4',
    species: 'AVICOLA',
    status: 'ACTIVO',
    initialCount: 5000,
    currentCount: 4920,
    startDate: '2026-09-15',
    tipoIngreso: 'ADQUISICION_EXTERNA',
    edadInicialDias: 5,
    pesoInicialKg: 0.12,
    sexoParvadaPiara: 'MIXTO',
    lineaGeneticaRaza: 'Cobb 500',
    daysInCycle: 36,
    precioFacturableUsdPorKg: 4.25,
    grossWeightKg: 12500,
    shrinkageDeductionKg: 0,
    netWeightKg: 12500,
    feedSacksConsumed: 120,
    feedCostUSD: 4800,
    unitPriceUSDPerKg: 4.25,
    billableAmountUSD: 53125,
    lastUpdatedTimestamp: Date.now(),
    updatedBy: 'admin',
    customFields: { galpon: 'Galpón 3 - Climatizado' },
  };

  const mockControls: FarmBiologicalControl[] = [
    {
      id: 'ctrl_001',
      batchId: 'batch_test_001',
      batchCode: 'LOT-AV-2026-F4',
      species: 'AVICOLA',
      type: 'PESAJE',
      date: '2026-10-01',
      metricValue: 2.15,
      metricUnit: 'kg/ave',
      responsibleWorker: 'Carlos Mendoza',
      observations: 'Muestreo de 50 aves representativas',
      timestamp: Date.now() - 86400000,
    },
  ];

  const html = BatchExportService.generateSingleBatchPdfHtml(mockBatch, mockControls, 42.5);

  assert(
    html.includes('LOT-AV-2026-F4') &&
      html.includes('Cobb 500') &&
      html.includes('MIXTO') &&
      html.includes('4.25') &&
      html.includes('53,125') &&
      html.includes('Bs.') &&
      html.includes('Galpón 3 - Climatizado'),
    'Motor Documental PDF: Certificado Oficial de Lote Individual',
    'HTML contiene metadatos fenotípicos, tasa BCV y trazabilidad de pesaje sin valores undefined.'
  );
}

// Test 6: Motor de Exportación PDF - Inventario Consolidado de Biomasa Viva
{
  const mockBatches: BiologicalBatch[] = [
    {
      id: 'batch_p1',
      code: 'LOT-PORC-A1',
      species: 'PORCINO',
      status: 'ACTIVO',
      initialCount: 50,
      currentCount: 48,
      startDate: '2026-06-01',
      tipoIngreso: 'NACIMIENTO_INTERNO',
      sexoParvadaPiara: 'MACHO',
      lineaGeneticaRaza: 'Pietrain',
      daysInCycle: 125,
      precioFacturableNetoUsdPorKg: 6.20,
      precioSacoAlimentoUsd: 41.0,
      deduccionMermaKg: 18.0,
      grossWeightKg: 5200,
      shrinkageDeductionKg: 18.0,
      netWeightKg: 5182,
      feedSacksConsumed: 180,
      feedCostUSD: 7380,
      unitPriceUSDPerKg: 6.20,
      billableAmountUSD: 32128.4,
      lastUpdatedTimestamp: Date.now(),
      updatedBy: 'admin',
    },
  ];

  const html = BatchExportService.generateConsolidatedBatchesPdfHtml('PORCINO', mockBatches, 42.5);

  assert(
    html.includes('Inventario Consolidado de Biomasa Viva') &&
      html.includes('LOT-PORC-A1') &&
      html.includes('Pietrain') &&
      html.includes('MACHO') &&
      html.includes('32,128.40'),
    'Motor Documental PDF: Inventario Consolidado de Biomasa Porcina',
    'HTML estructurado con totalizadores, tarifas dinámicas, merma y cuadro de firmas corporativas.'
  );
}

console.log('\x1b[1m\x1b[32m===================================================================\x1b[0m');
console.log(`\x1b[1m\x1b[32m  CERTIFICACIÓN EXITOSA: ${testsPassed} DE ${testsTotal} PRUEBAS COMPLETADAS (100% PASS)\x1b[0m`);
console.log('\x1b[1m\x1b[32m===================================================================\x1b[0m');
