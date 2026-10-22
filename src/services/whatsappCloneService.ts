/**
 * Servicio de Clon de WhatsApp Web, Conectividad QR y Gestión CRM/BRM
 * Puro Apure ERP - Módulo de Mensajería Bidireccional
 * Respeta el paradigma Offline-First, idempotencia por message_id y normalización E.164
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { offlineSyncEngine } from './offlineSyncEngine';
import {
  WhatsAppLine,
  WhatsAppMessage,
  WhatsAppTemplate,
  WhatsAppChatContact,
} from '../types/crmWhatsapp';
import { DualEntity } from '../types/finance';
import { sanitizeFirestorePayload } from '../utils/sanitizeFirestorePayload';

const LINES_COLLECTION = 'whatsapp_lineas';
const MESSAGES_COLLECTION = 'whatsapp_mensajes';
const TEMPLATES_COLLECTION = 'whatsapp_plantillas';

export const DEFAULT_LINE_NAMES: Record<string, string> = {
  linea_cobranzas: 'Línea de Crédito y Cobranzas',
  linea_ventas: 'Línea de Ventas y Despacho',
  linea_brm: 'Línea de Proveedores y BRM',
};

/**
 * Normaliza cualquier número telefónico al estándar internacional E.164 (+58...)
 * Soporta números venezolanos móviles (0412, 0414, 0424, 0416, 0426) o internacionales.
 */
export function normalizeToE164(phone: string): string {
  if (!phone) return '';
  let clean = phone.replace(/[^\d+]/g, '');

  if (clean.startsWith('+')) {
    return clean;
  }

  if (clean.startsWith('0')) {
    return `+58${clean.substring(1)}`;
  }

  if (clean.startsWith('58')) {
    return `+${clean}`;
  }

  return `+58${clean}`;
}

export const DEFAULT_WHATSAPP_TEMPLATES: Omit<WhatsAppTemplate, 'id'>[] = [
  {
    nombre: 'Bienvenida y Facturación Preventiva',
    categoria: 'BIENVENIDA_FACTURA',
    textoPlantilla:
      'Estimado(a) {cliente}, le saludamos de Agropecuaria Puro Apure. Le notificamos que su factura N° {factura} ha sido emitida por un monto de ${monto_usd} USD (Bs. {monto_ves}). Fecha límite de pago: {fecha_vencimiento}. Estamos a su entera disposición.',
    variablesRequeridas: ['{cliente}', '{factura}', '{monto_usd}', '{monto_ves}', '{fecha_vencimiento}'],
    activo: true,
  },
  {
    nombre: 'Recordatorio Previo (-3 Días)',
    categoria: 'RECORDATORIO_PREVIO',
    textoPlantilla:
      'Hola {cliente}, le recordamos cordialmente que su factura N° {factura} por ${monto_usd} USD vencerá en 3 días ({fecha_vencimiento}). Agradecemos reportar su comprobante por esta vía para su oportuna pre-conciliación contable.',
    variablesRequeridas: ['{cliente}', '{factura}', '{monto_usd}', '{fecha_vencimiento}'],
    activo: true,
  },
  {
    nombre: 'Vencimiento Administrativo',
    categoria: 'VENCIMIENTO_ADMINISTRATIVO',
    textoPlantilla:
      'Atención {cliente}, le informamos que su factura N° {factura} por ${monto_usd} USD ha llegado hoy a su fecha de vencimiento ({fecha_vencimiento}). Le solicitamos gestionar su cancelación a la brevedad para mantener la vigencia de su línea de despacho.',
    variablesRequeridas: ['{cliente}', '{factura}', '{monto_usd}', '{fecha_vencimiento}'],
    activo: true,
  },
  {
    nombre: 'Mora Empática y Negociación',
    categoria: 'MORA_EMPATICA',
    textoPlantilla:
      'Estimado(a) {cliente}, nos comunicamos desde la Gerencia de Cobranzas de Puro Apure respecto a la factura N° {factura} vencida con saldo de ${monto_usd} USD. Entendemos la dinámica productiva y deseamos acordar un plan de abono oportuno. Por favor indíquenos su disponibilidad para coordinar.',
    variablesRequeridas: ['{cliente}', '{factura}', '{monto_usd}'],
    activo: true,
  },
  {
    nombre: 'Confirmación de Pago Conciliado',
    categoria: 'CONFIRMACION_PAGO',
    textoPlantilla:
      '¡Excelente noticia, {cliente}! Su reporte de pago correspondiente a la factura N° {factura} por ${monto_usd} USD (Bs. {monto_ves}) ha sido validado por nuestro Analista Forense OCR y CONCILIADO exitosamente en el sistema contable de Puro Apure ERP. ¡Muchas gracias por su compromiso!',
    variablesRequeridas: ['{cliente}', '{factura}', '{monto_usd}', '{monto_ves}'],
    activo: true,
  },
  {
    nombre: 'Seguimiento a Proveedor (BRM)',
    categoria: 'SEGUIMIENTO_PROVEEDOR',
    textoPlantilla:
      'Estimado aliado {cliente}, le contactamos del departamento de Administración de Puro Apure para coordinar la recepción de insumos/materia prima y la programación de pagos correspondiente a la orden {factura}. Agradecemos confirmar recepción de este mensaje.',
    variablesRequeridas: ['{cliente}', '{factura}'],
    activo: true,
  },
];

export class WhatsAppCloneService {
  /**
   * Inicializa las 3 líneas operativas base sin datos ficticios (Cero Mock Data)
   */
  static async initializeDefaultLines(): Promise<WhatsAppLine[]> {
    const defaultLines: WhatsAppLine[] = [
      {
        id: 'linea_cobranzas',
        nombre: 'Línea de Crédito y Cobranzas',
        tipo: 'COBRANZAS',
        numeroTelefono: '',
        estado: 'DESCONECTADO',
        lastActivityTimestamp: Date.now(),
        isOnline: false,
      },
      {
        id: 'linea_ventas',
        nombre: 'Línea de Ventas y Despacho',
        tipo: 'VENTAS',
        numeroTelefono: '',
        estado: 'DESCONECTADO',
        lastActivityTimestamp: Date.now(),
        isOnline: false,
      },
      {
        id: 'linea_brm',
        nombre: 'Línea de Proveedores y BRM',
        tipo: 'PROVEEDORES_BRM',
        numeroTelefono: '',
        estado: 'DESCONECTADO',
        lastActivityTimestamp: Date.now(),
        isOnline: false,
      },
    ];

    try {
      const snap = await getDocs(collection(db, LINES_COLLECTION));
      if (snap.empty) {
        for (const line of defaultLines) {
          await setDoc(doc(db, LINES_COLLECTION, line.id), line);
        }
        return defaultLines;
      }

      // Saneamiento DevSecOps: Si algún doc en Firestore tiene números ficticios heredados, sanearlos
      const DEFAULT_LINE_NAMES: Record<string, string> = {
        linea_cobranzas: 'Línea de Crédito y Cobranzas',
        linea_ventas: 'Línea de Ventas y Despacho',
        linea_brm: 'Línea de Proveedores y BRM',
      };

      const lines: WhatsAppLine[] = snap.docs.map((d) => {
        const data = d.data() as WhatsAppLine;
        const nombre = data.nombre || DEFAULT_LINE_NAMES[data.id || d.id] || `Línea ${data.id || d.id}`;
        if (data.numeroTelefono && data.numeroTelefono.includes('58414000000')) {
          return {
            ...data,
            nombre,
            numeroTelefono: '',
            estado: (data.estado === 'CONECTADO' ? 'DESCONECTADO' : data.estado) as WhatsAppLine['estado'],
            isOnline: false,
          };
        }
        return {
          ...data,
          nombre,
        };
      });
      return lines;
    } catch {
      return defaultLines;
    }
  }

  /**
   * Suscripción en tiempo real a las líneas activas
   */
  static subscribeWhatsAppLines(callback: (lines: WhatsAppLine[]) => void): () => void {
    const DEFAULT_LINE_NAMES: Record<string, string> = {
      linea_cobranzas: 'Línea de Crédito y Cobranzas',
      linea_ventas: 'Línea de Ventas y Despacho',
      linea_brm: 'Línea de Proveedores y BRM',
    };

    const q = query(collection(db, LINES_COLLECTION));
    return onSnapshot(
      q,
      (snapshot) => {
        const lines: WhatsAppLine[] = snapshot.docs.map((d) => {
          const data = d.data() as WhatsAppLine;
          const nombre = data.nombre || DEFAULT_LINE_NAMES[data.id || d.id] || `Línea ${data.id || d.id}`;
          if (data.numeroTelefono && data.numeroTelefono.includes('58414000000')) {
            return {
              ...data,
              nombre,
              numeroTelefono: '',
              estado: (data.estado === 'CONECTADO' ? 'DESCONECTADO' : data.estado) as WhatsAppLine['estado'],
              isOnline: false,
            };
          }
          return {
            ...data,
            nombre,
          };
        });
        callback(lines);
      },
      (err) => {
        console.warn('[WhatsAppCloneService] Error escuchando líneas:', err);
      }
    );
  }

  /**
   * Actualiza el estado de una línea de forma resiliente con merge (SSoT)
   */
  static async updateLineStatus(
    lineaId: string,
    estado: WhatsAppLine['estado'],
    numeroTelefono?: string,
    qrDataUri?: string
  ): Promise<boolean> {
    try {
      const ref = doc(db, LINES_COLLECTION, lineaId);
      const isOnline = estado === 'CONECTADO';
      const payload: Record<string, any> = {
        id: lineaId,
        estado,
        isOnline,
        lastActivityTimestamp: Date.now(),
      };
      if (isOnline && numeroTelefono) {
        payload.numeroTelefono = numeroTelefono;
        payload.numeroConectado = numeroTelefono;
      } else {
        payload.numeroTelefono = '';
        payload.numeroConectado = '';
      }
      if (qrDataUri) {
        payload.qrCodeDataUri = qrDataUri;
      }
      await setDoc(ref, payload, { merge: true });
      return true;
    } catch (err: any) {
      console.warn('[WhatsAppCloneService] Advertencia actualizando estado de línea:', err?.message || err);
      return false;
    }
  }

  /**
   * Consulta el estado en vivo del puente de servidor (SSoT)
   */
  static async getLineLiveStatus(lineaId: string): Promise<{
    success: boolean;
    estado: WhatsAppLine['estado'];
    numeroConectado?: string;
    qrCodeDataUri?: string;
    lastError?: string;
  }> {
    try {
      const res = await fetch(`/api/whatsapp/status?lineaId=${encodeURIComponent(lineaId)}`, {
        cache: 'no-store',
      }).then((r) => r.json());
      return res;
    } catch (err: any) {
      return { success: false, estado: 'DESCONECTADO', lastError: err.message };
    }
  }

  /**
   * Solicita la generación de un código QR auténtico al servidor
   */
  static async requestQrCode(
    lineaId: string,
    forceNew: boolean = false
  ): Promise<{
    success: boolean;
    estado: WhatsAppLine['estado'];
    qrCodeDataUri?: string;
    qrDataUri?: string;
    lastError?: string;
  }> {
    try {
      const endpoint = forceNew
        ? `/api/whatsapp/force-qr?lineaId=${encodeURIComponent(lineaId)}`
        : `/api/whatsapp/qr?lineaId=${encodeURIComponent(lineaId)}`;
      const res = await fetch(endpoint, {
        method: forceNew ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      }).then((r) => r.json());
      return res;
    } catch (err: any) {
      return { success: false, estado: 'ERROR', lastError: err.message };
    }
  }

  /**
   * Desvincula la línea y cierra la sesión tanto en el socket como en Firestore
   */
  static async disconnectLine(lineaId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const currentUser = auth.currentUser;
      const token = currentUser ? await currentUser.getIdToken() : '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/whatsapp/disconnect?lineaId=${encodeURIComponent(lineaId)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ lineaId }),
      }).then((r) => r.json());

      if (!res.success) {
        return { success: false, error: res.error || 'Error al desvincular' };
      }

      await this.updateLineStatus(lineaId, 'DESCONECTADO', '');
      return { success: true };
    } catch (err: any) {
      console.error('[WhatsAppCloneService] Error al desvincular línea:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Fuerza la desvinculación completa y solicita un código QR limpio y nuevo
   */
  static async forceResetQr(lineaId: string): Promise<{
    success: boolean;
    estado: WhatsAppLine['estado'];
    qrCodeDataUri?: string;
    qrDataUri?: string;
    lastError?: string;
  }> {
    try {
      const currentUser = auth.currentUser;
      const token = currentUser ? await currentUser.getIdToken() : '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/whatsapp/force-qr?lineaId=${encodeURIComponent(lineaId)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ lineaId, force: true }),
      }).then((r) => r.json());

      const estado = res.estado || (res.success ? 'ESPERANDO_QR' : 'ERROR');
      const qrDataUri = res.qrCodeDataUri || res.qrDataUri;

      await this.updateLineStatus(lineaId, estado, undefined, qrDataUri);

      return {
        success: res.success,
        estado,
        qrCodeDataUri: qrDataUri,
        qrDataUri: qrDataUri,
        lastError: res.error || res.lastError || res.message,
      };
    } catch (err: any) {
      console.error('[WhatsAppCloneService] Error al forzar nuevo QR:', err);
      return { success: false, estado: 'ERROR', lastError: err.message };
    }
  }

  /**
   * Suscripción en tiempo real a todos los mensajes de una línea para sincronización y vista previa en la barra lateral
   */
  static subscribeLineMessages(
    lineaId: string,
    callback: (messages: WhatsAppMessage[]) => void
  ): () => void {
    const q = query(
      collection(db, MESSAGES_COLLECTION),
      where('lineaId', '==', lineaId),
      limit(500)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const all = snapshot.docs.map((d) => d.data() as WhatsAppMessage);
        all.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        callback(all);
      },
      (err) => {
        console.warn('[WhatsAppCloneService] Error suscribiendo mensajes de línea:', err);
      }
    );
  }

  /**
   * Suscripción en tiempo real a los mensajes de una conversación específica
   */
  static subscribeChatMessages(
    lineaId: string,
    contactPhone: string,
    callback: (messages: WhatsAppMessage[]) => void
  ): () => void {
    const normPhone = normalizeToE164(contactPhone);
    const q = query(
      collection(db, MESSAGES_COLLECTION),
      where('lineaId', '==', lineaId),
      limit(300)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const all = snapshot.docs.map((d) => d.data() as WhatsAppMessage);
        const chatMsgs = all.filter(
          (m) =>
            normalizeToE164(m.remitenteTelefono) === normPhone ||
            normalizeToE164(m.destinatarioTelefono) === normPhone
        );
        chatMsgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        // Deduplicación estricta de mensajes salientes (ventana de 5s y mismo texto)
        const deduped: WhatsAppMessage[] = [];
        const seenIds = new Set<string>();
        const seenContent = new Set<string>();

        for (const m of chatMsgs) {
          if (seenIds.has(m.id)) continue;
          if (m.direccion === 'SALIENTE') {
            const sig = `${m.destinatarioTelefono}_${(m.texto || '').trim()}_${Math.floor((m.timestamp || 0) / 5000)}`;
            if (seenContent.has(sig)) continue;
            seenContent.add(sig);
          }
          seenIds.add(m.id);
          deduped.push(m);
        }

        callback(deduped);
      },
      (err) => {
        console.warn('[WhatsAppCloneService] Error suscribiendo mensajes de chat:', err);
      }
    );
  }

  /**
   * Consulta los contactos sincronizados de la agenda del teléfono vinculado
   */
  static async getLineContacts(lineaId: string): Promise<Record<string, { id: string; name?: string; phone?: string }>> {
    try {
      const res = await fetch(`/api/whatsapp/contacts?lineaId=${lineaId}`, {
        cache: 'no-store',
      }).then((r) => r.json());
      return res?.contacts || {};
    } catch {
      return {};
    }
  }

  /**
   * Depuración DevSecOps: Pone en cuarentena y elimina documentos antiguos con LIDs corruptos (ej. +83983891230953, +25404815458478)
   */
  static async purgeCorruptedLidMessages(lineaId?: string): Promise<number> {
    try {
      const q = lineaId
        ? query(collection(db, MESSAGES_COLLECTION), where('lineaId', '==', lineaId), limit(500))
        : query(collection(db, MESSAGES_COLLECTION), limit(500));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      let count = 0;

      const isCorruptedLid = (phone?: string) => {
        if (!phone) return false;
        const digits = phone.replace(/\D/g, '');
        // LIDs huérfanos típicos de Baileys que no son números E.164 venezolanos (58) ni números internacionales válidos
        if (digits === '83983891230953' || digits === '25404815458478') return true;
        if (digits.length >= 13 && !digits.startsWith('58') && !phone.includes('@')) return true;
        return false;
      };

      snap.forEach((d) => {
        const m = d.data() as WhatsAppMessage;
        if (isCorruptedLid(m.remitenteTelefono) || isCorruptedLid(m.destinatarioTelefono)) {
          batch.delete(d.ref);
          count++;
        }
      });

      if (count > 0) {
        await batch.commit();
        console.log(`[WhatsAppCloneService] Purga completada: ${count} mensajes con LIDs corruptos eliminados.`);
      }
      return count;
    } catch (err) {
      console.warn('[WhatsAppCloneService] Aviso al depurar LIDs corruptos:', err);
      return 0;
    }
  }

  /**
   * Envía un mensaje en el Clon de WhatsApp Web con autorización Bearer y validación auténtica de socket
   */
  static async sendWhatsAppMessage(
    lineaId: string,
    remitenteTelefono: string,
    destinatarioTelefono: string,
    texto: string,
    tipoMensaje: WhatsAppMessage['tipoMensaje'] = 'TEXTO',
    mediaUrl?: string,
    mediaMimeType?: string,
    destinatarioNombre?: string
  ): Promise<{ success: boolean; messageId: string; error?: string }> {
    const msgId = `WAM-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    const destNorm = normalizeToE164(destinatarioTelefono);
    const remNorm = normalizeToE164(remitenteTelefono);

    const message: WhatsAppMessage & { destinatarioNombre?: string; errorDetalle?: string } = {
      id: msgId,
      whatsappMessageId: msgId,
      lineaId,
      remitenteTelefono: remNorm,
      destinatarioTelefono: destNorm,
      direccion: 'SALIENTE',
      texto,
      timestamp: now,
      estado: 'ENVIADO',
      tipoMensaje,
      hasComprobantePago: false,
      ocrStatus: 'NO_ANALIZADO',
      destinatarioNombre: destinatarioNombre || undefined,
    };

    if (mediaUrl) {
      message.mediaUrl = mediaUrl;
    }
    if (mediaMimeType) {
      message.mediaMimeType = mediaMimeType;
    }

    const cleanMessage = sanitizeFirestorePayload(message);

    try {
      let serverRes: { success: boolean; messageId?: string; error?: string } = {
        success: false,
        error: 'Línea desconectada',
      };

      // Entrega real a través de la pasarela de servidor con autorización
      if (typeof window !== 'undefined') {
        const currentUser = auth.currentUser;
        const token = currentUser ? await currentUser.getIdToken() : '';
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        try {
          const fetchRes = await fetch('/api/whatsapp/send', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              lineaId,
              toPhone: destNorm,
              text: texto,
              mediaDataUrl: mediaUrl || undefined,
              clientMsgId: msgId,
              destinatarioNombre: destinatarioNombre || undefined,
            }),
          });
          serverRes = await fetchRes.json();
        } catch (fetchErr: any) {
          serverRes = {
            success: false,
            error: fetchErr.message || 'Error de conexión con la pasarela de WhatsApp',
          };
        }
      }

      const docRef = doc(db, MESSAGES_COLLECTION, msgId);

      // Si el servidor reporta error o desconexión, marcar como FALLIDO (prohibido fingir éxito)
      if (!serverRes.success) {
        const failedMessage: WhatsAppMessage = {
          ...cleanMessage,
          estado: 'FALLIDO',
          errorDetalle: serverRes.error || 'Fallo de entrega en socket de WhatsApp',
        };
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          await offlineSyncEngine.enqueueMutation(MESSAGES_COLLECTION, msgId, 'SET', failedMessage, {
            offline: true,
          });
        } else {
          await setDoc(docRef, sanitizeFirestorePayload(failedMessage));
        }
        return {
          success: false,
          messageId: msgId,
          error: serverRes.error || 'No se pudo enviar el mensaje por WhatsApp. Verifique que la línea esté conectada.',
        };
      }

      // Entrega exitosa verificada por Baileys
      const confirmedMessage: WhatsAppMessage = {
        ...cleanMessage,
        estado: 'ENVIADO',
        whatsappMessageId: serverRes.messageId || msgId,
      };

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await offlineSyncEngine.enqueueMutation(MESSAGES_COLLECTION, msgId, 'SET', confirmedMessage, {
          offline: true,
        });
      } else {
        await setDoc(docRef, sanitizeFirestorePayload(confirmedMessage));
      }

      return { success: true, messageId: msgId };
    } catch (err: any) {
      console.error('[WhatsAppCloneService] Error enviando mensaje:', err);
      return { success: false, messageId: msgId, error: err.message };
    }
  }

  /**
   * Registra un mensaje entrante
   */
  static async receiveIncomingMessage(
    lineaId: string,
    remitenteTelefono: string,
    destinatarioTelefono: string,
    texto: string,
    mediaUrl?: string,
    mediaMimeType?: string,
    hasComprobante = false
  ): Promise<{ success: boolean; messageId: string }> {
    const msgId = `WAM-IN-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    const destNorm = normalizeToE164(destinatarioTelefono);
    const remNorm = normalizeToE164(remitenteTelefono);

    const message: WhatsAppMessage = {
      id: msgId,
      whatsappMessageId: msgId,
      lineaId,
      remitenteTelefono: remNorm,
      destinatarioTelefono: destNorm,
      direccion: 'ENTRANTE',
      texto,
      timestamp: now,
      estado: 'LEIDO',
      tipoMensaje: mediaUrl ? 'IMAGEN' : 'TEXTO',
      hasComprobantePago: hasComprobante,
      ocrStatus: hasComprobante ? 'PENDIENTE' : 'NO_ANALIZADO',
    };

    if (mediaUrl) {
      message.mediaUrl = mediaUrl;
    }
    if (mediaMimeType) {
      message.mediaMimeType = mediaMimeType;
    }

    const cleanMessage = Object.fromEntries(
      Object.entries(message).filter(([_, v]) => v !== undefined)
    ) as WhatsAppMessage;

    try {
      await setDoc(doc(db, MESSAGES_COLLECTION, msgId), cleanMessage);
      return { success: true, messageId: msgId };
    } catch {
      return { success: false, messageId: msgId };
    }
  }

  /**
   * Obtiene la lista de plantillas disponibles
   */
  static async getTemplates(): Promise<WhatsAppTemplate[]> {
    try {
      const snap = await getDocs(collection(db, TEMPLATES_COLLECTION));
      if (snap.empty) {
        const created: WhatsAppTemplate[] = [];
        for (let i = 0; i < DEFAULT_WHATSAPP_TEMPLATES.length; i++) {
          const tpl = {
            ...DEFAULT_WHATSAPP_TEMPLATES[i],
            id: `TPL-DEFAULT-${i + 1}`,
          };
          await setDoc(doc(db, TEMPLATES_COLLECTION, tpl.id), tpl);
          created.push(tpl);
        }
        return created;
      }
      return snap.docs.map((d) => d.data() as WhatsAppTemplate);
    } catch {
      return DEFAULT_WHATSAPP_TEMPLATES.map((t, idx) => ({ ...t, id: `TPL-${idx + 1}` }));
    }
  }

  /**
   * Renderiza una plantilla sustituyendo sus variables
   */
  static renderTemplate(
    templateText: string,
    params: {
      cliente?: string;
      factura?: string;
      monto_usd?: number | string;
      monto_ves?: number | string;
      fecha_vencimiento?: string;
    }
  ): string {
    const formatNum = (n: number | string | undefined) => {
      if (n === undefined || n === null) return '0.00';
      const num = typeof n === 'number' ? n : parseFloat(String(n)) || 0;
      return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    return templateText
      .replace(/{{\s*cliente\s*}}|{\s*cliente\s*}/gi, params.cliente || 'Estimado(a) Cliente')
      .replace(/{{\s*factura\s*}}|{\s*factura\s*}/gi, params.factura || 'N/A')
      .replace(/{{\s*monto_usd\s*}}|{\s*monto_usd\s*}/gi, formatNum(params.monto_usd))
      .replace(/{{\s*monto_ves\s*}}|{\s*monto_ves\s*}/gi, formatNum(params.monto_ves))
      .replace(/{{\s*fecha_vencimiento\s*}}|{\s*fecha_vencimiento\s*}/gi, params.fecha_vencimiento || new Date().toISOString().split('T')[0]);
  }

  /**
   * Cruza un número de teléfono con el directorio ERP
   */
  static enrichContactWithERP(
    phone: string,
    entities: DualEntity[],
    pendingInvoicesUSD = 0,
    accountsPayableUSD = 0
  ): WhatsAppChatContact {
    const normPhone = normalizeToE164(phone);
    const matched = entities.find((e) => {
      const entPhone = normalizeToE164(e.phone || e.telefonoContacto || '');
      return entPhone === normPhone && normPhone.length > 5;
    });

    if (matched) {
      const isCliente = matched.roles?.includes('CLIENTE');
      const isProveedor = matched.roles?.includes('PROVEEDOR');
      const isDual = isCliente && isProveedor;

      return {
        telefonoE164: normPhone,
        nombreDisplay: matched.name || matched.nombre || matched.razonSocial || normPhone,
        mensajesNoLeidos: 0,
        entityId: matched.id,
        entityRole: isDual ? 'DUAL' : isCliente ? 'CLIENTE' : isProveedor ? 'PROVEEDOR' : 'LEAD',
        estadoSolvencia: pendingInvoicesUSD > 0 ? 'EN_MORA' : 'SOLVENTE',
        deudaTotalUSD: pendingInvoicesUSD,
        limiteCreditoUSD: 0,
        cuentasPorPagarUSD: accountsPayableUSD,
        saldoNetoCompensadoUSD: pendingInvoicesUSD - accountsPayableUSD,
      };
    }

    return {
      telefonoE164: normPhone,
      nombreDisplay: normPhone,
      mensajesNoLeidos: 0,
      entityRole: 'LEAD',
      estadoSolvencia: 'SIN_DEUDA',
      deudaTotalUSD: 0,
      limiteCreditoUSD: 0,
    };
  }

  /**
   * Genera el enlace directo oficial wa.me para modo híbrido
   */
  static generateWaMeLink(phone: string, messageText?: string): string {
    const cleanDigits = phone.replace(/[^\d]/g, '');
    const encoded = messageText ? encodeURIComponent(messageText) : '';
    return `https://wa.me/${cleanDigits}${encoded ? `?text=${encoded}` : ''}`;
  }


  /**
   * Elimina una conversación y todos sus mensajes en Firestore y en el dispositivo real
   */
  static async deleteChat(
    lineaId: string,
    contactPhone: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const normPhone = normalizeToE164(contactPhone);
      const cleanDigits = contactPhone.replace(/\D/g, '');
      const currentUser = auth.currentUser;
      const token = currentUser ? await currentUser.getIdToken() : '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // 1. Notificar al backend para limpiar en Baileys y Firestore
      if (typeof window !== 'undefined') {
        fetch('/api/whatsapp/delete-chat', {
          method: 'POST',
          headers,
          body: JSON.stringify({ lineaId, contactPhone: normPhone }),
        }).catch(() => {});
      }

      // 2. Limpieza reactiva en cliente
      const q = query(
        collection(db, MESSAGES_COLLECTION),
        where('lineaId', '==', lineaId),
        limit(500)
      );
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      let count = 0;
      snap.forEach((d) => {
        const m = d.data() as WhatsAppMessage;
        const rNorm = normalizeToE164(m.remitenteTelefono);
        const dNorm = normalizeToE164(m.destinatarioTelefono);
        if (
          rNorm === normPhone ||
          dNorm === normPhone ||
          (cleanDigits.length >= 7 && (rNorm.includes(cleanDigits) || dNorm.includes(cleanDigits)))
        ) {
          batch.delete(d.ref);
          count++;
        }
      });
      if (count > 0) {
        await batch.commit();
      }

      return { success: true };
    } catch (err: any) {
      console.error('[WhatsAppCloneService] Error eliminando chat:', err);
      return { success: false, error: err.message };
    }
  }

  static generateDirectWhatsAppUrl(phone: string, messageText?: string): string {
    return this.generateWaMeLink(phone, messageText);
  }
}
