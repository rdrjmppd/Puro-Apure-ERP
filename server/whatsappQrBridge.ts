/**
 * ============================================================================
 * PURO APURE ERP — SERVER MIDDLEWARE / API PROXY: whatsappQrBridge
 * ============================================================================
 * Servidor puente para conectividad WhatsApp QR y gestión multi-dispositivo.
 * Compatible tanto con servidor local como con el contenedor de Google AI Studio.
 * ============================================================================
 */

export interface WhatsAppQrBridgeStatus {
  lineaId: string;
  estado: 'CONECTADO' | 'ESPERANDO_QR' | 'DESCONECTADO';
  qrCodeDataUri?: string;
  numeroConectado?: string;
  uptimeSeconds: number;
}

const activeLinesState = new Map<string, WhatsAppQrBridgeStatus>();

// Inicializar estados en memoria
const defaultLines = ['linea_cobranzas', 'linea_ventas', 'linea_brm'];
defaultLines.forEach((id) => {
  activeLinesState.set(id, {
    lineaId: id,
    estado: 'CONECTADO',
    numeroConectado: id === 'linea_cobranzas' ? '+584140000001' : id === 'linea_ventas' ? '+584140000002' : '+584140000003',
    uptimeSeconds: 3600,
  });
});

export async function getWhatsAppLineStatusHandler(lineaId: string): Promise<WhatsAppQrBridgeStatus> {
  const current = activeLinesState.get(lineaId);
  if (current) return current;

  const created: WhatsAppQrBridgeStatus = {
    lineaId,
    estado: 'CONECTADO',
    numeroConectado: '+584140000000',
    uptimeSeconds: 120,
  };
  activeLinesState.set(lineaId, created);
  return created;
}

export async function generateQrCodeHandler(lineaId: string): Promise<{ qrDataUri: string }> {
  // Generar QR visual SVG en Base64 representativo de pairing de WhatsApp Web
  const dummyQrSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
    <rect width="200" height="200" fill="#ffffff" rx="12"/>
    <!-- Patrón QR de sincronización multi-dispositivo Puro Apure -->
    <rect x="20" y="20" width="40" height="40" fill="#065F46"/>
    <rect x="28" y="28" width="24" height="24" fill="#ffffff"/>
    <rect x="34" y="34" width="12" height="12" fill="#065F46"/>
    <rect x="140" y="20" width="40" height="40" fill="#065F46"/>
    <rect x="148" y="28" width="24" height="24" fill="#ffffff"/>
    <rect x="154" y="34" width="12" height="12" fill="#065F46"/>
    <rect x="20" y="140" width="40" height="40" fill="#065F46"/>
    <rect x="28" y="148" width="24" height="24" fill="#ffffff"/>
    <rect x="34" y="154" width="12" height="12" fill="#065F46"/>
    <!-- Bits centrales -->
    <rect x="80" y="30" width="12" height="12" fill="#10B981"/>
    <rect x="105" y="45" width="12" height="12" fill="#065F46"/>
    <rect x="75" y="80" width="50" height="50" fill="#D97706" rx="6"/>
    <circle cx="100" cy="105" r="16" fill="#ffffff"/>
    <path d="M94 100 L106 100 L100 112 Z" fill="#065F46"/>
    <rect x="140" y="90" width="14" height="14" fill="#065F46"/>
    <rect x="160" y="120" width="12" height="12" fill="#10B981"/>
    <rect x="85" y="150" width="16" height="16" fill="#065F46"/>
    <rect x="120" y="150" width="20" height="20" fill="#065F46"/>
  </svg>`;

  const base64Svg = Buffer.from(dummyQrSvg).toString('base64');
  const qrDataUri = `data:image/svg+xml;base64,${base64Svg}`;

  const current = activeLinesState.get(lineaId) || {
    lineaId,
    estado: 'ESPERANDO_QR',
    uptimeSeconds: 0,
  };

  current.estado = 'ESPERANDO_QR';
  current.qrCodeDataUri = qrDataUri;
  activeLinesState.set(lineaId, current);

  return { qrDataUri };
}

export async function confirmPairingHandler(lineaId: string, phone: string): Promise<WhatsAppQrBridgeStatus> {
  const current = activeLinesState.get(lineaId) || {
    lineaId,
    estado: 'CONECTADO',
    uptimeSeconds: 0,
  };

  current.estado = 'CONECTADO';
  current.numeroConectado = phone || '+584141234567';
  current.qrCodeDataUri = undefined;
  current.uptimeSeconds = 1;
  activeLinesState.set(lineaId, current);

  return current;
}
