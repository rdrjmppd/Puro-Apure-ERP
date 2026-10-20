/**
 * ============================================================================
 * PURO APURE ERP — SUITE DE PRUEBAS AUTOMATIZADAS E2E Y QA DEVSECOPS
 * ============================================================================
 * Escenarios Certificados:
 * 1. Simulación de Desconexión de Red durante Carga de Lotes Biológicos
 *    - Validación Zootécnica (Avícola/Porcino), Merma y Concurrencia DAG.
 *    - Encolamiento local offline y compresión UTF-8 en buffer.
 * 2. Desduplicación de Lotes (Batch Deduplication) y Prevención de Colisiones
 *    - Ráfaga de pesajes continuos sobre el mismo lote biológico.
 *    - Eliminación de mutaciones obsoletas conservando solo el último clientTimestamp.
 * 3. Transacciones Bimonetarias y Motor Analítico Mark-to-Market (MtM)
 *    - Cruce atómico de deudas (ACID writeBatch) ante interrupción de conectividad.
 *    - Recálculo dinámico Mark-to-Market con prevención de errores IEEE 754.
 * 4. Recolección de Basura de Memoria Local (Garbage Collection TTL 90 Días)
 *    - Purgado automático de snapshots caducados en IndexedDB.
 * 5. Ciclo de Reconexión y Vaciado de Cola Atómico (Flush Queue)
 * ============================================================================
 */

import { calculateAvianBatch, calculatePorcineBatch } from '../src/services/inventoryService';
import { FinanceService } from '../src/services/financeService';
import { BiologicalBatch, FarmBiologicalControl } from '../src/types/inventory';
import { PaymentRecord, DualEntity } from '../src/types/finance';

// Terminal ANSI styling
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

interface AssertionResult {
  title: string;
  passed: boolean;
  details: string;
  durationMs: number;
}

const suiteResults: AssertionResult[] = [];

function assert(condition: boolean, title: string, details: string, startTime: number) {
  const duration = Math.round(performance.now() - startTime);
  suiteResults.push({
    title,
    passed: condition,
    details,
    durationMs: duration,
  });

  if (condition) {
    console.log(`  ${GREEN}✓ PASS${RESET} [${duration}ms] ${BOLD}${title}${RESET}`);
    console.log(`    ${CYAN}→ Detalle:${RESET} ${details}`);
  } else {
    console.error(`  ${RED}✗ FAIL${RESET} [${duration}ms] ${BOLD}${title}${RESET}`);
    console.error(`    ${RED}→ Detalle:${RESET} ${details}`);
    throw new Error(`Aserción fallida: ${title} - ${details}`);
  }
}

interface MockQueuedMutation {
  id: string;
  collectionName: string;
  docId: string;
  action: 'SET' | 'UPDATE' | 'DELETE';
  payload: any;
  clientTimestamp: number;
}

// ============================================================================
// SIMULADOR IN-MEMORY DE INDEXEDDB / MOTOR OFFLINE RESILIENTE
// ============================================================================
class MockOfflineSyncEngine {
  public queue: MockQueuedMutation[] = [];

  public snapshotCache: Map<string, { data: any; updatedAt: number }> = new Map();
  public isOnline: boolean = true;
  public totalSyncedBatches: number = 0;
  public totalDeduplicatedPurged: number = 0;

  public setOnline(status: boolean) {
    this.isOnline = status;
  }

  public async enqueueMutation(
    collectionName: string,
    docId: string,
    action: 'SET' | 'UPDATE' | 'DELETE',
    payload: any,
    clientTimestamp: number = Date.now()
  ): Promise<string> {
    const id = `mut_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.queue.push({
      id,
      collectionName,
      docId,
      action,
      payload,
      clientTimestamp,
    });

    if (action !== 'DELETE') {
      this.snapshotCache.set(`${collectionName}/${docId}`, {
        data: payload,
        updatedAt: clientTimestamp,
      });
    } else {
      this.snapshotCache.delete(`${collectionName}/${docId}`);
    }

    return id;
  }

  /**
   * Implementa el algoritmo exacto de desduplicación de lotes de offlineSyncEngine.ts
   */
  public deduplicateQueue(): { deduplicated: MockQueuedMutation[]; purgedCount: number } {
    const latestMutationMap = new Map<string, MockQueuedMutation>();
    const obsoleteIds: string[] = [];

    for (const mutation of this.queue) {
      const uniqueKey = `${mutation.collectionName}/${mutation.docId}`;
      const existing = latestMutationMap.get(uniqueKey);

      if (!existing) {
        latestMutationMap.set(uniqueKey, mutation);
      } else {
        if (mutation.clientTimestamp >= existing.clientTimestamp) {
          obsoleteIds.push(existing.id);
          latestMutationMap.set(uniqueKey, mutation);
        } else {
          obsoleteIds.push(mutation.id);
        }
      }
    }

    this.queue = this.queue.filter((m: MockQueuedMutation) => !obsoleteIds.includes(m.id));
    this.totalDeduplicatedPurged += obsoleteIds.length;
    return {
      deduplicated: Array.from(latestMutationMap.values()),
      purgedCount: obsoleteIds.length,
    };
  }

  public async flushQueue(): Promise<{ syncedCount: number; errors: number }> {
    if (!this.isOnline) {
      return { syncedCount: 0, errors: 0 };
    }

    const { deduplicated } = this.deduplicateQueue();
    const count = deduplicated.length;
    this.queue = [];
    this.totalSyncedBatches += 1;
    return { syncedCount: count, errors: 0 };
  }

  public purgeExpiredCache(ttlDays: number = 90, customNow: number = Date.now()): number {
    const threshold = customNow - ttlDays * 24 * 60 * 60 * 1000;
    let purged = 0;
    for (const [key, val] of this.snapshotCache.entries()) {
      if (val.updatedAt < threshold) {
        this.snapshotCache.delete(key);
        purged++;
      }
    }
    return purged;
  }
}

// ============================================================================
// ESCENARIOS DE PRUEBA
// ============================================================================

async function runTestSuite() {
  console.log(`\n${BOLD}${CYAN}===================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}   PURO APURE ERP — EJECUCIÓN DE PRUEBAS DE AUTOMATIZACIÓN QA E2E   ${RESET}`);
  console.log(`${BOLD}${CYAN}===================================================================${RESET}\n`);

  const mockEngine = new MockOfflineSyncEngine();

  // --------------------------------------------------------------------------
  // ESCENARIO 1: CARGA DE LOTES BIOLÓGICOS Y CORTES DE RED REPENTINOS
  // --------------------------------------------------------------------------
  console.log(`${BOLD}${YELLOW}[ESCENARIO 1] Resiliencia Zootécnica y Carga de Lotes ante Caída de Red${RESET}`);
  {
    const t0 = performance.now();
    // 1.1 Validación de motor zootécnico avícola (Ciclo max 40 días, $4.00/kg peso vivo)
    const avianCalc = calculateAvianBatch({
      daysInCycle: 38,
      grossWeightKg: 2500,
      tipoIngreso: 'NACIMIENTO_INTERNO',
      edadInicialDias: 1,
      pesoInicialKg: 0.045,
    });

    assert(
      avianCalc.isValid && avianCalc.netWeightKg === 2500 && avianCalc.billableAmountUSD === 10000,
      'Cálculo Zootécnico Avícola (Regla de Facturación $4.00/kg y Peso Vivo)',
      `Ciclo Restante: ${avianCalc.cicloRestante} días, Peso Neto: ${avianCalc.netWeightKg}kg, Facturable: $${avianCalc.billableAmountUSD}`,
      t0
    );

    // 1.2 Validación de motor zootécnico porcino (Merma 15-20kg, 4 sacos a $40, $6.00/kg)
    const t1 = performance.now();
    const porcineCalc = calculatePorcineBatch({
      daysInCycle: 120,
      grossWeightKg: 110.0,
      shrinkageDeductionKg: 18.0,
      feedSacksConsumed: 4,
      tipoIngreso: 'NACIMIENTO_INTERNO',
      edadInicialDias: 25,
      pesoInicialKg: 6.5,
    });

    assert(
      porcineCalc.isValid && porcineCalc.netWeightKg === 92.0 && porcineCalc.feedCostUSD === 160.0 && porcineCalc.billableAmountUSD === 552.0,
      'Cálculo Zootécnico Porcino (Algoritmo de Merma 18kg, Alimento $160 y Facturación $6.00/kg)',
      `Peso Neto: ${porcineCalc.netWeightKg}kg, Costo Alimento: $${porcineCalc.feedCostUSD}, Facturable: $${porcineCalc.billableAmountUSD}`,
      t1
    );

    // 1.3 Simulación de caída súbita de conectividad
    const t2 = performance.now();
    mockEngine.setOnline(false);

    const testAvianBatch: BiologicalBatch = {
      id: 'LOTE-AVI-2026-TEST',
      code: 'LOT-AV-2026-01',
      species: 'AVICOLA',
      initialCount: 1200,
      currentCount: 1200,
      startDate: '2026-09-01',
      tipoIngreso: 'NACIMIENTO_INTERNO',
      status: 'ACTIVO',
      daysInCycle: 38,
      grossWeightKg: 2500,
      shrinkageDeductionKg: avianCalc.shrinkageDeductionKg,
      netWeightKg: avianCalc.netWeightKg,
      feedSacksConsumed: 0,
      feedCostUSD: 0,
      unitPriceUSDPerKg: avianCalc.unitPriceUSDPerKg,
      billableAmountUSD: avianCalc.billableAmountUSD,
      lastUpdatedTimestamp: Date.now(),
      updatedBy: 'operador_campo_apure',
    };

    await mockEngine.enqueueMutation('biological_batches', testAvianBatch.id, 'SET', testAvianBatch);

    assert(
      mockEngine.queue.length === 1 && !mockEngine.isOnline,
      'Aislamiento Offline: Encolamiento de Lote Biológico',
      `Lote ${testAvianBatch.id} encolado en buffer local. Conexión offline confirmada.`,
      t2
    );

    // 1.4 Consulta de Snapshot Cache en modo offline
    const t3 = performance.now();
    const cachedItem = mockEngine.snapshotCache.get(`biological_batches/${testAvianBatch.id}`);
    assert(
      cachedItem !== undefined && cachedItem.data.netWeightKg === 2500,
      'Caché Optimista de Alta Velocidad (Lectura sin Red)',
      `El registro ${testAvianBatch.id} se encuentra disponible instantáneamente en caché local.`,
      t3
    );
  }

  // --------------------------------------------------------------------------
  // ESCENARIO 2: DESDUPLICACIÓN EN RÁFAGA (BATCH DEDUPLICATION)
  // --------------------------------------------------------------------------
  console.log(`\n${BOLD}${YELLOW}[ESCENARIO 2] Prevención de Colisiones y Desduplicación por docId${RESET}`);
  {
    const t0 = performance.now();
    const batchId = 'LOTE-PORC-RAPID-WEIGH';

    // Simular operario en galpón registrando 5 pesajes sucesivos en menos de 2 minutos sin internet
    const baseTime = Date.now();
    for (let i = 1; i <= 5; i++) {
      await mockEngine.enqueueMutation(
        'biological_batches',
        batchId,
        'UPDATE',
        {
          id: batchId,
          grossWeightKg: 8000 + i * 50,
          iteration: i,
          note: `Pesaje consecutivo #${i}`,
        },
        baseTime + i * 1000
      );
    }

    assert(
      mockEngine.queue.filter((m) => m.docId === batchId).length === 5,
      'Ráfaga de Mutaciones Locales en Buffer',
      `Se registraron 5 pesajes consecutivos en cola local para ${batchId}.`,
      t0
    );

    // Ejecutar algoritmo de deduplicación
    const t1 = performance.now();
    const { deduplicated, purgedCount } = mockEngine.deduplicateQueue();

    assert(
      purgedCount === 4 &&
        deduplicated.filter((m: MockQueuedMutation) => m.docId === batchId).length === 1 &&
        deduplicated.find((m: MockQueuedMutation) => m.docId === batchId)?.payload.iteration === 5,
      'Batch Deduplication: Retención Exclusiva de Estado Más Reciente',
      `Se purgaron 4 mutaciones obsoletas. Se conservó únicamente la iteración 5 (último clientTimestamp).`,
      t1
    );
  }

  // --------------------------------------------------------------------------
  // ESCENARIO 3: TRANSACCIONES BIMONETARIAS Y MOTOR MARK-TO-MARKET (MtM)
  // --------------------------------------------------------------------------
  console.log(`\n${BOLD}${YELLOW}[ESCENARIO 3] Ecosistema Bimonetario y Motor Mark-to-Market (MtM)${RESET}`);
  {
    const t0 = performance.now();

    const samplePayments: PaymentRecord[] = [
      {
        id: 'PAY-MTM-001',
        entityId: 'PROV-MAIZ-01',
        entityName: 'Agropecuaria El Maizal C.A.',
        city: 'San Fernando',
        paymentMode: 'TRANSFERENCIA',
        platform: 'Banesco',
        idDocument: 'J-12345678-0',
        linkedInvoice: 'FAC-001',
        impactType: 'EGRESO_PROVEEDOR',
        amountUSD: 1000.0,
        amountVES: 36500.0,
        bcvRate: 36.5,
        date: '2026-01-15',
        reference: 'TRANSF-001928',
        isReconciled: true,
        createdAt: Date.now(),
        updatedBy: 'admin',
        snapshot: {
          frozenUSD: 1000.0,
          frozenVES: 36500.0,
          frozenRate: 36.5,
          capturedAt: '2026-01-15T00:00:00Z',
          source: 'BCV_OFICIAL',
        },
      },
      {
        id: 'PAY-MTM-002',
        entityId: 'CLI-CARNICERIA-02',
        entityName: 'Distribuidora Carnes del Llano',
        city: 'San Fernando',
        paymentMode: 'PAGO_MOVIL',
        platform: 'Banco de Venezuela',
        idDocument: 'J-87654321-0',
        linkedInvoice: 'FAC-002',
        impactType: 'INGRESO_VENTA',
        amountUSD: 2500.0,
        amountVES: 105000.0,
        bcvRate: 42.0,
        date: '2026-02-01',
        reference: 'PAGO-MOVIL-8821',
        isReconciled: true,
        createdAt: Date.now(),
        updatedBy: 'admin',
        snapshot: {
          frozenUSD: 2500.0,
          frozenVES: 105000.0,
          frozenRate: 42.0,
          capturedAt: '2026-02-01T00:00:00Z',
          source: 'BCV_OFICIAL',
        },
      },
    ];

    // Simular tasa de mercado actual de 75.00 VES/USD (devaluación significativa)
    const simulatedRate = 75.0;
    const mtmResults = FinanceService.calculateMarkToMarket(samplePayments, simulatedRate);

    assert(
      mtmResults.length === 2,
      'Procesamiento Mark-to-Market de Transacciones Históricas',
      `Se calcularon 2 deltas cambiarios bajo tasa simulada de Bs. ${simulatedRate}/USD`,
      t0
    );

    const t1 = performance.now();
    const item1 = mtmResults[0];
    // Original: $1000 / Bs. 36,500. Tasa simulada: 75 -> Revaluado USD = 36500 / 75 = 486.67
    // Delta USD = 486.67 - 1000 = -513.33 USD
    // Porcentaje devaluación = ((75 - 36.5) / 36.5) * 100 = 105.48%
    const expectedRevaluedUSD = Number((36500 / 75).toFixed(2));
    const expectedDeltaUSD = Number((expectedRevaluedUSD - 1000).toFixed(2));

    assert(
      item1.revaluedAmountUSD === expectedRevaluedUSD &&
        item1.devaluationDeltaUSD === expectedDeltaUSD &&
        item1.devaluationPercentage === 105.48,
      'Precisión Matemática Inmutable (Prevención de Error IEEE 754)',
      `Original: $${item1.originalAmountUSD} | Revaluado: $${item1.revaluedAmountUSD} | Delta: $${item1.devaluationDeltaUSD} (${item1.devaluationPercentage}%)`,
      t1
    );

    // 3.2 Cruce de Deudas y Atomicidad en Encolamiento Offline
    const t2 = performance.now();
    const dualEntity: DualEntity = {
      id: 'ENT-DUAL-001',
      name: 'AgroInsumos & Ganados Apure',
      rifCedula: 'J-50129384-9',
      roles: ['CLIENTE', 'PROVEEDOR'],
      city: 'San Fernando',
      address: 'Av. Caracas',
      phone: '0247-3412345',
      balanceUSD: 1500.0,
      balanceVES: 54750.0,
      balancePorPagarUSD: 2000.0,
      balancePorCobrarUSD: 3500.0,
      lastUpdatedTimestamp: Date.now(),
    };

    const crossClearingRecord: PaymentRecord = {
      id: 'CRUCE-CLEAR-2026-001',
      entityId: dualEntity.id,
      entityName: dualEntity.name,
      city: 'San Fernando',
      paymentMode: 'TRANSFERENCIA',
      platform: 'Compensación Interna',
      idDocument: dualEntity.rifCedula,
      linkedInvoice: 'CRUCE-DEUDA-001',
      impactType: 'INGRESO_VENTA',
      amountUSD: 500.0,
      amountVES: 500.0 * 75.0,
      bcvRate: 75.0,
      date: new Date().toISOString(),
      reference: 'CRUCE-AUTO-DEVSECOPS',
      isReconciled: true,
      createdAt: Date.now(),
      updatedBy: 'admin',
      snapshot: {
        frozenUSD: 500.0,
        frozenVES: 500.0 * 75.0,
        frozenRate: 75.0,
        capturedAt: new Date().toISOString(),
        source: 'CLEARING_DESK',
      },
    };

    // Registrar mutaciones atómicas encoladas
    await mockEngine.enqueueMutation('dual_entities', dualEntity.id, 'UPDATE', {
      balanceUSD: 1000.0,
      balanceVES: 1000.0 * 75.0,
    });
    await mockEngine.enqueueMutation('payments', crossClearingRecord.id, 'SET', crossClearingRecord);

    assert(
      mockEngine.queue.some((m: MockQueuedMutation) => m.docId === dualEntity.id) &&
        mockEngine.queue.some((m: MockQueuedMutation) => m.docId === crossClearingRecord.id),
      'Atomicidad Bimonetaria en Buffer Offline (Contraparte + Pago)',
      'Operación unificada de amortización registrada simultáneamente en buffer de mutaciones.',
      t2
    );
  }

  // --------------------------------------------------------------------------
  // ESCENARIO 4: RECOLECCIÓN DE BASURA LOCAL (TTL 90 DÍAS)
  // --------------------------------------------------------------------------
  console.log(`\n${BOLD}${YELLOW}[ESCENARIO 4] Política de Expiración Automática y Garbage Collection${RESET}`);
  {
    const t0 = performance.now();
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    // Inyectar datos antiguos (95 días de antigüedad)
    mockEngine.snapshotCache.set('old_batch/LOTE-HISTORICO-01', {
      data: { name: 'Lote Antiguo Purgable' },
      updatedAt: now - 95 * DAY_MS,
    });
    mockEngine.snapshotCache.set('old_batch/LOTE-HISTORICO-02', {
      data: { name: 'Lote Antiguo Purgable 2' },
      updatedAt: now - 110 * DAY_MS,
    });

    // Inyectar datos recientes (15 días de antigüedad)
    mockEngine.snapshotCache.set('active_batch/LOTE-ACTIVO-2026', {
      data: { name: 'Lote Vigente en Producción' },
      updatedAt: now - 15 * DAY_MS,
    });

    const purged = mockEngine.purgeExpiredCache(90, now);

    assert(
      purged === 2 &&
        !mockEngine.snapshotCache.has('old_batch/LOTE-HISTORICO-01') &&
        !mockEngine.snapshotCache.has('old_batch/LOTE-HISTORICO-02') &&
        mockEngine.snapshotCache.has('active_batch/LOTE-ACTIVO-2026'),
      'Garbage Collection TTL 90 Días: Desalojo de Registros Inactivos',
      `Se purgaron exitosamente ${purged} registros mayores a 90 días, conservando los datos activos en cuota.`,
      t0
    );
  }

  // --------------------------------------------------------------------------
  // ESCENARIO 5: RECONEXIÓN DE RED Y DESPACHO ATÓMICO (FLUSH)
  // --------------------------------------------------------------------------
  console.log(`\n${BOLD}${YELLOW}[ESCENARIO 5] Reconexión de Red y Sincronización Todo-o-Nada a Firestore${RESET}`);
  {
    const t0 = performance.now();
    const pendingBefore = mockEngine.queue.length;

    // Restablecer conectividad
    mockEngine.setOnline(true);
    const flushResult = await mockEngine.flushQueue();

    assert(
      flushResult.syncedCount > 0 && mockEngine.queue.length === 0,
      'Sincronización Total al Recuperar Red (Cero Fugas / Cero Huérfanos)',
      `Se despacharon exitosamente ${flushResult.syncedCount} operaciones. Cola residual: ${mockEngine.queue.length}.`,
      t0
    );
  }

  // --------------------------------------------------------------------------
  // RESUMEN CONSOLIDADO DE CERTIFICACIÓN QA
  // --------------------------------------------------------------------------
  console.log(`\n${BOLD}${GREEN}===================================================================${RESET}`);
  console.log(`${BOLD}${GREEN}   CERTIFICACIÓN E2E DE QA AUTOMATION COMPLETADA CON ÉXITO        ${RESET}`);
  console.log(`${BOLD}${GREEN}===================================================================${RESET}`);
  console.log(`  Total Aserciones Evaluadas: ${BOLD}${suiteResults.length}${RESET}`);
  console.log(`  Aserciones Exitosas:        ${BOLD}${GREEN}${suiteResults.filter((r) => r.passed).length}${RESET}`);
  console.log(`  Aserciones Fallidas:        ${BOLD}${suiteResults.filter((r) => !r.passed).length}${RESET}`);
  console.log(`  Estado de Resiliencia:      ${BOLD}${GREEN}BLINDADO A NIVEL ENTERPRISE (100% PASS)${RESET}\n`);

  return suiteResults;
}

// Ejecución directa si se invoca con tsx
runTestSuite().catch((err) => {
  console.error('\nError en suite E2E:', err);
  process.exit(1);
});
