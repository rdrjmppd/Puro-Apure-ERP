/**
 * ============================================================================
 * PURO APURE ERP — SERVER MIDDLEWARE / API GATEWAY: whatsappQrBridge
 * ============================================================================
 * Pasarela Multi-Dispositivo auténtica con @whiskeysockets/baileys y QRCode.
 * Conexión criptográfica real mediante WebSockets a los servidores de WhatsApp.
 * Opción A: Resguardo de sesión cifrado AES-256-GCM en Firestore (whatsapp_sesiones).
 * Sincronización bidireccional en tiempo real con Cloud Firestore (SSoT).
 * Blindaje DevSecOps: Sin datos falsos, auditoría inmutable y corte anti-bucle QR.
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
import crypto from 'crypto';
import { adminApp, adminAuth, adminDb, FieldValue } from './firebaseAdmin';

export interface WhatsAppQrBridgeStatus {
  lineaId: string;
  estado: 'CONECTADO' | 'ESPERANDO_QR' | 'DESCONECTADO' | 'QR_EXPIRADO' | 'ERROR';
  qrCodeDataUri?: string;
  qrExpiresAt?: number;
  qrRotations?: number;
  numeroConectado?: string;
  uptimeSeconds: number;
  lastError?: string;
}

// Mapa de Sockets activos y estados en memoria
const activeSockets = new Map<string, WASocket>();
const activeLinesState = new Map<string, WhatsAppQrBridgeStatus>();
const lineStartTimes = new Map<string, number>();
const qrRotationCounters = new Map<string, number>();

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
 * Clave simétrica derivada para cifrado AES-256-GCM de sesiones en Firestore
 */
const ENCRYPTION_SECRET =
  process.env.WHATSAPP_SESSION_SECRET || 'puro-apure-erp-baileys-secret-key-2026-ar-group';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest();

function encryptSessionData(text: string): { iv: string; tag: string; encrypted: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return {
    iv: iv.toString('hex'),
    tag,
    encrypted,
  };
}

function decryptSessionData(payload: { iv: string; tag: string; encrypted: string }): string {
  const iv = Buffer.from(payload.iv, 'hex');
  const tag = Buffer.from(payload.tag, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(payload.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Directorio de trabajo local para la sesión activa de Baileys
 */
function getSessionDir(lineaId: string): string {
  const dir = path.resolve(process.cwd(), '.whatsapp_sessions', lineaId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Opción A: Restaura los archivos de sesión desde Firestore a disco si la carpeta local está vacía
 */
async function restoreSessionFromFirestore(lineaId: string, sessionDir: string): Promise<boolean> {
  try {
    const docRef = adminDb.collection('whatsapp_sesiones').doc(lineaId);
    const snap = await docRef.get();
    if (!snap.exists) return false;

    const data = snap.data();
    if (!data?.filesEncrypted) return false;

    const decryptedJson = decryptSessionData(data.filesEncrypted);
    const files: Record<string, string> = JSON.parse(decryptedJson);

    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const fileKeys = Object.keys(files);
    for (const filename of fileKeys) {
      fs.writeFileSync(path.join(sessionDir, filename), files[filename], 'utf-8');
    }

    console.log(
      `[WhatsApp Bridge] Sesión de ${lineaId} restaurada exitosamente desde Firestore (${fileKeys.length} archivos).`
    );
    return true;
  } catch (err) {
    console.warn(`[WhatsApp Bridge] Aviso al restaurar sesión de Firestore para ${lineaId}:`, err);
    return false;
  }
}

/**
 * Opción A: Resguarda los archivos de sesión cifrados en Firestore
 */
async function persistSessionToFirestore(lineaId: string, sessionDir: string): Promise<void> {
  try {
    if (!fs.existsSync(sessionDir)) return;
    const fileNames = fs.readdirSync(sessionDir);
    if (fileNames.length === 0) return;

    const files: Record<string, string> = {};
    for (const name of fileNames) {
      const filePath = path.join(sessionDir, name);
      if (fs.statSync(filePath).isFile()) {
        files[name] = fs.readFileSync(filePath, 'utf-8');
      }
    }

    const jsonStr = JSON.stringify(files);
    const encrypted = encryptSessionData(jsonStr);

    await adminDb.collection('whatsapp_sesiones').doc(lineaId).set(
      {
        lineaId,
        updatedAt: Date.now(),
        filesCount: Object.keys(files).length,
        filesEncrypted: encrypted,
      },
      { merge: true }
    );
  } catch (err) {
    console.warn(`[WhatsApp Bridge] Aviso al resguardar sesión en Firestore para ${lineaId}:`, err);
  }
}

/**
 * Opción A: Elimina la sesión resguardada en Firestore al desvincular
 */
async function deleteSessionFromFirestore(lineaId: string): Promise<void> {
  try {
    await adminDb.collection('whatsapp_sesiones').doc(lineaId).delete();
    console.log(`[WhatsApp Bridge] Sesión en Firestore eliminada para ${lineaId}.`);
  } catch (err) {
    console.warn(`[WhatsApp Bridge] Error al eliminar sesión de Firestore para ${lineaId}:`, err);
  }
}

/**
 * Registro de auditoría inmutable
 */
async function logWhatsAppAudit(entry: {
  lineaId: string;
  evento: string;
  numeroTelefono?: string;
  destinatario?: string;
  plantillaId?: string;
  usuarioUid?: string;
  timestamp: number;
  detalles: string;
}) {
  try {
    await adminDb.collection('whatsapp_auditoria').add({
      ...entry,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.debug('[WhatsApp Bridge] Auditoría en memoria:', entry);
  }
}

/**
 * Sincroniza el estado de la línea con Firestore para que el frontend lo lea en tiempo real
 */
async function syncLineToFirestore(lineaId: string, status: Record<string, any>) {
  try {
    const docRef = adminDb.collection('whatsapp_lineas').doc(lineaId);
    await docRef.set(
      {
        ...status,
        lastActivityTimestamp: Date.now(),
      },
      { merge: true }
    );
  } catch (err) {
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
    const docRef = adminDb.collection('whatsapp_mensajes').doc(messageData.id);
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

  // Si no hay archivos locales, intentar restaurar de Firestore
  if (!fs.existsSync(sessionDir) || fs.readdirSync(sessionDir).length === 0) {
    await restoreSessionFromFirestore(lineaId, sessionDir);
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: Browsers.macOS('Desktop'),
    printQRInTerminal: false,
    syncFullHistory: false,
    connectTimeoutMs: 30000,
    keepAliveIntervalMs: 25000,
  });

  activeSockets.set(lineaId, sock);
  lineStartTimes.set(lineaId, Date.now());

  sock.ev.on('creds.update', async () => {
    await saveCreds();
    await persistSessionToFirestore(lineaId, sessionDir);
  });

  sock.ev.on('connection.update', async (update) => {
    const { qr, connection, lastDisconnect } = update;

    // Emisión de Código QR
    if (qr) {
      let rotations = (qrRotationCounters.get(lineaId) || 0) + 1;
      qrRotationCounters.set(lineaId, rotations);
      console.log(`[WhatsApp Bridge] Real QR generado para ${lineaId} (Rotación ${rotations}/5)`);

      // Cortacircuitos: Si supera 5 rotaciones sin escaneo (~100s), pausar para no saturar
      if (rotations > 5) {
        console.warn(`[WhatsApp Bridge] Límite de 5 rotaciones alcanzado para ${lineaId}. Pausando QR.`);
        const expiredState: WhatsAppQrBridgeStatus = {
          lineaId,
          estado: 'QR_EXPIRADO',
          uptimeSeconds: 0,
          qrCodeDataUri: undefined,
          lastError: 'El código QR expiró por inactividad. Haga clic en Refrescar para generar uno nuevo.',
        };
        activeLinesState.set(lineaId, expiredState);

        await syncLineToFirestore(lineaId, {
          estado: 'QR_EXPIRADO',
          qrCodeDataUri: FieldValue.delete(),
        });

        try {
          sock.end(undefined);
        } catch {}
        activeSockets.delete(lineaId);
        return;
      }

      try {
        const qrDataUri = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
        const currentState = activeLinesState.get(lineaId) || {
          lineaId,
          estado: 'ESPERANDO_QR',
          uptimeSeconds: 0,
        };
        currentState.estado = 'ESPERANDO_QR';
        currentState.qrCodeDataUri = qrDataUri;
        currentState.qrExpiresAt = Date.now() + 20000;
        currentState.qrRotations = rotations;
        activeLinesState.set(lineaId, currentState);

        await syncLineToFirestore(lineaId, {
          estado: 'ESPERANDO_QR',
          qrCodeDataUri: qrDataUri,
          qrExpiresAt: currentState.qrExpiresAt,
          qrRotations: rotations,
        });
      } catch (qrErr) {
        console.error(`[WhatsApp Bridge] Error generando imagen QR:`, qrErr);
      }
    }

    // Conexión Establecida (Dispositivo Vinculado)
    if (connection === 'open') {
      qrRotationCounters.set(lineaId, 0);
      const rawUser = sock.user?.id || '';
      const phoneDigits = rawUser.split(':')[0].split('@')[0].replace(/[^\d]/g, '');
      const connectedPhone = phoneDigits ? `+${phoneDigits}` : undefined;

      console.log(`[WhatsApp Bridge] ¡Línea ${lineaId} CONECTADA exitosamente con ${connectedPhone || 'teléfono real'}!`);

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
        numeroTelefono: connectedPhone || null,
        numeroConectado: connectedPhone || null,
        qrCodeDataUri: FieldValue.delete(),
        isOnline: true,
      });

      await persistSessionToFirestore(lineaId, sessionDir);

      await logWhatsAppAudit({
        lineaId,
        evento: 'VINCULACION_EXITOSA',
        numeroTelefono: connectedPhone,
        timestamp: Date.now(),
        detalles: 'Dispositivo vinculado por escaneo de QR auténtico',
      });
    }

    // Cierre o Desconexión
    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      const isRestartRequired = statusCode === DisconnectReason.restartRequired; // 515

      console.log(
        `[WhatsApp Bridge] Conexión cerrada para ${lineaId}. Código: ${statusCode}. LoggedOut: ${isLoggedOut}. RestartRequired: ${isRestartRequired}`
      );

      activeSockets.delete(lineaId);

      // Código 515: Reinicio normal requerido durante el apretón de manos post-escaneo
      if (isRestartRequired) {
        console.log(`[WhatsApp Bridge] Reinicio 515 post-escaneo para ${lineaId}. Reconectando de inmediato...`);
        setTimeout(() => {
          initializeBaileysSocket(lineaId).catch(console.error);
        }, 500);
        return;
      }

      // Logout definitivo por el usuario desde su teléfono
      if (isLoggedOut) {
        console.log(`[WhatsApp Bridge] Sesión desvinculada definitivamente por WhatsApp para ${lineaId}.`);
        const currentState: WhatsAppQrBridgeStatus = {
          lineaId,
          estado: 'DESCONECTADO',
          uptimeSeconds: 0,
        };
        activeLinesState.set(lineaId, currentState);

        await syncLineToFirestore(lineaId, {
          estado: 'DESCONECTADO',
          numeroTelefono: FieldValue.delete(),
          numeroConectado: FieldValue.delete(),
          qrCodeDataUri: FieldValue.delete(),
          isOnline: false,
        });

        await deleteSessionFromFirestore(lineaId);
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch {}

        await logWhatsAppAudit({
          lineaId,
          evento: 'DESCONEXION_REMOTA',
          timestamp: Date.now(),
          detalles: 'Sesión cerrada desde WhatsApp Móvil',
        });
        return;
      }

      // Reconexión si la línea estaba previamente activa
      const current = activeLinesState.get(lineaId);
      if (current?.estado === 'CONECTADO') {
        console.log(`[WhatsApp Bridge] Reconectando ${lineaId} en 3 segundos...`);
        setTimeout(() => {
          initializeBaileysSocket(lineaId).catch(console.error);
        }, 3000);
      }
    }
  });

  // Escuchar mensajes entrantes en tiempo real con soporte @s.whatsapp.net y @lid
  sock.ev.on('messages.upsert', async ({ messages: newMessages, type }) => {
    if (type !== 'notify') return;

    for (const msg of newMessages) {
      if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;

      const remoteJid = msg.key.remoteJid || '';
      const isFromMe = msg.key.fromMe || false;

      // Normalización E.164: soporte JID estándar y LID
      let phoneDigits = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^\d]/g, '');
      if (!phoneDigits && msg.key.participant) {
        phoneDigits = msg.key.participant.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^\d]/g, '');
      }

      const senderPhone = phoneDigits ? `+${phoneDigits}` : undefined;
      const rawUser = sock.user?.id || '';
      const myPhoneDigits = rawUser.split(':')[0].split('@')[0].replace(/[^\d]/g, '');
      const myPhone = myPhoneDigits ? `+${myPhoneDigits}` : undefined;

      if (!senderPhone) continue;

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
          // Mitigación DevSecOps (N5): Evitar rebasar límite de 1MB de Firestore
          if (buffer.length <= 800 * 1024) {
            const mime = msg.message.imageMessage?.mimetype || 'image/jpeg';
            mediaUrl = `data:${mime};base64,${buffer.toString('base64')}`;
          } else {
            console.warn(`[WhatsApp Bridge] Imagen entrante de ${buffer.length} bytes excede umbral seguro de 800KB.`);
          }
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
        remitenteTelefono: isFromMe ? (myPhone || senderPhone) : senderPhone,
        destinatarioTelefono: isFromMe ? senderPhone : (myPhone || senderPhone),
        direccion: isFromMe ? 'SALIENTE' : 'ENTRANTE',
        texto: textContent,
        timestamp: (msg.messageTimestamp as number) * 1000 || Date.now(),
        estado: 'LEIDO',
        tipoMensaje: isImage ? 'IMAGEN' : 'TEXTO',
        mediaUrl,
        hasComprobantePago: isImage,
      });

      // Si es imagen entrante, crear registro en bandeja de pre-conciliación OCR sin alterar libro mayor
      if (isImage && !isFromMe && mediaUrl) {
        try {
          await adminDb.collection('pagos_reportados_ocr').add({
            lineaId,
            remitenteTelefono: senderPhone,
            mediaUrl,
            estadoConciliacion: 'pendiente_revision',
            fechaReporte: Date.now(),
            origen: 'WHATSAPP_WEB_REAL',
            ocrVerdict: 'PENDIENTE_DISPARO_MANUAL',
          });
        } catch (ocrErr) {
          console.warn('[WhatsApp Bridge] No se pudo encolar pago OCR:', ocrErr);
        }
      }
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
    current.uptimeSeconds = Math.floor(
      (Date.now() - (lineStartTimes.get(lineaId) || Date.now())) / 1000
    );
  }

  return current;
}

/**
 * Genera y devuelve el código QR auténtico de WhatsApp
 */
export async function generateQrCodeHandler(
  lineaId: string,
  forceNew: boolean = false
): Promise<WhatsAppQrBridgeStatus> {
  if (forceNew) {
    qrRotationCounters.set(lineaId, 0);
    const existing = activeSockets.get(lineaId);
    if (existing) {
      try {
        existing.end(undefined);
      } catch {}
      activeSockets.delete(lineaId);
    }
  }

  // Iniciar socket si no existe
  if (!activeSockets.has(lineaId)) {
    await initializeBaileysSocket(lineaId);
  }

  // Esperar hasta 6 segundos para que WhatsApp emita el QR si aún no está disponible
  let current = activeLinesState.get(lineaId);
  let waited = 0;
  while (
    !current?.qrCodeDataUri &&
    current?.estado !== 'CONECTADO' &&
    current?.estado !== 'QR_EXPIRADO' &&
    waited < 6000
  ) {
    await new Promise((r) => setTimeout(r, 200));
    waited += 200;
    current = activeLinesState.get(lineaId);
  }

  return (
    current || {
      lineaId,
      estado: 'ESPERANDO_QR',
      uptimeSeconds: 0,
    }
  );
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
    return { success: false, error: `La línea ${lineaId} no está conectada activamente a WhatsApp.` };
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
    const rawUser = sock.user?.id || '';
    const myPhoneDigits = rawUser.split(':')[0].split('@')[0].replace(/[^\d]/g, '');
    const myPhone = myPhoneDigits ? `+${myPhoneDigits}` : '+580000000000';

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
 * Desconecta la sesión de WhatsApp y limpia los archivos de sesión locales y en Firestore
 */
export async function disconnectWhatsAppLineHandler(lineaId: string): Promise<{ success: boolean; message: string }> {
  qrRotationCounters.set(lineaId, 0);
  const sock = activeSockets.get(lineaId);
  if (sock) {
    try {
      await sock.logout();
    } catch {
      try {
        sock.end(undefined);
      } catch {}
    }
    activeSockets.delete(lineaId);
  }

  const sessionDir = getSessionDir(lineaId);
  try {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  } catch {}

  await deleteSessionFromFirestore(lineaId);

  const state: WhatsAppQrBridgeStatus = {
    lineaId,
    estado: 'DESCONECTADO',
    uptimeSeconds: 0,
  };
  activeLinesState.set(lineaId, state);

  await syncLineToFirestore(lineaId, {
    estado: 'DESCONECTADO',
    numeroTelefono: FieldValue.delete(),
    numeroConectado: FieldValue.delete(),
    qrCodeDataUri: FieldValue.delete(),
    isOnline: false,
    lastActivityTimestamp: Date.now(),
  });

  await logWhatsAppAudit({
    lineaId,
    evento: 'LINEA_DESVINCULADA_MANUAL',
    timestamp: Date.now(),
    detalles: 'Línea desvinculada manualmente por el operador administrativo',
  });

  return { success: true, message: `Línea ${lineaId} desvinculada y sesión eliminada con éxito` };
}

/**
 * Compatibilidad: Devuelve el estado actual de la línea
 */
export async function confirmPairingHandler(
  lineaId: string,
  _phone?: string
): Promise<WhatsAppQrBridgeStatus> {
  return getWhatsAppLineStatusHandler(lineaId);
}

/**
 * Validador de Token Bearer de Firebase Authentication para endpoints seguros
 */
export async function verifyAuthToken(
  authHeader?: string
): Promise<{ authorized: boolean; uid?: string; error?: string }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authorized: false, error: 'Token de autenticación Bearer requerido' };
  }
  const token = authHeader.substring(7).trim();
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { authorized: true, uid: decoded.uid };
  } catch (err: any) {
    return { authorized: false, error: `Token inválido: ${err.message}` };
  }
}
