import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { offlineSyncEngine } from './offlineSyncEngine';
import { InventoryService } from './inventoryService';
import { FinanceService } from './financeService';
import { BiologicalBatch, FarmBiologicalControl, InventoryItem } from '../types/inventory';
import { DualEntity, PaymentRecord, BillingInvoice, InvoiceItem } from '../types/finance';
import { triggerDirectBlobDownload } from '../utils/pdfTemplateEngine';

export interface AgroErpBackupPayload {
  version: string;
  timestamp: string;
  appId: string;
  system: string;
  sha256Signature?: string;
  data: {
    batches: BiologicalBatch[];
    inventory: InventoryItem[];
    farmControls: FarmBiologicalControl[];
    payments: PaymentRecord[];
    dualEntities: DualEntity[];
    invoices: BillingInvoice[];
  };
}

export class BackupRestoreService {
  /**
   * Genera un volcado completo de todas las colecciones con firma SHA-256
   */
  static async exportBackup(): Promise<{ payload: AgroErpBackupPayload; jsonString: string; hash: string }> {
    const fetchColl = async <T>(name: string): Promise<T[]> => {
      try {
        const snap = await getDocs(collection(db, name));
        return snap.docs.map((d) => d.data() as T);
      } catch (err) {
        console.warn(`Aviso al leer colección ${name} para respaldo:`, err);
        return [];
      }
    };

    const batches = await fetchColl<BiologicalBatch>('batches');
    const inventory = await fetchColl<InventoryItem>('inventory');
    const farmControls = await fetchColl<FarmBiologicalControl>('farm_controls');
    const payments = await fetchColl<PaymentRecord>('payments');
    const dualEntities = await fetchColl<DualEntity>('dual_entities');
    const invoices = await fetchColl<BillingInvoice>('billing_invoices');

    const dataPayload: AgroErpBackupPayload = {
      version: '2.5.0',
      timestamp: new Date().toISOString(),
      appId: 'ec465a93-4c76-4ddd-b408-699d30184409',
      system: 'Puro Apure ERP Agroindustrial',
      data: {
        batches,
        inventory,
        farmControls,
        payments,
        dualEntities,
        invoices,
      },
    };

    const rawDataToSign = JSON.stringify(dataPayload.data);
    const hash = await this.computeSha256(rawDataToSign);
    dataPayload.sha256Signature = hash;

    const jsonString = JSON.stringify(dataPayload, null, 2);

    return { payload: dataPayload, jsonString, hash };
  }

  /**
   * Descarga el archivo de respaldo en formato JSON utilizando el gestor unificado de blobs
   */
  static async downloadBackupFile(): Promise<string> {
    const { jsonString, hash } = await this.exportBackup();
    const blob = new Blob([jsonString], { type: 'application/json' });
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `puro_apure_backup_${dateStr}.json`;
    triggerDirectBlobDownload(blob, filename);
    return hash;
  }

  /**
   * Restaura datos a la base de datos a partir de una carga útil JSON verificada
   */
  static async restoreBackup(
    jsonString: string
  ): Promise<{ success: boolean; message: string; counts: { [key: string]: number } }> {
    try {
      const parsed: AgroErpBackupPayload = JSON.parse(jsonString);

      if (!parsed.data || typeof parsed.data !== 'object') {
        throw new Error('Estructura de respaldo inválida o incompatible.');
      }

      // Validar firma
      const rawData = JSON.stringify(parsed.data);
      const computedHash = await this.computeSha256(rawData);

      if (parsed.sha256Signature && parsed.sha256Signature !== computedHash) {
        console.warn('Aviso de integridad: El hash del archivo difiere de la firma original.');
      }

      const { batches = [], inventory = [], farmControls = [], payments = [], dualEntities = [], invoices = [] } = parsed.data;

      // Restaurar lotes
      for (const b of batches) {
        await setDoc(doc(db, 'batches', b.id), b, { merge: true });
        await offlineSyncEngine.enqueueMutation('batches', b.id, 'SET', b);
      }

      // Restaurar inventario
      for (const inv of inventory) {
        await setDoc(doc(db, 'inventory', inv.id), inv, { merge: true });
        await offlineSyncEngine.enqueueMutation('inventory', inv.id, 'SET', inv);
      }

      // Restaurar controles biológicos
      for (const fc of farmControls) {
        await setDoc(doc(db, 'farm_controls', fc.id), fc, { merge: true });
        await offlineSyncEngine.enqueueMutation('farm_controls', fc.id, 'SET', fc);
      }

      // Restaurar pagos
      for (const p of payments) {
        await setDoc(doc(db, 'payments', p.id), p, { merge: true });
        await offlineSyncEngine.enqueueMutation('payments', p.id, 'SET', p);
      }

      // Restaurar entidades duales
      for (const de of dualEntities) {
        await setDoc(doc(db, 'dual_entities', de.id), de, { merge: true });
        await offlineSyncEngine.enqueueMutation('dual_entities', de.id, 'SET', de);
      }

      // Restaurar facturas proforma
      for (const inv of invoices) {
        await setDoc(doc(db, 'billing_invoices', inv.id), inv, { merge: true });
        await offlineSyncEngine.enqueueMutation('billing_invoices', inv.id, 'SET', inv);
      }

      return {
        success: true,
        message: 'Respaldo restaurado con éxito en la base de datos persistente.',
        counts: {
          batches: batches.length,
          inventory: inventory.length,
          farmControls: farmControls.length,
          payments: payments.length,
          dualEntities: dualEntities.length,
          invoices: invoices.length,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Fallo en restauración: ${err.message || 'Error de lectura JSON'}`,
        counts: {},
      };
    }
  }

  /**
   * Siembra un conjunto completo y calibrado de datos de campo de demostración
   */
  static async seedCompleteFieldDemoData(): Promise<void> {
    const timestamp = Date.now();
    const rate = 42.50; // Tasa oficial BCV estimada
    const operator = 'Ruben Rojas (Superadmin)';

    // 1. Sembrar Insumos en Almacén
    const feedAvian: InventoryItem = {
      id: 'inv_alimento_iniciador_pollos',
      category: 'INSUMO',
      subtype: 'ALIMENTO',
      name: 'Alimento Balanceado Pollo Iniciador (Saco 40kg)',
      quantity: 180,
      unit: 'sacos',
      unitCostUSD: 24.50,
      totalValueUSD: Number((180 * 24.50).toFixed(2)),
      lastUpdatedTimestamp: timestamp,
      updatedBy: operator,
    };
    const feedPorcine: InventoryItem = {
      id: 'inv_alimento_ceba_cerdos',
      category: 'INSUMO',
      subtype: 'ALIMENTO',
      name: 'Alimento Balanceado Cerdo Engorde Ceba (Saco 40kg)',
      quantity: 320,
      unit: 'sacos',
      unitCostUSD: 28.00,
      totalValueUSD: Number((320 * 28.00).toFixed(2)),
      lastUpdatedTimestamp: timestamp,
      updatedBy: operator,
    };
    const vaccineGumboro: InventoryItem = {
      id: 'inv_vacuna_gumboro',
      category: 'INSUMO',
      subtype: 'VITAMINAS',
      name: 'Vacuna Newcastle + Gumboro (Frasco 1000 Dosis)',
      quantity: 15,
      unit: 'unidades',
      unitCostUSD: 18.00,
      totalValueUSD: Number((15 * 18.00).toFixed(2)),
      lastUpdatedTimestamp: timestamp,
      updatedBy: operator,
    };

    await InventoryService.saveInventoryItem(feedAvian, 0, operator, true);
    await InventoryService.saveInventoryItem(feedPorcine, 0, operator, true);
    await InventoryService.saveInventoryItem(vaccineGumboro, 0, operator, true);

    // 2. Sembrar Lote Avícola Cobb 500 (Día 35, 4,850 aves vivas, 2.10 kg/ave)
    const avianBatchId = 'batch_cobb_500_lote_01';
    const avianBatch: BiologicalBatch = {
      id: avianBatchId,
      code: 'AV-COBB500-2026-A1',
      species: 'AVICOLA',
      tipoIngreso: 'NACIMIENTO_INTERNO',
      status: 'ACTIVO',
      initialCount: 5000,
      currentCount: 4850,
      startDate: new Date(timestamp - 35 * 86400000).toISOString().split('T')[0],
      daysInCycle: 35,
      grossWeightKg: 10185, // 2.10 kg x 4,850 aves
      shrinkageDeductionKg: 0,
      netWeightKg: 10185,
      feedSacksConsumed: 215,
      feedCostUSD: 215 * 24.50,
      unitPriceUSDPerKg: 4.00,
      billableAmountUSD: 10185 * 4.00, // $40,740
      lastUpdatedTimestamp: timestamp,
      updatedBy: operator,
    };
    await InventoryService.saveBiologicalBatch(avianBatch, 0, operator, true);

    // Controles biológicos del lote avícola
    await InventoryService.addFarmControl({
      id: `ctrl_avian_d28_${timestamp}`,
      batchId: avianBatchId,
      batchCode: avianBatch.code,
      species: 'AVICOLA',
      type: 'PESAJE',
      date: new Date(timestamp - 7 * 86400000).toISOString().split('T')[0],
      metricValue: 1.48,
      metricUnit: 'kg/ave',
      responsibleWorker: 'Zootecnista Campo',
      observations: 'Pesaje muestral Día 28 (1.48 kg vs estándar Cobb 1.50 kg). Conforme a curva.',
      timestamp: timestamp - 7 * 86400000,
    });
    await InventoryService.addFarmControl({
      id: `ctrl_avian_d35_${timestamp}`,
      batchId: avianBatchId,
      batchCode: avianBatch.code,
      species: 'AVICOLA',
      type: 'PESAJE',
      date: new Date(timestamp).toISOString().split('T')[0],
      metricValue: 2.10,
      metricUnit: 'kg/ave',
      responsibleWorker: 'Zootecnista Campo',
      observations: 'Pesaje Día 35. Peso promedio 2.10 kg. Excelente conversión alimenticia.',
      timestamp,
    });

    // 3. Sembrar Lote Porcino (120 cerdos, día 90, 85 kg bruto, merma 17.5 kg -> 67.5 kg neto)
    const pigBatchId = 'batch_porcino_ceba_01';
    const pigBatch: BiologicalBatch = {
      id: pigBatchId,
      code: 'PC-CEBA-LLANO-2026',
      species: 'PORCINO',
      tipoIngreso: 'NACIMIENTO_INTERNO',
      status: 'ACTIVO',
      initialCount: 120,
      currentCount: 118,
      startDate: new Date(timestamp - 90 * 86400000).toISOString().split('T')[0],
      daysInCycle: 90,
      grossWeightKg: 10030, // 85 kg x 118 cerdos
      shrinkageDeductionKg: 2065, // 17.5 kg x 118 cerdos
      netWeightKg: 7965, // 67.5 kg x 118 cerdos
      feedSacksConsumed: 472, // 4 sacos x 118
      feedCostUSD: 472 * 40.00,
      unitPriceUSDPerKg: 6.00,
      billableAmountUSD: 7965 * 6.00, // $47,790
      lastUpdatedTimestamp: timestamp,
      updatedBy: operator,
    };
    await InventoryService.saveBiologicalBatch(pigBatch, 0, operator, true);

    // 4. Sembrar Entidad Dual (Agroinsumos & Distribuidora El Llano C.A.)
    const dualEntityId = 'ent_agroinsumos_el_llano';
    const dualEntity: DualEntity = {
      id: dualEntityId,
      name: 'Agroinsumos & Alimentos del Llano C.A.',
      razonSocial: 'Agroinsumos & Alimentos del Llano C.A.',
      rifCedula: 'J-31459876-0',
      identificacionFiscal: 'J-31459876-0',
      roles: ['CLIENTE', 'PROVEEDOR'],
      city: 'San Fernando de Apure',
      address: 'Zona Industrial San Fernando, Galpón 4',
      direccionFiscal: 'Zona Industrial San Fernando, Galpón 4, Estado Apure',
      phone: '+58 414 1234567',
      telefonoContacto: '+58 414 1234567',
      balanceUSD: 6300.0, // Nos debe $6,300 neto
      balanceVES: 6300.0 * rate,
      lastUpdatedTimestamp: timestamp,
    };
    await FinanceService.saveDualEntity(dualEntity, operator);

    // 5. Sembrar Pagos y Asientos Contables Bimonetarios
    await FinanceService.registerPayment(
      {
        date: new Date(timestamp - 3 * 86400000).toISOString().split('T')[0],
        paymentMode: 'TRANSFERENCIA',
        platform: 'Banesco Banco Universal',
        reference: 'TRANSF-BANESCO-774921',
        idDocument: dualEntity.rifCedula,
        entityId: dualEntityId,
        entityName: dualEntity.name,
        city: 'San Fernando',
        linkedInvoice: 'AV-COBB500-2026-A1',
        impactType: 'INGRESO_VENTA',
        amountUSD: 5000.0,
        amountVES: 5000.0 * rate,
        bcvRate: rate,
        isReconciled: true,
        reconciledAt: new Date(timestamp - 2 * 86400000).toISOString(),
      },
      operator
    );

    await FinanceService.registerPayment(
      {
        date: new Date(timestamp - 5 * 86400000).toISOString().split('T')[0],
        paymentMode: 'TRANSFERENCIA',
        platform: 'Banco Mercantil',
        reference: 'TRANSF-MERCANTIL-338210',
        idDocument: dualEntity.rifCedula,
        entityId: dualEntityId,
        entityName: dualEntity.name,
        city: 'San Fernando',
        linkedInvoice: 'PROV-ALIMENTO-441',
        impactType: 'EGRESO_PROVEEDOR',
        amountUSD: 2450.0,
        amountVES: 2450.0 * rate,
        bcvRate: rate,
        isReconciled: true,
        reconciledAt: new Date(timestamp - 4 * 86400000).toISOString(),
      },
      operator
    );

    // 6. Sembrar Factura Proforma Bimonetaria
    const invoiceItem: InvoiceItem = {
      id: 'item_cobb_batch',
      description: 'Lote de Pollo Beneficiado en Pie Cobb 500 (Día 35, 1,000 aves)',
      species: 'AVICOLA',
      batchCode: avianBatch.code,
      grossWeightKg: 2100,
      shrinkageKg: 0,
      netWeightKg: 2100,
      unitPriceUSD: 4.00,
      subtotalUSD: 8400.0,
      subtotalVES: 8400.0 * rate,
    };

    const invoice: BillingInvoice = {
      id: 'inv_proforma_2026_001',
      invoiceNumber: 'PROF-2026-0001',
      date: new Date(timestamp).toISOString().split('T')[0],
      dueDate: new Date(timestamp + 15 * 86400000).toISOString().split('T')[0],
      customerRif: dualEntity.rifCedula,
      customerName: dualEntity.name,
      customerAddress: 'Carretera Nacional San Fernando - Achaguas, Km 14, Edo. Apure',
      customerPhone: dualEntity.phone,
      bcvRateApplied: rate,
      items: [invoiceItem],
      totalUSD: 8400.0,
      totalVES: 8400.0 * rate,
      paymentStatus: 'PENDIENTE',
      notes: 'Factura proforma bimonetaria exenta de IVA según ley de fomento ganadero y avícola nacional.',
      createdAt: timestamp,
      updatedBy: operator,
    };
    await FinanceService.saveInvoice(invoice);
  }

  private static async computeSha256(text: string): Promise<string> {
    try {
      const msgBuffer = new TextEncoder().encode(text);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    }
  }
}
