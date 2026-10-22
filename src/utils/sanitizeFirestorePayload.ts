/**
 * Utility: sanitizeFirestorePayload
 * Puro Apure ERP — Blindaje DevSecOps contra valores 'undefined' y 'NaN' en Cloud Firestore e IndexedDB.
 * Cumple con el estándar de Firebase SDK Web:
 * Prohibido enviar propiedades con valor 'undefined' (causa runtime exception en setDoc, updateDoc, writeBatch).
 */

export function sanitizeFirestorePayload<T = any>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  // Si es un número NaN, normalizarlo determinísticamente a 0
  if (typeof data === 'number') {
    return (Number.isNaN(data) ? 0 : data) as unknown as T;
  }

  // Preservar primitivos inalterados
  if (typeof data !== 'object') {
    return data;
  }

  // Preservar instancias de Date
  if (data instanceof Date) {
    return data;
  }

  // Preservar FieldValues de Firestore (tienen métodos internos como isEqual o _methodName)
  if (
    typeof (data as any).isEqual === 'function' ||
    (data as any)._methodName ||
    (data as any).constructor?.name === 'FieldValue' ||
    (data as any).constructor?.name === 'ServerTimestampTransform'
  ) {
    return data;
  }

  // Manejar Arrays recursivamente
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => sanitizeFirestorePayload(item)) as unknown as T;
  }

  // Manejar Objetos planos recursivamente eliminando claves con valor undefined
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) {
      continue;
    }
    if (typeof val === 'number' && Number.isNaN(val)) {
      cleaned[key] = 0;
      continue;
    }
    cleaned[key] = sanitizeFirestorePayload(val);
  }

  return cleaned as T;
}

export default sanitizeFirestorePayload;
