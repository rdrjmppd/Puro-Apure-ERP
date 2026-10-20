/**
 * ============================================================================
 * PURO APURE ERP — SERVER MIDDLEWARE / API GATEWAY: whatsappQrBridge
 * ============================================================================
 * Pasarela Multi-Dispositivo auténtica con @whiskeysockets/baileys y QRCode.
 * Conexión criptográfica real mediante WebSockets a los servidores de WhatsApp.
 * Sincronización bidireccional en tiempo real con Cloud Firestore.
 * ============================================================================
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  Browsers,
  downloadMediaMessage,
  WASocket,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import admin from './firebaseAdmin';

export interface WhatsAppQrBridgeStatus {
  lineaId: string;
  estado: 'CONECTADO' | 'ESPERANDO_QR' | 'DESCONECTADO' | 'ERROR';
  qrCodeDataUri?: string;
  numeroConectado?: string;
  uptimeSeconds: number;
  lastError?: string;
}

// Mapa de Sockets activos y estados en memoria
const activeSockets = new Map<string, WASocket>();
const activeLinesState = new Map<string, WhatsAppQrBridgeStatus>();
const lineStartTimes = new Map<string, number>();

// Inicializar estados por defecto
const defaultLines = ['linea_cobranzas', 'linea_ventas', 'linea_brm'];
defaultLines.forEach((id) => {
  activeLinesState.set(id, {
    lineaId: id,
    estado: 'DESCONECTADO',
    uptimeSeconds: 0,
  });
});

/**
 * Obtiene o crea la ruta local de la sesión de Baileys para la línea
 */
function getSessionDir(lineaId: string): string {
  const dir = path.resolve(process.cwd(), '.whatsapp_sessions', lineaId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Sincroniza el estado de la línea con Firestore para que el frontend (incluso en AI Studio) lo lea en tiempo real
 */
async function syncLineToFirestore(lineaId: string, status: Partial<WhatsAppQrBridgeStatus>) {
  try {
    const db = admin.firestore();
    const docRef = db.collection('whatsapp_lineas').doc(lineaId);
    await docRef.set(
      {
        ...status,
        lastActivityTimestamp: Date.now(),
        isOnline: status.estado === 'CONECTADO',
      },
      { merge: true }
    );
  } catch (err) {
    // Modo offline o sin credenciales admin, continuar en memoria
    console.debug(`[WhatsApp Bridge] Sincronización Firestore en memoria para ${lineaId}`);
  }
}

/**
 * Guarda un mensaje entrante o saliente en Firestore
 */
async function saveMessageToFirestore(messageData: {
  id: string;
  lineaId: string;
  remitenteTelefono: string;
  destinatarioTelefono: string;
  direccion: 'ENTRANTE' | 'SALIENTE';
  texto: string;
  timestamp: number;
  estado: 'ENVIADO' | 'ENTREGADO' | 'LEIDO';
  tipoMensaje: 'TEXTO' | 'IMAGEN';
  mediaUrl?: string;
  hasComprobantePago?: boolean;
}) {
  try {
    const db = admin.firestore();
    const docRef = db.collection('whatsapp_mensajes').doc(messageData.id);
    await docRef.set({
      ...messageData,
      whatsappMessageId: messageData.id,
      ocrStatus: messageData.hasComprobantePago ? 'PENDIENTE' : 'NO_ANALIZADO',
    });
    console.log(`[WhatsApp Bridge] Mensaje ${messageData.id} guardado en Firestore.`);
  } catch (err) {
    console.warn(`[WhatsApp Bridge] No se pudo guardar mensaje en Firestore:`, err);
  }
}

/**
 * Inicia o recupera el socket auténtico de Baileys para la línea especificada
 */
export async function initializeBaileysSocket(lineaId: string): Promise<WASocket> {
  const existing = activeSockets.get(lineaId);
  if (existing) {
    return existing;
  }

  const sessionDir = getSessionDir(lineaId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: Browsers.macOS('Desktop'),
    printQRInTerminal: false,
    syncFullHistory: false,
  });

  activeSockets.set(lineaId, sock);
  lineStartTimes.set(lineaId, Date.now());

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { qr, connection, lastDisconnect } = update;

    if (qr) {
      console.log(`[WhatsApp Bridge] Real QR generado para ${lineaId}`);
      try {
        const qrDataUri = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
        const currentState = activeLinesState.get(lineaId) || {
          lineaId,
          estado: 'ESPERANDO_QR',
          uptimeSeconds: 0,
        };
        currentState.estado = 'ESPERANDO_QR';
        currentState.qrCodeDataUri = qrDataUri;
        activeLinesState.set(lineaId, currentState);

        await syncLineToFirestore(lineaId, {
          estado: 'ESPERANDO_QR',
          qrCodeDataUri,
        });
      } catch (qrErr) {
        console.error(`[WhatsApp Bridge] Error generando imagen QR:`, qrErr);
      }
    }

    if (connection === 'open') {
      const connectedPhone = sock.user?.id ? `+${sock.user.id.split(':')[0]}` : '+584140000000';
      console.log(`[WhatsApp Bridge] ¡Línea ${lineaId} CONECTADA exitosamente con ${connectedPhone}!`);

      const currentState: WhatsAppQrBridgeStatus = {
        lineaId,
        estado: 'CONECTADO',
        numeroConectado: connectedPhone,
        qrCodeDataUri: undefined,
        uptimeSeconds: Math.floor((Date.now() - (lineStartTimes.get(lineaId) || Date.now())) / 1000),
      };
      activeLinesState.set(lineaId, currentState);

      await syncLineToFirestore(lineaId, {
        estado: 'CONECTADO',
        numeroConectado: connectedPhone,
        qrCodeDataUri: undefined,
      });
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(
        `[WhatsApp Bridge] Conexión cerrada para ${lineaId}. Código: ${statusCode}. Reconectar: ${shouldReconnect}`
      );

      activeSockets.delete(lineaId);

      if (shouldReconnect) {
        console.log(`[WhatsApp Bridge] Intentando reconectar ${lineaId} en 5 segundos...`);
        setTimeout(() => {
          initializeBaileysSocket(lineaId).catch(console.error);
        }, 5000);
      } else {
        // Sesión cerrada definitivamente por el usuario en WhatsApp
        const currentState: WhatsAppQrBridgeStatus = {
          lineaId,
          estado: 'DESCONECTADO',
          uptimeSeconds: 0,
        };
        activeLinesState.set(lineaId, currentState);
        await syncLineToFirestore(lineaId, {
          estado: 'DESCONECTADO',
          qrCodeDataUri: undefined,
        });

        // Limpiar archivos de sesión
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    }
  });

  // Escuchar mensajes entrantes en tiempo real
  sock.ev.on('messages.upsert', async ({ messages: newMessages, type }) => {
    if (type !== 'notify') return;

    for (const msg of newMessages) {
      if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;

      const remoteJid = msg.key.remoteJid || '';
      const isFromMe = msg.key.fromMe || false;
      const phoneDigits = remoteJid.replace('@s.whatsapp.net', '').replace(/[^\d]/g, '');
      const senderPhone = `+${phoneDigits}`;
      const myPhone = sock.user?.id ? `+${sock.user.id.split(':')[0]}` : '+584140000000';

      let textContent =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        '';

      let mediaUrl: string | undefined = undefined;
      const isImage = !!msg.message.imageMessage;

      if (isImage) {
        try {
          const buffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            {
              logger: pino({ level: 'silent' }),
              reuploadRequest: sock.updateMediaMessage,
            }
          );
          const mime = msg.message.imageMessage?.mimetype || 'image/jpeg';
          mediaUrl = `data:${mime};base64,${buffer.toString('base64')}`;
          if (!textContent) {
            textContent = '[Comprobante de Pago adjunto]';
          }
        } catch (mediaErr) {
          console.warn('[WhatsApp Bridge] Error al descargar imagen:', mediaErr);
        }
      }

      await saveMessageToFirestore({
        id: msg.key.id || `msg_${Date.now()}`,
        lineaId,
        remitenteTelefono: isFromMe ? myPhone : senderPhone,
        destinatarioTelefono: isFromMe ? senderPhone : myPhone,
        direccion: isFromMe ? 'SALIENTE' : 'ENTRANTE',
        texto: textContent,
        timestamp: (msg.messageTimestamp as number) * 1000 || Date.now(),
        estado: 'LEIDO',
        tipoMensaje: isImage ? 'IMAGEN' : 'TEXTO',
        mediaUrl,
        hasComprobantePago: isImage,
      });
    }
  });

  return sock;
}

/**
 * Consulta el estado de una línea de WhatsApp
 */
export async function getWhatsAppLineStatusHandler(lineaId: string): Promise<WhatsAppQrBridgeStatus> {
  const current = activeLinesState.get(lineaId);
  if (!current) {
    const fallback: WhatsAppQrBridgeStatus = {
      lineaId,
      estado: 'DESCONECTADO',
      uptimeSeconds: 0,
    };
    activeLinesState.set(lineaId, fallback);
    return fallback;
  }

  if (current.estado === 'CONECTADO') {
    current.uptimeSeconds = Math.floor((Date.now() - (lineStartTimes.get(lineaId) || Date.now())) / 1000);
  }

  return current;
}

/**
 * Genera y devuelve el código QR auténtico de WhatsApp
 */
export async function generateQrCodeHandler(lineaId: string): Promise<{ qrDataUri: string; estado: string }> {
  // Iniciar el socket si no existe
  await initializeBaileysSocket(lineaId);

  // Esperar hasta 5 segundos para que WhatsApp emita el QR si aún no está disponible
  let current = activeLinesState.get(lineaId);
  let waited = 0;
  while (!current?.qrCodeDataUri && current?.estado !== 'CONECTADO' && waited < 5000) {
    await new Promise((r) => setTimeout(r, 200));
    waited += 200;
    current = activeLinesState.get(lineaId);
  }

  return {
    qrDataUri: current?.qrCodeDataUri || '',
    estado: current?.estado || 'ESPERANDO_QR',
  };
}

/**
 * Envía un mensaje real a través del socket activo de WhatsApp
 */
export async function sendWhatsAppMessageHandler(
  lineaId: string,
  toPhone: string,
  text: string,
  mediaDataUrl?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const sock = activeSockets.get(lineaId);
  if (!sock) {
    return { success: false, error: `La línea ${lineaId} no está conectada activamente.` };
  }

  try {
    const cleanDigits = toPhone.replace(/[^\d]/g, '');
    const jid = `${cleanDigits}@s.whatsapp.net`;

    let sentMsg;
    if (mediaDataUrl && mediaDataUrl.startsWith('data:image/')) {
      const base64Data = mediaDataUrl.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      sentMsg = await sock.sendMessage(jid, {
        image: buffer,
        caption: text,
      });
    } else {
      sentMsg = await sock.sendMessage(jid, { text });
    }

    const messageId = sentMsg?.key.id || `msg_${Date.now()}`;
    const myPhone = sock.user?.id ? `+${sock.user.id.split(':')[0]}` : '+584140000000';

    await saveMessageToFirestore({
      id: messageId,
      lineaId,
      remitenteTelefono: myPhone,
      destinatarioTelefono: `+${cleanDigits}`,
      direccion: 'SALIENTE',
      texto: text,
      timestamp: Date.now(),
      estado: 'ENVIADO',
      tipoMensaje: mediaDataUrl ? 'IMAGEN' : 'TEXTO',
      mediaUrl: mediaDataUrl,
    });

    return { success: true, messageId };
  } catch (err: any) {
    console.error('[WhatsApp Bridge] Error al enviar mensaje:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Desconecta la sesión de WhatsApp y limpia los archivos de sesión
 */
export async function disconnectWhatsAppLineHandler(lineaId: string): Promise<{ success: boolean }> {
  const sock = activeSockets.get(lineaId);
  if (sock) {
    try {
      await sock.logout();
    } catch {
      sock.end(undefined);
    }
    activeSockets.delete(lineaId);
  }

  const sessionDir = getSessionDir(lineaId);
  try {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  } catch {
    // ignore
  }

  const state: WhatsAppQrBridgeStatus = {
    lineaId,
    estado: 'DESCONECTADO',
    uptimeSeconds: 0,
  };
  activeLinesState.set(lineaId, state);
  await syncLineToFirestore(lineaId, {
    estado: 'DESCONECTADO',
    numeroConectado: undefined,
    qrCodeDataUri: undefined,
  });

  return { success: true };
}

/**
 * Confirmar emparejamiento manual (compatibilidad)
 */
export async function confirmPairingHandler(lineaId: string, phone: string): Promise<WhatsAppQrBridgeStatus> {
  const current = activeLinesState.get(lineaId) || {
    lineaId,
    estado: 'CONECTADO',
    uptimeSeconds: 0,
  };
  current.estado = 'CONECTADO';
  current.numeroConectado = phone || '+584141234567';
  current.qrCodeDataUri = undefined;
  activeLinesState.set(lineaId, current);
  await syncLineToFirestore(lineaId, current);
  return current;
}
