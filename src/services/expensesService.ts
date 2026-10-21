/**
 * ============================================================================
 * PURO APURE ERP — SERVICIO FINANCIERO: ExpensesService
 * ============================================================================
 * Gestión de Gastos Operativos, Construcción, Equipos Tecnológicos y
 * Registro Histórico Retroactivo con Cruce Contable de Camadas Pasadas.
 * Aritmética decimal exacta (centsRound), Offline-First (IndexedDB / Firestore).
 * ============================================================================
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { offlineSyncEngine } from './offlineSyncEngine';
import {
  OperatingExpense,
  HistoricalConsolidatedPnl,
  GastoCategoria,
  GastoTipoRegistro,
} from '../types/purchasing';
import { HistoricalBatchRecord } from '../types/inventory';
import {
  centsRound,
  calculateHistoricalBatchBalance,
} from './financialAnalyticsService';

const EXPENSES_COLLECTION = 'gastos_operativos';

export class ExpensesService {
  /**
   * Suscripción en tiempo real a la colección de gastos operativos e históricos
   */
  static subscribeExpenses(
    callback: (expenses: OperatingExpense[]) => void
  ): () => void {
    const q = query(
      collection(db, EXPENSES_COLLECTION),
      orderBy('fecha', 'desc')
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const list: OperatingExpense[] = snapshot.docs.map(
          (d) => d.data() as OperatingExpense
        );
        callback(list);
      },
      (err) => {
        console.warn('[ExpensesService] Error al suscribirse a gastos, intentando lectura offline:', err);
        this.getExpenses().then(callback).catch(() => callback([]));
      }
    );
  }

  /**
   * Obtiene todos los gastos registrados (soporta Offline-First con fallback)
   */
  static async getExpenses(): Promise<OperatingExpense[]> {
    try {
      const snap = await getDocs(
        query(collection(db, EXPENSES_COLLECTION), orderBy('fecha', 'desc'))
      );
      if (!snap.empty) {
        return snap.docs.map((d) => d.data() as OperatingExpense);
      }
      return [];
    } catch (err) {
      console.warn('[ExpensesService] Fallback offline al leer gastos:', err);
      return [];
    }
  }

  /**
   * Registra un nuevo gasto operativo del día o gasto histórico pasado
   */
  static async createExpense(
    data: Omit<OperatingExpense, 'id' | 'createdAt' | 'updatedAt' | 'idempotencyKey'>,
    userId: string = 'admin'
  ): Promise<{ success: boolean; id: string; error?: string }> {
    const now = Date.now();
    const id = `EXP-${data.fecha.replace(/-/g, '')}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const idempotencyKey = `IDEMP-${id}-${now}`;

    // Aritmética financiera restrictiva
    const montoUSD = centsRound(Number(data.montoUSD) || 0);
    const tasaBcv = Number(data.tasaBcv) > 0 ? Number(data.tasaBcv) : undefined;
    const montoVES = tasaBcv ? centsRound(montoUSD * tasaBcv) : (data.montoVES ? centsRound(data.montoVES) : undefined);

    const expenseRecord: OperatingExpense = {
      ...data,
      id,
      idempotencyKey,
      montoUSD,
      montoVES,
      tasaBcv,
      numeroComprobante: data.numeroComprobante?.trim() || (data.tipoRegistro === 'HISTORICO_RETROACTIVO' ? 'S/F' : undefined),
      tieneComprobanteFisico: !!data.numeroComprobante?.trim() || !!data.comprobanteUrl,
      descripcionDetallada: data.descripcionDetallada?.trim() || data.concepto.trim(),
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    };

    try {
      const docRef = doc(db, EXPENSES_COLLECTION, id);

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await offlineSyncEngine.enqueueMutation(EXPENSES_COLLECTION, id, 'SET', expenseRecord, {
          offline: true,
        });
      } else {
        await setDoc(docRef, expenseRecord);
      }

      return { success: true, id };
    } catch (err: any) {
      console.error('[ExpensesService] Error al crear gasto:', err);
      // Respaldo en IndexedDB ante error de red
      try {
        await offlineSyncEngine.enqueueMutation(EXPENSES_COLLECTION, id, 'SET', expenseRecord, {
          offline: true,
        });
        return { success: true, id };
      } catch (e: any) {
        return { success: false, id, error: e.message || err.message };
      }
    }
  }

  /**
   * Actualiza un gasto existente
   */
  static async updateExpense(
    id: string,
    updates: Partial<OperatingExpense>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const docRef = doc(db, EXPENSES_COLLECTION, id);
      const payload: Partial<OperatingExpense> = {
        ...updates,
        updatedAt: Date.now(),
      };

      if (updates.montoUSD !== undefined) {
        payload.montoUSD = centsRound(Number(updates.montoUSD) || 0);
        if (updates.tasaBcv && updates.tasaBcv > 0) {
          payload.montoVES = centsRound(payload.montoUSD * updates.tasaBcv);
        }
      }

      await updateDoc(docRef, payload);
      return { success: true };
    } catch (err: any) {
      console.error('[ExpensesService] Error al actualizar gasto:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Elimina un gasto del sistema
   */
  static async deleteExpense(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const docRef = doc(db, EXPENSES_COLLECTION, id);
      await deleteDoc(docRef);
      return { success: true };
    } catch (err: any) {
      console.error('[ExpensesService] Error al eliminar gasto:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Motor de Cruce Financiero Estratégico:
   * Cruza las Ganancias Netas de Camadas Pasadas (Aves + Cerdos) contra los Gastos Históricos
   * para obtener el Estado de Resultados Histórico Consolidado de la Empresa.
   */
  static calculateConsolidatedHistoricalPnl(
    expenses: OperatingExpense[],
    historicalBatches: HistoricalBatchRecord[]
  ): HistoricalConsolidatedPnl {
    // 1. Filtrar solo los gastos de naturaleza histórica o atribuibles al balance estructural
    const historicalExpenses = expenses.filter(
      (e) => e.tipoRegistro === 'HISTORICO_RETROACTIVO' || e.esGastoEstructuralEmpresa
    );

    // 2. Desglose de gastos por categoría
    const initialCategories: Record<GastoCategoria, number> = {
      CONSTRUCCION_INFRAESTRUCTURA: 0,
      EQUIPOS_TECNOLOGIA: 0,
      PAPELERIA_OFICINA: 0,
      HERRAMIENTAS_OPERATIVAS: 0,
      MANTENIMIENTO_SERVICIOS: 0,
      PAGO_PROVEEDORES_HISTORICO: 0,
      PAGO_EMPLEADOS_MANO_OBRA: 0,
      GASTOS_OPERATIVOS_GENERALES: 0,
    };

    let totalGastosHistoricosUSD = 0;
    let totalGastosOpexUSD = 0;
    let totalGastosCapexUSD = 0;

    historicalExpenses.forEach((exp) => {
      const amount = centsRound(Number(exp.montoUSD) || 0);
      totalGastosHistoricosUSD = centsRound(totalGastosHistoricosUSD + amount);

      if (exp.naturaleza === 'CAPEX' || exp.categoria === 'EQUIPOS_TECNOLOGIA') {
        totalGastosCapexUSD = centsRound(totalGastosCapexUSD + amount);
      } else {
        totalGastosOpexUSD = centsRound(totalGastosOpexUSD + amount);
      }

      if (initialCategories[exp.categoria] !== undefined) {
        initialCategories[exp.categoria] = centsRound(initialCategories[exp.categoria] + amount);
      } else {
        initialCategories.GASTOS_OPERATIVOS_GENERALES = centsRound(
          initialCategories.GASTOS_OPERATIVOS_GENERALES + amount
        );
      }
    });

    // 3. Consolidación de ingresos y costos de camadas pasadas
    let totalIngresosCamadasUSD = 0;
    let totalCostosCamadasUSD = 0;

    historicalBatches.forEach((batch) => {
      const balance = calculateHistoricalBatchBalance(batch);
      const ventas = centsRound(Number(batch.montoTotalVentaUsd) || 0);
      const inversion = centsRound(balance.inversionTotalCamadaUsd || 0);

      totalIngresosCamadasUSD = centsRound(totalIngresosCamadasUSD + ventas);
      totalCostosCamadasUSD = centsRound(totalCostosCamadasUSD + inversion);
    });

    const totalGananciasCamadasUSD = centsRound(totalIngresosCamadasUSD - totalCostosCamadasUSD);

    // 4. Utilidad Neta Real Consolidada de la Empresa
    const utilidadNetaConsolidadaUSD = centsRound(totalGananciasCamadasUSD - totalGastosHistoricosUSD);

    // 5. Margen de rentabilidad global sobre ingresos totales
    const margenRentabilidadReal =
      totalIngresosCamadasUSD > 0
        ? centsRound((utilidadNetaConsolidadaUSD / totalIngresosCamadasUSD) * 100)
        : 0;

    return {
      totalIngresosCamadasUSD,
      totalCostosCamadasUSD,
      totalGananciasCamadasUSD,
      totalGastosHistoricosUSD,
      totalGastosOpexUSD,
      totalGastosCapexUSD,
      desgloseGastosPorCategoria: initialCategories,
      utilidadNetaConsolidadaUSD,
      margenRentabilidadReal,
      conteoCamadas: historicalBatches.length,
      conteoGastos: historicalExpenses.length,
    };
  }
}
