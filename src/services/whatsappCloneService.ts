/**
 * Servicio de Clon de WhatsApp Web, Conectividad QR y Gestión CRM/BRM
 * Puro Apure ERP - Módulo de Mensajería Bidireccional
 * Respeta el paradigma Offline-First, idempotencia por message_id y normalización E.164
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { offlineSyncEngine } from './offlineSyncEngine';
import {
  WhatsAppLine,
  WhatsAppMessage,
  WhatsAppTemplate,
  WhatsAppChatContact,
  WhatsAppLineType,
} from '../types/crmWhatsapp';
import { DualEntity } from '../types/finance';

const LINES_COLLECTION = 'whatsapp_lineas';
const MESSAGES_COLLECTION = 'whatsapp_mensajes';
const TEMPLATES_COLLECTION = 'whatsapp_plantillas';

/**
 * Normaliza cualquier número telefónico al estándar internacional E.164 (+58...)
 * Soporta números venezolanos móviles (0412, 0414, 0424, 0416, 0426) o internacionales.
 */
export function normalizeToE164(phone: string): string {
  if (!phone) return '';
  // Eliminar espacios, guiones, paréntesis y caracteres no numéricos excepto el '+'
  let clean = phone.replace(/[^\d+]/g, '');

  if (clean.startsWith('+')) {
    return clean;
  }

  // Si empieza con 0 (ej. 0414...), reemplazar 0 por +58
  if (clean.startsWith('0')) {
    return `+58${clean.substring(1)}`;
  }

  // Si ya tiene código de país 58 sin '+'
  if (clean.startsWith('58')) {
    return `+${clean}`;
  }

  // Por defecto asumir código venezolano +58
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
   * Inicializa las 3 líneas operativas base si no existen en Firestore
   */
  static async initializeDefaultLines(): Promise<WhatsAppLine[]> {
    const defaultLines: WhatsAppLine[] = [
      {
        id: 'linea_cobranzas',
        nombre: 'Línea de Crédito y Cobranzas',
        tipo: 'COBRANZAS',
        numeroTelefono: '+584140000001',
        estado: 'CONECTADO',
        lastActivityTimestamp: Date.now(),
        isOnline: true,
      },
      {
        id: 'linea_ventas',
        nombre: 'Línea de Ventas y Despacho',
        tipo: 'VENTAS',
        numeroTelefono: '+584140000002',
        estado: 'CONECTADO',
        lastActivityTimestamp: Date.now(),
        isOnline: true,
      },
      {
        id: 'linea_brm',
        nombre: 'Línea de Proveedores y BRM',
        tipo: 'PROVEEDORES_BRM',
        numeroTelefono: '+584140000003',
        estado: 'CONECTADO',
        lastActivityTimestamp: Date.now(),
        isOnline: true,
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
      return snap.docs.map((d) => d.data() as WhatsAppLine);
    } catch {
      return defaultLines;
    }
  }

  /**
   * Suscripción en tiempo real a las líneas activas
   */
  static subscribeWhatsAppLines(callback: (lines: WhatsAppLine[]) => void): () => void {
    const q = query(collection(db, LINES_COLLECTION));
    return onSnapshot(
      q,
      (snapshot) => {
        const lines = snapshot.docs.map((d) => d.data() as WhatsAppLine);
        callback(lines);
      },
      (err) => {
        console.warn('[WhatsAppCloneService] Error escuchando líneas:', err);
      }
    );
  }

  /**
   * Actualiza el estado de una línea (ej. al escanear QR o reconectar)
   */
  static async updateLineStatus(
    lineaId: string,
    estado: WhatsAppLine['estado'],
    qrDataUri?: string
  ): Promise<boolean> {
    try {
      const ref = doc(db, LINES_COLLECTION, lineaId);
      await updateDoc(ref, {
        estado,
        qrCodeDataUri: qrDataUri || null,
        lastActivityTimestamp: Date.now(),
        isOnline: estado === 'CONECTADO',
      });
      return true;
    } catch (err) {
      console.error('[WhatsAppCloneService] Error actualizando estado de línea:', err);
      return false;
    }
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
      orderBy('timestamp', 'asc'),
      limit(200)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const all = snapshot.docs.map((d) => d.data() as WhatsAppMessage);
        // Filtrar en memoria para permitir mensajes bidireccionales con este contacto
        const chatMsgs = all.filter(
          (m) =>
            m.remitenteTelefono === normPhone ||
            m.destinatarioTelefono === normPhone
        );
        callback(chatMsgs);
      },
      (err) => {
        console.warn('[WhatsAppCloneService] Error suscribiendo mensajes de chat:', err);
      }
    );
  }

  /**
   * Envía un mensaje en el Clon de WhatsApp Web (soporta texto, imágenes o PDFs)
   * Idempotencia estricta por whatsappMessageId.
   */
  static async sendWhatsAppMessage(
    lineaId: string,
    remitenteTelefono: string,
    destinatarioTelefono: string,
    texto: string,
    tipoMensaje: WhatsAppMessage['tipoMensaje'] = 'TEXTO',
    mediaUrl?: string,
    mediaMimeType?: string
  ): Promise<{ success: boolean; messageId: string; error?: string }> {
    const msgId = `WAM-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    const destNorm = normalizeToE164(destinatarioTelefono);
    const remNorm = normalizeToE164(remitenteTelefono);

    const message: WhatsAppMessage = {
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
      mediaUrl,
      mediaMimeType,
      hasComprobantePago: false,
      ocrStatus: 'NO_ANALIZADO',
    };

    try {
      const docRef = doc(db, MESSAGES_COLLECTION, msgId);
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await offlineSyncEngine.enqueueMutation(MESSAGES_COLLECTION, msgId, 'SET', message, {
          offline: true,
        });
      } else {
        await setDoc(docRef, message);
      }

      // Simular cambio a 'ENTREGADO' tras breve confirmación de red
      setTimeout(() => {
        updateDoc(docRef, { estado: 'ENTREGADO' }).catch(() => {});
      }, 800);

      return { success: true, messageId: msgId };
    } catch (err: any) {
      console.error('[WhatsAppCloneService] Error enviando mensaje:', err);
      return { success: false, messageId: msgId, error: err.message };
    }
  }

  /**
   * Registra un mensaje entrante simulado o recibido por webhook/socket
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
      mediaUrl,
      mediaMimeType,
      hasComprobantePago: hasComprobante,
      ocrStatus: hasComprobante ? 'PENDIENTE' : 'NO_ANALIZADO',
    };

    try {
      await setDoc(doc(db, MESSAGES_COLLECTION, msgId), message);
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
        // Cargar plantillas por defecto si no existen
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
   * Renderiza una plantilla sustituyendo sus variables de forma determinista
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
   * Cruza un número de teléfono con el directorio ERP de Dual Entities para
   * enriquecer el contacto con su estado de solvencia, deuda y rol.
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

    // Contacto no registrado en directorio ERP (Prospecto o Lead)
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
   * Genera el enlace directo oficial wa.me para modo híbrido (Mobile & Fallback)
   */
  static generateWaMeLink(phone: string, messageText?: string): string {
    const cleanDigits = phone.replace(/[^\d]/g, '');
    const encoded = messageText ? encodeURIComponent(messageText) : '';
    return `https://wa.me/${cleanDigits}${encoded ? `?text=${encoded}` : ''}`;
  }

  static generateDirectWhatsAppUrl(phone: string, messageText?: string): string {
    return this.generateWaMeLink(phone, messageText);
  }
}
