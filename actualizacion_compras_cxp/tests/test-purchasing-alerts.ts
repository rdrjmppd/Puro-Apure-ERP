/**
 * Suite de Pruebas Automatizadas: Compras, Cuentas por Pagar (CxP) y Niveles Críticos
 * Puro Apure ERP - Módulo Financiero
 */

import {
  localDateDiffDays,
  evaluateInsumoAlert,
  calculateLateFeeProjection,
  evaluatePayableInvoice,
  buildStartupAlertDigest,
} from '../src/services/supplyAlertService';
import { InventoryItem } from '../src/types/inventory';
import { SupplyAlertConfig, PurchaseInvoice } from '../src/types/purchasing';

console.log('\x1b[1m\x1b[36m===================================================================\x1b[0m');
console.log('\x1b[1m\x1b[36m  SUITE DE PRUEBAS: COMPRAS, CXP Y NIVELES CRÍTICOS DE INSUMOS     \x1b[0m');
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

// ============================================================================
// 1. PRUEBAS DE FECHAS LOCALES (DST / UTC IMMUNITY)
// ============================================================================
console.log('\n\x1b[1m[1. Diferencia de Fechas Locales - Inmune a DST]\x1b[0m');

{
  const diff1 = localDateDiffDays('2026-10-20', '2026-10-14');
  assert(
    diff1 === 6,
    'Fecha futura: 2026-10-20 vs 2026-10-14 = +6 días',
    `Diferencia calculada: ${diff1}`
  );

  const diff2 = localDateDiffDays('2026-10-10', '2026-10-14');
  assert(
    diff2 === -4,
    'Fecha pasada: 2026-10-10 vs 2026-10-14 = -4 días (vencida)',
    `Diferencia calculada: ${diff2}`
  );

  const diff3 = localDateDiffDays('2026-10-14', '2026-10-14');
  assert(
    diff3 === 0,
    'Mismo día: 2026-10-14 vs 2026-10-14 = 0 días (vence hoy)',
    `Diferencia calculada: ${diff3}`
  );
}

// ============================================================================
// 2. PRUEBAS DE NIVELES CRÍTICOS Y ALARMAS DE INSUMOS
// ============================================================================
console.log('\n\x1b[1m[2. Evaluación de Niveles Críticos de Insumos]\x1b[0m');

const mockAlimentoItem: InventoryItem = {
  id: 'item-alimento-01',
  category: 'INSUMO',
  subtype: 'ALIMENTO',
  name: 'Alimento Iniciador Pollos',
  quantity: 50,
  unit: 'sacos',
  unitCostUSD: 25.0,
  totalValueUSD: 1250.0,
  lastUpdatedTimestamp: Date.now(),
  updatedBy: 'tester',
};

const mockConfig: SupplyAlertConfig = {
  inventoryItemId: 'item-alimento-01',
  activo: true,
  puntoCritico: 40,
  porcentajeAmarillo: 25, // 40 * 1.25 = 50 sacos
  consumoDiarioEstimado: 10,
  updatedAt: Date.now(),
  updatedBy: 'tester',
};

{
  // Test 2.1: En el límite exacto del umbral amarillo (50 sacos <= 50)
  const evalAmarillo = evaluateInsumoAlert(mockAlimentoItem, mockConfig);
  assert(
    evalAmarillo.nivel === 'AMARILLO' && evalAmarillo.umbralAmarillo === 50,
    'Alarma Amarilla (Proximidad al Punto Crítico)',
    `Stock: ${mockAlimentoItem.quantity}, Crítico: ${mockConfig.puntoCritico}, Umbral Amarillo: ${evalAmarillo.umbralAmarillo}, Nivel: ${evalAmarillo.nivel}`
  );

  // Test 2.2: Nivel Rojo (Stock <= 40)
  const evalRojo = evaluateInsumoAlert(
    { ...mockAlimentoItem, quantity: 35 },
    mockConfig
  );
  assert(
    evalRojo.nivel === 'ROJO' && evalRojo.diasCobertura === 3.5,
    'Alarma Roja (Punto Crítico Superado)',
    `Stock: 35, Crítico: 40, Nivel: ${evalRojo.nivel}, Días Cobertura: ${evalRojo.diasCobertura}`
  );

  // Test 2.3: Alta Rotación Crítica (<= 3 días de cobertura)
  const evalAltaRotacion = evaluateInsumoAlert(
    { ...mockAlimentoItem, quantity: 20 },
    mockConfig
  );
  assert(
    evalAltaRotacion.nivel === 'ROJO' &&
      evalAltaRotacion.esAltaRotacionCritica === true &&
      evalAltaRotacion.diasCobertura === 2,
    'Alarma Roja con Alta Rotación Crítica (<= 3 días)',
    `Stock: 20, Consumo: 10/día, Cobertura: ${evalAltaRotacion.diasCobertura}d, Alta Rotación: ${evalAltaRotacion.esAltaRotacionCritica}`
  );

  // Test 2.4: Nivel Verde (Stock > 50)
  const evalVerde = evaluateInsumoAlert(
    { ...mockAlimentoItem, quantity: 100 },
    mockConfig
  );
  assert(
    evalVerde.nivel === 'VERDE',
    'Nivel Óptimo Verde (Stock superior al umbral de seguridad)',
    `Stock: 100, Umbral Amarillo: 50, Nivel: ${evalVerde.nivel}`
  );
}

// ============================================================================
// 3. PRUEBAS DE CÁLCULO DE PROYECCIÓN DE MORA
// ============================================================================
console.log('\n\x1b[1m[3. Motor de Cálculo de Mora y Penalizaciones]\x1b[0m');

{
  // 3.1: En período de gracia (0 mora)
  const moraGracia = calculateLateFeeProjection(1000, 3, 5, 1, 'DIARIA', 0);
  assert(
    moraGracia.moraProyectadaUSD === 0 && moraGracia.aplicaMoraEfectiva === false,
    'Período de Gracia: Sin mora mientras días atraso <= días gracia',
    `Días atraso: 3, Gracia: 5, Mora: $${moraGracia.moraProyectadaUSD}`
  );

  // 3.2: Mora Diaria tras gracia (10 días atraso, 3 gracia = 7 días efectivos a 1% diario de $1,000 = $70)
  const moraDiaria = calculateLateFeeProjection(1000, 10, 3, 1, 'DIARIA', 25);
  assert(
    moraDiaria.moraProyectadaUSD === 70.0 && moraDiaria.riesgoTotalUSD === 1095.0,
    'Mora Diaria: 7 días efectivos * 1% * $1000 = $70 + Cargo Fijo $25 = Riesgo $1095',
    `Mora calculada: $${moraDiaria.moraProyectadaUSD}, Riesgo Total: $${moraDiaria.riesgoTotalUSD}`
  );

  // 3.3: Mora Semanal (8 días atraso, 0 gracia = 2 semanas a 2% de $1,000 = $40)
  const moraSemanal = calculateLateFeeProjection(1000, 8, 0, 2, 'SEMANAL', 0);
  assert(
    moraSemanal.moraProyectadaUSD === 40.0,
    'Mora Semanal: Ceil(8/7) = 2 semanas * 2% * $1000 = $40',
    `Mora: $${moraSemanal.moraProyectadaUSD}`
  );

  // 3.4: Mora Única (Flat 5% de $2000 = $100)
  const moraUnica = calculateLateFeeProjection(2000, 15, 0, 5, 'UNICA', 10);
  assert(
    moraUnica.moraProyectadaUSD === 100.0 && moraUnica.riesgoTotalUSD === 2110.0,
    'Mora Única Flat: 5% * $2000 = $100 + Penalización $10 = Riesgo $2110',
    `Mora: $${moraUnica.moraProyectadaUSD}, Riesgo: $${moraUnica.riesgoTotalUSD}`
  );
}

// ============================================================================
// 4. PRUEBAS DE CONSOLIDACIÓN DE DIGEST DE INICIO (STARTUP ALERTS)
// ============================================================================
console.log('\n\x1b[1m[4. Consolidación de Digest de Arranque]\x1b[0m');

{
  const mockInvoices: PurchaseInvoice[] = [
    {
      id: 'inv-01-vencida',
      idempotencyKey: 'idemp-01',
      numeroFacturaProveedor: 'FACT-001',
      proveedorId: 'prov-01',
      proveedorNombre: 'Alimentos Polar C.A.',
      proveedorRif: 'J-00041300-1',
      fechaEmision: '2026-09-01',
      fechaVencimiento: '2026-09-15',
      modalidad: 'CREDITO',
      items: [],
      totalUSD: 1000,
      totalVES: 36500,
      tasaBcv: 36.5,
      saldoPendienteUSD: 600,
      estadoPago: 'PARCIAL',
      condicionesAplicadas: {
        diasCalle: 14,
        diasGracia: 2,
        aplicaMora: true,
        tasaMoraPorcentaje: 1,
        periodicidadMora: 'DIARIA',
        penalizacionFijaUSD: 20,
      },
      pagosIds: [],
      inventarioAplicado: true,
      snapshot: { hashSHA256: 'mock', payloadString: '{}' },
      createdAt: Date.now(),
      createdBy: 'tester',
    },
    {
      id: 'inv-02-por-vencer',
      idempotencyKey: 'idemp-02',
      numeroFacturaProveedor: 'FACT-002',
      proveedorId: 'prov-02',
      proveedorNombre: 'Veterinaria Los Llanos',
      proveedorRif: 'J-12345678-9',
      fechaEmision: '2026-10-10',
      fechaVencimiento: '2026-10-16', // 2 días en el futuro respecto a 2026-10-14
      modalidad: 'CREDITO',
      items: [],
      totalUSD: 300,
      totalVES: 10950,
      tasaBcv: 36.5,
      saldoPendienteUSD: 300,
      estadoPago: 'PENDIENTE',
      condicionesAplicadas: {
        diasCalle: 6,
        diasGracia: 0,
        aplicaMora: false,
        tasaMoraPorcentaje: 0,
        periodicidadMora: 'DIARIA',
        penalizacionFijaUSD: 0,
      },
      pagosIds: [],
      inventarioAplicado: true,
      snapshot: { hashSHA256: 'mock', payloadString: '{}' },
      createdAt: Date.now(),
      createdBy: 'tester',
    },
    {
      id: 'inv-03-pagada',
      idempotencyKey: 'idemp-03',
      numeroFacturaProveedor: 'FACT-003',
      proveedorId: 'prov-03',
      proveedorNombre: 'Proveedor Pagado',
      proveedorRif: 'J-99999999-0',
      fechaEmision: '2026-10-01',
      fechaVencimiento: '2026-10-05',
      modalidad: 'CREDITO',
      items: [],
      totalUSD: 500,
      totalVES: 18250,
      tasaBcv: 36.5,
      saldoPendienteUSD: 0,
      estadoPago: 'PAGADA',
      condicionesAplicadas: {
        diasCalle: 4,
        diasGracia: 0,
        aplicaMora: false,
        tasaMoraPorcentaje: 0,
        periodicidadMora: 'DIARIA',
        penalizacionFijaUSD: 0,
      },
      pagosIds: ['pay-01'],
      inventarioAplicado: true,
      snapshot: { hashSHA256: 'mock', payloadString: '{}' },
      createdAt: Date.now(),
      createdBy: 'tester',
    },
  ];

  const configsMap = new Map<string, SupplyAlertConfig>();
  configsMap.set(mockConfig.inventoryItemId, mockConfig);

  const digest = buildStartupAlertDigest(
    [mockAlimentoItem], // 50 sacos => AMARILLO
    configsMap,
    mockInvoices,
    '2026-10-14'
  );

  assert(
    digest.insumosAlertaAmarillos.length === 1 &&
      digest.insumosCriticosRojos.length === 0,
    'Digest de Insumos: 1 Amarillo, 0 Rojos',
    `Amarillos: ${digest.insumosAlertaAmarillos.length}, Rojos: ${digest.insumosCriticosRojos.length}`
  );

  assert(
    digest.facturasVencidasRojas.length === 1 &&
      digest.facturasVencidasRojas[0].numeroFacturaProveedor === 'FACT-001',
    'Digest de CxP: 1 Factura Vencida Identificada (FACT-001)',
    `Factura: ${digest.facturasVencidasRojas[0].numeroFacturaProveedor}, Saldo: $${digest.facturasVencidasRojas[0].saldoPendienteUSD}`
  );

  assert(
    digest.facturasPorVencerAmarillas.length === 1 &&
      digest.facturasPorVencerAmarillas[0].numeroFacturaProveedor === 'FACT-002',
    'Digest de CxP: 1 Factura Próxima a Vencer (FACT-002)',
    `Factura: ${digest.facturasPorVencerAmarillas[0].numeroFacturaProveedor}, Días restantes: ${digest.facturasPorVencerAmarillas[0].diasRestantes}`
  );

  assert(
    digest.totalDeudaVencidaUSD === 600 && digest.tieneAlertasCriticas === true,
    'Consolidación Total Deuda Vencida Exigible = $600.00',
    `Deuda Vencida: $${digest.totalDeudaVencidaUSD}, Alertas Críticas: ${digest.tieneAlertasCriticas}`
  );
}

console.log('\n\x1b[1m\x1b[32m===================================================================\x1b[0m');
console.log(`\x1b[1m\x1b[32m  TODAS LAS PRUEBAS COMPLETADAS EXITOSAMENTE (${testsPassed}/${testsTotal})\x1b[0m`);
console.log('\x1b[1m\x1b[32m===================================================================\x1b[0m\n');
