/**
 * Puro Apure ERP - Human Resources & Operational KPIs Service Layer
 * Gestiona el catálogo de talento humano, nómina fija, honorarios profesionales
 * y contadores atómicos en tiempo real sobre el documento centralizado hr_stats.
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  increment,
  query,
  orderBy,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  HumanResourceRecord,
  NominaFijaEmployee,
  HonorariosEmployee,
  HRStats,
  ContractType,
} from '../types/humanResources';
import { offlineSyncEngine } from './offlineSyncEngine';
import { FinanceService } from './financeService';
import { PaymentRecord, PaymentMode } from '../types/finance';

export const HR_COLLECTION = 'human_resources';
export const HR_STATS_DOC_ID = 'hr_stats';

const DEFAULT_HR_STATS: HRStats = {
  id: HR_STATS_DOC_ID,
  activeNominaFijaCount: 0,
  activeHonorariosCount: 0,
  totalActiveCount: 0,
  totalInactiveCount: 0,
  totalMonthlyNominaUSD: 0,
  totalMonthlyHonorariosUSD: 0,
  lastUpdatedTimestamp: Date.now(),
  lastUpdatedBy: 'system',
};

export class HumanResourcesService {
  /**
   * Obtiene o inicializa el documento de metadatos centralizado hr_stats
   */
  static async getHRStats(): Promise<HRStats> {
    if (!db) return DEFAULT_HR_STATS;
    try {
      const statsRef = doc(db, HR_COLLECTION, HR_STATS_DOC_ID);
      const snap = await getDoc(statsRef);
      if (snap.exists()) {
        return snap.data() as HRStats;
      }
      // Inicializar si no existe
      await setDoc(statsRef, DEFAULT_HR_STATS);
      return DEFAULT_HR_STATS;
    } catch (err) {
      console.warn('[HR Service] Error obteniendo hr_stats, usando fallback:', err);
      return DEFAULT_HR_STATS;
    }
  }

  /**
   * Suscripción reactiva al documento de metadatos centralizado hr_stats
   */
  static subscribeHRStats(callback: (stats: HRStats) => void): Unsubscribe {
    if (!db) {
      callback(DEFAULT_HR_STATS);
      return () => {};
    }

    const statsRef = doc(db, HR_COLLECTION, HR_STATS_DOC_ID);
    return onSnapshot(
      statsRef,
      (snap) => {
        if (snap.exists()) {
          callback(snap.data() as HRStats);
        } else {
          // Inicialización lazy
          setDoc(statsRef, DEFAULT_HR_STATS).catch(() => {});
          callback(DEFAULT_HR_STATS);
        }
      },
      (err) => {
        console.warn('[HR Service] Error en snapshot de hr_stats (offline fallback):', err.message);
        callback(DEFAULT_HR_STATS);
      }
    );
  }

  /**
   * Suscripción reactiva a la lista de trabajadores (excluye el documento de metadatos hr_stats)
   */
  static subscribeEmployees(
    callback: (employees: HumanResourceRecord[]) => void,
    typeFilter?: ContractType
  ): Unsubscribe {
    if (!db) {
      callback([]);
      return () => {};
    }

    const collRef = collection(db, HR_COLLECTION);
    const q = query(collRef, orderBy('lastUpdatedTimestamp', 'desc'));

    return onSnapshot(
      q,
      (snap) => {
        const list: HumanResourceRecord[] = [];
        snap.forEach((d) => {
          // Excluir el documento de metadatos hr_stats
          if (d.id !== HR_STATS_DOC_ID) {
            const emp = d.data() as HumanResourceRecord;
            if (!typeFilter || emp.tipoContrato === typeFilter) {
              list.push(emp);
            }
          }
        });
        callback(list);
      },
      (err) => {
        console.warn('[HR Service] Error en snapshot de empleados (offline fallback):', err.message);
        callback([]);
      }
    );
  }

  /**
   * Guarda o actualiza un expediente de trabajador aplicando Contadores Atómicos
   * (FieldValue.increment()) sobre el documento hr_stats en una sola transacción batch.
   */
  static async saveEmployee(
    record: HumanResourceRecord,
    isNew: boolean,
    oldRecord?: HumanResourceRecord,
    updatedBy: string = 'admin'
  ): Promise<{ success: boolean; error?: string }> {
    if (!db) {
      return { success: false, error: 'Firebase Firestore no inicializado.' };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await offlineSyncEngine.enqueueMutation(
        HR_COLLECTION,
        record.id,
        isNew ? 'SET' : 'UPDATE',
        record,
        { action: 'HR_EMPLOYEE_SAVE', category: record.tipoContrato, offline: true }
      );
      return { success: true };
    }

    try {
      const batch = writeBatch(db);
      const empRef = doc(db, HR_COLLECTION, record.id);
      const statsRef = doc(db, HR_COLLECTION, HR_STATS_DOC_ID);

      const now = Date.now();
      record.lastUpdatedTimestamp = now;
      record.updatedAt = new Date().toISOString();
      record.updatedBy = updatedBy;

      batch.set(empRef, record, { merge: true });

      // Calcular deltas atómicos para hr_stats
      if (isNew) {
        if (record.status === 'ACTIVO') {
          if (record.tipoContrato === 'NOMINA_FIJA') {
            const monthlyCost = (record.sueldoBaseUSD || 0) + (record.aportesParafiscalesUSD || 0);
            batch.set(
              statsRef,
              {
                activeNominaFijaCount: increment(1),
                totalActiveCount: increment(1),
                totalMonthlyNominaUSD: increment(monthlyCost),
                lastUpdatedTimestamp: now,
                lastUpdatedBy: updatedBy,
              },
              { merge: true }
            );
          } else {
            const monthlyCost = record.tarifaServicioUSD || 0;
            batch.set(
              statsRef,
              {
                activeHonorariosCount: increment(1),
                totalActiveCount: increment(1),
                totalMonthlyHonorariosUSD: increment(monthlyCost),
                lastUpdatedTimestamp: now,
                lastUpdatedBy: updatedBy,
              },
              { merge: true }
            );
          }
        } else {
          batch.set(
            statsRef,
            {
              totalInactiveCount: increment(1),
              lastUpdatedTimestamp: now,
              lastUpdatedBy: updatedBy,
            },
            { merge: true }
          );
        }
      } else if (oldRecord) {
        // Cálculo diferencial de mutación
        const wasActive = oldRecord.status === 'ACTIVO';
        const isActive = record.status === 'ACTIVO';

        let deltaNominaCount = 0;
        let deltaHonorariosCount = 0;
        let deltaTotalActive = 0;
        let deltaTotalInactive = 0;
        let deltaMonthlyNominaUSD = 0;
        let deltaMonthlyHonorariosUSD = 0;

        const oldCostNomina =
          oldRecord.tipoContrato === 'NOMINA_FIJA'
            ? (oldRecord.sueldoBaseUSD || 0) + (oldRecord.aportesParafiscalesUSD || 0)
            : 0;
        const newCostNomina =
          record.tipoContrato === 'NOMINA_FIJA'
            ? (record.sueldoBaseUSD || 0) + (record.aportesParafiscalesUSD || 0)
            : 0;

        const oldCostHonorarios =
          oldRecord.tipoContrato === 'HONORARIOS_PROFESIONALES' ? oldRecord.tarifaServicioUSD || 0 : 0;
        const newCostHonorarios =
          record.tipoContrato === 'HONORARIOS_PROFESIONALES' ? record.tarifaServicioUSD || 0 : 0;

        if (wasActive && !isActive) {
          // Desactivación
          deltaTotalActive -= 1;
          deltaTotalInactive += 1;
          if (oldRecord.tipoContrato === 'NOMINA_FIJA') {
            deltaNominaCount -= 1;
            deltaMonthlyNominaUSD -= oldCostNomina;
          } else {
            deltaHonorariosCount -= 1;
            deltaMonthlyHonorariosUSD -= oldCostHonorarios;
          }
        } else if (!wasActive && isActive) {
          // Reactivación
          deltaTotalActive += 1;
          deltaTotalInactive -= 1;
          if (record.tipoContrato === 'NOMINA_FIJA') {
            deltaNominaCount += 1;
            deltaMonthlyNominaUSD += newCostNomina;
          } else {
            deltaHonorariosCount += 1;
            deltaMonthlyHonorariosUSD += newCostHonorarios;
          }
        } else if (isActive) {
          // Sigue activo pero pudo cambiar tipo de contrato o sueldo
          if (oldRecord.tipoContrato === record.tipoContrato) {
            if (record.tipoContrato === 'NOMINA_FIJA') {
              deltaMonthlyNominaUSD += newCostNomina - oldCostNomina;
            } else {
              deltaMonthlyHonorariosUSD += newCostHonorarios - oldCostHonorarios;
            }
          } else {
            // Cambio de categoría contractual
            if (oldRecord.tipoContrato === 'NOMINA_FIJA') {
              deltaNominaCount -= 1;
              deltaMonthlyNominaUSD -= oldCostNomina;
              deltaHonorariosCount += 1;
              deltaMonthlyHonorariosUSD += newCostHonorarios;
            } else {
              deltaHonorariosCount -= 1;
              deltaMonthlyHonorariosUSD -= oldCostHonorarios;
              deltaNominaCount += 1;
              deltaMonthlyNominaUSD += newCostNomina;
            }
          }
        }

        const statsUpdate: Record<string, any> = {
          lastUpdatedTimestamp: now,
          lastUpdatedBy: updatedBy,
        };

        if (deltaNominaCount !== 0) statsUpdate.activeNominaFijaCount = increment(deltaNominaCount);
        if (deltaHonorariosCount !== 0) statsUpdate.activeHonorariosCount = increment(deltaHonorariosCount);
        if (deltaTotalActive !== 0) statsUpdate.totalActiveCount = increment(deltaTotalActive);
        if (deltaTotalInactive !== 0) statsUpdate.totalInactiveCount = increment(deltaTotalInactive);
        if (deltaMonthlyNominaUSD !== 0) statsUpdate.totalMonthlyNominaUSD = increment(deltaMonthlyNominaUSD);
        if (deltaMonthlyHonorariosUSD !== 0) statsUpdate.totalMonthlyHonorariosUSD = increment(deltaMonthlyHonorariosUSD);

        batch.set(statsRef, statsUpdate, { merge: true });
      }

      await batch.commit();

      // Escritura exitosa en Firestore en modo online: no encolar para evitar Ghost Replay y doble consumo de I/O
      return { success: true };
    } catch (err: any) {
      console.warn('[HR Service] Fallo de red en batch.commit, encolando en motor offline:', err);
      try {
        await offlineSyncEngine.enqueueMutation(
          HR_COLLECTION,
          record.id,
          isNew ? 'SET' : 'UPDATE',
          record,
          { action: 'HR_EMPLOYEE_SAVE', category: record.tipoContrato, offline: true }
        );
        return { success: true };
      } catch (enqueueErr: any) {
        return { success: false, error: err.message || 'Error al persistir empleado.' };
      }
    }
  }

  /**
   * Elimina un empleado y ajusta los contadores atómicos en hr_stats
   */
  static async deleteEmployee(
    record: HumanResourceRecord,
    updatedBy: string = 'admin'
  ): Promise<{ success: boolean; error?: string }> {
    if (!db) return { success: false, error: 'Firebase Firestore no inicializado.' };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await offlineSyncEngine.enqueueMutation(
        HR_COLLECTION,
        record.id,
        'DELETE',
        { id: record.id },
        { action: 'HR_EMPLOYEE_DELETE', offline: true }
      );
      return { success: true };
    }

    try {
      const batch = writeBatch(db);
      const empRef = doc(db, HR_COLLECTION, record.id);
      const statsRef = doc(db, HR_COLLECTION, HR_STATS_DOC_ID);

      batch.delete(empRef);

      const now = Date.now();
      if (record.status === 'ACTIVO') {
        if (record.tipoContrato === 'NOMINA_FIJA') {
          const cost = (record.sueldoBaseUSD || 0) + (record.aportesParafiscalesUSD || 0);
          batch.set(
            statsRef,
            {
              activeNominaFijaCount: increment(-1),
              totalActiveCount: increment(-1),
              totalMonthlyNominaUSD: increment(-cost),
              lastUpdatedTimestamp: now,
              lastUpdatedBy: updatedBy,
            },
            { merge: true }
          );
        } else {
          const cost = record.tarifaServicioUSD || 0;
          batch.set(
            statsRef,
            {
              activeHonorariosCount: increment(-1),
              totalActiveCount: increment(-1),
              totalMonthlyHonorariosUSD: increment(-cost),
              lastUpdatedTimestamp: now,
              lastUpdatedBy: updatedBy,
            },
            { merge: true }
          );
        }
      } else {
        batch.set(
          statsRef,
          {
            totalInactiveCount: increment(-1),
            lastUpdatedTimestamp: now,
            lastUpdatedBy: updatedBy,
          },
          { merge: true }
        );
      }

      await batch.commit();

      // Escritura online exitosa: retornar directamente
      return { success: true };
    } catch (err: any) {
      console.warn('[HR Service] Fallo de red en deleteEmployee, encolando en motor offline:', err);
      try {
        await offlineSyncEngine.enqueueMutation(
          HR_COLLECTION,
          record.id,
          'DELETE',
          { id: record.id },
          { action: 'HR_EMPLOYEE_DELETE', offline: true }
        );
        return { success: true };
      } catch (enqueueErr: any) {
        return { success: false, error: err.message || 'Error al eliminar empleado.' };
      }
    }
  }

  /**
   * Trigger Bimonetario de Finanzas BCV (Fase 4):
   * Al registrar el pago mensual de un trabajador (Nómina Fija o Honorarios),
   * genera automáticamente un asiento contable de "EGRESO" en el módulo de Finanzas BCV,
   * calculando el equivalente en Bolívares según la tasa BCV oficial y congelando el snapshot.
   */
  static async dispatchHRPaymentToFinance(
    employee: HumanResourceRecord,
    paymentAmountUSD: number,
    bcvRate: number,
    paymentMode: PaymentMode = 'TRANSFERENCIA',
    bankPlatform: string = 'BDV / Banesco Nómina',
    customConcept?: string,
    userId: string = 'admin'
  ): Promise<{ success: boolean; paymentRecord?: PaymentRecord; error?: string }> {
    try {
      const amountVES = Number((paymentAmountUSD * bcvRate).toFixed(2));
      const reference = `NOM-${employee.cedula.replace(/[^0-9]/g, '') || Date.now()}-${Date.now().toString().slice(-4)}`;
      const defaultConcept =
        employee.tipoContrato === 'NOMINA_FIJA'
          ? `Pago de Nómina Mensual - ${employee.nombreCompleto} (${employee.cargo})`
          : `Liquidación de Honorarios Profesionales - ${employee.nombreCompleto} (${employee.descripcionServicio})`;

      const paymentPayload: Omit<PaymentRecord, 'id' | 'createdAt' | 'snapshot' | 'updatedBy'> = {
        date: new Date().toISOString().split('T')[0],
        paymentMode,
        platform: bankPlatform,
        reference,
        idDocument: employee.cedula,
        entityName: employee.nombreCompleto,
        city: 'San Fernando de Apure',
        linkedInvoice: `HR_${employee.tipoContrato}_${employee.id}`,
        impactType: 'EGRESO',
        amountUSD: Number(paymentAmountUSD.toFixed(2)),
        amountVES,
        bcvRate,
        isReconciled: true,
      };

      const record = await FinanceService.registerPayment(paymentPayload, userId);

      // Emitir evento reactivo en el sistema para telemetría
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('agroerp:hr-payment-dispatched', {
            detail: {
              employeeId: employee.id,
              employeeName: employee.nombreCompleto,
              amountUSD: paymentAmountUSD,
              amountVES,
              bcvRate,
              paymentId: record.id,
              timestamp: Date.now(),
            },
          })
        );
      }

      return { success: true, paymentRecord: record };
    } catch (err: any) {
      console.error('[HR Service] Error despachando pago bimonetario a Finanzas:', err);
      return { success: false, error: err.message || 'Error registrando egreso en Finanzas BCV.' };
    }
  }
}
