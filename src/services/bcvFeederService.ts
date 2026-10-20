/**
 * Puro Apure ERP - Motor Canónico de Extracción y Sincronización Cambiaria (BCV)
 * Fase 2: Suscripción Reactiva Frontend y Tolerancia Offline-First (IndexedDB / Service Worker)
 */

import { doc, getDoc, setDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { BcvRateRecord } from '../types/finance';
import { offlineSyncEngine } from './offlineSyncEngine';

const RATES_COLLECTION = 'exchange_rates';
const BCV_DOC_ID = 'bcv_latest';
const RATES_HISTORY_COLLECTION = 'exchange_rates_history';
const STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000;
const OFFLINE_CACHE_KEY = 'bcv_rate_offline_cache';

export interface BcvSyncResult {
  success: boolean;
  rate: number;
  date: string;
  source: string;
  timestamp: number;
  isStale: boolean;
  error?: string;
}

export class BcvFeederService {
  private static syncInProgress: Promise<BcvSyncResult> | null = null;

  /**
   * Ejecuta la sincronización autorizada invocando la Cloud Function fetchBCVRate.
   * Si el sistema está sin conexión y la sincronización es manual, lanza una excepción capturable
   * para desplegar el modal "Sin conexión. Se utiliza la última tasa en caché".
   */
  static async syncLatestRate(force = false): Promise<BcvSyncResult> {
    if (this.syncInProgress) {
      return this.syncInProgress;
    }

    this.syncInProgress = (async (): Promise<BcvSyncResult> => {
      const now = Date.now();
      const docRef = doc(db, RATES_COLLECTION, BCV_DOC_ID);
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

      // Si no es forzado, evaluar frescura del documento en Firestore o IndexedDB
      if (!force) {
        try {
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const data = snap.data() as BcvRateRecord;
            const isFresh = data.rateUSD_VES > 0 && now - data.timestamp < STALE_THRESHOLD_MS;
            if (isFresh) {
              await offlineSyncEngine.setCachedItem(OFFLINE_CACHE_KEY, data);
              return {
                success: true,
                rate: data.rateUSD_VES,
                date: data.date,
                source: data.source,
                timestamp: data.timestamp,
                isStale: false,
              };
            }
          }
        } catch (e) {
          console.warn('[BcvFeeder] Error al consultar Firestore local:', e);
        }
      }

      // Si está desconectado explícitamente y es sincronización forzada
      if (!isOnline && force) {
        const idbCached = await offlineSyncEngine.getCachedItem<BcvRateRecord>(OFFLINE_CACHE_KEY);
        const err: any = new Error('OFFLINE_NO_NETWORK');
        err.cachedRate = idbCached?.rateUSD_VES || 0;
        throw err;
      }

      // Tier 1: Invocación directa a la Cloud Function fetchBCVRate (Node.js backend)
      try {
        const cfResponse = await fetch('/api/fetchBCVRate', {
          headers: { 'Cache-Control': 'no-cache' },
          signal: AbortSignal.timeout(6000),
        });

        if (cfResponse.ok) {
          const cfData = await cfResponse.json();
          if (cfData.success && typeof cfData.rate === 'number' && cfData.rate > 0) {
            const resultRecord: BcvRateRecord = {
              date: cfData.date || new Date().toISOString().split('T')[0],
              rateUSD_VES: Number(cfData.rate.toFixed(4)),
              timestamp: now,
              source: cfData.source || 'Banco Central de Venezuela (Cloud Function fetchBCVRate)',
            };

            // 1. Sobrescribir documento centralizado en Firestore y almacenar snapshot histórico
            try {
              const histDocRef = doc(db, RATES_HISTORY_COLLECTION, resultRecord.date);
              Promise.all([
                setDoc(docRef, resultRecord),
                setDoc(histDocRef, resultRecord, { merge: true }),
              ])
                .then(() => {
                  console.log('[BcvFeeder] Firestore centralizado e histórico actualizados.');
                })
                .catch((fsErr) => {
                  console.warn('[BcvFeeder] Firestore local cache write fallback:', fsErr);
                });
            } catch (fireAndForgetErr) {
              console.warn('[BcvFeeder] Error despachando escritura a Firestore:', fireAndForgetErr);
            }

            // 2. Persistir en IndexedDB para disponibilidad 100% Offline-First
            await offlineSyncEngine.setCachedItem(OFFLINE_CACHE_KEY, resultRecord);
            await offlineSyncEngine.setCachedItem(`bcv_rate_date_${resultRecord.date}`, resultRecord);

            return {
              success: true,
              rate: resultRecord.rateUSD_VES,
              date: resultRecord.date,
              source: resultRecord.source,
              timestamp: now,
              isStale: false,
            };
          }
        }
      } catch (tier1Err) {
        console.warn('[BcvFeeder] Tier 1 Cloud Function no disponible:', tier1Err);
      }

      // Si la sincronización forzada falló por falta de red, lanzar excepción para el modal
      if (force) {
        const idbCached = await offlineSyncEngine.getCachedItem<BcvRateRecord>(OFFLINE_CACHE_KEY);
        const err: any = new Error('OFFLINE_NO_NETWORK');
        err.cachedRate = idbCached?.rateUSD_VES || 0;
        throw err;
      }

      // Tier 2: Recuperación desde IndexedDB en estado Offline
      const idbRecord = await offlineSyncEngine.getCachedItem<BcvRateRecord>(OFFLINE_CACHE_KEY);
      if (idbRecord && idbRecord.rateUSD_VES > 0) {
        return {
          success: true,
          rate: idbRecord.rateUSD_VES,
          date: idbRecord.date,
          source: `${idbRecord.source} (IndexedDB Offline)`,
          timestamp: idbRecord.timestamp,
          isStale: true,
        };
      }

      // Tier 3: Fallback a Firestore existente aunque sea stale
      try {
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data() as BcvRateRecord;
          if (data.rateUSD_VES > 0) {
            return {
              success: true,
              rate: data.rateUSD_VES,
              date: data.date,
              source: `${data.source} (Offline / En Caché)`,
              timestamp: data.timestamp,
              isStale: now - data.timestamp > STALE_THRESHOLD_MS,
            };
          }
        }
      } catch (tier3Err) {
        console.error('[BcvFeeder] Imposible recuperar tasa de Firestore:', tier3Err);
      }

      return {
        success: false,
        rate: 0,
        date: new Date().toISOString().split('T')[0],
        source: 'Sin Cotización Disponible (Estado Cero)',
        timestamp: now,
        isStale: true,
        error: 'Sin conexión a internet ni cotización previa registrada.',
      };
    })().finally(() => {
      this.syncInProgress = null;
    });

    return this.syncInProgress;
  }

  /**
   * Obtiene la tasa cambiaria oficial para una fecha específica (YYYY-MM-DD).
   * Consulta primero la caché local de IndexedDB y luego la colección histórica en Firestore.
   * Si no existe cotización para esa fecha exacta (ej. fin de semana o feriado bancario),
   * busca la cotización oficial más reciente previa a esa fecha.
   */
  static async fetchRateForDate(dateString: string): Promise<number | null> {
    if (!dateString) return null;

    const cacheKey = `bcv_rate_date_${dateString}`;
    try {
      const cached = await offlineSyncEngine.getCachedItem<BcvRateRecord>(cacheKey);
      if (cached && cached.rateUSD_VES > 0) {
        return cached.rateUSD_VES;
      }
    } catch (e) {
      console.warn('[BcvFeeder] Error leyendo tasa histórica de IndexedDB:', e);
    }

    // Si hay conexión o Firestore local está disponible
    try {
      const histDocRef = doc(db, RATES_HISTORY_COLLECTION, dateString);
      const snap = await getDoc(histDocRef);
      if (snap.exists()) {
        const data = snap.data() as BcvRateRecord;
        if (data.rateUSD_VES > 0) {
          await offlineSyncEngine.setCachedItem(cacheKey, data);
          return data.rateUSD_VES;
        }
      }

      // Si no existe para la fecha exacta, buscar la fecha más cercana anterior (lógica de fines de semana y feriados BCV)
      const q = query(
        collection(db, RATES_HISTORY_COLLECTION),
        where('date', '<=', dateString),
        orderBy('date', 'desc'),
        limit(1)
      );
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        const data = querySnap.docs[0].data() as BcvRateRecord;
        if (data.rateUSD_VES > 0) {
          await offlineSyncEngine.setCachedItem(cacheKey, data);
          return data.rateUSD_VES;
        }
      }
    } catch (err) {
      console.warn(`[BcvFeeder] Consulta histórica Firestore no disponible para fecha ${dateString}:`, err);
    }

    // Fallback de contingencia: última tasa en caché
    const fallbackRate = await this.getOfflineCachedRate();
    return fallbackRate > 0 ? fallbackRate : null;
  }

  /**
   * Registra manualmente o sincroniza una tasa histórica para una fecha pasada.
   */
  static async recordHistoricalRate(
    dateString: string,
    rate: number,
    source = 'Manual / Registro Histórico'
  ): Promise<void> {
    if (!dateString || rate <= 0) return;
    const record: BcvRateRecord = {
      date: dateString,
      rateUSD_VES: Number(rate.toFixed(4)),
      timestamp: Date.now(),
      source,
    };

    const cacheKey = `bcv_rate_date_${dateString}`;
    await offlineSyncEngine.setCachedItem(cacheKey, record);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await offlineSyncEngine.enqueueMutation(
        RATES_HISTORY_COLLECTION,
        dateString,
        'SET',
        record,
        { offline: true }
      );
      return;
    }

    try {
      const histDocRef = doc(db, RATES_HISTORY_COLLECTION, dateString);
      await setDoc(histDocRef, record, { merge: true });
    } catch (err) {
      console.warn('[BcvFeeder] Fallo al persistir tasa histórica online, encolando offline:', err);
      await offlineSyncEngine.enqueueMutation(
        RATES_HISTORY_COLLECTION,
        dateString,
        'SET',
        record,
        { offline: true }
      );
    }
  }

  /**
   * Obtiene la última tasa desde IndexedDB para el Service Worker
   */
  static async getOfflineCachedRate(): Promise<number> {
    const cached = await offlineSyncEngine.getCachedItem<BcvRateRecord>(OFFLINE_CACHE_KEY);
    return cached?.rateUSD_VES || 0;
  }
}
