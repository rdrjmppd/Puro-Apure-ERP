/**
 * Puro Apure ERP - Offline-First Concurrent Batch Synchronization Engine
 * Spec-Driven Phase 2: Telemetry Optimization & Debounce Synchronization.
 * 
 * Replaces fixed interval polling with an event-driven 30-second debounce pattern
 * over global mutation state and user activity, preventing quote saturation and data hemorrhage on Firebase.
 */

import {
  writeBatch,
  doc,
  collection,
  DocumentData,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { sanitizeFirestorePayload } from '../utils/sanitizeFirestorePayload';

export interface QueuedMutation {
  id: string;
  collectionName: string;
  docId: string;
  action: 'SET' | 'UPDATE' | 'DELETE';
  compressedPayload: string;
  rawSizeBytes: number;
  compressedSizeBytes: number;
  clientTimestamp: number;
  retryCount: number;
  metadata?: Record<string, unknown>;
}

export interface DeadLetterItem {
  id: string;
  mutation: QueuedMutation;
  error: string;
  failedAt: number;
  retryCount: number;
}

export type SyncEngineMode = 'IDLE_QUIESCENT' | 'DEBOUNCING' | 'SYNCING';

export interface SyncEngineStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  dlqCount?: number;
  lastSyncTime: number | null;
  nextSyncCountdownSeconds: number;
  totalSavedBytes: number;
  isDebouncing: boolean;
  lastActivityTimestamp: number | null;
  mode: SyncEngineMode;
}

const DB_NAME = 'puro_apure_offline_db';
const DB_VERSION = 4;
const QUEUE_STORE = 'mutation_queue';
const CACHE_STORE = 'snapshot_cache';
const DLQ_STORE = 'dead_letter_queue';
const DEBOUNCE_WAIT_MS = 30000; // 30-second debounce window after last user activity/mutation
const DEFAULT_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days retention policy

class OfflineSyncEngine {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private countdownTimer: NodeJS.Timeout | null = null;
  private countdownSeconds = 0;
  private isDebouncing = false;
  private lastActivityTimestamp: number | null = null;
  private lastSyncTime: number | null = null;
  private isSyncing = false;
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private listeners: Array<(status: SyncEngineStatus) => void> = [];
  private totalSavedBytes = 0;
  private firstEnqueuedTimestamp: number | null = null;
  private readonly MAX_DEBOUNCE_WAIT_MS = 120000; // 2 minutos límite absoluto anti-inanición
  private isPurgingCache = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initIndexedDb().then(() => {
        // Ejecución automática de purga de caché con TTL de 90 días en arranque
        this.purgeExpiredCacheEntries().catch((err) =>
          console.warn('[OfflineSyncEngine] Advertencia en purga inicial de caché:', err)
        );
      });

      // Listen to connectivity shifts
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.notifyStatus();
        this.getQueueCount().then((count) => {
          if (count > 0) {
            this.triggerDebounce();
          }
        });
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.notifyStatus();
      });

      // Global capture of form interactions to postpone sync during active typing
      window.addEventListener(
        'input',
        () => this.recordActivity(),
        { passive: true }
      );
      window.addEventListener(
        'change',
        () => this.recordActivity(),
        { passive: true }
      );

      // Descarga forzada inmediata ante salida o cambio de visibilidad de página (Anti Data-Loss)
      const handleFlushBeforeExit = () => {
        if (this.isOnline && !this.isSyncing) {
          this.flushQueue().catch(() => {});
        }
      };
      window.addEventListener('beforeunload', handleFlushBeforeExit);
      window.addEventListener('pagehide', handleFlushBeforeExit);
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            handleFlushBeforeExit();
          }
        });
      }
    }
  }

  private initIndexedDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not supported in this environment'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          const store = db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
          store.createIndex('clientTimestamp', 'clientTimestamp', { unique: false });
        }
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          const cacheStore = db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
          cacheStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        } else {
          // Si el almacén ya existe desde versiones anteriores, verificar o añadir el índice updatedAt
          const tx = (event.target as IDBOpenDBRequest)?.transaction;
          if (tx) {
            const cacheStore = tx.objectStore(CACHE_STORE);
            if (!cacheStore.indexNames.contains('updatedAt')) {
              cacheStore.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
          }
        }
        // Almacén Dead-Letter Queue (DLQ) para mutaciones venenosas aisladas
        if (!db.objectStoreNames.contains(DLQ_STORE)) {
          const dlqStore = db.createObjectStore(DLQ_STORE, { keyPath: 'id' });
          dlqStore.createIndex('failedAt', 'failedAt', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  private utf8Encoder = new TextEncoder();

  /**
   * Lightweight LZ/Run-Length compression for JSON payloads
   * Escapes literal tildes (~~) and validates decompressed chunks to prevent RangeError.
   * Reduces memory footprint in IndexedDB on low-RAM mobile hardware.
   */
  private compress(data: unknown): { compressed: string; rawSize: number; compressedSize: number } {
    const raw = JSON.stringify(data);
    const rawSize = this.utf8Encoder.encode(raw).length;

    // Escapar tildes literales antes de comprimir para evitar colisión con el marcador RLE
    const escapedRaw = raw.replace(/~/g, '~~');

    let compressed = '';
    let count = 1;
    for (let i = 0; i < escapedRaw.length; i++) {
      if (escapedRaw[i] === escapedRaw[i + 1] && count < 9) {
        count++;
      } else {
        if (count > 2) {
          compressed += `~${count}${escapedRaw[i]}`;
        } else if (count === 2) {
          compressed += `${escapedRaw[i]}${escapedRaw[i]}`;
        } else {
          compressed += escapedRaw[i];
        }
        count = 1;
      }
    }
    const compressedSize = this.utf8Encoder.encode(compressed).length;
    this.totalSavedBytes += Math.max(0, rawSize - compressedSize);
    return { compressed, rawSize, compressedSize };
  }

  private decompress<T = unknown>(compressed: string): T {
    let raw = '';
    for (let i = 0; i < compressed.length; i++) {
      if (compressed[i] === '~') {
        // Chequeo de escape de tilde literal (~~)
        if (i + 1 < compressed.length && compressed[i + 1] === '~') {
          raw += '~';
          i += 1;
          continue;
        }

        // Marcador de repetición: ~{count}{char}
        if (i + 2 < compressed.length) {
          const repeatCount = parseInt(compressed[i + 1], 10);
          if (!isNaN(repeatCount) && repeatCount > 0 && repeatCount <= 9) {
            const char = compressed[i + 2];
            raw += char.repeat(repeatCount);
            i += 2;
          } else {
            // Si el dígito es inválido o no numérico, preservar el caracter de forma segura
            raw += compressed[i];
          }
        } else {
          raw += compressed[i];
        }
      } else {
        raw += compressed[i];
      }
    }
    return JSON.parse(raw) as T;
  }

  /**
   * Records user activity (typing in forms, modifying fields).
   * If there are mutations waiting in queue, it resets the 30-second debounce timer.
   */
  public recordActivity() {
    this.lastActivityTimestamp = Date.now();
    this.getQueueCount().then((count) => {
      if (count > 0) {
        this.triggerDebounce();
      }
    });
  }

  /**
   * Injects or resets the 30-second Debounce Timer.
   * Cloud synchronization is delayed until exactly 30 seconds after the last interaction,
   * but will forcefully flush if the maximum wait threshold (120s) is exceeded.
   */
  public triggerDebounce() {
    const now = Date.now();
    this.lastActivityTimestamp = now;

    if (this.firstEnqueuedTimestamp === null) {
      this.firstEnqueuedTimestamp = now;
    }

    // Anti-starvation check: If typing continuously exceeds 120s, force flush
    if (now - this.firstEnqueuedTimestamp >= this.MAX_DEBOUNCE_WAIT_MS) {
      this.isDebouncing = false;
      this.countdownSeconds = 0;
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      this.firstEnqueuedTimestamp = null;
      this.flushQueue();
      return;
    }

    this.isDebouncing = true;
    this.countdownSeconds = 30;

    // Reset countdown and debounce timers
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.notifyStatus();

    // 1-second interval ticker for UI feedback
    this.countdownTimer = setInterval(() => {
      if (this.countdownSeconds > 1) {
        this.countdownSeconds -= 1;
        this.notifyStatus();
      } else {
        this.countdownSeconds = 0;
        if (this.countdownTimer) {
          clearInterval(this.countdownTimer);
          this.countdownTimer = null;
        }
      }
    }, 1000);

    // Master 30-second delay: Fires only after 30s of uninterrupted inactivity
    this.debounceTimer = setTimeout(async () => {
      this.isDebouncing = false;
      this.countdownSeconds = 0;
      this.firstEnqueuedTimestamp = null;
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
      this.debounceTimer = null;
      await this.flushQueue();
    }, DEBOUNCE_WAIT_MS);
  }

  /**
   * Enqueue a mutation locally. It starts/resets the 30-second debounce timer.
   */
  public async enqueueMutation(
    collectionName: string,
    docId: string,
    action: 'SET' | 'UPDATE' | 'DELETE',
    payload: DocumentData,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const cleanPayload = sanitizeFirestorePayload(payload);
    const db = await this.initIndexedDb();
    const { compressed, rawSize, compressedSize } = this.compress(cleanPayload);

    const mutation: QueuedMutation = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      collectionName,
      docId,
      action,
      compressedPayload: compressed,
      rawSizeBytes: rawSize,
      compressedSizeBytes: compressedSize,
      clientTimestamp: Date.now(),
      retryCount: 0,
      metadata,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction([QUEUE_STORE, CACHE_STORE], 'readwrite');
      tx.objectStore(QUEUE_STORE).add(mutation);

      // Optimistically update snapshot cache
      if (action !== 'DELETE') {
        tx.objectStore(CACHE_STORE).put({
          key: `${collectionName}/${docId}`,
          data: cleanPayload,
          updatedAt: Date.now(),
        });
      } else {
        tx.objectStore(CACHE_STORE).delete(`${collectionName}/${docId}`);
      }

      tx.oncomplete = () => {
        // Trigger or reset debounce cycle of 30s
        this.triggerDebounce();
        resolve(mutation.id);
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Reads from offline snapshot cache instantly
   */
  public async getCachedDoc<T = unknown>(collectionName: string, docId: string): Promise<T | null> {
    const db = await this.initIndexedDb();
    return new Promise((resolve) => {
      const tx = db.transaction(CACHE_STORE, 'readonly');
      const req = tx.objectStore(CACHE_STORE).get(`${collectionName}/${docId}`);
      req.onsuccess = () => {
        resolve(req.result ? (req.result.data as T) : null);
      };
      req.onerror = () => resolve(null);
    });
  }

  /**
   * Flushes queued mutations using Firestore Write Batches (Max 400 items per batch)
   */
  public async flushQueue(): Promise<{ syncedCount: number; errors: number }> {
    if (this.isSyncing || !this.isOnline) {
      return { syncedCount: 0, errors: 0 };
    }

    // Cancel active debounce timer since flush is happening now
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.isDebouncing = false;
    this.countdownSeconds = 0;

    this.isSyncing = true;
    this.notifyStatus();

    try {
      const idb = await this.initIndexedDb();
      const mutations = await this.getAllQueuedMutations(idb);

      if (mutations.length === 0) {
        this.isSyncing = false;
        this.notifyStatus();
        return { syncedCount: 0, errors: 0 };
      }

      // Phase 1 & P0 Resilience: Deduplication & Delta Preservation Algorithm
      // Snapshot mutations (SET/UPDATE) without increments can be deduplicated by docId keeping the latest.
      // Delta mutations (containing _increments or metadata.isDelta) MUST NEVER be discarded as obsolete.
      const latestMutationMap = new Map<string, QueuedMutation>();
      const obsoleteIds: string[] = [];
      const deltaMutations: QueuedMutation[] = [];

      for (const mutation of mutations) {
        const isDelta = Boolean(mutation.metadata?.isDelta || mutation.compressedPayload.includes('_increments'));
        if (isDelta) {
          deltaMutations.push(mutation);
          continue;
        }

        const uniqueDocKey = `${mutation.collectionName}/${mutation.docId}`;
        const existing = latestMutationMap.get(uniqueDocKey);

        if (!existing) {
          latestMutationMap.set(uniqueDocKey, mutation);
        } else {
          // Compare clientTimestamp: retain the most recent snapshot
          if (mutation.clientTimestamp >= existing.clientTimestamp) {
            obsoleteIds.push(existing.id);
            latestMutationMap.set(uniqueDocKey, mutation);
          } else {
            obsoleteIds.push(mutation.id);
          }
        }
      }

      // Purge strictly superseded snapshots from IndexedDB immediately
      if (obsoleteIds.length > 0) {
        await this.removeQueuedMutations(idb, obsoleteIds);
      }

      // Combine deduplicated snapshots with preserved delta mutations, ordered chronologically
      const runnableMutations = [...Array.from(latestMutationMap.values()), ...deltaMutations].sort(
        (a, b) => a.clientTimestamp - b.clientTimestamp
      );

      // Group runnable mutations in batches of 400 (Firestore limit is 500)
      const batchSize = 400;
      let syncedCount = 0;
      let errorCount = 0;

      for (let i = 0; i < runnableMutations.length; i += batchSize) {
        const chunk = runnableMutations.slice(i, i + batchSize);
        const fbBatch = writeBatch(db);
        const processedIds: string[] = [];
        const seenDocsInBatch = new Set<string>();

        for (const item of chunk) {
          try {
            const uniqueDocKey = `${item.collectionName}/${item.docId}`;
            if (seenDocsInBatch.has(uniqueDocKey)) {
              // Prevenir colisión intra-batch sin descartar de IDB: se omite en este batch para el siguiente ciclo
              continue;
            }
            seenDocsInBatch.add(uniqueDocKey);

            const docRef = doc(collection(db, item.collectionName), item.docId);
            const decompressedData = this.decompress<DocumentData>(item.compressedPayload);

            // Soporte nativo para deltas atómicos de Firestore (increment)
            const rawDecompressed = { ...decompressedData };
            if (rawDecompressed._increments && typeof rawDecompressed._increments === 'object') {
              for (const [k, v] of Object.entries(rawDecompressed._increments)) {
                if (typeof v === 'number') {
                  rawDecompressed[k] = increment(v);
                }
              }
              delete rawDecompressed._increments;
            }
            const dataToWrite: DocumentData = sanitizeFirestorePayload(rawDecompressed);

            if (item.action === 'SET') {
              fbBatch.set(docRef, {
                ...dataToWrite,
                syncedAt: serverTimestamp(),
              }, { merge: true });
            } else if (item.action === 'UPDATE') {
              fbBatch.update(docRef, {
                ...dataToWrite,
                syncedAt: serverTimestamp(),
              });
            } else if (item.action === 'DELETE') {
              fbBatch.delete(docRef);
            }
            processedIds.push(item.id);
          } catch (err) {
            console.error('[OfflineSyncEngine] Error preparando ítem para batch:', err);
            errorCount++;
          }
        }

        if (processedIds.length === 0) continue;

        try {
          await fbBatch.commit();
          await this.removeQueuedMutations(idb, processedIds);
          syncedCount += processedIds.length;
        } catch (commitErr) {
          console.warn('[OfflineSyncEngine] Batch commit falló o rechazado por red/Firestore:', commitErr);
          errorCount += processedIds.length;
          const errMsg = commitErr instanceof Error ? commitErr.message : String(commitErr);

          // P0: Erradicación de Queue-Lock y Aislamiento de Poison-Pills
          // Si una mutación acumula 5 intentos fallidos, se aísla en DLQ para permitir que la cola fluya
          for (const item of chunk) {
            if (!processedIds.includes(item.id)) continue;
            const newRetry = (item.retryCount || 0) + 1;
            item.retryCount = newRetry;

            if (newRetry >= 5) {
              await this.moveToDeadLetterQueue(idb, item, errMsg);
              await this.removeQueuedMutations(idb, [item.id]);
              console.error(`[OfflineSyncEngine] Poison-Pill aislada en DLQ tras 5 intentos: ${item.collectionName}/${item.docId}`);
            } else {
              await this.updateQueuedMutation(idb, item);
            }
          }
          break; // Detener el bucle de chunks en esta ronda si hubo fallo de red
        }

        // Rendimiento: Yield cooperativo entre chunks para preservar 60fps en la UI
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      this.lastSyncTime = Date.now();
      this.isSyncing = false;
      this.notifyStatus();
      return { syncedCount, errors: errorCount };
    } catch (err) {
      console.error('Queue flush failed:', err);
      this.isSyncing = false;
      this.notifyStatus();
      return { syncedCount: 0, errors: 1 };
    }
  }

  private getAllQueuedMutations(idb: IDBDatabase): Promise<QueuedMutation[]> {
    return new Promise((resolve) => {
      const tx = idb.transaction(QUEUE_STORE, 'readonly');
      const store = tx.objectStore(QUEUE_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  private removeQueuedMutations(idb: IDBDatabase, ids: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(QUEUE_STORE, 'readwrite');
      const store = tx.objectStore(QUEUE_STORE);
      for (const id of ids) {
        store.delete(id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async updateQueuedMutation(idb: IDBDatabase, mutation: QueuedMutation): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(QUEUE_STORE, 'readwrite');
      const store = tx.objectStore(QUEUE_STORE);
      store.put(mutation);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async moveToDeadLetterQueue(idb: IDBDatabase, mutation: QueuedMutation, errorMsg: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!idb.objectStoreNames.contains(DLQ_STORE)) return resolve();
      const tx = idb.transaction(DLQ_STORE, 'readwrite');
      const store = tx.objectStore(DLQ_STORE);
      const dlqItem: DeadLetterItem = {
        id: `dlq_${Date.now()}_${mutation.id}`,
        mutation,
        error: errorMsg,
        failedAt: Date.now(),
        retryCount: mutation.retryCount,
      };
      store.put(dlqItem);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async getDeadLetterQueueCount(): Promise<number> {
    try {
      const idb = await this.initIndexedDb();
      return new Promise((resolve) => {
        if (!idb.objectStoreNames.contains(DLQ_STORE)) return resolve(0);
        const tx = idb.transaction(DLQ_STORE, 'readonly');
        const req = tx.objectStore(DLQ_STORE).count();
        req.onsuccess = () => resolve(req.result || 0);
        req.onerror = () => resolve(0);
      });
    } catch {
      return 0;
    }
  }

  public async getDeadLetterItems(): Promise<DeadLetterItem[]> {
    try {
      const idb = await this.initIndexedDb();
      return new Promise((resolve) => {
        if (!idb.objectStoreNames.contains(DLQ_STORE)) return resolve([]);
        const tx = idb.transaction(DLQ_STORE, 'readonly');
        const store = tx.objectStore(DLQ_STORE);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  public async clearDeadLetterQueue(): Promise<void> {
    try {
      const idb = await this.initIndexedDb();
      return new Promise((resolve, reject) => {
        if (!idb.objectStoreNames.contains(DLQ_STORE)) return resolve();
        const tx = idb.transaction(DLQ_STORE, 'readwrite');
        const store = tx.objectStore(DLQ_STORE);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Error clearing DLQ:', e);
    }
  }

  public async getQueueCount(): Promise<number> {
    try {
      const idb = await this.initIndexedDb();
      return new Promise((resolve) => {
        const tx = idb.transaction(QUEUE_STORE, 'readonly');
        const req = tx.objectStore(QUEUE_STORE).count();
        req.onsuccess = () => resolve(req.result || 0);
        req.onerror = () => resolve(0);
      });
    } catch {
      return 0;
    }
  }

  public subscribe(listener: (status: SyncEngineStatus) => void): () => void {
    this.listeners.push(listener);
    this.notifyStatus();
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private async notifyStatus() {
    const pendingCount = await this.getQueueCount();
    const dlqCount = await this.getDeadLetterQueueCount();

    let mode: SyncEngineMode = 'IDLE_QUIESCENT';
    if (this.isSyncing) {
      mode = 'SYNCING';
    } else if (this.isDebouncing && pendingCount > 0) {
      mode = 'DEBOUNCING';
    }

    const status: SyncEngineStatus = {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingCount,
      dlqCount,
      lastSyncTime: this.lastSyncTime,
      nextSyncCountdownSeconds: this.countdownSeconds,
      totalSavedBytes: this.totalSavedBytes,
      isDebouncing: this.isDebouncing,
      lastActivityTimestamp: this.lastActivityTimestamp,
      mode,
    };

    for (const listener of this.listeners) {
      listener(status);
    }
  }

  /**
   * Cierra activamente la conexión local a IndexedDB para evitar bloqueos (deadlock)
   * antes de purgar o reiniciar las bases de datos.
   */
  public async closeDatabase(): Promise<void> {
    if (this.dbPromise) {
      try {
        const db = await this.dbPromise;
        if (db) {
          db.close();
        }
      } catch (err) {
        console.warn('[OfflineSyncEngine] Error al cerrar conexión IDB:', err);
      } finally {
        this.dbPromise = null;
      }
    }
  }

  /**
   * Purgado estricto de IndexedDB y almacenamiento local para Cierre de Sesión seguro
   * Garantiza cierre previo de conexiones y eliminación asíncrona segura con timeout.
   */
  public async purgeAllStorage(): Promise<void> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.debounceTimer = null;
    this.countdownTimer = null;
    this.isDebouncing = false;
    this.countdownSeconds = 0;

    // 1. Cerrar explícitamente cualquier descriptor abierto de IndexedDB del motor
    await this.closeDatabase();

    // 2. Purge localStorage y sessionStorage
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.clear();
      } catch (e) {
        console.warn('localStorage clear notice:', e);
      }
    }
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.clear();
      } catch (e) {
        console.warn('sessionStorage clear notice:', e);
      }
    }

    // 3. Clear IndexedDB databases con promesas explícitas y timeout de seguridad
    const safeDeleteDatabase = (dbName: string, timeoutMs = 2500): Promise<void> => {
      return new Promise((resolve) => {
        if (typeof indexedDB === 'undefined') return resolve();

        let finished = false;
        const timer = setTimeout(() => {
          if (!finished) {
            finished = true;
            console.warn(`[OfflineSyncEngine] deleteDatabase('${dbName}') excedió timeout (${timeoutMs}ms)`);
            resolve();
          }
        }, timeoutMs);

        try {
          const req = indexedDB.deleteDatabase(dbName);
          req.onsuccess = () => {
            if (!finished) {
              finished = true;
              clearTimeout(timer);
              resolve();
            }
          };
          req.onerror = () => {
            if (!finished) {
              finished = true;
              clearTimeout(timer);
              resolve();
            }
          };
          req.onblocked = () => {
            // Conexión bloqueada por otra pestaña o proceso pendiente
            console.warn(`[OfflineSyncEngine] deleteDatabase('${dbName}') bloqueada por conexión abierta.`);
            if (!finished) {
              finished = true;
              clearTimeout(timer);
              resolve();
            }
          };
        } catch {
          if (!finished) {
            finished = true;
            clearTimeout(timer);
            resolve();
          }
        }
      });
    };

    try {
      if (typeof indexedDB !== 'undefined') {
        const dbs = await indexedDB.databases?.();
        if (dbs && dbs.length > 0) {
          for (const d of dbs) {
            if (d.name) {
              // PREVENCIÓN DE CORRUPCIÓN SDK:
              // NO eliminar bases de datos internas de Firebase ni Firestore
              if (
                d.name.startsWith('firestore') ||
                d.name.startsWith('firebase') ||
                d.name.includes('firebase')
              ) {
                continue;
              }
              await safeDeleteDatabase(d.name);
            }
          }
        } else {
          await safeDeleteDatabase(DB_NAME);
          await safeDeleteDatabase('agroerp_offline_db');
          await safeDeleteDatabase('agroerp_cache_db');
        }
      }
    } catch (e) {
      console.warn('IndexedDB purge notice:', e);
    }

    this.dbPromise = null;
  }

  /**
   * Almacenamiento seguro en IndexedDB para instantáneas Offline-First (Tasa BCV, etc.)
   */
  async setCachedItem(key: string, data: any): Promise<void> {
    try {
      const db = await this.initIndexedDb();
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        console.warn(`[OfflineSyncEngine] ObjectStore ${CACHE_STORE} no disponible aún en IndexedDB`);
        return;
      }
      return await new Promise<void>((resolve, reject) => {
        try {
          const tx = db.transaction(CACHE_STORE, 'readwrite');
          const store = tx.objectStore(CACHE_STORE);
          store.put({ key, data, updatedAt: Date.now() });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error('Transacción abortada en IndexedDB'));
        } catch (txErr) {
          reject(txErr);
        }
      });
    } catch (e) {
      console.warn('[OfflineSyncEngine] Error escribiendo en IndexedDB:', e);
    }
  }

  /**
   * Recupera un valor almacenado en caché de IndexedDB durante estados sin conexión
   */
  async getCachedItem<T = any>(key: string): Promise<T | null> {
    try {
      const db = await this.initIndexedDb();
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        return null;
      }
      return await new Promise<T | null>((resolve, reject) => {
        try {
          const tx = db.transaction(CACHE_STORE, 'readonly');
          const store = tx.objectStore(CACHE_STORE);
          const req = store.get(key);
          req.onsuccess = () => {
            if (req.result && req.result.data) {
              resolve(req.result.data as T);
            } else {
              resolve(null);
            }
          };
          req.onerror = () => reject(req.error);
        } catch (txErr) {
          reject(txErr);
        }
      });
    } catch (err) {
      console.warn('[OfflineSyncEngine] Error leyendo caché de IndexedDB:', err);
      return null;
    }
  }

  /**
   * Política de expiración automática de caché (TTL 90 días por defecto)
   * Previene la saturación del almacenamiento local (QuotaExceededError) en IndexedDB
   * al purgar instantáneas caducadas o sin uso operativo reciente.
   */
  async purgeExpiredCacheEntries(ttlMs: number = DEFAULT_CACHE_TTL_MS): Promise<{ purgedCount: number; remainingCount: number }> {
    if (this.isPurgingCache) {
      return { purgedCount: 0, remainingCount: 0 };
    }
    this.isPurgingCache = true;

    try {
      const db = await this.initIndexedDb();
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        return { purgedCount: 0, remainingCount: 0 };
      }

      const thresholdTimestamp = Date.now() - ttlMs;

      return await new Promise<{ purgedCount: number; remainingCount: number }>((resolve, reject) => {
        try {
          const tx = db.transaction(CACHE_STORE, 'readwrite');
          const store = tx.objectStore(CACHE_STORE);
          let purgedCount = 0;
          let remainingCount = 0;

          // Si el índice 'updatedAt' existe, optimizar mediante cursor con límite superior
          if (store.indexNames.contains('updatedAt')) {
            const index = store.index('updatedAt');
            const range = IDBKeyRange.upperBound(thresholdTimestamp);
            const cursorReq = index.openCursor(range);

            cursorReq.onsuccess = (e) => {
              const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
              if (cursor) {
                // Registro expirado: eliminar
                cursor.delete();
                purgedCount++;
                cursor.continue();
              }
            };
          } else {
            // Recorrido lineal en almacén si el índice está pendiente de creación
            const req = store.openCursor();
            req.onsuccess = (e) => {
              const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
              if (cursor) {
                const item = cursor.value;
                const itemUpdatedAt = item?.updatedAt || 0;
                if (itemUpdatedAt < thresholdTimestamp) {
                  cursor.delete();
                  purgedCount++;
                } else {
                  remainingCount++;
                }
                cursor.continue();
              }
            };
          }

          tx.oncomplete = () => {
            if (purgedCount > 0) {
              console.info(`[OfflineSyncEngine] Purgados ${purgedCount} registros expirados del almacén ${CACHE_STORE} (TTL: 90 días).`);
            }
            resolve({ purgedCount, remainingCount });
          };

          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error('Transacción de purga abortada'));
        } catch (txErr) {
          reject(txErr);
        }
      });
    } catch (err) {
      console.warn('[OfflineSyncEngine] Error durante la purga de caché por TTL:', err);
      return { purgedCount: 0, remainingCount: 0 };
    } finally {
      this.isPurgingCache = false;
    }
  }
}

export const offlineSyncEngine = new OfflineSyncEngine();
