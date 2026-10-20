/**
 * Tipos e Interfaces para el Motor OCR Forense y Bandeja de Pre-Conciliación
 * Especificación Restrictiva y Cuatro Candados de Veracidad (Spec-Driven Development)
 */

export type TipoComprobanteOCR =
  | 'PAGO_MOVIL'
  | 'TRANSFERENCIA'
  | 'ZELLE'
  | 'CRIPTOACTIVOS'
  | 'RETENCION_FISCAL'
  | 'RIF';

export type VeredictoVeracidad =
  | 'AUTENTICO_ALTA_CONFIANZA'
  | 'SOSPECHOSO_REVISION_HUMANA'
  | 'ALERTA_FRAUDE_EDICION_O_IA';

export type EstadoConciliacionOCR =
  | 'pendiente_revision'
  | 'aprobado_conciliado'
  | 'rechazado';

export interface DictamenVeracidadOCR {
  veredicto: VeredictoVeracidad;
  score: number; // 0 a 100
  candado1_reciclaje: {
    esDuplicado: boolean;
    hashDuplicado?: string;
    referenciaDuplicada?: string;
    detalle: string;
  };
  candado2_exif_ia: {
    tieneFirmasIAOEdicion: boolean;
    softwareDetectado?: string;
    detalle: string;
  };
  candado3_visual_gemini: {
    consistenciaTipografica: boolean;
    halosDeColor: boolean;
    patronBancarioValido: boolean;
    detalle: string;
  };
  candado4_resumen: string;
  tiempoAnalisisMs: number;
}

export interface PagoReportadoOCR {
  id: string;
  comprobanteOriginalUrl: string;
  sha256Bytes: string;
  pHash: string; // Hash perceptual de 64-bits
  tipoComprobante: TipoComprobanteOCR;
  bancoEmisor?: string;
  bancoReceptor?: string;
  fechaComprobante: string; // YYYY-MM-DD o formato extraído
  numeroReferencia: string;
  referenciaNormalizada: string; // Alfanumérica en mayúsculas sin espacios
  monedaOriginal: 'VES' | 'USD';
  montoOriginal: number;
  tasaBcvSnapshot: number;
  montoEquivalenteUSD: number;
  montoEquivalenteVES: number;
  rifCedula?: string;
  telefonoNombreEmisor?: string;

  // Cruce y Pre-Conciliación Contable
  clienteIdSugerido?: string;
  clienteNombreSugerido?: string;
  facturaIdSeleccionada?: string;
  facturaCodigoSeleccionada?: string;

  // Dictamen Forense y Semáforo
  dictamenVeracidad: DictamenVeracidadOCR;

  // Estado del Flujo Contable
  estadoConciliacion: EstadoConciliacionOCR;
  notasRevision?: string;
  revisadoPor?: string;
  fechaRevision?: number;
  justificacionSuperAdmin?: string;

  // Auditoría y Trazabilidad
  paymentRecordIdGenerado?: string;
  whatsappMessageIdOrigen?: string;
  createdTimestamp: number;
  updatedTimestamp: number;
}
