/**
 * Servicio Financiero, CRM/VRM Dual, Motor Cambiario BCV y Mark-to-Market
 * Fase 3: Ecosistema Financiero Agroindustrial Bimonetario
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  runTransaction,
  increment,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { offlineSyncEngine } from './offlineSyncEngine';
import { BcvFeederService, BcvSyncResult } from './bcvFeederService';
import { centsRound } from './financialAnalyticsService';
import { BiologicalBatch } from '../types/inventory';
import {
  DualEntity,
  PaymentRecord,
  BcvRateRecord,
  MarkToMarketResult,
  BillingInvoice,
  PaymentReconciliation,
  AccountingEntry,
  ProformaInvoice,
  InstallmentScheduleItem,
} from '../types/finance';

export const ENTITIES_COLLECTION = 'dual_entities';
export const PAYMENTS_COLLECTION = 'payments';
export const ACCOUNTING_ENTRIES_COLLECTION = 'accounting_entries';
export const RATES_COLLECTION = 'exchange_rates';
export const INVOICES_COLLECTION = 'billing_invoices';
export const PROFORMAS_COLLECTION = 'proformas';
export const RECONCILIATIONS_COLLECTION = 'payment_reconciliations';

export interface BatchDeductionParams {
  loteId: string;
  cantidadKg: number;
  cantidadUnidades: number;
}

export class FinanceService {
  private static cachedBcvRate = 0;
  private static lastRateFetchTime = 0;

  /**
   * Obtiene la tasa BCV oficial para una fecha específica (vigente o histórica)
   */
  static async fetchBcvRateForDate(dateString: string): Promise<number> {
    const historicalRate = await BcvFeederService.fetchRateForDate(dateString);
    if (historicalRate && historicalRate > 0) {
      return historicalRate;
    }
    return this.fetchLatestBcvRate();
  }

  /**
   * Motor Cambiario: Fetching Engine para la tasa oficial del Banco Central (BCV)
   * Sincroniza desde fuentes canónicas, auto-actualizable, con persistencia y fallback offline.
   */
  static async fetchLatestBcvRate(forceSync = false): Promise<number> {
    const now = Date.now();
    // Cache de 15 minutos en memoria si la tasa es reciente y no se fuerza sincronización
    if (!forceSync && now - this.lastRateFetchTime < 900000 && this.cachedBcvRate > 100) {
      return this.cachedBcvRate;
    }

    try {
      const syncResult = await BcvFeederService.syncLatestRate(forceSync);
      if (syncResult && syncResult.rate > 0) {
        this.cachedBcvRate = syncResult.rate;
        this.lastRateFetchTime = now;
        return this.cachedBcvRate;
      }
    } catch (err) {
      console.warn('[FinanceService] Fallback al consultar BcvFeeder:', err);
    }

    return this.cachedBcvRate;
  }

  /**
   * Fuerza la sincronización inmediata de la tasa oficial del BCV desde el servidor/API
   */
  static async syncBcvRateNow(): Promise<BcvSyncResult> {
    const res = await BcvFeederService.syncLatestRate(true);
    if (res.success && res.rate > 0) {
      this.cachedBcvRate = res.rate;
      this.lastRateFetchTime = Date.now();
    }
    return res;
  }

  /**
   * Permite actualizar la tasa BCV manualmente o mediante el feeder del sistema
   */
  static async updateBcvRate(newRate: number, source = 'Operador Oficial'): Promise<void> {
    if (newRate <= 0) throw new Error('La tasa de cambio debe ser superior a cero.');

    const now = Date.now();
    const rateDocRef = doc(db, RATES_COLLECTION, 'bcv_latest');
    const record: BcvRateRecord = {
      date: new Date().toISOString().split('T')[0],
      rateUSD_VES: Number(newRate.toFixed(4)),
      timestamp: now,
      source,
    };

    await setDoc(rateDocRef, record);
    this.cachedBcvRate = record.rateUSD_VES;
    this.lastRateFetchTime = now;
  }

  /**
   * Registro de Pagos con Data Snapshot Congelado:
   * Al registrar una transacción, congela monto USD, monto VES y la tasa exacta del momento.
   */
  static async registerPayment(
    paymentData: Omit<PaymentRecord, 'id' | 'createdAt' | 'snapshot' | 'updatedBy'>,
    userId: string
  ): Promise<PaymentRecord> {
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();

    // Validación estricta y tolerancia bimonetaria
    const safeRate = paymentData.bcvRate > 0 && !isNaN(paymentData.bcvRate)
      ? Number(paymentData.bcvRate.toFixed(4))
      : (this.cachedBcvRate > 0 ? Number(this.cachedBcvRate.toFixed(4)) : 0);

    const safeUSD = typeof paymentData.amountUSD === 'number' && !isNaN(paymentData.amountUSD)
      ? Number(paymentData.amountUSD.toFixed(2))
      : 0;

    const safeVES = typeof paymentData.amountVES === 'number' && !isNaN(paymentData.amountVES) && paymentData.amountVES > 0
      ? Number(paymentData.amountVES.toFixed(2))
      : Number((safeUSD * safeRate).toFixed(2));

    // Data Snapshot Inmutable con precisión bimonetaria garantizada
    const snapshot = {
      frozenRate: safeRate,
      frozenUSD: safeUSD,
      frozenVES: safeVES,
      capturedAt: new Date().toISOString(),
      source: 'BCV Snapshot Engine v3.0 (Criptográfico e Inmutable)',
    };

    const record: PaymentRecord = {
      ...paymentData,
      id: paymentId,
      amountUSD: safeUSD,
      amountVES: safeVES,
      bcvRate: safeRate,
      createdAt: now,
      updatedBy: userId,
      snapshot,
    };

    const docRef = doc(db, PAYMENTS_COLLECTION, paymentId);

    // Si el cliente está sin conexión, encolar en buffer offline directamente
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await offlineSyncEngine.enqueueMutation(
        PAYMENTS_COLLECTION,
        paymentId,
        'SET',
        record,
        { offline: true }
      );
      if (paymentData.entityId) {
        let deltaUSD = 0;
        if (paymentData.impactType === 'INGRESO_VENTA' || paymentData.impactType === 'INGRESO') {
          deltaUSD = -safeUSD;
        } else if (paymentData.impactType === 'EGRESO_PROVEEDOR' || paymentData.impactType === 'EGRESO') {
          deltaUSD = safeUSD;
        }
        const deltaVES = centsRound(deltaUSD * safeRate);
        await offlineSyncEngine.enqueueMutation(
          ENTITIES_COLLECTION,
          paymentData.entityId,
          'UPDATE',
          {
            _increments: {
              balanceUSD: deltaUSD,
              balanceVES: deltaVES,
            },
            lastUpdatedTimestamp: now,
          },
          { offline: true, isDelta: true }
        );
      }
      return record;
    }

    try {
      // Estabilidad Transaccional ACID (Prioridad 1 Spec-Driven):
      // Si el pago está asociado a una Entidad Dual (Cliente o Proveedor),
      // se utiliza writeBatch para garantizar confirmación indivisible (Todo-o-nada):
      // 1. Registro del pago (PaymentRecord) con Data Snapshot inmutable
      // 2. Amortización del saldo mediante deltas atómicos (increment) en la Entidad
      if (paymentData.entityId) {
        const entityDocRef = doc(db, ENTITIES_COLLECTION, paymentData.entityId);
        const entitySnap = await getDoc(entityDocRef);

        if (entitySnap.exists()) {
          const entityData = entitySnap.data() as DualEntity;
          const currentBalUSD = Number(entityData.balanceUSD ?? 0);
          
          let deltaUSD = 0;
          if (paymentData.impactType === 'INGRESO_VENTA' || paymentData.impactType === 'INGRESO') {
            deltaUSD = -safeUSD; // Disminuye lo que el cliente debe a la empresa
          } else if (paymentData.impactType === 'EGRESO_PROVEEDOR' || paymentData.impactType === 'EGRESO') {
            deltaUSD = safeUSD;  // Amortiza pasivo con proveedor
          }

          const newBalanceUSD = centsRound(currentBalUSD + deltaUSD);
          const newBalanceVES = centsRound(newBalanceUSD * safeRate);

          const batch = writeBatch(db);
          batch.set(docRef, record);
          batch.update(entityDocRef, {
            balanceUSD: increment(deltaUSD),
            balanceVES: increment(centsRound(deltaUSD * safeRate)),
            balancePorCobrarUSD: entityData.roles.includes('CLIENTE') && newBalanceUSD > 0 ? newBalanceUSD : 0,
            balancePorPagarUSD: entityData.roles.includes('PROVEEDOR') && newBalanceUSD < 0 ? Math.abs(newBalanceUSD) : 0,
            lastUpdatedTimestamp: now,
          });

          await batch.commit();
          return record;
        }
      }

      // Si no tiene entidad vinculada, persistir atómicamente el pago directo
      const singleBatch = writeBatch(db);
      singleBatch.set(docRef, record);
      await singleBatch.commit();
    } catch (e) {
      console.warn('[FinanceService] Transacción atómica batch pausada por fallo de red, encolando offline:', e);
      await offlineSyncEngine.enqueueMutation(
        PAYMENTS_COLLECTION,
        paymentId,
        'SET',
        record,
        { offline: true }
      );
      if (paymentData.entityId) {
        let deltaUSD = 0;
        if (paymentData.impactType === 'INGRESO_VENTA' || paymentData.impactType === 'INGRESO') {
          deltaUSD = -safeUSD;
        } else if (paymentData.impactType === 'EGRESO_PROVEEDOR' || paymentData.impactType === 'EGRESO') {
          deltaUSD = safeUSD;
        }
        await offlineSyncEngine.enqueueMutation(
          ENTITIES_COLLECTION,
          paymentData.entityId,
          'UPDATE',
          {
            _increments: {
              balanceUSD: deltaUSD,
              balanceVES: centsRound(deltaUSD * safeRate),
            },
            lastUpdatedTimestamp: now,
          },
          { offline: true, isDelta: true }
        );
      }
    }

    return record;
  }

  /**
   * Conciliación Bancaria: Cambia estado conciliado/por conciliar
   */
  static async togglePaymentReconciliation(
    paymentId: string,
    isReconciled: boolean,
    userId: string
  ): Promise<void> {
    const docRef = doc(db, PAYMENTS_COLLECTION, paymentId);
    const updatePayload = {
      isReconciled,
      reconciledAt: isReconciled ? new Date().toISOString() : null,
      updatedBy: userId,
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await offlineSyncEngine.enqueueMutation(
        PAYMENTS_COLLECTION,
        paymentId,
        'UPDATE',
        updatePayload,
        { offline: true }
      );
      return;
    }

    try {
      const batch = writeBatch(db);
      batch.update(docRef, updatePayload);
      await batch.commit();
    } catch (e) {
      console.warn('Conciliación encolada localmente por fallo de red:', e);
      await offlineSyncEngine.enqueueMutation(
        PAYMENTS_COLLECTION,
        paymentId,
        'UPDATE',
        updatePayload,
        { offline: true }
      );
    }
  }

  /**
   * Gestión de Entidades Duales (CLIENTE / PROVEEDOR)
   */
  static async saveDualEntity(
    entity: Omit<DualEntity, 'lastUpdatedTimestamp'>,
    userId: string
  ): Promise<void> {
    const docRef = doc(db, ENTITIES_COLLECTION, entity.id);
    const record: DualEntity = {
      ...entity,
      lastUpdatedTimestamp: Date.now(),
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await offlineSyncEngine.enqueueMutation(
        ENTITIES_COLLECTION,
        entity.id,
        'SET',
        record,
        { offline: true }
      );
      return;
    }

    try {
      const batch = writeBatch(db);
      batch.set(docRef, record);
      await batch.commit();
    } catch (e) {
      console.warn('Entidad dual guardada en buffer offline por fallo de red:', e);
      await offlineSyncEngine.enqueueMutation(
        ENTITIES_COLLECTION,
        entity.id,
        'SET',
        record,
        { offline: true }
      );
    }
  }

  /**
   * Cruce de Cuentas para Entidades Duales:
   * Compensa deudas mutuas de clientes que también son proveedores.
   * Ejecución atómica garantizada mediante writeBatch de Firestore.
   */
  static async applyAccountCrossClearing(
    entityId: string,
    amountToClearUSD: number,
    userId: string
  ): Promise<void> {
    const docRef = doc(db, ENTITIES_COLLECTION, entityId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error('Entidad no localizada');

    const entity = snap.data() as DualEntity;
    if (!entity.roles.includes('CLIENTE') || !entity.roles.includes('PROVEEDOR')) {
      throw new Error('El cruce de cuentas requiere que la entidad posea ambos roles: CLIENTE y PROVEEDOR.');
    }

    const safeUSD = centsRound(amountToClearUSD);
    if (safeUSD <= 0) throw new Error('El monto a compensar debe ser mayor a 0 USD.');

    const currentRate = await this.fetchLatestBcvRate();
    const safeRate = Number(currentRate) > 0 ? Number(currentRate) : 1;
    const safeVES = centsRound(safeUSD * safeRate);
    const now = Date.now();

    const deltaUSD = -safeUSD;
    const deltaVES = -safeVES;

    const crossClearingRecord: PaymentRecord = {
      id: `clear_${now}_${Math.random().toString(36).slice(2, 7)}`,
      date: new Date().toISOString().split('T')[0],
      paymentMode: 'OTRO',
      platform: 'Cruce de Cuentas Dual (Compensación Interna)',
      reference: `CRUCE-${entity.rifCedula.replace(/[^A-Z0-9]/gi, '')}-${Date.now().toString().slice(-4)}`,
      idDocument: entity.rifCedula,
      entityId: entity.id,
      entityName: entity.name,
      city: entity.city || 'San Fernando de Apure',
      linkedInvoice: `CLEARING_${entity.id}`,
      impactType: 'INGRESO',
      amountUSD: safeUSD,
      amountVES: safeVES,
      bcvRate: safeRate,
      isReconciled: true,
      reconciledAt: new Date().toISOString(),
      snapshot: {
        frozenRate: safeRate,
        frozenUSD: safeUSD,
        frozenVES: safeVES,
        capturedAt: new Date().toISOString(),
        source: 'Compensación Atómica Dual v3.0 (writeBatch ACID)',
      },
      createdAt: now,
      updatedBy: userId,
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await offlineSyncEngine.enqueueMutation(
        ENTITIES_COLLECTION,
        entity.id,
        'UPDATE',
        {
          _increments: {
            balanceUSD: deltaUSD,
            balanceVES: deltaVES,
          },
          lastUpdatedTimestamp: now,
        },
        { offline: true, isDelta: true }
      );
      await offlineSyncEngine.enqueueMutation(
        PAYMENTS_COLLECTION,
        crossClearingRecord.id,
        'SET',
        crossClearingRecord,
        { offline: true }
      );
      return;
    }

    try {
      // Confirmación indivisible (Atomicidad ACID - Todo o Nada)
      const batch = writeBatch(db);
      const clearPaymentRef = doc(db, PAYMENTS_COLLECTION, crossClearingRecord.id);

      const estimatedNewBalanceUSD = centsRound((entity.balanceUSD || 0) + deltaUSD);

      batch.update(docRef, {
        balanceUSD: increment(deltaUSD),
        balanceVES: increment(deltaVES),
        balancePorCobrarUSD: estimatedNewBalanceUSD > 0 ? estimatedNewBalanceUSD : 0,
        balancePorPagarUSD: estimatedNewBalanceUSD < 0 ? Math.abs(estimatedNewBalanceUSD) : 0,
        lastUpdatedTimestamp: now,
      });

      batch.set(clearPaymentRef, crossClearingRecord);

      await batch.commit();
    } catch (e) {
      console.warn('[FinanceService] Fallo de red en cruce atómico, encolando en motor offline:', e);
      await offlineSyncEngine.enqueueMutation(
        ENTITIES_COLLECTION,
        entity.id,
        'UPDATE',
        {
          _increments: {
            balanceUSD: deltaUSD,
            balanceVES: deltaVES,
          },
          lastUpdatedTimestamp: now,
        },
        { offline: true, isDelta: true }
      );
      await offlineSyncEngine.enqueueMutation(
        PAYMENTS_COLLECTION,
        crossClearingRecord.id,
        'SET',
        crossClearingRecord,
        { offline: true }
      );
    }
  }

  /**
   * Tolerancia de desviación cambiaria para el recálculo contable (Mark-to-Market).
   * Filtro anti-ruido: 0.005 (0.5%) para ignorar micro-fluctuaciones volátiles del BCV.
   */
  public static readonly MTM_RATE_DEVIATION_TOLERANCE = 0.005;

  /**
   * Motor Analítico Mark-to-Market:
   * Recalcula transacciones históricas según una tasa simulada/actual para revelar el Delta de Devaluación.
   * Aplica banda de tolerancia de 0.5% (0.005) para mitigar recálculos innecesarios por micro-fluctuaciones.
   */
  static calculateMarkToMarket(
    payments: PaymentRecord[],
    simulatedRate: number,
    rateTolerance: number = FinanceService.MTM_RATE_DEVIATION_TOLERANCE
  ): MarkToMarketResult[] {
    if (!simulatedRate || simulatedRate <= 0 || isNaN(simulatedRate) || !isFinite(simulatedRate)) return [];

    return payments.map((p) => {
      const originalUSD = Number(((p.snapshot?.frozenUSD ?? p.amountUSD) || 0).toFixed(2));
      const originalVES = Number(((p.snapshot?.frozenVES ?? p.amountVES) || 0).toFixed(2));
      const frozenRate = (p.snapshot?.frozenRate ?? p.bcvRate) || 1;

      // Evaluar si la desviación con respecto a la tasa congelada supera el umbral de tolerancia (0.005 / 0.5%)
      const rateDeviation = frozenRate > 0 ? Math.abs(simulatedRate - frozenRate) / frozenRate : 0;
      const effectiveRate = rateDeviation < rateTolerance ? frozenRate : simulatedRate;

      // Al evaluar en base al monto en VES inmovilizado con la tasa efectiva:
      // ¿Cuánto USD representa hoy ese monto en bolívares?
      const revaluedUSD = effectiveRate > 0 ? Number((originalVES / effectiveRate).toFixed(2)) : 0;
      // O si se evalúa el monto en USD convertido a la tasa efectiva:
      const revaluedVES = Number((originalUSD * effectiveRate).toFixed(2));

      // Delta de Devaluación: Pérdida o ganancia cambiaria del saldo en VES expresado en USD
      const devaluationDeltaUSD = Number((revaluedUSD - originalUSD).toFixed(2));
      const devaluationDeltaVES = Number((revaluedVES - originalVES).toFixed(2));
      const devaluationPercentage = frozenRate > 0
        ? Number((((effectiveRate - frozenRate) / frozenRate) * 100).toFixed(2))
        : 0;

      return {
        paymentId: p.id,
        reference: p.reference,
        date: p.date,
        entityName: p.entityName,
        originalAmountUSD: originalUSD,
        originalAmountVES: originalVES,
        frozenRate,
        simulatedRate: effectiveRate,
        revaluedAmountUSD: revaluedUSD,
        revaluedAmountVES: revaluedVES,
        devaluationDeltaUSD,
        devaluationDeltaVES,
        devaluationPercentage,
      };
    });
  }

  /**
   * Suscripciones en Tiempo Real
   */
  static subscribeDualEntities(callback: (entities: DualEntity[]) => void): () => void {
    const q = collection(db, ENTITIES_COLLECTION);
    return onSnapshot(
      q,
      (snap) => {
        const list: DualEntity[] = [];
        snap.forEach((d) => list.push(d.data() as DualEntity));
        callback(list);
      },
      (err) => console.warn('Dual entities onSnapshot fallback (offline):', err.message)
    );
  }

  static subscribePayments(callback: (payments: PaymentRecord[]) => void): () => void {
    const q = collection(db, PAYMENTS_COLLECTION);
    return onSnapshot(
      q,
      (snap) => {
        const list: PaymentRecord[] = [];
        snap.forEach((d) => list.push(d.data() as PaymentRecord));
        // Orden descendente por fecha / creación
        list.sort((a, b) => b.createdAt - a.createdAt);
        callback(list);
      },
      (err) => console.warn('Payments onSnapshot fallback (offline):', err.message)
    );
  }

  static subscribeLatestRate(callback: (rate: number) => void): () => void {
    const docRef = doc(db, RATES_COLLECTION, 'bcv_latest');
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as BcvRateRecord;
          if (data?.rateUSD_VES) {
            callback(data.rateUSD_VES);
          }
        }
      },
      (err) => console.warn('Rates onSnapshot fallback (offline):', err.message)
    );
  }

  static subscribeLatestRateDetails(
    callback: (details: { rate: number; date: string; source: string; timestamp: number; isStale: boolean }) => void
  ): () => void {
    const docRef = doc(db, RATES_COLLECTION, 'bcv_latest');
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as BcvRateRecord;
          if (data?.rateUSD_VES) {
            const now = Date.now();
            const isStale = now - (data.timestamp || 0) > 4 * 60 * 60 * 1000;
            callback({
              rate: data.rateUSD_VES,
              date: data.date || '',
              source: data.source || 'BCV',
              timestamp: data.timestamp || 0,
              isStale,
            });
          }
        }
      },
      (err) => console.warn('Rates details onSnapshot fallback (offline):', err.message)
    );
  }

  /**
   * Guarda o actualiza una proforma de facturación bimonetaria y descuenta atómicamente la biomasa del lote (ACID).
   */
  static async saveInvoiceWithInventoryDeduction(
    invoice: BillingInvoice,
    batchDeduction?: BatchDeductionParams
  ): Promise<void> {
    const invoiceRef = doc(db, INVOICES_COLLECTION, invoice.id);
    const hasDeduction = !!(
      batchDeduction &&
      batchDeduction.loteId &&
      (batchDeduction.cantidadKg > 0 || batchDeduction.cantidadUnidades > 0)
    );

    // Modo Offline: Encolar mutaciones en buffer IndexedDB
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await offlineSyncEngine.enqueueMutation(
        INVOICES_COLLECTION,
        invoice.id,
        'SET',
        invoice,
        { offline: true }
      );
      if (hasDeduction && batchDeduction) {
        await offlineSyncEngine.enqueueMutation(
          'batches',
          batchDeduction.loteId,
          'UPDATE',
          {
            _increments: {
              currentCount: -Math.max(0, Math.floor(batchDeduction.cantidadUnidades || 0)),
              grossWeightKg: -centsRound(batchDeduction.cantidadKg || 0),
              netWeightKg: -centsRound(batchDeduction.cantidadKg || 0),
            },
            lastUpdatedTimestamp: Date.now(),
          },
          { offline: true, isDelta: true }
        );
      }
      return;
    }

    // Modo Online: Transacción ACID con verificación en tiempo real de inventario
    try {
      if (hasDeduction && batchDeduction) {
        await runTransaction(db, async (transaction) => {
          const batchRef = doc(db, 'batches', batchDeduction.loteId);
          const batchSnap = await transaction.get(batchRef);

          if (!batchSnap.exists()) {
            throw new Error(`El lote biológico (${batchDeduction.loteId}) no existe en la base de datos.`);
          }

          const batchData = batchSnap.data() as BiologicalBatch;
          if (batchData.status === 'FINALIZADO') {
            throw new Error(`El lote ${batchData.code || batchDeduction.loteId} ya se encuentra en estado FINALIZADO.`);
          }

          const isAvian = batchData.species === 'AVICOLA';
          const availableKg = isAvian
            ? (batchData.grossWeightKg || 0)
            : (batchData.netWeightKg || Math.max(0, (batchData.grossWeightKg || 0) - (batchData.deduccionMermaKg || 17.5)));
          const availableUnits = batchData.currentCount || 0;

          if (batchDeduction.cantidadKg > 0 && batchDeduction.cantidadKg > availableKg) {
            throw new Error(
              `Existencia insuficiente en lote ${batchData.code}: Solicitado ${batchDeduction.cantidadKg} kg • Disponible ${availableKg} kg.`
            );
          }

          if (batchDeduction.cantidadUnidades > 0 && batchDeduction.cantidadUnidades > availableUnits) {
            throw new Error(
              `Existencia insuficiente de unidades en lote ${batchData.code}: Solicitado ${batchDeduction.cantidadUnidades} • Disponible ${availableUnits} animales.`
            );
          }

          const countToDeduct = Math.max(0, Math.floor(batchDeduction.cantidadUnidades || 0));
          const kgToDeduct = centsRound(batchDeduction.cantidadKg || 0);
          const remainingUnits = Math.max(0, availableUnits - countToDeduct);
          const remainingGrossKg = Math.max(0, centsRound((batchData.grossWeightKg || 0) - kgToDeduct));
          const nextStatus = (remainingUnits <= 0 || (remainingGrossKg <= 0 && isAvian)) ? 'FINALIZADO' : batchData.status;

          transaction.update(batchRef, {
            currentCount: increment(-countToDeduct),
            grossWeightKg: increment(-kgToDeduct),
            netWeightKg: increment(-kgToDeduct),
            status: nextStatus,
            lastUpdatedTimestamp: Date.now(),
          });

          transaction.set(invoiceRef, invoice);
        });
      } else {
        await setDoc(invoiceRef, invoice);
      }
    } catch (err: any) {
      if (
        err?.message?.includes('Existencia insuficiente') ||
        err?.message?.includes('FINALIZADO') ||
        err?.message?.includes('no existe')
      ) {
        throw err;
      }

      console.warn('[FinanceService] Transacción online de factura/lote falló, encolando en motor offline:', err);
      await offlineSyncEngine.enqueueMutation(
        INVOICES_COLLECTION,
        invoice.id,
        'SET',
        invoice,
        { offline: true }
      );
      if (hasDeduction && batchDeduction) {
        await offlineSyncEngine.enqueueMutation(
          'batches',
          batchDeduction.loteId,
          'UPDATE',
          {
            _increments: {
              currentCount: -Math.max(0, Math.floor(batchDeduction.cantidadUnidades || 0)),
              grossWeightKg: -centsRound(batchDeduction.cantidadKg || 0),
              netWeightKg: -centsRound(batchDeduction.cantidadKg || 0),
            },
            lastUpdatedTimestamp: Date.now(),
          },
          { offline: true, isDelta: true }
        );
      }
    }
  }

  /**
   * Guarda o actualiza una proforma de facturación bimonetaria (compatibilidad retrospectiva)
   */
  static async saveInvoice(invoice: BillingInvoice): Promise<void> {
    return this.saveInvoiceWithInventoryDeduction(invoice);
  }

  /**
   * Suscripción en tiempo real a las proformas de facturación
   */
  static subscribeInvoices(callback: (invoices: BillingInvoice[]) => void): () => void {
    const q = collection(db, INVOICES_COLLECTION);
    return onSnapshot(
      q,
      (snap) => {
        const list: BillingInvoice[] = [];
        snap.forEach((d) => list.push(d.data() as BillingInvoice));
        list.sort((a, b) => b.createdAt - a.createdAt);
        callback(list);
      },
      (err) => console.warn('Invoices onSnapshot fallback (offline):', err.message)
    );
  }

  /**
   * Suscripción en tiempo real al submódulo de Conciliación de Pagos (payment_reconciliations)
   */
  static subscribeReconciliations(callback: (reconciliations: PaymentReconciliation[]) => void): () => void {
    const q = collection(db, RECONCILIATIONS_COLLECTION);
    return onSnapshot(
      q,
      (snap) => {
        const list: PaymentReconciliation[] = [];
        snap.forEach((d) => list.push(d.data() as PaymentReconciliation));
        list.sort((a, b) => b.createdAt - a.createdAt);
        callback(list);
      },
      (err) => console.warn('Payment reconciliations onSnapshot fallback (offline):', err.message)
    );
  }

  /**
   * Registra una conciliación de pago en Firestore / IndexedDB con Snapshot criptográfico inmutable
   */
  static async saveReconciliation(reconciliation: PaymentReconciliation): Promise<void> {
    const docRef = doc(db, RECONCILIATIONS_COLLECTION, reconciliation.id);
    const enrichedReconciliation: PaymentReconciliation = {
      ...reconciliation,
      montoUSD: centsRound(reconciliation.montoUSD),
      montoVES: centsRound(reconciliation.montoVES),
      snapshot: reconciliation.snapshot || {
        frozenRate: reconciliation.tasaBcv,
        frozenUSD: centsRound(reconciliation.montoUSD),
        frozenVES: centsRound(reconciliation.montoVES),
        capturedAt: new Date().toISOString(),
        source: 'Motor Conciliación Dual v3.0 (ACID Snapshot)',
      },
      createdAt: reconciliation.createdAt || Date.now(),
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await offlineSyncEngine.enqueueMutation(
        RECONCILIATIONS_COLLECTION,
        enrichedReconciliation.id,
        'SET',
        enrichedReconciliation,
        { offline: true }
      );
      return;
    }

    try {
      await setDoc(docRef, enrichedReconciliation);
    } catch (err) {
      console.warn('Reconciliation saved via offline queue fallback:', err);
      await offlineSyncEngine.enqueueMutation(
        RECONCILIATIONS_COLLECTION,
        enrichedReconciliation.id,
        'SET',
        enrichedReconciliation,
        { offline: true }
      );
    }
  }
}

/**
 * Generador Canónico de Tabla de Amortización para Ventas a Crédito
 * Distribuye el saldo financiado de manera equitativa evitando discrepancias por redondeo.
 */
export function calculateInstallmentSchedule(
  totalFinanciadoUSD: number,
  numeroCuotas: number,
  frecuencia: string,
  fechaInicio: string,
  bcvRate: number
): InstallmentScheduleItem[] {
  if (numeroCuotas <= 0 || totalFinanciadoUSD <= 0) return [];
  const cuotaBaseUSD = centsRound(totalFinanciadoUSD / numeroCuotas);
  const startDate = new Date(fechaInicio || new Date().toISOString().split('T')[0]);

  const schedule: InstallmentScheduleItem[] = [];
  let remainingUSD = centsRound(totalFinanciadoUSD);

  for (let i = 1; i <= numeroCuotas; i++) {
    const dueDate = new Date(startDate);
    if (frecuencia === 'SEMANAL') {
      dueDate.setDate(dueDate.getDate() + i * 7);
    } else if (frecuencia === 'QUINCENAL') {
      dueDate.setDate(dueDate.getDate() + i * 15);
    } else if (frecuencia === 'MENSUAL') {
      dueDate.setMonth(dueDate.getMonth() + i);
    } else {
      dueDate.setDate(dueDate.getDate() + i * 30);
    }

    const currentCuotaUSD = i === numeroCuotas ? centsRound(remainingUSD) : cuotaBaseUSD;
    remainingUSD = centsRound(remainingUSD - currentCuotaUSD);

    schedule.push({
      cuotaNumero: i,
      fechaVencimiento: dueDate.toISOString().split('T')[0],
      montoUSD: currentCuotaUSD,
      montoVES: centsRound(currentCuotaUSD * bcvRate),
      tasaBcv: bcvRate,
      estado: 'PENDIENTE',
    });
  }

  return schedule;
}
