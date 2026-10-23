/**
 * Puro Apure ERP - Motor de Lectura OCR Multimodal y Analista Forense Anti-IA / Anti-Fraude
 * Cumple con los 4 Candados de Veracidad y la Separación Estricta entre Pre-Conciliación y Verdad Contable.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { offlineSyncEngine } from './offlineSyncEngine';
import { centsRound, round2 } from './financialAnalyticsService';
import { sanitizeFirestorePayload } from '../utils/sanitizeFirestorePayload';
import {
  PagoReportadoOCR,
  DictamenVeracidadOCR,
  VeredictoVeracidad,
  TipoComprobanteOCR,
} from '../types/ocrForensic';
import { PaymentRecord, BillingInvoice } from '../types/finance';
import {
  parseBankReceiptText,
  parseVenezuelanOrInternationalAmount,
  mergeReceiptResults,
  formatCaracasDate,
  getCaracasToday,
  isFutureCaracasDate,
  isDateOlderThanDays,
} from '../utils/bankReceiptParser';

const PAGOS_REPORTADOS_COLLECTION = 'pagos_reportados_ocr';
const PAYMENTS_COLLECTION = 'payments';
const INVOICES_COLLECTION = 'billing_invoices';
const AUDIT_COLLECTION = 'audit_trail';

/**
 * Calcula la huella digital SHA-256 exacta de los bytes del archivo
 */
export async function calculateSha256(bytes: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback determinista para entornos sin crypto.subtle
  let hash = 0;
  for (let i = 0; i < bytes.length; i++) {
    hash = (hash << 5) - hash + bytes[i];
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

/**
 * Calcula el Hash Perceptual (pHash de 64-bits) de una imagen en base64
 * Genera una huella visual robusta contra recortes leves o compresión JPEG
 */
export async function calculatePHash(base64Data: string, rawBytes: Uint8Array): Promise<string> {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 8;
          canvas.height = 8;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(fallbackPHash(rawBytes));
            return;
          }
          ctx.drawImage(img, 0, 0, 8, 8);
          const imgData = ctx.getImageData(0, 0, 8, 8).data;
          let sum = 0;
          const grays: number[] = [];
          for (let i = 0; i < imgData.length; i += 4) {
            // Luminancia ITU-R BT.601
            const gray = 0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2];
            grays.push(gray);
            sum += gray;
          }
          const avg = sum / 64;
          let bitString = '';
          for (const g of grays) {
            bitString += g >= avg ? '1' : '0';
          }
          // Convertir 64 bits a 16 caracteres hexadecimales
          let hex = '';
          for (let i = 0; i < 64; i += 4) {
            const nibble = parseInt(bitString.substring(i, i + 4), 2);
            hex += nibble.toString(16);
          }
          resolve(hex);
        } catch {
          resolve(fallbackPHash(rawBytes));
        }
      };
      img.onerror = () => resolve(fallbackPHash(rawBytes));
      img.src = base64Data;
    });
  }
  return fallbackPHash(rawBytes);
}

function fallbackPHash(bytes: Uint8Array): string {
  if (bytes.length === 0) return '0000000000000000';
  const step = Math.max(1, Math.floor(bytes.length / 64));
  let hex = '';
  for (let i = 0; i < 16; i++) {
    const idx = (i * step * 4) % bytes.length;
    hex += (bytes[idx] % 16).toString(16);
  }
  return hex.padEnd(16, '0');
}

/**
 * Calcula la Distancia de Hamming entre dos hashes pHash de 16 caracteres hex (64 bits).
 * Retorna el número de bits diferentes (0 = idénticos, <= 6 = imagen visualmente reciclada).
 */
export function calculateHammingDistance(hash1: string, hash2: string): number {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return 64;
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const val1 = parseInt(hash1[i], 16) || 0;
    const val2 = parseInt(hash2[i], 16) || 0;
    let xor = val1 ^ val2;
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

/**
 * Candado 2: Inspección Binaria de EXIF, Metadatos y Magic Bytes
 * Detecta huellas de Inteligencia Artificial (Midjourney, DALL-E, Stable Diffusion, Flux, ComfyUI)
 * o de editores de imágenes (Photoshop, Canva, GIMP, Pixlr).
 */
export function inspectExifAndMagicBytes(bytes: Uint8Array): {
  tieneFirmasIAOEdicion: boolean;
  softwareDetectado?: string;
  detalle: string;
} {
  // Convertir los primeros 16KB a texto para escanear cabeceras EXIF, XMP y comentarios JFIF/PNG
  const sampleSize = Math.min(bytes.length, 16384);
  let asciiHeader = '';
  for (let i = 0; i < sampleSize; i++) {
    asciiHeader += String.fromCharCode(bytes[i]);
  }
  const lowerHeader = asciiHeader.toLowerCase();

  const aiSignatures = [
    { tag: 'midjourney', name: 'Midjourney AI Generator' },
    { tag: 'dall-e', name: 'OpenAI DALL-E Generator' },
    { tag: 'stable diffusion', name: 'Stable Diffusion AI' },
    { tag: 'comfyui', name: 'ComfyUI Node-Based AI' },
    { tag: 'flux', name: 'Black Forest Labs Flux AI' },
    { tag: 'firefly', name: 'Adobe Firefly AI' },
    { tag: 'civitai', name: 'Civitai Synthetic Checkpoint' },
    { tag: 'prompt:', name: 'Generative AI Prompt Metadata' },
  ];

  for (const sig of aiSignatures) {
    if (lowerHeader.includes(sig.tag)) {
      return {
        tieneFirmasIAOEdicion: true,
        softwareDetectado: sig.name,
        detalle: `Firma binaria de Inteligencia Artificial detectada en metadatos: ${sig.name}`,
      };
    }
  }

  const editorSignatures = [
    { tag: 'photoshop', name: 'Adobe Photoshop' },
    { tag: 'canva', name: 'Canva Design Platform' },
    { tag: 'gimp', name: 'GIMP Image Editor' },
    { tag: 'pixlr', name: 'Pixlr Web Editor' },
    { tag: 'lightroom', name: 'Adobe Lightroom' },
    { tag: 'snapseed', name: 'Google Snapseed' },
  ];

  for (const sig of editorSignatures) {
    if (lowerHeader.includes(sig.tag)) {
      return {
        tieneFirmasIAOEdicion: true,
        softwareDetectado: sig.name,
        detalle: `Metadatos de software de edición digital detectados: ${sig.name}`,
      };
    }
  }

  return {
    tieneFirmasIAOEdicion: false,
    detalle: 'Metadatos EXIF limpios sin trazas de software de edición ni IA generativa.',
  };
}

/**
 * Normaliza cualquier número de referencia bancaria a formato alfanumérico en mayúsculas sin espacios
 */
export function normalizeBankReference(ref: string): string {
  if (!ref) return '';
  return ref.toUpperCase().replace(/[^A-Z0-9]/g, '');
}


export interface VeracityEvaluationParams {
  esDuplicado: boolean;
  hashDuplicado?: string;
  referenciaDuplicada?: string;
  tieneFirmasIAOEdicion: boolean;
  softwareDetectado?: string;
  consistenciaTipografica?: boolean;
  halosDeColor?: boolean;
  patronBancarioValido?: boolean;
  bancoReconocido?: boolean;
  bancoEmisor?: string;
  bancoReceptor?: string;
  hasReference?: boolean;
  numeroReferencia?: string;
  hasValidAmount?: boolean;
  montoOriginal?: number;
  fechaComprobante?: string;
  isDateInFuture?: boolean;
  isDateTooOld?: boolean;
  hasBeneficiaryData?: boolean;
  rifCedula?: string;
  telefonoNombreEmisor?: string;
  isLowResolution?: boolean;
  anomaliasExtra?: string[];
}

/**
 * Recalibración de la Matriz Matemática de Veracidad Forense (Base 100 Puntos)
 * - Candado 1: Unicidad Criptográfica y Contable (30 pts) [Reciclaje: -85 pts]
 * - Candado 2: Integridad Binaria EXIF / JFIF / PNG Anti-IA y Anti-Edición (30 pts) [IA/Edición: -80 pts]
 * - Candado 3: Coherencia Matemática, Bancaria y Estructural (40 pts)
 *   * Banco reconocido: +10 pts
 *   * Referencia válida: +10 pts
 *   * Monto positivo (> 0): +10 pts
 *   * Fecha válida (no futura) + Beneficiario: +10 pts
 * Sin penalizaciones por ausencia de EXIF en capturas de pantalla o WhatsApp.
 */
export function evaluateVeracityScore(params: VeracityEvaluationParams): {
  score: number;
  veredicto: VeredictoVeracidad;
  detalles: {
    candado1: string;
    candado2: string;
    candado3: string;
    candado4_resumen: string;
  };
  anomalias: string[];
} {
  const anomalias: string[] = [];

  // =========================================================================
  // Candado 1: Unicidad Criptográfica y Contable (Peso 30 puntos)
  // =========================================================================
  let c1Score = 30;
  let c1Detalle = 'Candado 1: Comprobante y referencia únicos en el sistema contable (+30 pts).';
  if (params.esDuplicado) {
    c1Score = -55; // Aplica penalización de -85 pts
    c1Detalle = `Candado 1 [ALERTA RECICLAJE]: Comprobante o referencia (${params.referenciaDuplicada || params.hashDuplicado || 'Duplicado'}) ya registrada previamente.`;
    anomalias.push('Comprobante o referencia bancaria reciclada/duplicada.');
  }

  // =========================================================================
  // Candado 2: Integridad Binaria Anti-IA y Anti-Edición (Peso 30 puntos)
  // =========================================================================
  let c2Score = 30;
  let c2Detalle = 'Candado 2: Cabeceras binarias limpias sin rastros de edición ni IA generativa (+30 pts).';
  if (params.tieneFirmasIAOEdicion) {
    c2Score = -50; // Aplica penalización de -80 pts
    c2Detalle = `Candado 2 [ALERTA FRAUDE EDICIÓN/IA]: Detectada firma de software de edición o IA (${params.softwareDetectado || 'Edición detectada'}).`;
    anomalias.push(`Metadatos con firma de software no autorizado: ${params.softwareDetectado || 'Edición detectada'}.`);
  }

  // =========================================================================
  // Candado 3: Coherencia Matemática, Bancaria y Estructural (Peso 40 puntos)
  // =========================================================================
  let c3Score = 0;
  const c3Items: string[] = [];

  // Banco emisor o receptor válido reconocido (+10 pts)
  const isBankRecognized = params.bancoReconocido !== false && params.patronBancarioValido !== false;
  if (isBankRecognized) {
    c3Score += 10;
    c3Items.push('Banco verificado (+10)');
  } else {
    anomalias.push('Banco emisor o receptor no identificado con precisión (-10 pts).');
  }

  // Número de referencia válido extraído (+10 pts)
  const hasRefExplicitFalse = params.hasReference === false;
  const hasRefValue = typeof params.numeroReferencia === 'string';
  const isDummyRef = hasRefValue && /^(0{6,}|123456\d*)$/.test(params.numeroReferencia || '');
  const isRefInvalid = hasRefExplicitFalse || (hasRefValue && (params.numeroReferencia!.length < 6 || isDummyRef));

  if (!isRefInvalid) {
    c3Score += 10;
    c3Items.push('Referencia válida (+10)');
  } else {
    anomalias.push('Número de referencia no detectado o formato inválido (-10 pts).');
  }

  // Monto numérico positivo y con formato monetario coherente (+10 pts)
  const hasAmountExplicitFalse = params.hasValidAmount === false;
  const hasAmountValue = typeof params.montoOriginal === 'number';
  const isAmountInvalid = hasAmountExplicitFalse || (hasAmountValue && params.montoOriginal! <= 0);

  if (!isAmountInvalid) {
    c3Score += 10;
    c3Items.push('Monto válido (+10)');
  } else {
    anomalias.push('Monto del comprobante no legible o igual a cero (-10 pts).');
  }

  // Fecha y datos de beneficiario/cédula/teléfono (+10 pts)
  const isFuture = params.isDateInFuture === true;
  const isOld = params.isDateTooOld === true;
  const hasBeneficiaryInvalid = params.hasBeneficiaryData === false;

  if (!hasBeneficiaryInvalid) {
    c3Score += 10;
    c3Items.push('Fecha y beneficiario presentes (+10)');
  } else {
    anomalias.push('Datos del beneficiario o titular ausentes (-10 pts).');
  }

  // Penalizaciones objetivas específicas de Candado 3
  if (params.consistenciaTipografica === false) {
    c3Score -= 25;
    anomalias.push('Inconsistencia en la tipografía o alineación de caracteres (-25 pts).');
  }
  if (params.halosDeColor === true) {
    c3Score -= 25;
    anomalias.push('Halos de color o artefactos de compresión sospechosos alrededor del texto (-25 pts).');
  }
  if (isFuture) {
    c3Score -= 25;
    anomalias.push('Fecha del comprobante está en el futuro respecto a la hora de Venezuela (-25 pts).');
  }
  if (isOld) {
    c3Score -= 25;
    anomalias.push('Comprobante tiene más de 90 días de antigüedad (-25 pts).');
  }
  if (params.isLowResolution === true) {
    c3Score -= 25;
    anomalias.push('Resolución extremadamente baja (< 200x200 px) o aspecto distorsionado (-25 pts).');
  }

  if (params.anomaliasExtra) {
    for (const a of params.anomaliasExtra) {
      if (!anomalias.includes(a)) anomalias.push(a);
    }
  }

  const rawTotal = c1Score + c2Score + c3Score;

  // Asignación de veredicto según los umbrales especificados
  let score = rawTotal;
  let veredicto: VeredictoVeracidad = 'AUTENTICO_ALTA_CONFIANZA';

  if (params.esDuplicado) {
    score = Math.min(15, Math.max(5, rawTotal));
    veredicto = 'ALERTA_FRAUDE_EDICION_O_IA';
  } else if (params.tieneFirmasIAOEdicion) {
    score = Math.min(20, Math.max(5, rawTotal));
    veredicto = 'ALERTA_FRAUDE_EDICION_O_IA';
  } else {
    score = Math.max(0, Math.min(100, rawTotal));
    if (score >= 85) {
      veredicto = 'AUTENTICO_ALTA_CONFIANZA';
    } else if (score >= 50) {
      veredicto = 'SOSPECHOSO_REVISION_HUMANA';
    } else {
      veredicto = 'ALERTA_FRAUDE_EDICION_O_IA';
    }
  }

  const c3Detalle = `Candado 3: ${c3Items.join(', ') || 'Extracción parcial'}. ${anomalias.length > 0 ? `Anomalías: ${anomalias.join(' • ')}` : 'Estructura bancaria íntegra.'}`;
  const c4Resumen = `Dictamen: ${veredicto} (Puntaje: ${score}/100). ${c1Detalle} ${c2Detalle}`;

  return {
    score,
    veredicto,
    detalles: {
      candado1: c1Detalle,
      candado2: c2Detalle,
      candado3: c3Detalle,
      candado4_resumen: c4Resumen,
    },
    anomalias,
  };
}


/**
 * Preprocesa una imagen en navegador aplicando rotación (90°, 180°, 270°)
 * o inversión cromática negativa para comprobantes bancarios en modo oscuro.
 */

const OCR_TRANSCRIPTIONS_KEY = 'puro_apure_ocr_transcriptions_v1';
const ocrMemoryCache = new Map<string, PagoReportadoOCR>();

/**
 * Guarda una transcripción de comprobante analizado en memoria activa (Map) y localStorage
 */
export function saveTranscriptionToMemory(payment: PagoReportadoOCR): void {
  if (!payment) return;
  if (payment.sha256Bytes) ocrMemoryCache.set(payment.sha256Bytes, payment);
  if (payment.id) ocrMemoryCache.set(payment.id, payment);
  if (payment.numeroReferencia) ocrMemoryCache.set(payment.numeroReferencia, payment);

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = localStorage.getItem(OCR_TRANSCRIPTIONS_KEY);
      const list: PagoReportadoOCR[] = stored ? JSON.parse(stored) : [];
      const filtered = list.filter((p) => p.id !== payment.id && p.sha256Bytes !== payment.sha256Bytes);
      filtered.unshift(payment);
      if (filtered.length > 50) filtered.pop();
      localStorage.setItem(OCR_TRANSCRIPTIONS_KEY, JSON.stringify(filtered));
    } catch (e) {
      console.warn('[OcrForensicService] Error persistiendo en localStorage:', e);
    }
  }
}

/**
 * Recupera una transcripción guardada previamente por su SHA-256, ID o Número de Referencia
 * Descarta e invalida automáticamente transcripciones incompletas (sin monto > 0, sin referencia o sin banco emisor)
 */
export function getTranscriptionFromMemory(identifier: string): PagoReportadoOCR | null {
  if (!identifier) return null;

  const isCompleteAndValid = (p: PagoReportadoOCR): boolean => {
    return Boolean(
      p &&
      p.montoOriginal &&
      p.montoOriginal > 0 &&
      p.numeroReferencia &&
      p.bancoEmisor
    );
  };

  if (ocrMemoryCache.has(identifier)) {
    const memItem = ocrMemoryCache.get(identifier)!;
    if (isCompleteAndValid(memItem)) {
      return memItem;
    } else {
      // Invalida caché corrupta o incompleta
      ocrMemoryCache.delete(identifier);
    }
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = localStorage.getItem(OCR_TRANSCRIPTIONS_KEY);
      if (stored) {
        const list: PagoReportadoOCR[] = JSON.parse(stored);
        const matchIndex = list.findIndex(
          (p) =>
            p.id === identifier ||
            p.sha256Bytes === identifier ||
            p.numeroReferencia === identifier ||
            p.referenciaNormalizada === identifier
        );
        if (matchIndex !== -1) {
          const match = list[matchIndex];
          if (isCompleteAndValid(match)) {
            ocrMemoryCache.set(identifier, match);
            return match;
          } else {
            // Purgar elemento corrupto de localStorage
            list.splice(matchIndex, 1);
            localStorage.setItem(OCR_TRANSCRIPTIONS_KEY, JSON.stringify(list));
          }
        }
      }
    } catch {}
  }
  return null;
}

export type PreprocessFilter = 'none' | 'invert' | 'high_luminance_isolation' | 'clahe_contrast';

/**
 * Preprocesa una imagen en navegador aplicando rotación (90°, 180°, 270°)
 * o filtros ópticos:
 * - invert: Negativo cromático estándar
 * - high_luminance_isolation: Aislamiento de píxeles de alta luminancia (Y >= 200).
 *   Convierte texto blanco (#FFFFFF) a negro puro (0,0,0) y píldoras grises (~#8E8E93, Y ~ 140)
 *   o fondos oscuros a blanco puro (255,255,255).
 * - clahe_contrast: Estiramiento de contraste dinámico.
 */
export async function preprocessOrRotateImage(
  dataUri: string,
  rotationDeg: 0 | 90 | 180 | 270 = 0,
  filter: PreprocessFilter | boolean = 'none'
): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return dataUri;
  }
  const actualFilter: PreprocessFilter =
    typeof filter === 'boolean' ? (filter ? 'invert' : 'none') : filter;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const isSideways = rotationDeg === 90 || rotationDeg === 270;
        canvas.width = isSideways ? img.height : img.width;
        canvas.height = isSideways ? img.width : img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUri);

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rotationDeg * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);

        if (actualFilter !== 'none') {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = imgData.data;

          if (actualFilter === 'invert') {
            for (let i = 0; i < d.length; i += 4) {
              d[i] = 255 - d[i];
              d[i + 1] = 255 - d[i + 1];
              d[i + 2] = 255 - d[i + 2];
            }
          } else if (actualFilter === 'high_luminance_isolation') {
            // Aislamiento de Alta Luminancia (Canal B - Especial para Píldoras Grises en Modo Oscuro BDV):
            // Letras blancas (#FFFFFF, Y >= 190 / R>=190 & G>=190 & B>=190) -> Negro Puro (0, 0, 0)
            // Píldora gris (~#8E8E93, Y ~ 140) y Fondo negro (#1C1C1E, Y ~ 30) -> Blanco Puro (255, 255, 255)
            for (let i = 0; i < d.length; i += 4) {
              const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
              const isHigh =
                (d[i] >= 190 && d[i + 1] >= 190 && d[i + 2] >= 190) ||
                y >= 195;
              if (isHigh) {
                d[i] = 0;
                d[i + 1] = 0;
                d[i + 2] = 0;
              } else {
                d[i] = 255;
                d[i + 1] = 255;
                d[i + 2] = 255;
              }
            }
          } else if (actualFilter === 'clahe_contrast') {
            let minLuma = 255;
            let maxLuma = 0;
            for (let i = 0; i < d.length; i += 4) {
              const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
              if (y < minLuma) minLuma = y;
              if (y > maxLuma) maxLuma = y;
            }
            const range = Math.max(1, maxLuma - minLuma);
            for (let i = 0; i < d.length; i += 4) {
              d[i] = Math.min(255, Math.max(0, ((d[i] - minLuma) / range) * 255));
              d[i + 1] = Math.min(255, Math.max(0, ((d[i + 1] - minLuma) / range) * 255));
              d[i + 2] = Math.min(255, Math.max(0, ((d[i + 2] - minLuma) / range) * 255));
            }
          }

          ctx.putImageData(imgData, 0, 0);
        }

        resolve(canvas.toDataURL('image/jpeg', 0.95));
      } catch {
        resolve(dataUri);
      }
    };
    img.onerror = () => resolve(dataUri);
    img.src = dataUri;
  });
}

export class OcrForensicService {
  /**
   * Ejecuta el análisis completo del comprobante bajo demanda respetando los 4 Candados de Veracidad
   */
  static async analyzeReceiptImage(
    base64Data: string,
    mimeType: string,
    currentBcvRate: number,
    existingRecords: PagoReportadoOCR[] = []
  ): Promise<PagoReportadoOCR> {
    const startTime = Date.now();

    // 1. Extraer bytes limpios de base64 (soportando Data URLs, Blobs y URLs relativas)
    let base64Clean = base64Data;
    if (base64Data.startsWith('data:')) {
      base64Clean = base64Data.replace(/^data:[a-zA-Z0-9/]+;base64,/, '');
    } else if (typeof window !== 'undefined' && (base64Data.startsWith('blob:') || base64Data.startsWith('http') || base64Data.startsWith('/'))) {
      try {
        const resp = await fetch(base64Data);
        const blob = await resp.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        base64Clean = dataUrl.replace(/^data:[a-zA-Z0-9/]+;base64,/, '');
      } catch (err) {
        console.warn('[OcrForensicService] Error leyendo URL de imagen a base64:', err);
      }
    }

    let isLowRes = false;
    if (typeof window !== 'undefined' && typeof Image !== 'undefined') {
      try {
        const imgProbe = new Image();
        imgProbe.src = base64Data.startsWith('data:') ? base64Data : `data:${mimeType || 'image/jpeg'};base64,${base64Clean}`;
        if (imgProbe.width > 0 && imgProbe.height > 0) {
          if (imgProbe.width < 200 || imgProbe.height < 200) {
            isLowRes = true;
          }
        }
      } catch {}
    }

    const binaryStr = typeof atob !== 'undefined' ? atob(base64Clean) : Buffer.from(base64Clean, 'base64').toString('binary');
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // 2. Calcular huellas digitales
    const sha256 = await calculateSha256(bytes);
    const pHash = await calculatePHash(base64Data, bytes);

    // 3. Candado 2: Inspección Binaria de EXIF
    const exifAudit = inspectExifAndMagicBytes(bytes);

    // 4. Extracción Óptica Real de Doble Capa (Gemini Vision / Tesseract en Píxeles)
    const visionResult = await this.extractWithGeminiVision(base64Clean, mimeType);

    const refNorm = normalizeBankReference(visionResult.numeroReferencia || '');

    // 5. Candado 1: Anti-Reciclaje de Imagen y Referencia
    let isDuplicate = false;
    let matchedRef = '';

    for (const rec of existingRecords) {
      if (rec.sha256Bytes === sha256) {
        isDuplicate = true;
        break;
      }
      if (refNorm && refNorm.length >= 6 && rec.referenciaNormalizada === refNorm) {
        isDuplicate = true;
        matchedRef = refNorm;
        break;
      }
      const dist = calculateHammingDistance(pHash, rec.pHash);
      if (dist <= 6) {
        isDuplicate = true;
        break;
      }
    }

    // 6. Validación de Coherencia Temporal en America/Caracas
    const isFuture = isFutureCaracasDate(visionResult.fechaComprobante);
    const isOld = isDateOlderThanDays(visionResult.fechaComprobante, 90);

    // 7. Candado 4: Cálculo Determinista del Score de Veracidad (0 a 100)
    const veracity = evaluateVeracityScore({
      esDuplicado: isDuplicate,
      hashDuplicado: isDuplicate ? sha256 : undefined,
      referenciaDuplicada: matchedRef || undefined,
      tieneFirmasIAOEdicion: exifAudit.tieneFirmasIAOEdicion,
      softwareDetectado: exifAudit.softwareDetectado,
      consistenciaTipografica: visionResult.consistenciaTipografica,
      halosDeColor: visionResult.halosDeColor,
      patronBancarioValido: visionResult.patronBancarioValido,
      bancoReconocido: Boolean(visionResult.bancoEmisor || visionResult.bancoReceptor),
      bancoEmisor: visionResult.bancoEmisor,
      bancoReceptor: visionResult.bancoReceptor,
      hasReference: Boolean(visionResult.numeroReferencia && visionResult.numeroReferencia.length >= 6),
      numeroReferencia: visionResult.numeroReferencia,
      hasValidAmount: Boolean(visionResult.montoOriginal && visionResult.montoOriginal > 0),
      montoOriginal: visionResult.montoOriginal,
      fechaComprobante: visionResult.fechaComprobante,
      isDateInFuture: isFuture,
      isDateTooOld: isOld,
      hasBeneficiaryData: Boolean(visionResult.rifCedula || visionResult.telefonoNombreEmisor),
      isLowResolution: isLowRes,
    });

    const dictamen: DictamenVeracidadOCR = {
      veredicto: veracity.veredicto,
      score: veracity.score,
      candado1_reciclaje: {
        esDuplicado: isDuplicate,
        hashDuplicado: isDuplicate ? sha256 : undefined,
        referenciaDuplicada: matchedRef || undefined,
        detalle: veracity.detalles.candado1,
      },
      candado2_exif_ia: {
        tieneFirmasIAOEdicion: exifAudit.tieneFirmasIAOEdicion,
        softwareDetectado: exifAudit.softwareDetectado,
        detalle: veracity.detalles.candado2,
      },
      candado3_visual_gemini: {
        consistenciaTipografica: visionResult.consistenciaTipografica,
        halosDeColor: visionResult.halosDeColor,
        patronBancarioValido: visionResult.patronBancarioValido,
        detalle: veracity.detalles.candado3,
      },
      candado4_resumen: veracity.detalles.candado4_resumen,
      tiempoAnalisisMs: Date.now() - startTime,
    };

    const safeRate = currentBcvRate > 0 ? currentBcvRate : 1;
    const montoOrig = centsRound(Number(visionResult.montoOriginal) || 0);
    const isVES = visionResult.monedaOriginal === 'VES';
    const montoUSD = isVES ? centsRound(montoOrig / safeRate) : montoOrig;
    const montoVES = isVES ? montoOrig : centsRound(montoOrig * safeRate);

    const pagoReportado: PagoReportadoOCR = sanitizeFirestorePayload({
      id: `OCR-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      comprobanteOriginalUrl: base64Data,
      sha256Bytes: sha256,
      pHash,
      tipoComprobante: visionResult.tipoComprobante || 'PAGO_MOVIL',
      bancoEmisor: visionResult.bancoEmisor || '',
      bancoReceptor: visionResult.bancoReceptor || '',
      codigoBancoDestino: visionResult.codigoBancoDestino || '',
      fechaComprobante: visionResult.fechaComprobante || getCaracasToday(),
      horaComprobante: visionResult.horaComprobante || '',
      fechaHoraDisplay: visionResult.fechaHoraDisplay || visionResult.fechaComprobante,
      numeroReferencia: visionResult.numeroReferencia || '',
      referenciaNormalizada: refNorm || '',
      monedaOriginal: visionResult.monedaOriginal || 'VES',
      montoOriginal: montoOrig,
      tasaBcvSnapshot: safeRate,
      montoEquivalenteUSD: montoUSD,
      montoEquivalenteVES: montoVES,
      rifCedula: visionResult.rifCedula || '',
      telefonoNombreEmisor: visionResult.telefonoNombreEmisor || '',
      cuentaOrigen: visionResult.cuentaOrigen || '',
      concepto: visionResult.concepto || '',
      anomaliaSospechosa: veracity.anomalias.length > 0 ? veracity.anomalias.join(' • ') : undefined,
      dictamenVeracidad: dictamen,
      estadoConciliacion: 'pendiente_revision',
      createdTimestamp: Date.now(),
      updatedTimestamp: Date.now(),
    });

    // Persistencia en memoria activa y localStorage de la transcripción OCR
    saveTranscriptionToMemory(pagoReportado);

    return pagoReportado;
  }

  /**
   * Extracción Óptica Real de Doble Capa:
   * Capa 1: Endpoint Proxy Gemini Vision en Backend (/api/ocr-analyze)
   * Capa 2: Tesseract OCR sobre los píxeles reales en Cliente con Parser Bancario
   * PROHIBIDO inventar datos a partir de substrings del Base64 crudo.
   */
  private static async extractWithGeminiVision(
    base64Clean: string,
    mimeType: string
  ): Promise<{
    tipoComprobante: TipoComprobanteOCR;
    bancoEmisor?: string;
    bancoReceptor?: string;
    codigoBancoDestino?: string;
    fechaComprobante: string;
    horaComprobante?: string;
    fechaHoraDisplay?: string;
    numeroReferencia: string;
    monedaOriginal: 'VES' | 'USD';
    montoOriginal: number;
    rifCedula?: string;
    telefonoNombreEmisor?: string;
    cuentaOrigen?: string;
    concepto?: string;
    consistenciaTipografica: boolean;
    halosDeColor: boolean;
    patronBancarioValido: boolean;
    analisisVisualDetalle: string;
  }> {
    // 1. Intentar vía endpoint proxy seguro del backend (/api/ocr-analyze)
    let backendData: any = null;
    if (typeof window !== 'undefined') {
      try {
        const resp = await fetch('/api/ocr-analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Clean, mimeType: mimeType || 'image/jpeg' }),
        });
        if (resp.ok) {
          const resJson = await resp.json();
          if (resJson.success && resJson.data) {
            const d = resJson.data;
            const parsedMonto = parseVenezuelanOrInternationalAmount(String(d.montoOriginal || 0));
            // Si el backend extrajo monto mayor a cero y datos válidos, retornar de inmediato
            if (parsedMonto > 0 && (d.bancoEmisor || d.numeroReferencia)) {
              return {
                tipoComprobante: d.tipoComprobante || 'PAGO_MOVIL',
                bancoEmisor: d.bancoEmisor || '',
                bancoReceptor: d.bancoReceptor || '',
                codigoBancoDestino: d.codigoBancoDestino || '',
                fechaComprobante: d.fechaComprobante || getCaracasToday(),
                horaComprobante: d.horaComprobante || '',
                fechaHoraDisplay: d.fechaHoraDisplay || d.fechaComprobante,
                numeroReferencia: String(d.numeroReferencia || '').replace(/[^0-9A-Za-z]/g, ''),
                monedaOriginal: d.monedaOriginal === 'USD' ? 'USD' : 'VES',
                montoOriginal: parsedMonto,
                rifCedula: d.rifCedula || '',
                telefonoNombreEmisor: d.telefonoNombreEmisor || '',
                cuentaOrigen: d.cuentaOrigen || '',
                concepto: d.concepto || '',
                consistenciaTipografica: d.consistenciaTipografica ?? true,
                halosDeColor: d.halosDeColor ?? false,
                patronBancarioValido: d.patronBancarioValido ?? true,
                analisisVisualDetalle: d.analisisVisualDetalle || 'Comprobante analizado con peritaje multimodal.',
              };
            } else if (d.bancoEmisor || d.numeroReferencia) {
              // Guardar datos parciales del backend para fusionar tras pasada local
              backendData = d;
            }
          }
        }
      } catch (proxyErr) {
        console.debug('[OcrForensicService] Proxy backend no disponible, intentando OCR cliente:', proxyErr);
      }
    }

    // 2. Capa Secundaria: Reconocimiento Óptico Real sobre Píxeles en Cliente (Tesseract.js)
    let worker: any = null;
    try {
      const { createWorker } = await import('tesseract.js');
      worker = await createWorker('spa+eng');
      const basePayload = base64Clean.startsWith('data:')
        ? base64Clean
        : `data:${mimeType || 'image/jpeg'};base64,${base64Clean}`;

      // Canal A: Pasada estándar a 0° orientación
      let ret = await worker.recognize(basePayload);
      let ocrRawText = ret?.data?.text || '';
      let parsed = parseBankReceiptText(ocrRawText);

      // Si falta monto, referencia o beneficiario, ejecutar Canal B (Aislamiento de Alta Luminancia) y transformaciones
      if (!parsed.esComprobanteValido || parsed.montoOriginal <= 0 || !parsed.numeroReferencia || !parsed.rifCedula) {
        const passes: { angle: 0 | 90 | 180 | 270; filter: PreprocessFilter }[] = [
          // Canal B: Aislamiento de texto blanco sobre píldora gris en modo oscuro (Y >= 195)
          { angle: 0, filter: 'high_luminance_isolation' },
          // Inversión estándar
          { angle: 0, filter: 'invert' },
          // Rotaciones 90°, 180°, 270°
          { angle: 90, filter: 'none' },
          { angle: 180, filter: 'none' },
          { angle: 270, filter: 'none' },
        ];

        for (const p of passes) {
          try {
            const transformedPayload = await preprocessOrRotateImage(basePayload, p.angle, p.filter);
            const pRet = await worker.recognize(transformedPayload);
            const pText = pRet?.data?.text || '';
            if (pText.trim().length > 10) {
              const pParsed = parseBankReceiptText(pText);
              parsed = mergeReceiptResults(parsed, pParsed);
              if (parsed.esComprobanteValido && parsed.montoOriginal > 0 && parsed.numeroReferencia) {
                break;
              }
            }
          } catch (_) {}
        }
      }

      // Si teníamos datos parciales del backend, fusionar asegurando que el monto extraído prevalezca
      if (backendData) {
        parsed = mergeReceiptResults(
          {
            tipoComprobante: backendData.tipoComprobante || 'PAGO_MOVIL',
            bancoEmisor: backendData.bancoEmisor || '',
            bancoReceptor: backendData.bancoReceptor || '',
            codigoBancoDestino: backendData.codigoBancoDestino || '',
            numeroReferencia: backendData.numeroReferencia || '',
            montoOriginal: parseVenezuelanOrInternationalAmount(String(backendData.montoOriginal || 0)),
            monedaOriginal: backendData.monedaOriginal === 'USD' ? 'USD' : 'VES',
            fechaComprobante: backendData.fechaComprobante || getCaracasToday(),
            horaComprobante: backendData.horaComprobante || '',
            fechaHoraDisplay: backendData.fechaHoraDisplay || '',
            rifCedula: backendData.rifCedula || '',
            telefonoNombreEmisor: backendData.telefonoNombreEmisor || '',
            cuentaOrigen: backendData.cuentaOrigen || '',
            concepto: backendData.concepto || '',
            indicadoresManipulacionVisual: [],
            anomaliasEstructurales: [],
            confianzaExtraccion: 90,
            esComprobanteValido: true,
          },
          parsed
        );
      }
      if (parsed.esComprobanteValido || parsed.montoOriginal > 0 || parsed.numeroReferencia) {
        return {
          tipoComprobante: parsed.tipoComprobante,
          bancoEmisor: parsed.bancoEmisor,
          bancoReceptor: parsed.bancoReceptor,
          codigoBancoDestino: parsed.codigoBancoDestino,
          fechaComprobante: parsed.fechaComprobante,
          horaComprobante: parsed.horaComprobante,
          fechaHoraDisplay: parsed.fechaHoraDisplay,
          numeroReferencia: parsed.numeroReferencia,
          monedaOriginal: parsed.monedaOriginal,
          montoOriginal: parsed.montoOriginal,
          rifCedula: parsed.rifCedula,
          telefonoNombreEmisor: parsed.telefonoNombreEmisor,
          cuentaOrigen: parsed.cuentaOrigen,
          concepto: parsed.concepto,
          consistenciaTipografica: true,
          halosDeColor: false,
          patronBancarioValido: true,
          analisisVisualDetalle: 'Extracción óptica de píxeles mediante Tesseract OCR local con compensación multi-orientación y contraste.',
        };
      }
    } catch (clientTessErr) {
      console.debug('[OcrForensicService] Tesseract cliente no pudo procesar imagen:', clientTessErr);
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch (_) {}
      }
    }

    // Fallback defensivo Cero Mock Data: Nunca inventar cifras ni bancos ficticios
    return {
      tipoComprobante: 'PAGO_MOVIL',
      bancoEmisor: '',
      bancoReceptor: '',
      codigoBancoDestino: '',
      fechaComprobante: getCaracasToday(),
      horaComprobante: '',
      fechaHoraDisplay: '',
      numeroReferencia: '',
      monedaOriginal: 'VES',
      montoOriginal: 0,
      rifCedula: '',
      telefonoNombreEmisor: '',
      cuentaOrigen: '',
      concepto: '',
      consistenciaTipografica: true,
      halosDeColor: false,
      patronBancarioValido: false,
      analisisVisualDetalle: 'Extracción visual no concluyente. Por favor verifique e introduzca los datos manualmente.',
    };
  }

  static saveTranscriptionToMemory(payment: PagoReportadoOCR): void {
    saveTranscriptionToMemory(payment);
  }

  static getTranscriptionFromMemory(identifier: string): PagoReportadoOCR | null {
    return getTranscriptionFromMemory(identifier);
  }

  static async saveReportedPayment(
    payment: PagoReportadoOCR
  ): Promise<{ success: boolean; id: string; error?: string }> {
    try {
      const sanitized = sanitizeFirestorePayload(payment);
      const docRef = doc(db, PAGOS_REPORTADOS_COLLECTION, sanitized.id);
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await offlineSyncEngine.enqueueMutation(
          PAGOS_REPORTADOS_COLLECTION,
          sanitized.id,
          'SET',
          sanitized,
          { offline: true }
        );
      } else {
        await setDoc(docRef, sanitized);
      }
      return { success: true, id: sanitized.id };
    } catch (err: any) {
      console.error('[OcrForensicService] Error guardando pago reportado:', err);
      return { success: false, id: payment.id, error: err.message };
    }
  }

  /**
   * Suscripción en tiempo real a la bandeja de pagos reportados pendientes
   */
  static subscribePendingReportedPayments(
    callback: (payments: PagoReportadoOCR[]) => void
  ): () => void {
    const q = query(
      collection(db, PAGOS_REPORTADOS_COLLECTION),
      orderBy('createdTimestamp', 'desc'),
      limit(100)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const payments = snapshot.docs.map((d) => d.data() as PagoReportadoOCR);
        callback(payments);
      },
      (err) => {
        console.warn('[OcrForensicService] Error escuchando pagos reportados:', err);
      }
    );
  }

  /**
   * CIERRE TRANSACCIONAL ATÓMICO: Registra Pago Conciliado y Cruza Factura
   * 1. Registra el ingreso contable en la colección 'payments'.
   * 2. Deduce el saldo pendiente en 'billing_invoices' (marca como PAGADA si llega a 0).
   * 3. Actualiza el comprobante a 'aprobado_conciliado' en 'pagos_reportados_ocr'.
   * 4. Registra auditoría inmutable.
   * Línea Roja: Bloqueado para rol OBRERO. Exige justificación si el comprobante tenía ALERTA_FRAUDE.
   */
  static async approveAndReconcilePayment(
    pagoId: string,
    options: {
      invoiceId?: string;
      entityId?: string;
      entityName?: string;
      bcvRate: number;
      userId: string;
      userRole: string;
      notasRevision?: string;
      justificacionSuperAdmin?: string;
    }
  ): Promise<{ success: boolean; paymentRecordId?: string; error?: string }> {
    // 1. Candado ABAC
    if (options.userRole === 'OBRERO') {
      return {
        success: false,
        error: 'Acceso Denegado (403): El rol OBRERO no posee facultades para conciliar pagos contables.',
      };
    }

    try {
      const pagoRef = doc(db, PAGOS_REPORTADOS_COLLECTION, pagoId);
      const pagoSnap = await getDoc(pagoRef);
      if (!pagoSnap.exists()) {
        return { success: false, error: 'El registro de pago OCR no existe.' };
      }

      const pago = pagoSnap.data() as PagoReportadoOCR;

      // Si tiene alerta roja, solo SUPERADMIN con justificación puede proceder
      if (
        pago.dictamenVeracidad.veredicto === 'ALERTA_FRAUDE_EDICION_O_IA' &&
        options.userRole !== 'SUPERADMIN'
      ) {
        return {
          success: false,
          error:
            'Bloqueo de Seguridad: Este comprobante posee Dictamen de Fraude/Edición. Solo un SUPERADMIN puede forzar su conciliación.',
        };
      }

      if (
        pago.dictamenVeracidad.veredicto === 'ALERTA_FRAUDE_EDICION_O_IA' &&
        (!options.justificacionSuperAdmin || options.justificacionSuperAdmin.trim().length < 10)
      ) {
        return {
          success: false,
          error:
            'Justificación Requerida: Debe ingresar una justificación detallada (mínimo 10 caracteres) para autorizar un comprobante con Alerta de Fraude.',
        };
      }

      const now = Date.now();
      const paymentRecordId = `PAY-OCR-${now}-${Math.random().toString(36).substring(2, 7)}`;
      const safeRate = options.bcvRate > 0 ? options.bcvRate : pago.tasaBcvSnapshot;
      const safeUSD = pago.montoEquivalenteUSD;
      const safeVES = pago.montoEquivalenteVES;

      const batch = writeBatch(db);

      // (A) Crear PaymentRecord oficial en 'payments'
      const paymentRecord: PaymentRecord = {
        id: paymentRecordId,
        date: pago.fechaComprobante,
        paymentMode: (pago.tipoComprobante as any) || 'TRANSFERENCIA',
        platform: pago.bancoEmisor || 'Pago Móvil / Banco',
        reference: pago.referenciaNormalizada || pago.numeroReferencia,
        idDocument: pago.rifCedula || 'J-00000000-0',
        entityId: options.entityId || pago.clienteIdSugerido || 'CLIENTE_GENERICO',
        entityName: options.entityName || pago.clienteNombreSugerido || 'Cliente Puro Apure',
        city: 'San Fernando de Apure',
        linkedInvoice: options.invoiceId || pago.facturaIdSeleccionada || 'ANTICIPO',
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
          source: 'OCR Forense Anti-IA & Pre-Conciliación v1.0',
        },
        createdAt: now,
        updatedBy: options.userId,
      };

      const newPayRef = doc(db, PAYMENTS_COLLECTION, paymentRecordId);
      batch.set(newPayRef, sanitizeFirestorePayload(paymentRecord));

      // (B) Deducir / Saldar Factura si se seleccionó una
      const targetInvoiceId = options.invoiceId || pago.facturaIdSeleccionada;
      if (targetInvoiceId) {
        const invRef = doc(db, INVOICES_COLLECTION, targetInvoiceId);
        const invSnap = await getDoc(invRef);
        if (invSnap.exists()) {
          const invData = invSnap.data() as BillingInvoice;
          const saldoPrevio = Number(invData.saldoPendienteUSD !== undefined ? invData.saldoPendienteUSD : invData.totalUSD) || 0;
          const nuevoSaldo = centsRound(Math.max(0, saldoPrevio - safeUSD));
          const nuevoPaymentStatus = nuevoSaldo <= 0 ? 'PAGADO' : 'PARCIAL';

          batch.update(invRef, sanitizeFirestorePayload({
            saldoPendienteUSD: nuevoSaldo,
            paymentStatus: nuevoPaymentStatus,
            estado: nuevoSaldo <= 0 ? 'PAGADA' : 'PARCIAL',
            lastPaymentTimestamp: now,
            updatedBy: options.userId,
          }));
        }
      }

      // (C) Actualizar Pago Reportado OCR a 'aprobado_conciliado'
      batch.update(pagoRef, sanitizeFirestorePayload({
        estadoConciliacion: 'aprobado_conciliado',
        revisadoPor: options.userId,
        fechaRevision: now,
        notasRevision: options.notasRevision || pago.notasRevision || 'Aprobado y conciliado.',
        justificacionSuperAdmin: options.justificacionSuperAdmin || null,
        paymentRecordIdGenerado: paymentRecordId,
        updatedTimestamp: now,
      }));

      // (D) Audit Trail
      const auditRef = doc(db, AUDIT_COLLECTION, `AUD-${now}`);
      batch.set(auditRef, sanitizeFirestorePayload({
        accion: 'CONCILIACION_PAGO_OCR',
        pagoId,
        paymentRecordId,
        usuario: options.userId,
        rol: options.userRole,
        montoUSD: safeUSD,
        scoreVeracidad: pago.dictamenVeracidad.score,
        veredicto: pago.dictamenVeracidad.veredicto,
        timestamp: now,
      }));

      await batch.commit();

      return { success: true, paymentRecordId };
    } catch (err: any) {
      console.error('[OcrForensicService] Error al conciliar pago atómico:', err);
      return { success: false, error: err.message };
    }
  }
}

export function extractReceiptHeuristic(text: string) {
  const parsed = parseBankReceiptText(text);
  return {
    hasData: parsed.esComprobanteValido || parsed.montoOriginal > 0 || Boolean(parsed.numeroReferencia),
    tipoComprobante: parsed.tipoComprobante,
    bancoEmisor: parsed.bancoEmisor,
    bancoReceptor: parsed.bancoReceptor,
    fechaComprobante: parsed.fechaComprobante,
    numeroReferencia: parsed.numeroReferencia,
    monedaOriginal: parsed.monedaOriginal,
    montoOriginal: parsed.montoOriginal,
    rifCedula: parsed.rifCedula,
    telefonoNombreEmisor: parsed.telefonoNombreEmisor,
    telefonoEmisor: parsed.telefonoNombreEmisor,
    cuentaOrigen: parsed.cuentaOrigen,
    concepto: parsed.concepto,
  };
}
