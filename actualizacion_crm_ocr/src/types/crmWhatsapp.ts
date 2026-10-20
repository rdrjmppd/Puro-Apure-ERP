/**
 * Tipos e Interfaces para el Módulo CRM / BRM y Clon de WhatsApp Web
 * Especificación Restrictiva (Spec-Driven Development)
 */

export type WhatsAppLineType = 'COBRANZAS' | 'VENTAS' | 'PROVEEDORES_BRM';
export type WhatsAppConnectionStatus = 'CONECTADO' | 'ESPERANDO_QR' | 'DESCONECTADO' | 'ERROR';
export type WhatsAppMessageDirection = 'ENTRANTE' | 'SALIENTE';
export type WhatsAppMessageStatus = 'ENVIADO' | 'ENTREGADO' | 'LEIDO' | 'FALLIDO';
export type WhatsAppMessageType = 'TEXTO' | 'IMAGEN' | 'DOCUMENTO_PDF';

export interface WhatsAppLine {
  id: string; // ej. 'linea_cobranzas', 'linea_ventas', 'linea_brm'
  nombre: string;
  tipo: WhatsAppLineType;
  numeroTelefono: string; // Formato E.164: +58...
  estado: WhatsAppConnectionStatus;
  qrCodeDataUri?: string;
  lastActivityTimestamp: number;
  isOnline: boolean;
  metadata?: Record<string, unknown>;
}

export interface WhatsAppMessage {
  id: string;
  whatsappMessageId: string; // Idempotencia estricta
  lineaId: string;
  remitenteTelefono: string; // E.164
  destinatarioTelefono: string; // E.164
  direccion: WhatsAppMessageDirection;
  texto: string;
  timestamp: number;
  estado: WhatsAppMessageStatus;
  tipoMensaje: WhatsAppMessageType;
  mediaUrl?: string;
  mediaMimeType?: string;
  hasComprobantePago?: boolean;
  ocrStatus?: 'NO_ANALIZADO' | 'PENDIENTE' | 'ANALIZADO';
  ocrPagoId?: string;
  senderName?: string;
}

export type WhatsAppTemplateCategory =
  | 'BIENVENIDA_FACTURA'
  | 'RECORDATORIO_PREVIO'
  | 'VENCIMIENTO_ADMINISTRATIVO'
  | 'MORA_EMPATICA'
  | 'CONFIRMACION_PAGO'
  | 'SEGUIMIENTO_PROVEEDOR';

export interface WhatsAppTemplate {
  id: string;
  nombre: string;
  categoria: WhatsAppTemplateCategory;
  textoPlantilla: string; // Contiene {cliente}, {factura}, {monto_usd}, {monto_ves}, {fecha_vencimiento}
  variablesRequeridas: string[];
  activo: boolean;
}

export interface WhatsAppChatContact {
  telefonoE164: string;
  nombreDisplay: string;
  ultimoMensaje?: WhatsAppMessage;
  mensajesNoLeidos: number;
  avatarUrl?: string;
  // Cruce de Directorio ERP
  entityId?: string;
  entityRole?: 'CLIENTE' | 'PROVEEDOR' | 'DUAL' | 'LEAD';
  estadoSolvencia?: 'SOLVENTE' | 'EN_MORA' | 'SIN_DEUDA';
  deudaTotalUSD?: number;
  deudaTotalVES?: number;
  limiteCreditoUSD?: number;
  cuentasPorPagarUSD?: number; // Para BRM o Rol Dual
  saldoNetoCompensadoUSD?: number;
}
