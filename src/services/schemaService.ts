/**
 * Puro Apure ERP - Motor de Esquemas Dinámicos (Dynamic Schema Engine)
 * Servicio de persistencia y resolución en Cloud Firestore y caché IndexedDB Offline-First
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { offlineSyncEngine } from './offlineSyncEngine';
import { DynamicSchemaField, SchemaTargetModule } from '../types/schema';

const COLLECTION_NAME = 'system_schemas';
const CACHE_KEY = 'system_schemas_cache';

// Claves reservadas del sistema y vectores de contaminación de prototipo (Prototype Pollution)
export const RESERVED_DYNAMIC_FIELD_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'id',
  'category',
  'name',
  'quantity',
  'unit',
  'unitCostUSD',
  'totalValueUSD',
  'lastUpdatedTimestamp',
  'updatedBy',
  'species',
  'initialCount',
  'currentCount',
  'daysInCycle',
  'grossWeightKg',
  'feedSacksConsumed',
  'status',
  'createdAt',
  'role',
  'customFields',
]);

/**
 * Sanitiza texto eliminando o escapando caracteres sensibles a XSS y etiquetas de script
 */
export function escapeHtmlString(input: string): string {
  if (!input) return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\0/g, '') // Elimina null bytes
    .trim();
}

/**
 * Sanitiza payloads dinámicos inyectados por el usuario o esquemas personalizados.
 * Genera un diccionario libre de prototipo (Object.create(null)) para erradicar Prototype Pollution.
 */
export function sanitizeDynamicPayload(raw: Record<string, any> | undefined | null): Record<string, any> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const cleanMap: Record<string, any> = Object.create(null);

  for (const [key, val] of Object.entries(raw)) {
    // 1. Descartar llaves reservadas o sospechosas de Prototype Pollution
    if (RESERVED_DYNAMIC_FIELD_KEYS.has(key)) continue;
    // 2. Solo permitir claves alfanuméricas con guiones bajos (hasta 64 caracteres)
    if (!/^[a-zA-Z0-9_]{1,64}$/.test(key)) continue;

    // 3. Sanitizar valores por tipo
    if (typeof val === 'string') {
      cleanMap[key] = escapeHtmlString(val);
    } else if (typeof val === 'number') {
      cleanMap[key] = isFinite(val) ? val : 0;
    } else if (typeof val === 'boolean') {
      cleanMap[key] = val;
    } else if (val === null || val === undefined) {
      // Omitir o mantener nulo seguro
      cleanMap[key] = null;
    }
  }

  // Convertir a objeto seguro para serialización JSON
  return { ...cleanMap };
}

// Esquemas iniciales por defecto para pruebas y arranque en frío
const DEFAULT_SCHEMAS: DynamicSchemaField[] = [
  {
    id: 'schema_inv_ubicacion_estante',
    targetModule: 'INVENTARIO',
    fieldName: 'ubicacion_estante',
    fieldLabel: 'Ubicación / Estante Almacén',
    fieldType: 'TEXTO',
    required: false,
    defaultValue: 'Galpón Central - Pasillo A',
    description: 'Código de localización física en el almacén de insumos',
    createdAt: new Date().toISOString(),
    createdBy: 'system_root',
  },
  {
    id: 'schema_inv_nivel_reorden',
    targetModule: 'INVENTARIO',
    fieldName: 'nivel_reorden_minimo',
    fieldLabel: 'Nivel Mínimo de Reorden',
    fieldType: 'NUMERO',
    required: false,
    defaultValue: '20',
    description: 'Umbral para disparar alertas automáticas de reposición',
    createdAt: new Date().toISOString(),
    createdBy: 'system_root',
  },
  {
    id: 'schema_traz_galpon_asignado',
    targetModule: 'TRAZABILIDAD',
    fieldName: 'galpon_bioseguro',
    fieldLabel: 'Galpón de Bioseguridad Asignado',
    fieldType: 'SELECTOR',
    options: 'Galpón 1 (Norte), Galpón 2 (Sur), Maternidad Porcina, Ceba Intensiva',
    required: true,
    defaultValue: 'Galpón 1 (Norte)',
    description: 'Área física de confinamiento con control de bioseguridad',
    createdAt: new Date().toISOString(),
    createdBy: 'system_root',
  },
  {
    id: 'schema_traz_veterinario_responsable',
    targetModule: 'TRAZABILIDAD',
    fieldName: 'veterinario_responsable',
    fieldLabel: 'Médico Veterinario Inspector',
    fieldType: 'TEXTO',
    required: false,
    defaultValue: 'Dr. Carlos Mendoza (Colegiado #4120)',
    description: 'Especialista a cargo del plan zoosanitario del lote',
    createdAt: new Date().toISOString(),
    createdBy: 'system_root',
  },
];

export class SchemaService {
  private static memoryCache: DynamicSchemaField[] = [...DEFAULT_SCHEMAS];

  /**
   * Obtiene todos los esquemas dinámicos, combinando Firestore e IndexedDB
   */
  static async getAllSchemas(): Promise<DynamicSchemaField[]> {
    try {
      // 1. Intentar cargar desde Firestore
      const collRef = collection(db, COLLECTION_NAME);
      const q = query(collRef, orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const schemas: DynamicSchemaField[] = [];
        snap.forEach((d) => {
          schemas.push(d.data() as DynamicSchemaField);
        });
        this.memoryCache = schemas;
        // Guardar copia local tolerante a desconexión
        await offlineSyncEngine.setCachedItem(CACHE_KEY, schemas);
        return schemas;
      } else {
        // Inicializar esquemas base si la colección está vacía
        for (const item of DEFAULT_SCHEMAS) {
          try {
            await setDoc(doc(db, COLLECTION_NAME, item.id), item);
          } catch {
            // Safe fallback
          }
        }
        await offlineSyncEngine.setCachedItem(CACHE_KEY, DEFAULT_SCHEMAS);
        return DEFAULT_SCHEMAS;
      }
    } catch (e) {
      console.warn('[SchemaService] Fallback offline al consultar Firestore:', e);
      // 2. Fallback a caché IndexedDB
      const cached = await offlineSyncEngine.getCachedItem<DynamicSchemaField[]>(CACHE_KEY);
      if (cached && cached.length > 0) {
        this.memoryCache = cached;
        return cached;
      }
      return this.memoryCache;
    }
  }

  /**
   * Obtiene esquemas filtrados por módulo de destino
   */
  static async getSchemasByModule(module: SchemaTargetModule): Promise<DynamicSchemaField[]> {
    const all = await this.getAllSchemas();
    return all.filter((s) => s.targetModule === module || s.targetModule === 'GENERAL');
  }

  /**
   * Suscripción en tiempo real a cambios de esquemas
   */
  static subscribeSchemas(
    onUpdate: (schemas: DynamicSchemaField[]) => void,
    module?: SchemaTargetModule
  ): () => void {
    try {
      const collRef = collection(db, COLLECTION_NAME);
      const unsub = onSnapshot(
        collRef,
        (snap) => {
          const list: DynamicSchemaField[] = [];
          snap.forEach((d) => list.push(d.data() as DynamicSchemaField));
          if (list.length > 0) {
            this.memoryCache = list;
            offlineSyncEngine.setCachedItem(CACHE_KEY, list);
            const filtered = module
              ? list.filter((s) => s.targetModule === module || s.targetModule === 'GENERAL')
              : list;
            onUpdate(filtered);
          } else {
            onUpdate(
              module
                ? this.memoryCache.filter((s) => s.targetModule === module || s.targetModule === 'GENERAL')
                : this.memoryCache
            );
          }
        },
        (err) => {
          console.warn('[SchemaService] Error en snapshot listener, usando memoria/caché:', err);
          this.getAllSchemas().then((data) => {
            const filtered = module
              ? data.filter((s) => s.targetModule === module || s.targetModule === 'GENERAL')
              : data;
            onUpdate(filtered);
          });
        }
      );
      return unsub;
    } catch {
      // Iniciar con memoria
      this.getAllSchemas().then((data) => {
        const filtered = module
          ? data.filter((s) => s.targetModule === module || s.targetModule === 'GENERAL')
          : data;
        onUpdate(filtered);
      });
      return () => {};
    }
  }

  /**
   * Determina si un nombre de campo dinámico es inválido o colisiona con el prototipo o llaves del sistema
   */
  static isReservedFieldName(name: string): boolean {
    if (!name) return true;
    const clean = name.trim().toLowerCase();
    return RESERVED_DYNAMIC_FIELD_KEYS.has(clean) || !/^[a-zA-Z][a-zA-Z0-9_]{1,63}$/.test(name);
  }

  /**
   * Guarda o actualiza un campo de esquema dinámico (Exclusivo SuperAdmin)
   * Sanitiza las definiciones y bloquea vectores de contaminación de prototipo
   */
  static async saveSchemaField(field: DynamicSchemaField): Promise<boolean> {
    // 1. Validación de seguridad e inmutabilidad de llaves
    if (this.isReservedFieldName(field.fieldName)) {
      console.error(`[SchemaService] Intento de inyección o llave reservada bloqueado: ${field.fieldName}`);
      throw new Error(`El nombre de campo "${field.fieldName}" está reservado o contiene caracteres inválidos.`);
    }

    // 2. Sanitizar cadenas de texto contra inyección HTML/Script
    const sanitizedField: DynamicSchemaField = {
      ...field,
      fieldName: field.fieldName.trim().toLowerCase(),
      fieldLabel: escapeHtmlString(field.fieldLabel),
      description: field.description ? escapeHtmlString(field.description) : undefined,
      defaultValue: field.defaultValue ? escapeHtmlString(field.defaultValue) : undefined,
      options: field.options
        ? field.options
            .split(',')
            .map((opt) => escapeHtmlString(opt.trim()))
            .filter(Boolean)
            .join(', ')
        : undefined,
    };

    try {
      const docRef = doc(db, COLLECTION_NAME, sanitizedField.id);
      await setDoc(docRef, sanitizedField);

      // Actualizar memoria y caché local
      this.memoryCache = [sanitizedField, ...this.memoryCache.filter((s) => s.id !== sanitizedField.id)];
      await offlineSyncEngine.setCachedItem(CACHE_KEY, this.memoryCache);
      return true;
    } catch (e) {
      console.warn('[SchemaService] Error guardando esquema en Firestore, aplicando en caché:', e);
      this.memoryCache = [sanitizedField, ...this.memoryCache.filter((s) => s.id !== sanitizedField.id)];
      await offlineSyncEngine.setCachedItem(CACHE_KEY, this.memoryCache);
      return true;
    }
  }

  /**
   * Elimina un campo de esquema dinámico
   */
  static async deleteSchemaField(fieldId: string): Promise<boolean> {
    try {
      const docRef = doc(db, COLLECTION_NAME, fieldId);
      await deleteDoc(docRef);

      this.memoryCache = this.memoryCache.filter((s) => s.id !== fieldId);
      await offlineSyncEngine.setCachedItem(CACHE_KEY, this.memoryCache);
      return true;
    } catch (e) {
      console.warn('[SchemaService] Error eliminando esquema en Firestore:', e);
      this.memoryCache = this.memoryCache.filter((s) => s.id !== fieldId);
      await offlineSyncEngine.setCachedItem(CACHE_KEY, this.memoryCache);
      return true;
    }
  }
}
