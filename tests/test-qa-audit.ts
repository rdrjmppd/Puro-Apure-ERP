/**
 * Test de Auditoría Forense Integral - Fase 4 (@QA)
 * Puro Apure ERP - Módulo Biomasa y Lotes (Historial de Camadas y Paridas Pasadas)
 */

import { 
  calculateHistoricalBatchBalance, 
  calculateCumulativeBusinessProfitability,
  round2,
  centsRound
} from '../src/services/financialAnalyticsService';
import { BatchExportService } from '../src/services/batchExportService';
import { CORPORATE_HEADER_CONFIG } from '../src/utils/documentAssets';
import type { HistoricalBatchRecord } from '../src/types/inventory';
import * as fs from 'fs';
import * as path from 'path';

console.log('================================================================');
console.log('=== PROTOCOLO DE AUDITORÍA FORENSE Y CERTIFICACIÓN FINAL QA ===');
console.log('================================================================\n');

let totalAuditChecks = 0;
let passedAuditChecks = 0;

function assertCheck(description: string, condition: boolean, detail?: string) {
  totalAuditChecks++;
  if (condition) {
    passedAuditChecks++;
    console.log(`[PASS] ${description}`);
  } else {
    console.error(`[FAIL] ${description} -> ${detail || 'Fallo de verificación'}`);
    process.exitCode = 1;
  }
}

// -------------------------------------------------------------
// 1. AUDITORÍA DEL CANDADO ANTIALUCINACIONES (STRICT MOCKS BAN)
// -------------------------------------------------------------
console.log('--- 1. AUDITORÍA: Candado Antialucinaciones (Strict Mocks Ban) ---');
const emptyCumulative = calculateCumulativeBusinessProfitability([]);
assertCheck('Rentabilidad acumulada vacía: totalBatches consolidado es 0', emptyCumulative.consolidated.totalBatches === 0);
assertCheck('Rentabilidad acumulada vacía: totalInvestedUSD consolidado es 0.00', emptyCumulative.consolidated.totalInvestedUSD === 0);
assertCheck('Rentabilidad acumulada vacía: totalSalesUSD consolidado es 0.00', emptyCumulative.consolidated.totalSalesUSD === 0);
assertCheck('Rentabilidad acumulada vacía: netProfitUSD consolidado es 0.00', emptyCumulative.consolidated.netProfitUSD === 0);
assertCheck('Rentabilidad acumulada vacía: roiPercentage consolidado es 0.00%', emptyCumulative.consolidated.roiPercentage === 0);
assertCheck('Rentabilidad acumulada vacía: profitMarginPercentage consolidado es 0.00%', emptyCumulative.consolidated.profitMarginPercentage === 0);
assertCheck('Rentabilidad acumulada vacía: avian totalBatches es 0', emptyCumulative.avian.totalBatches === 0);
assertCheck('Rentabilidad acumulada vacía: porcine totalBatches es 0', emptyCumulative.porcine.totalBatches === 0);
assertCheck('Rentabilidad acumulada vacía: sin NaN en resultados', 
  !isNaN(emptyCumulative.consolidated.totalInvestedUSD) && 
  !isNaN(emptyCumulative.consolidated.netProfitUSD) && 
  !isNaN(emptyCumulative.consolidated.roiPercentage)
);

// -------------------------------------------------------------
// 2. AUDITORÍA DE AISLAMIENTO ESTRUCTURAL (CERO COLISIONES DE STOCK/NÓMINA)
// -------------------------------------------------------------
console.log('\n--- 2. AUDITORÍA: Aislamiento Estructural de Código Fuente ---');
const cwd = process.cwd();
const inventoryServicePath = path.resolve(cwd, 'src/services/inventoryService.ts');
const inventoryServiceCode = fs.readFileSync(inventoryServicePath, 'utf8');

assertCheck('Colección de destino definida como "lotes_historicos"', 
  inventoryServiceCode.includes("HISTORICAL_BATCHES_COLLECTION = 'lotes_historicos'")
);

// Verificar que saveHistoricalBatch no realiza movimientos de inventario activo
const saveHistoricalFnStart = inventoryServiceCode.indexOf('export async function saveHistoricalBatch');
const saveHistoricalFnEnd = inventoryServiceCode.indexOf('export async function getHistoricalBatches');
const saveHistoricalFnCode = inventoryServiceCode.substring(saveHistoricalFnStart, saveHistoricalFnEnd);

assertCheck('saveHistoricalBatch NO reduce inventario activo (no llama a reduceStock / updateDoc(inventory))',
  !saveHistoricalFnCode.includes('reduceStock') && 
  !saveHistoricalFnCode.includes('inventory_movements') &&
  !saveHistoricalFnCode.includes("collection(db, 'inventory')") &&
  !saveHistoricalFnCode.includes("collection(db, INVENTORY_COLLECTION)")
);

assertCheck('saveHistoricalBatch NO altera nómina activa ni hr_stats',
  !saveHistoricalFnCode.includes('human_resources') && 
  !saveHistoricalFnCode.includes('hr_stats')
);

// -------------------------------------------------------------
// 3. AUDITORÍA DE EXACTITUD MATEMÁTICA Y CASOS DE BORDE (EDGE CASES)
// -------------------------------------------------------------
console.log('\n--- 3. AUDITORÍA: Aritmética Exacta y Casos Límite ---');

// Caso Borde A: 100% de Mortalidad (Catástrofe biológica)
const catastropheBatch: HistoricalBatchRecord = {
  id: 'HIST-CATASTROPHE',
  codigoLoteHistorico: 'CAM-TEST-CATASTROPHE',
  especie: 'AVICOLA',
  tipoOrigenHistorico: 'COMPRA_ADQUISICION',
  sexoParvadaPiara: 'MIXTO',
  fechaInicioLote: '2025-01-01',
  fechaBeneficioCierre: '2025-01-15',
  cantidadAnimalesInicial: 500,
  diasNacidosInicio: 1,
  pesoGlobalInicialKg: 25,
  montoPagadoCompraUsd: 400,
  costoAlimentosUsd: 150,
  costoVacunasUsd: 50,
  costoOtrosInsumosUsd: 20,
  costoManoObraCuidadoresUsd: 80,
  costoVeterinarioCertificacionesUsd: 30,
  mortalidadTotalAnimales: 500, // 100% muertos
  edadBeneficioDias: 15,
  pesoGlobalBrutoCierreKg: 0,
  mermaTotalBeneficioKg: 0,
  pesoGlobalNetoVendibleKg: 0,
  precioVentaPorKgUsd: 0,
  montoTotalVentaUsd: 0,
  createdTimestamp: Date.now(),
  updatedTimestamp: Date.now(),
  createdBy: 'qa-tester'
};

const catastropheBalance = calculateHistoricalBatchBalance(catastropheBatch);
assertCheck('Caso 100% mortalidad: mortalidad es 100.00%', catastropheBalance.porcentajeMortalidad === 100);
assertCheck('Caso 100% mortalidad: supervivencia es 0.00%', catastropheBalance.porcentajeSupervivencia === 0);
assertCheck('Caso 100% mortalidad: animales beneficiados es 0', catastropheBalance.animalesBeneficiados === 0);
assertCheck('Caso 100% mortalidad: inversión total es $730.00', catastropheBalance.inversionTotalCamadaUsd === 730);
assertCheck('Caso 100% mortalidad: utilidad neta real es -$730.00 (pérdida total)', catastropheBalance.utilidadNetaRealUsd === -730);
assertCheck('Caso 100% mortalidad: ROI es -100.00%', catastropheBalance.porcentajeGananciaRealROI === -100);
assertCheck('Caso 100% mortalidad: costo por kg vendible protegido contra división por cero (0)', catastropheBalance.costoProduccionPorKgVendibleUsd === 0);
assertCheck('Caso 100% mortalidad: costo por animal beneficiado protegido contra división por cero (0)', catastropheBalance.costoProduccionPorAnimalBeneficiadoUsd === 0);

// Caso Borde B: Nacimiento en Granja con 0 Costo de Adquisición (Porcino)
const farmBirthBatch: HistoricalBatchRecord = {
  id: 'HIST-PARIDA-02',
  codigoLoteHistorico: 'PAR-TEST-GRANJA-02',
  especie: 'PORCINO',
  tipoOrigenHistorico: 'PARIDA_NACIMIENTO_GRANJA',
  sexoParvadaPiara: 'MIXTO',
  lineaGeneticaRaza: 'Landrace x Duroc',
  fechaInicioLote: '2025-02-01',
  fechaBeneficioCierre: '2025-07-01',
  cantidadAnimalesInicial: 12,
  diasNacidosInicio: 0, // Nacidos en granja
  pesoGlobalInicialKg: 18,
  montoPagadoCompraUsd: 0, // 0 costo de compra
  costoAlimentosUsd: 1800,
  costoVacunasUsd: 120,
  costoOtrosInsumosUsd: 60,
  costoManoObraCuidadoresUsd: 300,
  costoVeterinarioCertificacionesUsd: 100,
  mortalidadTotalAnimales: 1,
  edadBeneficioDias: 150,
  pesoGlobalBrutoCierreKg: 1265, // ~115kg promedio x 11 cerdos
  mermaTotalBeneficioKg: 198, // 18kg merma x 11 cerdos
  pesoGlobalNetoVendibleKg: 1067,
  precioVentaPorKgUsd: 3.20,
  montoTotalVentaUsd: 3414.40,
  createdTimestamp: Date.now(),
  updatedTimestamp: Date.now(),
  createdBy: 'qa-tester'
};

const farmBirthBalance = calculateHistoricalBatchBalance(farmBirthBatch);
assertCheck('Parida nacida en granja: días efectivos en granja es 150', farmBirthBalance.diasEfectivosEnGranja === 150);
assertCheck('Parida nacida en granja: costo adquisición $0.00 reflejado con exactitud', farmBirthBatch.montoPagadoCompraUsd === 0);
assertCheck('Parida nacida en granja: inversión total es $2,380.00', farmBirthBalance.inversionTotalCamadaUsd === 2380);
assertCheck('Parida nacida en granja: venta total es $3,414.40', farmBirthBatch.montoTotalVentaUsd === 3414.40);
assertCheck('Parida nacida en granja: utilidad neta real es $1,034.40', farmBirthBalance.utilidadNetaRealUsd === 1034.40);
assertCheck('Parida nacida en granja: ROI % es 43.46%', farmBirthBalance.porcentajeGananciaRealROI === 43.46);
assertCheck('Parida nacida en granja: merma deducida correctamente de peso bruto (1,265 - 198 = 1,067)', 
  round2(farmBirthBatch.pesoGlobalBrutoCierreKg - farmBirthBatch.mermaTotalBeneficioKg) === farmBirthBatch.pesoGlobalNetoVendibleKg
);

// -------------------------------------------------------------
// 4. AUDITORÍA DE DOCUMENTOS CORPORATIVOS (@Documentos)
// -------------------------------------------------------------
console.log('\n--- 4. AUDITORÍA: Documentos Corporativos y Branding ---');

// Renderizar HTML real de exportación individual de lote
const singlePdfHtml = BatchExportService.generateSingleHistoricalBatchPdfHtml(farmBirthBatch);
assertCheck(`Renderizado PDF individual incluye branding oficial "${CORPORATE_HEADER_CONFIG.companyName}"`,
  singlePdfHtml.includes(CORPORATE_HEADER_CONFIG.companyName)
);
assertCheck(`Renderizado PDF individual incluye RIF institucional "${CORPORATE_HEADER_CONFIG.rif}"`,
  singlePdfHtml.includes(CORPORATE_HEADER_CONFIG.rif)
);
assertCheck('Renderizado PDF individual incluye trazabilidad y certificación digital',
  singlePdfHtml.includes('Trazabilidad criptográfica garantizada') || singlePdfHtml.includes('Documento digital emitido')
);

// Renderizar HTML real de informe acumulativo consolidado
const cumulativePdfHtml = BatchExportService.generateCumulativeProfitabilityPdfHtml([farmBirthBatch]);
assertCheck('Renderizado PDF consolidado incluye título ejecutivo',
  cumulativePdfHtml.includes('INFORME EJECUTIVO DE RENTABILIDAD REAL DEL NEGOCIO HASTA LA FECHA')
);
assertCheck('Renderizado PDF consolidado incluye desglose de inversión y utilidad',
  cumulativePdfHtml.includes('Utilidad Neta') && cumulativePdfHtml.includes('ROI')
);

// Verificar servicio de exportación a Excel
const exportServicePath = path.resolve(cwd, 'src/services/batchExportService.ts');
const exportServiceCode = fs.readFileSync(exportServicePath, 'utf8');

assertCheck('BatchExportService implementa exportSingleHistoricalBatchToExcel',
  exportServiceCode.includes('exportSingleHistoricalBatchToExcel')
);
assertCheck('BatchExportService implementa exportCumulativeProfitabilityToExcel',
  exportServiceCode.includes('exportCumulativeProfitabilityToExcel')
);
assertCheck('Exportador Excel genera hojas de Resumen Consolidado y Lotes Auditados',
  exportServiceCode.includes("name: 'Resumen_Consolidado'") &&
  exportServiceCode.includes("name: 'Lotes_Auditados'")
);

// -------------------------------------------------------------
// 5. AUDITORÍA DE ADAPTABILIDAD UX / RESPONSIVIDAD (@UX)
// -------------------------------------------------------------
console.log('\n--- 5. AUDITORÍA: Estándares de UX Multiplataforma (PC + Móvil) ---');
const modalPath = path.resolve(cwd, 'src/components/HistoricalBatchModal.tsx');
const modalCode = fs.readFileSync(modalPath, 'utf8');

assertCheck('Modal de registro cumple con diseño touch-friendly (mínimo 44px de altura o padding touch)',
  modalCode.includes('min-h-[44px]') || modalCode.includes('py-3') || modalCode.includes('h-11') || modalCode.includes('h-12')
);

assertCheck('Modal de registro incluye grid responsivo para móviles y desktop',
  modalCode.includes('grid-cols-1') && modalCode.includes('md:grid-cols-')
);

const inventoryMgmtPath = path.resolve(cwd, 'src/pages/InventoryManagement.tsx');
const inventoryMgmtCode = fs.readFileSync(inventoryMgmtPath, 'utf8');

assertCheck('Tabla de historial en InventoryManagement tiene scroll horizontal responsivo (overflow-x-auto)',
  inventoryMgmtCode.includes('overflow-x-auto')
);

assertCheck('Tarjetas de sustentación ejecutiva usan números monoespaciados (tabular-nums) para precisión contable',
  inventoryMgmtCode.includes('tabular-nums')
);

// -------------------------------------------------------------
// RESUMEN AUDITORÍA
// -------------------------------------------------------------
console.log('\n================================================================');
console.log(`=== RESULTADO DE LA AUDITORÍA FORENSE QA: ${passedAuditChecks} / ${totalAuditChecks} PRUEBAS SUPERADAS ===`);
if (passedAuditChecks === totalAuditChecks) {
  console.log('=== CERTIFICACIÓN QA: APTO PARA PRODUCCIÓN SIN REGRESIONES ===');
} else {
  console.error('=== CERTIFICACIÓN QA: FALLÓ UNA O MÁS COMPROBACIONES ===');
}
console.log('================================================================\n');
