/**
 * Tipos e Interfaces para el Módulo CRM / BRM y Clon de WhatsApp Web
 * Especificación Restrictiva (Spec-Driven Development)
 */

export type WhatsAppLineType = 'COBRANZAS' | 'VENTAS' | 'PROVEEDORES_BRM';
export type WhatsAppConnectionStatus =
  | 'CONECTADO'
  | 'ESPERANDO_QR'
  | 'DESCONECTADO'
  | 'QR_EXPIRADO'
  | 'ERROR';
export type WhatsAppMessageDirection = 'ENTRANTE' | 'SALIENTE';
export type WhatsAppMessageStatus = 'ENVIADO' | 'ENTREGADO' | 'LEIDO' | 'FALLIDO';
export type WhatsAppMessageType =
  | 'TEXTO'
  | 'IMAGEN'
  | 'DOCUMENTO'
  | 'DOCUMENTO_PDF'
  | 'AUDIO'
  | 'PLANTILLA';

export interface WhatsAppLine {
  id: string; // ej. 'linea_cobranzas', 'linea_ventas', 'linea_brm'
  nombre: string;
  tipo: WhatsAppLineType;
  numeroTelefono?: string; // Formato E.164: +58... o vacío si desconectado
  estado: WhatsAppConnectionStatus;
  qrCodeDataUri?: string;
  qrExpiresAt?: number;
  qrRotations?: number;
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
  audioDuration?: number;
  audioDurationSeconds?: number;
  isPtt?: boolean;
  hasComprobantePago?: boolean;
  ocrStatus?: 'NO_ANALIZADO' | 'PENDIENTE' | 'ANALIZADO';
  ocrPagoId?: string;
  senderName?: string;
  destinatarioNombre?: string;
  errorDetalle?: string;
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
  textoPlantilla: string;
  variablesRequeridas: string[];
  activo: boolean;
}

export interface WhatsAppChatContact {
  id?: string;
  nombre?: string;
  telefono?: string;
  tipo?: 'CLIENTE' | 'PROVEEDOR' | 'ROL_DUAL';
  saldoPendienteUSD?: number;
  saldoPendienteVES?: number;
  facturasPendientesCount?: number;
  diasMoraMax?: number;
  ultimoMensaje?: WhatsAppMessage;

  // Propiedades enriquecidas de ERP
  telefonoE164: string;
  nombreDisplay: string;
  mensajesNoLeidos?: number;
  entityId?: string;
  entityRole?: 'CLIENTE' | 'PROVEEDOR' | 'DUAL' | 'LEAD';
  estadoSolvencia?: 'SOLVENTE' | 'EN_MORA' | 'SIN_DEUDA';
  deudaTotalUSD?: number;
  limiteCreditoUSD?: number;
  cuentasPorPagarUSD?: number;
  saldoNetoCompensadoUSD?: number;
}
