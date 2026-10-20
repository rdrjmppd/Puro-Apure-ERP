/**
 * Servicio Transaccional de Compras, Cuentas por Pagar (CxP) y Términos de Proveedores
 * Puro Apure ERP - Módulo Financiero
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  runTransaction,
  writeBatch,
  increment,
  arrayUnion,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { offlineSyncEngine } from './offlineSyncEngine';
import { centsRound } from './financialAnalyticsService';
import { BcvFeederService } from './bcvFeederService';
import { InventoryService } from './inventoryService';
import { ENTITIES_COLLECTION, PAYMENTS_COLLECTION } from './financeService';
import { DualEntity } from '../types/finance';
import {
  PurchaseInvoice,
  SupplierTerms,
  SupplyAlertConfig,
  PurchaseItem,
  LateFeeAdjustment,
} from '../types/purchasing';

export const PURCHASE_INVOICES_COLLECTION = 'purchase_invoices';
export const SUPPLIER_TERMS_COLLECTION = 'supplier_terms';
export const SUPPLY_ALERT_CONFIGS_COLLECTION = 'supply_alert_configs';

export interface CreatePurchaseInvoiceParams {
  idempotencyKey?: string;
  numeroFacturaProveedor: string;
  numeroControl?: string;
  proveedorId: string;
  proveedorNombre: string;
  proveedorRif: string;
  fechaEmision: string; // YYYY-MM-DD
  modalidad: 'CONTADO' | 'CREDITO';
  items: PurchaseItem[];
  notaRiesgoManual?: string;
  userId: string;
  customBcvRate?: number;
}

export interface RegisterSupplierPaymentParams {
  facturaId: string;
  montoUSD: number;
  metodoPago: string;
  bancoPlataforma: string;
  referencia: string;
  fecha: string;
  userId: string;
  customBcvRate?: number;
}

export class PurchasingService {
  // ==========================================================================
  // 1. TÉRMINOS Y CONDICIONES COMERCIALES DE PROVEEDORES
  // ==========================================================================

  static async getSupplierTerms(entityId: string): Promise<SupplierTerms | null> {
    try {
      const docRef = doc(db, SUPPLIER_TERMS_COLLECTION, entityId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data() as SupplierTerms;
      }
      return null;
    } catch (e) {
      console.warn('Error fetching supplier terms:', e);
      return null;
    }
  }

  static async saveSupplierTerms(
    terms: Omit<SupplierTerms, 'updatedAt'>,
    userId: string
  ): Promise<void> {
    const docRef = doc(db, SUPPLIER_TERMS_COLLECTION, terms.entityId);
    const payload: SupplierTerms = {
      ...terms,
      updatedAt: Date.now(),
      updatedBy: userId,
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await offlineSyncEngine.enqueueMutation(
        SUPPLIER_TERMS_COLLECTION,
        terms.entityId,
        'SET',
        payload,
        { offline: true }
      );
      return;
    }

    try {
      await setDoc(docRef, payload, { merge: true });
    } catch (e) {
      console.warn('Fallback offline para supplier terms:', e);
      await offlineSyncEngine.enqueueMutation(
        SUPPLIER_TERMS_COLLECTION,
        terms.entityId,
        'SET',
        payload,
        { offline: true }
      );
    }
  }

  static async listSupplierTerms(): Promise<SupplierTerms[]> {
    try {
      const snap = await getDocs(collection(db, SUPPLIER_TERMS_COLLECTION));
      const list: SupplierTerms[] = [];
      snap.forEach((d) => list.push(d.data() as SupplierTerms));
      return list;
    } catch (e) {
      console.warn('Error listing supplier terms:', e);
      return [];
    }
  }

  // ==========================================================================
  // 2. NIVELES CRÍTICOS Y ALARMAS DE INSUMOS
  // ==========================================================================

  static async getSupplyAlertConfig(inventoryItemId: string): Promise<SupplyAlertConfig | null> {
    try {
      const docRef = doc(db, SUPPLY_ALERT_CONFIGS_COLLECTION, inventoryItemId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data() as SupplyAlertConfig;
      }
      return null;
    } catch (e) {
      console.warn('Error fetching supply alert config:', e);
      return null;
    }
  }

  static async saveSupplyAlertConfig(
    config: Omit<SupplyAlertConfig, 'updatedAt'>,
    userId: string
  ): Promise<void> {
    const docRef = doc(db, SUPPLY_ALERT_CONFIGS_COLLECTION, config.inventoryItemId);
    const payload: SupplyAlertConfig = {
      ...config,
      updatedAt: Date.now(),
      updatedBy: userId,
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await offlineSyncEngine.enqueueMutation(
        SUPPLY_ALERT_CONFIGS_COLLECTION,
        config.inventoryItemId,
        'SET',
        payload,
        { offline: true }
      );
      return;
    }

    try {
      await setDoc(docRef, payload, { merge: true });
    } catch (e) {
      console.warn('Fallback offline para supply alert config:', e);
      await offlineSyncEngine.enqueueMutation(
        SUPPLY_ALERT_CONFIGS_COLLECTION,
        config.inventoryItemId,
        'SET',
        payload,
        { offline: true }
      );
    }
  }

  static subscribeSupplyAlertConfigs(
    callback: (configs: Map<string, SupplyAlertConfig>) => void
  ): () => void {
    const colRef = collection(db, SUPPLY_ALERT_CONFIGS_COLLECTION);
    return onSnapshot(
      colRef,
      (snap) => {
        const map = new Map<string, SupplyAlertConfig>();
        snap.forEach((d) => map.set(d.id, d.data() as SupplyAlertConfig));
        callback(map);
      },
      (err) => console.warn('Snapshot error in supply alert configs:', err)
    );
  }

  // ==========================================================================
  // 3. GESTIÓN Y ALTA RÁPIDA DE PROVEEDORES
  // ==========================================================================

  /**
   * Busca si existe un proveedor por RIF normalizado.
   * Si existe como cliente pero no proveedor, agrega rol PROVEEDOR.
   * Si no existe, crea una nueva DualEntity con rol PROVEEDOR.
   */
  static async findOrCreateSupplierByRif(
    rif: string,
    name: string,
    phone: string,
    address: string,
    userId: string
  ): Promise<DualEntity> {
    const cleanRif = rif.trim().toUpperCase().replace(/[\s-]/g, '');
    const colRef = collection(db, ENTITIES_COLLECTION);
    const q = query(colRef, where('rifCedula', '==', cleanRif));
    const snap = await getDocs(q);

    if (!snap.empty) {
      const existing = snap.docs[0].data() as DualEntity;
      if (!existing.roles.includes('PROVEEDOR')) {
        const docRef = doc(db, ENTITIES_COLLECTION, existing.id);
        await updateDoc(docRef, {
          roles: arrayUnion('PROVEEDOR'),
          lastUpdatedTimestamp: Date.now(),
        });
        existing.roles.push('PROVEEDOR');
      }
      return existing;
    }

    // Crear nueva entidad proveedor
    const newId = `prov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newEntity: DualEntity = {
      id: newId,
      name,
      razonSocial: name,
      rifCedula: cleanRif,
      identificacionFiscal: cleanRif,
      roles: ['PROVEEDOR'],
      city: 'San Fernando de Apure',
      address: address || 'Apure',
      direccionFiscal: address || 'Apure',
      phone: phone || '',
      telefonoContacto: phone || '',
      balanceUSD: 0,
      balanceVES: 0,
      balancePorCobrarUSD: 0,
      balancePorPagarUSD: 0,
      balancePorCobrarVES: 0,
      balancePorPagarVES: 0,
      lastUpdatedTimestamp: Date.now(),
    };

    const docRef = doc(db, ENTITIES_COLLECTION, newId);
    await setDoc(docRef, newEntity);
    return newEntity;
  }

  // ==========================================================================
  // 4. FACTURAS DE COMPRA Y CUENTAS POR PAGAR (CxP)
  // ==========================================================================

  static async createPurchaseInvoice(
    params: CreatePurchaseInvoiceParams
  ): Promise<PurchaseInvoice> {
    const invoiceId = `cxp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const idempotencyKey = params.idempotencyKey || `idemp_${invoiceId}`;

    // 1. Obtener tasa BCV (histórica de fechaEmision o provista)
    const bcvRate = params.customBcvRate || (await BcvFeederService.fetchRateForDate(params.fechaEmision));

    // 2. Calcular montos
    let totalUSD = 0;
    for (const item of params.items) {
      totalUSD += centsRound(item.cantidad * item.costoUnitarioUSD);
    }
    totalUSD = centsRound(totalUSD);
    const totalVES = centsRound(totalUSD * bcvRate);

    // 3. Obtener condiciones del proveedor
    const terms = await this.getSupplierTerms(params.proveedorId);
    const diasCalle = params.modalidad === 'CONTADO' ? 0 : (terms?.diasCalle || 15);

    // Calcular fechaVencimiento: fechaEmision + diasCalle
    const [eY, eM, eD] = params.fechaEmision.split('-').map(Number);
    const fechaVenc = new Date(eY, eM - 1, eD + diasCalle, 12, 0, 0);
    const vY = fechaVenc.getFullYear();
    const vM = String(fechaVenc.getMonth() + 1).padStart(2, '0');
    const vD = String(fechaVenc.getDate()).padStart(2, '0');
    const fechaVencimiento = `${vY}-${vM}-${vD}`;

    const condicionesAplicadas = {
      diasCalle,
      diasGracia: terms?.diasGracia || 0,
      aplicaMora: terms?.aplicaMora || false,
      tasaMoraPorcentaje: terms?.tasaMoraPorcentaje || 0,
      periodicidadMora: terms?.periodicidadMora || 'MENSUAL',
      penalizacionFijaUSD: terms?.penalizacionFijaUSD || 0,
    };

    const isContado = params.modalidad === 'CONTADO';
    const saldoPendienteUSD = isContado ? 0 : totalUSD;
    const estadoPago = isContado ? 'PAGADA' : 'PENDIENTE';

    const invoice: PurchaseInvoice = {
      id: invoiceId,
      idempotencyKey,
      numeroFacturaProveedor: params.numeroFacturaProveedor,
      numeroControl: params.numeroControl,
      proveedorId: params.proveedorId,
      proveedorNombre: params.proveedorNombre,
      proveedorRif: params.proveedorRif,
      fechaEmision: params.fechaEmision,
      fechaVencimiento,
      modalidad: params.modalidad,
      items: params.items,
      totalUSD,
      totalVES,
      tasaBcv: bcvRate,
      snapshot: {
        frozenRate: bcvRate,
        frozenUSD: totalUSD,
        frozenVES: totalVES,
        capturedAt: new Date().toISOString(),
        source: 'BCV Histórico / Compra Proveedor',
      },
      saldoPendienteUSD,
      estadoPago,
      condicionesAplicadas,
      notaRiesgoManual: params.notaRiesgoManual || terms?.notaRiesgoManual,
      inventarioAplicado: true,
      pagosIds: [],
      createdAt: Date.now(),
      createdBy: params.userId,
    };

    const invoiceDocRef = doc(db, PURCHASE_INVOICES_COLLECTION, invoiceId);
    const entityDocRef = doc(db, ENTITIES_COLLECTION, params.proveedorId);

    // Si está offline, guardar encolando
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await offlineSyncEngine.enqueueMutation(
        PURCHASE_INVOICES_COLLECTION,
        invoiceId,
        'SET',
        invoice,
        { offline: true, idempotencyKey }
      );
      if (!isContado) {
        await offlineSyncEngine.enqueueMutation(
          ENTITIES_COLLECTION,
          params.proveedorId,
          'UPDATE',
          {
            _increments: {
              balanceUSD: -totalUSD,
              balanceVES: -totalVES,
              balancePorPagarUSD: totalUSD,
              balancePorPagarVES: totalVES,
            },
            lastUpdatedTimestamp: Date.now(),
          },
          { offline: true }
        );
      }
      // Sumar ítems a inventario offline
      for (const item of params.items) {
        if (item.ingresaAInventario && item.inventoryItemId) {
          await InventoryService.receivePurchaseStock(
            item.inventoryItemId,
            item.cantidad,
            item.costoUnitarioUSD,
            params.userId
          );
        }
      }
      return invoice;
    }

    // Modo online con transacción ACID
    try {
      await runTransaction(db, async (transaction) => {
        // Guardar factura
        transaction.set(invoiceDocRef, invoice);

        // Si es a crédito, impactar balances del proveedor
        if (!isContado) {
          transaction.update(entityDocRef, {
            balanceUSD: increment(-totalUSD),
            balanceVES: increment(-totalVES),
            balancePorPagarUSD: increment(totalUSD),
            balancePorPagarVES: increment(totalVES),
            lastUpdatedTimestamp: Date.now(),
          });
        }
      });

      // Sumar ítems de inventario
      for (const item of params.items) {
        if (item.ingresaAInventario && item.inventoryItemId) {
          await InventoryService.receivePurchaseStock(
            item.inventoryItemId,
            item.cantidad,
            item.costoUnitarioUSD,
            params.userId
          );
        }
      }

      // Si fue de contado, registrar el asiento de pago efectivo en payments
      if (isContado) {
        await this.recordCashPurchasePayment(invoice, params.userId);
      }

      return invoice;
    } catch (err) {
      console.warn('Fallo en transacción de compra, encolando offline:', err);
      await offlineSyncEngine.enqueueMutation(
        PURCHASE_INVOICES_COLLECTION,
        invoiceId,
        'SET',
        invoice,
        { offline: true, idempotencyKey }
      );
      return invoice;
    }
  }

  /**
   * Registra un pago o abono contra una factura de proveedor (CxP)
   */
  static async registerSupplierPayment(
    params: RegisterSupplierPaymentParams
  ): Promise<void> {
    const paymentId = `pay_cxp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const invoiceDocRef = doc(db, PURCHASE_INVOICES_COLLECTION, params.facturaId);

    // Leer la factura para verificar saldo
    const invoiceSnap = await getDoc(invoiceDocRef);
    if (!invoiceSnap.exists()) {
      throw new Error(`Factura CxP #${params.facturaId} no encontrada.`);
    }

    const invoice = invoiceSnap.data() as PurchaseInvoice;
    if (invoice.estadoPago === 'PAGADA' || invoice.estadoPago === 'ANULADA') {
      throw new Error(`La factura ya está ${invoice.estadoPago}.`);
    }

    const montoUSD = centsRound(params.montoUSD);
    if (montoUSD <= 0) {
      throw new Error('El monto de abono debe ser mayor a 0.');
    }
    if (montoUSD > invoice.saldoPendienteUSD + 0.01) {
      throw new Error(`El abono ($${montoUSD}) supera el saldo pendiente ($${invoice.saldoPendienteUSD}).`);
    }

    const nuevoSaldo = centsRound(Math.max(0, invoice.saldoPendienteUSD - montoUSD));
    const nuevoEstado = nuevoSaldo <= 0 ? 'PAGADA' : 'PARCIAL';
    const bcvRate = params.customBcvRate || (await BcvFeederService.fetchRateForDate(params.fecha));
    const montoVES = centsRound(montoUSD * bcvRate);

    const paymentRecord = {
      id: paymentId,
      date: params.fecha,
      paymentMode: params.metodoPago,
      platform: params.bancoPlataforma,
      reference: params.referencia,
      idDocument: invoice.proveedorRif,
      entityId: invoice.proveedorId,
      entityName: invoice.proveedorNombre,
      city: 'San Fernando de Apure',
      linkedInvoice: invoice.numeroFacturaProveedor,
      impactType: 'EGRESO_PROVEEDOR',
      amountUSD: montoUSD,
      amountVES: montoVES,
      bcvRate,
      isReconciled: true,
      snapshot: {
        frozenRate: bcvRate,
        frozenUSD: montoUSD,
        frozenVES: montoVES,
        capturedAt: new Date().toISOString(),
        source: 'Pago a Proveedor CxP',
      },
      createdAt: Date.now(),
      updatedBy: params.userId,
    };

    const paymentDocRef = doc(db, PAYMENTS_COLLECTION, paymentId);
    const entityDocRef = doc(db, ENTITIES_COLLECTION, invoice.proveedorId);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await offlineSyncEngine.enqueueMutation(
        PURCHASE_INVOICES_COLLECTION,
        invoice.id,
        'UPDATE',
        {
          saldoPendienteUSD: nuevoSaldo,
          estadoPago: nuevoEstado,
          pagosIds: arrayUnion(paymentId),
        },
        { offline: true }
      );
      await offlineSyncEngine.enqueueMutation(
        PAYMENTS_COLLECTION,
        paymentId,
        'SET',
        paymentRecord,
        { offline: true }
      );
      await offlineSyncEngine.enqueueMutation(
        ENTITIES_COLLECTION,
        invoice.proveedorId,
        'UPDATE',
        {
          _increments: {
            balanceUSD: montoUSD,
            balanceVES: montoVES,
            balancePorPagarUSD: -montoUSD,
            balancePorPagarVES: -montoVES,
          },
          lastUpdatedTimestamp: Date.now(),
        },
        { offline: true }
      );
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        // Actualizar factura
        transaction.update(invoiceDocRef, {
          saldoPendienteUSD: nuevoSaldo,
          estadoPago: nuevoEstado,
          pagosIds: arrayUnion(paymentId),
        });

        // Crear asiento de egreso en payments
        transaction.set(paymentDocRef, paymentRecord);

        // Descontar pasivo en dual_entities
        transaction.update(entityDocRef, {
          balanceUSD: increment(montoUSD),
          balanceVES: increment(montoVES),
          balancePorPagarUSD: increment(-montoUSD),
          balancePorPagarVES: increment(-montoVES),
          lastUpdatedTimestamp: Date.now(),
        });
      });
    } catch (err) {
      console.warn('Error en transacción de pago a proveedor, encolando offline:', err);
      await offlineSyncEngine.enqueueMutation(
        PURCHASE_INVOICES_COLLECTION,
        invoice.id,
        'UPDATE',
        {
          saldoPendienteUSD: nuevoSaldo,
          estadoPago: nuevoEstado,
          pagosIds: arrayUnion(paymentId),
        },
        { offline: true }
      );
    }
  }

  /**
   * Aplica un recargo por mora confirmado manualmente por el usuario.
   * Se añade al saldo exigible y se audita en ajustesMora[].
   */
  static async applyLateFeeAdjustment(
    invoiceId: string,
    montoUSD: number,
    motivo: string,
    userId: string
  ): Promise<void> {
    const cleanMonto = centsRound(montoUSD);
    if (cleanMonto <= 0) return;

    const adjustment: LateFeeAdjustment = {
      id: `adj_${Date.now()}`,
      fecha: new Date().toISOString().split('T')[0],
      montoUSD: cleanMonto,
      motivo: motivo || 'Recargo por mora y penalización contractual',
      aplicadoPor: userId,
      timestamp: Date.now(),
    };

    const invoiceDocRef = doc(db, PURCHASE_INVOICES_COLLECTION, invoiceId);
    await updateDoc(invoiceDocRef, {
      saldoPendienteUSD: increment(cleanMonto),
      ajustesMora: arrayUnion(adjustment),
    });
  }

  /**
   * Anula una factura de compra solo si no tiene pagos aplicados
   */
  static async annulPurchaseInvoice(
    invoiceId: string,
    motivo: string,
    userId: string
  ): Promise<void> {
    const invoiceDocRef = doc(db, PURCHASE_INVOICES_COLLECTION, invoiceId);
    const snap = await getDoc(invoiceDocRef);
    if (!snap.exists()) throw new Error('Factura no encontrada.');

    const invoice = snap.data() as PurchaseInvoice;
    if (invoice.pagosIds && invoice.pagosIds.length > 0) {
      throw new Error('No se puede anular una factura con pagos registrados. Anule primero los pagos.');
    }

    const batch = writeBatch(db);
    batch.update(invoiceDocRef, {
      estadoPago: 'ANULADA',
      anuladaMotivo: motivo,
      saldoPendienteUSD: 0,
    });

    // Revertir pasivo si fue a crédito
    if (invoice.modalidad === 'CREDITO') {
      const entityDocRef = doc(db, ENTITIES_COLLECTION, invoice.proveedorId);
      batch.update(entityDocRef, {
        balanceUSD: increment(invoice.totalUSD),
        balanceVES: increment(invoice.totalVES),
        balancePorPagarUSD: increment(-invoice.totalUSD),
        balancePorPagarVES: increment(-invoice.totalVES),
        lastUpdatedTimestamp: Date.now(),
      });
    }

    await batch.commit();
  }

  static async listOpenPayables(): Promise<PurchaseInvoice[]> {
    try {
      const colRef = collection(db, PURCHASE_INVOICES_COLLECTION);
      const q = query(
        colRef,
        where('estadoPago', 'in', ['PENDIENTE', 'PARCIAL']),
        orderBy('fechaVencimiento', 'asc')
      );
      const snap = await getDocs(q);
      const list: PurchaseInvoice[] = [];
      snap.forEach((d) => list.push(d.data() as PurchaseInvoice));
      return list;
    } catch (e) {
      console.warn('Error listing open payables:', e);
      return [];
    }
  }

  static subscribePurchaseInvoices(
    callback: (invoices: PurchaseInvoice[]) => void
  ): () => void {
    const colRef = collection(db, PURCHASE_INVOICES_COLLECTION);
    return onSnapshot(
      colRef,
      (snap) => {
        const list: PurchaseInvoice[] = [];
        snap.forEach((d) => list.push(d.data() as PurchaseInvoice));
        // Orden descendente por fecha de emisión
        list.sort((a, b) => b.createdAt - a.createdAt);
        callback(list);
      },
      (err) => console.warn('Snapshot error in purchase invoices:', err)
    );
  }

  private static async recordCashPurchasePayment(
    invoice: PurchaseInvoice,
    userId: string
  ): Promise<void> {
    const paymentId = `pay_cash_${invoice.id}`;
    const paymentRecord = {
      id: paymentId,
      date: invoice.fechaEmision,
      paymentMode: 'TRANSFERENCIA',
      platform: 'Caja / Banco Operativo',
      reference: `CONTADO-${invoice.numeroFacturaProveedor}`,
      idDocument: invoice.proveedorRif,
      entityId: invoice.proveedorId,
      entityName: invoice.proveedorNombre,
      city: 'San Fernando de Apure',
      linkedInvoice: invoice.numeroFacturaProveedor,
      impactType: 'EGRESO_PROVEEDOR',
      amountUSD: invoice.totalUSD,
      amountVES: invoice.totalVES,
      bcvRate: invoice.tasaBcv,
      isReconciled: true,
      snapshot: invoice.snapshot,
      createdAt: Date.now(),
      updatedBy: userId,
    };
    const paymentDocRef = doc(db, PAYMENTS_COLLECTION, paymentId);
    await setDoc(paymentDocRef, paymentRecord);
  }
}
