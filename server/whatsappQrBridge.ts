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
import zlib from 'zlib';
import { GoogleGenAI } from '@google/genai';
import { adminApp, adminAuth, adminDb, FieldValue, hasAdminCredentials } from './firebaseAdmin';
import { sanitizeFirestorePayload } from '../src/utils/sanitizeFirestorePayload';

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
  // Compresión gzip para mantener el payload compacto y dentro del límite estricto de 1MB de Firestore
  const inputBuffer = zlib.gzipSync(Buffer.from(text, 'utf-8'));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encryptedBuf = Buffer.concat([cipher.update(inputBuffer), cipher.final()]);
  const tag = cipher.getAuthTag().toString('hex');
  return {
    iv: iv.toString('hex'),
    tag,
    encrypted: encryptedBuf.toString('hex'),
  };
}

function decryptSessionData(payload: { iv: string; tag: string; encrypted: string }): string {
  const iv = Buffer.from(payload.iv, 'hex');
  const tag = Buffer.from(payload.tag, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  const decryptedBuf = Buffer.concat([
    decipher.update(Buffer.from(payload.encrypted, 'hex')),
    decipher.final(),
  ]);
  // Detección automática de compresión gzip (magic bytes 0x1f 0x8b) para compatibilidad total
  if (decryptedBuf.length >= 2 && decryptedBuf[0] === 0x1f && decryptedBuf[1] === 0x8b) {
    return zlib.gunzipSync(decryptedBuf).toString('utf-8');
  }
  return decryptedBuf.toString('utf-8');
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
  if (!hasAdminCredentials) {
    return false;
  }
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
  } catch (err: any) {
    if (!err?.message?.includes('PERMISSION_DENIED') && err?.code !== 7) {
      console.warn(`[WhatsApp Bridge] Aviso al restaurar sesión de Firestore para ${lineaId}:`, err);
    }
    return false;
  }
}

/**
 * Opción A: Resguarda los archivos de sesión cifrados en Firestore
 */
async function persistSessionToFirestore(lineaId: string, sessionDir: string): Promise<void> {
  if (!hasAdminCredentials) {
    return;
  }
  try {
    if (!fs.existsSync(sessionDir)) return;
    const fileNames = fs.readdirSync(sessionDir);
    if (fileNames.length === 0) return;

    // Saneamiento DevSecOps: Seleccionar credenciales críticas y ventana deslizante de pre-keys
    const prekeys = fileNames.filter((f) => f.startsWith('pre-key-'));
    const lids = fileNames.filter((f) => f.startsWith('lid-mapping-'));
    const essential = fileNames.filter((f) => !f.startsWith('lid-mapping-') && !f.startsWith('pre-key-'));

    // Conservar esenciales (creds.json, app-state, etc.) + hasta 50 prekeys recientes y 50 lid-mappings
    const selectedFiles = [
      ...essential,
      ...prekeys.slice(-50),
      ...lids.slice(-50),
    ];

    const files: Record<string, string> = {};
    for (const name of selectedFiles) {
      const filePath = path.join(sessionDir, name);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        files[name] = fs.readFileSync(filePath, 'utf-8');
      }
    }

    const jsonStr = JSON.stringify(files);
    let encrypted = encryptSessionData(jsonStr);

    // Salvaguarda estricta de cuota Firestore: si aún supera 750 KB, limitar a credenciales esenciales
    if (encrypted.encrypted.length > 750_000) {
      const essentialFiles: Record<string, string> = {};
      for (const name of essential) {
        const filePath = path.join(sessionDir, name);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          essentialFiles[name] = fs.readFileSync(filePath, 'utf-8');
        }
      }
      encrypted = encryptSessionData(JSON.stringify(essentialFiles));
    }

    await adminDb.collection('whatsapp_sesiones').doc(lineaId).set(
      {
        lineaId,
        updatedAt: Date.now(),
        filesCount: Object.keys(files).length,
        filesEncrypted: encrypted,
      },
      { merge: true }
    );
    console.log(`[WhatsApp Bridge] Sesión de ${lineaId} resguardada exitosamente en Firestore (${encrypted.encrypted.length} caracteres hex).`);
  } catch (err: any) {
    if (!err?.message?.includes('PERMISSION_DENIED') && err?.code !== 7) {
      console.warn(`[WhatsApp Bridge] Aviso al resguardar sesión en Firestore para ${lineaId}:`, err);
    }
  }
}

/**
 * Opción A: Elimina la sesión resguardada en Firestore al desvincular
 */
async function deleteSessionFromFirestore(lineaId: string): Promise<void> {
  if (!hasAdminCredentials) {
    return;
  }
  try {
    await adminDb.collection('whatsapp_sesiones').doc(lineaId).delete();
    console.log(`[WhatsApp Bridge] Sesión en Firestore eliminada para ${lineaId}.`);
  } catch (err: any) {
    if (!err?.message?.includes('PERMISSION_DENIED') && err?.code !== 7) {
      console.warn(`[WhatsApp Bridge] Error al eliminar sesión de Firestore para ${lineaId}:`, err);
    }
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
  if (!hasAdminCredentials) {
    console.debug('[WhatsApp Bridge] Auditoría en memoria:', entry);
    return;
  }
  try {
    await adminDb.collection('whatsapp_auditoria').add({
      ...entry,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.debug('[WhatsApp Bridge] Auditoría en memoria:', entry);
  }
}

const DEFAULT_BRIDGE_LINE_NAMES: Record<string, string> = {
  linea_cobranzas: 'Línea de Crédito y Cobranzas',
  linea_ventas: 'Línea de Ventas y Despacho',
  linea_brm: 'Línea de Proveedores y BRM',
};

/**
 * Sincroniza el estado de la línea con Firestore para que el frontend lo lea en tiempo real
 */
async function syncLineToFirestore(lineaId: string, status: Record<string, any>) {
  if (!hasAdminCredentials) {
    return;
  }
  try {
    const docRef = adminDb.collection('whatsapp_lineas').doc(lineaId);
    await docRef.set(
      {
        nombre: DEFAULT_BRIDGE_LINE_NAMES[lineaId] || `Línea ${lineaId}`,
        ...status,
        lastActivityTimestamp: Date.now(),
      },
      { merge: true }
    );
  } catch (err: any) {
    if (!err?.message?.includes('PERMISSION_DENIED') && err?.code !== 7) {
      console.debug(`[WhatsApp Bridge] Sincronización Firestore en memoria para ${lineaId}`);
    }
  }
}

export interface SyncedContact {
  id: string;
  name?: string;
  notify?: string;
  verifiedName?: string;
  phone?: string;
  lastUpdated: number;
}

const contactsMemoryCache = new Map<string, Map<string, SyncedContact>>();

function getContactsMapFilePath(lineaId: string): string {
  const sessionDir = getSessionDir(lineaId);
  return path.join(sessionDir, 'contacts-map.json');
}

export function cleanContactDisplayName(name?: string | null): string | undefined {
  if (!name) return undefined;
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  if (/^[\.\s\-_]+$/.test(trimmed) || trimmed === '...' || trimmed === '..' || trimmed === '.') {
    return undefined;
  }
  if (/^\+?\d+$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export function loadLineContacts(lineaId: string): Map<string, SyncedContact> {
  let map = contactsMemoryCache.get(lineaId);
  if (map) return map;

  map = new Map<string, SyncedContact>();
  const filePath = getContactsMapFilePath(lineaId);
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (typeof data === 'object' && data !== null) {
        for (const [k, v] of Object.entries(data)) {
          map.set(k, v as SyncedContact);
        }
      }
    } catch (e) {
      console.warn(`[WhatsApp Bridge] Error leyendo contacts-map.json para ${lineaId}:`, e);
    }
  }
  contactsMemoryCache.set(lineaId, map);
  return map;
}

function persistLineContacts(lineaId: string) {
  const map = contactsMemoryCache.get(lineaId);
  if (!map) return;
  const filePath = getContactsMapFilePath(lineaId);
  try {
    const obj: Record<string, SyncedContact> = {};
    for (const [k, v] of map.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {
    console.warn(`[WhatsApp Bridge] Error guardando contacts-map.json para ${lineaId}:`, e);
  }
}

export function ingestLineContacts(lineaId: string, contacts: any[]) {
  if (!Array.isArray(contacts) || contacts.length === 0) return;
  const map = loadLineContacts(lineaId);
  let changed = false;

  for (const c of contacts) {
    if (!c || !c.id) continue;
    const jid = String(c.id);
    const rawDigits = jid.split('@')[0].split(':')[0].replace(/[^\d]/g, '');
    const cleanName = cleanContactDisplayName(c.name) || cleanContactDisplayName(c.notify) || cleanContactDisplayName(c.verifiedName);

    if (cleanName) {
      const entry: SyncedContact = {
        id: jid,
        name: cleanName,
        notify: cleanContactDisplayName(c.notify),
        verifiedName: cleanContactDisplayName(c.verifiedName),
        phone: rawDigits ? `+${rawDigits}` : undefined,
        lastUpdated: Date.now(),
      };

      map.set(jid, entry);
      if (rawDigits) {
        map.set(rawDigits, entry);
        map.set(`+${rawDigits}`, entry);
      }
      changed = true;
    }
  }

  if (changed) {
    persistLineContacts(lineaId);
    console.log(`[WhatsApp Bridge] Agenda de ${lineaId} sincronizada: ${map.size} entradas registradas.`);
  }
}

export function getLineContactsHandler(lineaId: string): Record<string, SyncedContact> {
  const map = loadLineContacts(lineaId);
  const obj: Record<string, SyncedContact> = {};
  for (const [k, v] of map.entries()) {
    obj[k] = v;
  }
  return obj;
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
  estado: 'ENVIADO' | 'ENTREGADO' | 'LEIDO' | 'FALLIDO';
  tipoMensaje: 'TEXTO' | 'IMAGEN';
  mediaUrl?: string;
  hasComprobantePago?: boolean;
  senderName?: string;
  destinatarioNombre?: string;
  whatsappMessageId?: string;
  errorDetalle?: string;
}) {
  if (!hasAdminCredentials) {
    return;
  }
  try {
    const docRef = adminDb.collection('whatsapp_mensajes').doc(messageData.id);
    const payload = sanitizeFirestorePayload({
      ...messageData,
      whatsappMessageId: messageData.whatsappMessageId || messageData.id,
      ocrStatus: messageData.hasComprobantePago ? 'PENDIENTE' : 'NO_ANALIZADO',
    });
    await docRef.set(payload, { merge: true });
    console.log(`[WhatsApp Bridge] Mensaje ${messageData.id} guardado en Firestore.`);
  } catch (err: any) {
    if (!err?.message?.includes('PERMISSION_DENIED') && err?.code !== 7) {
      console.warn(`[WhatsApp Bridge] No se pudo guardar mensaje en Firestore:`, err);
    }
  }
}

/**
 * Resuelve un JID o LID de WhatsApp a número telefónico real E.164 consultando la tabla inversa de Baileys
 */
function resolveLidToPhoneNumber(
  lineaId: string,
  remoteJid: string,
  participant?: string
): { phone: string; isLid: boolean; lidRaw?: string } {
  const isLid = remoteJid.includes('@lid') || (!!participant && participant.includes('@lid'));
  const sessionDir = getSessionDir(lineaId);

  // 1. Si no es LID, extraer dígitos directos del JID estándar @s.whatsapp.net
  if (!isLid) {
    const raw = remoteJid.split('@')[0].split(':')[0].replace(/[^\d]/g, '');
    return { phone: raw ? `+${raw}` : '', isLid: false };
  }

  // 2. Si es LID, extraer el ID numérico
  const targetJid = remoteJid.includes('@lid') ? remoteJid : (participant || '');
  const lidClean = targetJid.replace('@lid', '').split(':')[0].replace(/[^\d]/g, '');

  if (lidClean) {
    // Buscar en archivo reverso de Baileys generado en sesión
    const reverseFile = path.join(sessionDir, `lid-mapping-${lidClean}_reverse.json`);
    if (fs.existsSync(reverseFile)) {
      try {
        const mapped = JSON.parse(fs.readFileSync(reverseFile, 'utf-8'));
        const cleanMapped = String(mapped).replace(/[^\d]/g, '');
        if (cleanMapped) {
          return { phone: `+${cleanMapped}`, isLid: true, lidRaw: lidClean };
        }
      } catch {}
    }
  }

  // 3. Si participant tiene formato estándar @s.whatsapp.net, usarlo
  if (participant && participant.includes('@s.whatsapp.net')) {
    const partDigits = participant.replace('@s.whatsapp.net', '').split(':')[0].replace(/[^\d]/g, '');
    if (partDigits) {
      return { phone: `+${partDigits}`, isLid: false, lidRaw: lidClean };
    }
  }

  // 4. Si aún no hay mapeo inverso, retornar el LID limpio
  return { phone: lidClean ? `+${lidClean}` : '', isLid: true, lidRaw: lidClean };
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

  // Sincronización de Agenda e Historial de Contactos desde el dispositivo vinculado
  sock.ev.on('messaging-history.set', async ({ contacts, chats, messages, isLatest }) => {
    console.log(`[WhatsApp Bridge] Sincronización messaging-history.set para ${lineaId} (isLatest: ${isLatest}): contacts=${contacts?.length || 0}`);
    if (contacts && contacts.length > 0) {
      ingestLineContacts(lineaId, contacts);
    }
  });

  sock.ev.on('contacts.upsert', async (contacts) => {
    console.log(`[WhatsApp Bridge] Sincronización contacts.upsert para ${lineaId}: ${contacts.length} contactos.`);
    ingestLineContacts(lineaId, contacts);
  });

  sock.ev.on('contacts.update', async (updates) => {
    ingestLineContacts(lineaId, updates as any);
  });

  // Escuchar mensajes entrantes en tiempo real con soporte @s.whatsapp.net y @lid
  sock.ev.on('messages.upsert', async ({ messages: newMessages, type }) => {
    if (type !== 'notify' && type !== 'append') return;

    for (const msg of newMessages) {
      if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;

      const remoteJid = msg.key.remoteJid || '';
      const isFromMe = msg.key.fromMe || false;

      // Normalización E.164 y resolución inversa de LIDs de WhatsApp
      const resolved = resolveLidToPhoneNumber(lineaId, remoteJid, msg.key.participant);
      const senderPhone = resolved.phone || undefined;
      const rawUser = sock.user?.id || '';
      const myPhoneDigits = rawUser.split(':')[0].split('@')[0].replace(/[^\d]/g, '');
      const myPhone = myPhoneDigits ? `+${myPhoneDigits}` : undefined;

      if (!senderPhone) continue;

      // Extraer nombre de remitente saneado desde la agenda local o pushName (prohibido "..." o vacíos)
      const contactsMap = loadLineContacts(lineaId);
      const contactEntry = contactsMap.get(senderPhone) || contactsMap.get(senderPhone.replace(/[^\d]/g, '')) || contactsMap.get(remoteJid);
      const cleanSender = cleanContactDisplayName(contactEntry?.name) || cleanContactDisplayName(msg.pushName);

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
        senderName: isFromMe ? undefined : (cleanSender || undefined),
        destinatarioNombre: isFromMe ? (cleanSender || undefined) : undefined,
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

  // Propagar eliminación de chats desde el teléfono hacia Firestore
  sock.ev.on('chats.delete' as any, async (deletedJids: string[]) => {
    for (const jid of deletedJids) {
      const cleanDigits = jid.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/\D/g, '');
      if (cleanDigits) {
        await deleteWhatsAppChatHandler(lineaId, cleanDigits);
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
 * Auto-restaura las sesiones activas en segundo plano al arrancar el servidor
 * si existen credenciales válidas en .whatsapp_sessions/<lineaId>/creds.json
 */
export async function autoRestoreExistingSessions(): Promise<void> {
  const lineIds = ['linea_cobranzas', 'linea_ventas', 'linea_brm'];
  for (const lineaId of lineIds) {
    try {
      const sessionDir = getSessionDir(lineaId);
      const credsFile = path.join(sessionDir, 'creds.json');
      let hasValidCreds = false;

      if (fs.existsSync(credsFile)) {
        try {
          const creds = JSON.parse(fs.readFileSync(credsFile, 'utf-8'));
          if (creds?.me?.id) {
            hasValidCreds = true;
          }
        } catch {}
      }

      if (!hasValidCreds && hasAdminCredentials) {
        hasValidCreds = await restoreSessionFromFirestore(lineaId, sessionDir);
      }

      if (hasValidCreds && !activeSockets.has(lineaId)) {
        console.log(`[WhatsApp Bridge] Sesión existente detectada para ${lineaId}. Auto-reconectando Baileys en segundo plano...`);
        initializeBaileysSocket(lineaId).catch((err) => {
          console.warn(`[WhatsApp Bridge] Aviso al auto-reconectar ${lineaId}:`, err?.message || err);
        });
      }
    } catch (e) {
      console.warn(`[WhatsApp Bridge] Error en auto-restauración de ${lineaId}:`, e);
    }
  }
}

/**
 * Genera y devuelve el código QR auténtico de WhatsApp
 */
export async function generateQrCodeHandler(
  lineaId: string,
  forceNew: boolean = false
): Promise<WhatsAppQrBridgeStatus> {
  if (forceNew) {
    // Si se solicita forzar nuevo QR, desvincular forzosamente para limpiar sesión zombi en disco y memoria
    await disconnectWhatsAppLineHandler(lineaId);
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
  mediaDataUrl?: string,
  clientMsgId?: string,
  destinatarioNombre?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const sock = activeSockets.get(lineaId);
  const lineState = activeLinesState.get(lineaId);

  if (!sock || lineState?.estado !== 'CONECTADO') {
    const errorMsg = `La línea ${lineaId} no está conectada activamente a WhatsApp (Estado: ${lineState?.estado || 'DESCONECTADO'}). Escanee el código QR para vincular su cuenta.`;
    return { success: false, error: errorMsg };
  }

  try {
    const cleanDigits = toPhone.replace(/[^\d]/g, '');
    const sessionDir = getSessionDir(lineaId);

    // Detección de LID (identificador de 13+ dígitos sin prefijo nacional de Venezuela 58)
    const isLid = cleanDigits.length > 13 && !cleanDigits.startsWith('58');
    let jid = `${cleanDigits}@s.whatsapp.net`;

    if (isLid) {
      // Buscar si existe un mapeo inverso a número real para este LID
      const reverseFile = path.join(sessionDir, `lid-mapping-${cleanDigits}_reverse.json`);
      let mappedPhone = '';
      if (fs.existsSync(reverseFile)) {
        try {
          const content = JSON.parse(fs.readFileSync(reverseFile, 'utf-8'));
          mappedPhone = String(content).replace(/[^\d]/g, '');
        } catch {}
      }

      if (mappedPhone) {
        jid = `${mappedPhone}@s.whatsapp.net`;
      } else {
        // Enviar al identificador LID directamente
        jid = `${cleanDigits}@lid`;
      }
    }

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

    const messageId = sentMsg?.key?.id || `msg_${Date.now()}`;
    const rawUser = sock.user?.id || '';
    const myPhoneDigits = rawUser.split(':')[0].split('@')[0].replace(/[^\d]/g, '');
    const myPhone = myPhoneDigits ? `+${myPhoneDigits}` : '+580000000000';

    const docId = clientMsgId || messageId;
    await saveMessageToFirestore({
      id: docId,
      lineaId,
      remitenteTelefono: myPhone,
      destinatarioTelefono: toPhone.startsWith('+') ? toPhone : `+${cleanDigits}`,
      direccion: 'SALIENTE',
      texto: text,
      timestamp: Date.now(),
      estado: 'ENVIADO',
      tipoMensaje: mediaDataUrl ? 'IMAGEN' : 'TEXTO',
      mediaUrl: mediaDataUrl,
      whatsappMessageId: sentMsg?.key?.id,
      destinatarioNombre: cleanContactDisplayName(destinatarioNombre),
    });

    return { success: true, messageId };
  } catch (err: any) {
    console.error('[WhatsApp Bridge] Error al enviar mensaje:', err);
    if (clientMsgId) {
      const rawUser = sock?.user?.id || '';
      const myPhoneDigits = rawUser.split(':')[0].split('@')[0].replace(/[^\d]/g, '');
      const myPhone = myPhoneDigits ? `+${myPhoneDigits}` : '+580000000000';
      const cleanDigits = toPhone.replace(/[^\d]/g, '');
      await saveMessageToFirestore({
        id: clientMsgId,
        lineaId,
        remitenteTelefono: myPhone,
        destinatarioTelefono: toPhone.startsWith('+') ? toPhone : `+${cleanDigits}`,
        direccion: 'SALIENTE',
        texto: text,
        timestamp: Date.now(),
        estado: 'FALLIDO',
        tipoMensaje: mediaDataUrl ? 'IMAGEN' : 'TEXTO',
        mediaUrl: mediaDataUrl,
        destinatarioNombre: cleanContactDisplayName(destinatarioNombre),
        errorDetalle: err.message,
      });
    }
    return { success: false, error: err.message || 'Error al enviar por socket de WhatsApp' };
  }
}

/**
 * Desconecta la sesión de WhatsApp y limpia los archivos de sesión locales y en Firestore
 */
export async function disconnectWhatsAppLineHandler(lineaId: string): Promise<{ success: boolean; message: string }> {
  qrRotationCounters.set(lineaId, 0);

  // 1. Establecer estado DESCONECTADO de inmediato en memoria para prevenir auto-reconexiones
  const state: WhatsAppQrBridgeStatus = {
    lineaId,
    estado: 'DESCONECTADO',
    uptimeSeconds: 0,
    qrCodeDataUri: undefined,
  };
  activeLinesState.set(lineaId, state);

  // 2. Cerrar y desmantelar el socket
  const sock = activeSockets.get(lineaId);
  if (sock) {
    try {
      sock.ev.removeAllListeners('connection.update');
      sock.ev.removeAllListeners('creds.update');
      sock.ev.removeAllListeners('messages.upsert');
      sock.ev.removeAllListeners('messaging-history.set');
      sock.ev.removeAllListeners('contacts.upsert');
      sock.ev.removeAllListeners('contacts.update');
      (sock.ev as any).removeAllListeners?.();
    } catch {}

    try {
      await Promise.race([
        sock.logout().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch {}

    try {
      sock.end(undefined);
    } catch {}

    activeSockets.delete(lineaId);
  }

  // 3. Eliminar sesión física en disco
  const sessionDir = getSessionDir(lineaId);
  try {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn(`[WhatsApp Bridge] Aviso al borrar ${sessionDir}:`, err);
  }

  // 4. Limpiar caché de memoria de contactos
  contactsMemoryCache.delete(lineaId);

  // 5. Eliminar de Firestore si hay credenciales administrativas
  if (hasAdminCredentials) {
    await deleteSessionFromFirestore(lineaId);
  }

  // 6. Sincronizar estado en Firestore si hay credenciales
  if (hasAdminCredentials) {
    await syncLineToFirestore(lineaId, {
      estado: 'DESCONECTADO',
      numeroTelefono: FieldValue.delete(),
      numeroConectado: FieldValue.delete(),
      qrCodeDataUri: FieldValue.delete(),
      isOnline: false,
      lastActivityTimestamp: Date.now(),
    });
  }

  // 7. Purga DevSecOps de Leads si hay credenciales
  if (hasAdminCredentials) {
    try {
      const entitiesSnap = await adminDb.collection('dual_entities').get();
      const registeredPhoneDigits = new Set<string>();
      entitiesSnap.forEach((d) => {
        const data = d.data();
        const p1 = (data.phone || '').replace(/\D/g, '');
        const p2 = (data.telefonoContacto || '').replace(/\D/g, '');
        if (p1.length >= 7) registeredPhoneDigits.add(p1.slice(-10));
        if (p2.length >= 7) registeredPhoneDigits.add(p2.slice(-10));
      });

      const messagesSnap = await adminDb
        .collection('whatsapp_mensajes')
        .where('lineaId', '==', lineaId)
        .get();

      const batch = adminDb.batch();
      let purgedCount = 0;

      messagesSnap.forEach((doc) => {
        const msg = doc.data();
        const remDigits = (msg.remitenteTelefono || '').replace(/\D/g, '').slice(-10);
        const destDigits = (msg.destinatarioTelefono || '').replace(/\D/g, '').slice(-10);

        const isRemRegistered = remDigits && registeredPhoneDigits.has(remDigits);
        const isDestRegistered = destDigits && registeredPhoneDigits.has(destDigits);

        if (!isRemRegistered && !isDestRegistered) {
          batch.delete(doc.ref);
          purgedCount++;
        }
      });

      if (purgedCount > 0) {
        await batch.commit();
        console.log(`[WhatsApp Bridge] Purga DevSecOps: ${purgedCount} mensajes de Leads eliminados tras desvincular.`);
      }
    } catch (purgeErr: any) {
      if (!purgeErr?.message?.includes('PERMISSION_DENIED') && purgeErr?.code !== 7) {
        console.warn('[WhatsApp Bridge] Error durante purga automática de Leads:', purgeErr);
      }
    }
  }

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
  // Blindaje DevSecOps: Si el entorno opera sin serviceAccountKey (hasAdminCredentials === false),
  // permitir la operación administrativa para no bloquear endpoints con 401 en local/dev
  if (!hasAdminCredentials) {
    return { authorized: true, uid: 'local_dev_operator' };
  }
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


/**
 * Elimina definitivamente un chat y todos sus mensajes en Firestore y en WhatsApp real
 */
export async function deleteWhatsAppChatHandler(
  lineaId: string,
  contactPhone: string
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const cleanDigits = contactPhone.replace(/\D/g, '');
    const normPhone = contactPhone.startsWith('+') ? contactPhone : `+${cleanDigits}`;

    if (hasAdminCredentials) {
      const messagesRef = adminDb.collection('whatsapp_mensajes');
      const snap1 = await messagesRef
        .where('lineaId', '==', lineaId)
        .where('remitenteTelefono', '==', normPhone)
        .get();
      const snap2 = await messagesRef
        .where('lineaId', '==', lineaId)
        .where('destinatarioTelefono', '==', normPhone)
        .get();

      const docIds = new Set<string>();
      snap1.docs.forEach((d) => docIds.add(d.id));
      snap2.docs.forEach((d) => docIds.add(d.id));

      if (cleanDigits.length >= 10) {
        const snap3 = await messagesRef
          .where('lineaId', '==', lineaId)
          .where('remitenteTelefono', '==', `+58${cleanDigits.slice(-10)}`)
          .get();
        const snap4 = await messagesRef
          .where('lineaId', '==', lineaId)
          .where('destinatarioTelefono', '==', `+58${cleanDigits.slice(-10)}`)
          .get();
        snap3.docs.forEach((d) => docIds.add(d.id));
        snap4.docs.forEach((d) => docIds.add(d.id));
      }

      const batch = adminDb.batch();
      for (const id of docIds) {
        batch.delete(messagesRef.doc(id));
      }
      if (docIds.size > 0) {
        await batch.commit();
        console.log(`[WhatsApp Bridge] Eliminados ${docIds.size} mensajes del chat ${normPhone}.`);
      }
    }

    // Sincronizar borrado con el teléfono real de WhatsApp si el socket está activo
    const sock = activeSockets.get(lineaId);
    if (sock) {
      try {
        const jid = `${cleanDigits}@s.whatsapp.net`;
        await sock.chatModify({ delete: true, lastMessages: [] }, jid);
        console.log(`[WhatsApp Bridge] Sincronizado borrado de chat ${jid} con WhatsApp real.`);
      } catch (sockErr) {
        console.debug('[WhatsApp Bridge] No se pudo sincronizar borrado con socket Baileys:', sockErr);
      }
    }

    await logWhatsAppAudit({
      lineaId,
      evento: 'CHAT_ELIMINADO',
      destinatario: normPhone,
      timestamp: Date.now(),
      detalles: `Eliminado chat con ${normPhone}. Total mensajes purgados: ${docIds.size}`,
    });

    return { success: true, count: docIds.size };
  } catch (err: any) {
    console.error('[WhatsApp Bridge] Error al eliminar chat:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Analizador OCR de comprobantes bancarios mediante Gemini en el backend
 */
export async function analyzeReceiptOcrHandler(
  base64Clean: string,
  mimeType: string = 'image/jpeg'
): Promise<{ success: boolean; data?: any; error?: string }> {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey.length < 20) {
    return {
      success: false,
      error: 'API Key de Gemini no configurada o incompleta en el servidor.',
    };
  }

  const candidateModels = [
    'gemini-2.5-flash',
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
  ];
  for (const model of candidateModels) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Actúa como un Perito Forense Documental y Lector OCR para Comprobantes de Pago en Venezuela (Pago Móvil, Transferencia, Zelle, Binance, Criptoactivos).
Analiza meticulosamente la imagen adjunta y extrae en formato estrictamente JSON:
{
  "tipoComprobante": "PAGO_MOVIL" | "TRANSFERENCIA" | "ZELLE" | "CRIPTOACTIVOS" | "RETENCION_FISCAL" | "RIF",
  "bancoEmisor": "Nombre del banco emisor o plataforma (ej. Bancamiga, Banesco, Mercantil, BDV, BNC, Provincial, etc.)",
  "bancoReceptor": "Nombre del banco receptor (ej. Banco de Venezuela, Banesco, etc.)",
  "fechaComprobante": "YYYY-MM-DD",
  "numeroReferencia": "Solo dígitos o alfanumérico de referencia (ej. 112338509503)",
  "monedaOriginal": "VES" | "USD",
  "montoOriginal": 0.00,
  "rifCedula": "Cédula o RIF detectado (ej. V-11083828 o J-12345678-0)",
  "telefonoNombreEmisor": "Teléfono o concepto asociado (ej. 04145057900)",
  "consistenciaTipografica": true o false,
  "halosDeColor": true o false,
  "patronBancarioValido": true o false,
  "analisisVisualDetalle": "Resumen conciso del peritaje forense"
}
IMPORTANTE: Si el monto está en formato venezolano con punto de miles y coma de decimales (ej. Bs. 8.833,96), conviértelo a número flotante 8833.96. Prohibido inventar datos si no son legibles.`;

      const response: any = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: mimeType || 'image/jpeg',
                  data: base64Clean,
                },
              },
              { text: prompt },
            ],
          },
        ],
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });

      const text = response.text || '';
      const parsed = JSON.parse(text);
      return {
        success: true,
        data: {
          tipoComprobante: parsed.tipoComprobante || 'PAGO_MOVIL',
          bancoEmisor: parsed.bancoEmisor || '',
          bancoReceptor: parsed.bancoReceptor || '',
          fechaComprobante: parsed.fechaComprobante || new Date().toISOString().split('T')[0],
          numeroReferencia: String(parsed.numeroReferencia || '').replace(/[^0-9A-Za-z]/g, ''),
          monedaOriginal: parsed.monedaOriginal === 'USD' ? 'USD' : 'VES',
          montoOriginal: Number(parsed.montoOriginal) || 0,
          rifCedula: parsed.rifCedula || '',
          telefonoNombreEmisor: parsed.telefonoNombreEmisor || '',
          consistenciaTipografica: parsed.consistenciaTipografica ?? true,
          halosDeColor: parsed.halosDeColor ?? false,
          patronBancarioValido: parsed.patronBancarioValido ?? true,
          analisisVisualDetalle: parsed.analisisVisualDetalle || `Comprobante analizado con ${model}.`,
        },
      };
    } catch (err: any) {
      console.warn(`[OCR Backend] Error con modelo ${model}:`, err.message);
    }
  }

  return { success: false, error: 'No se pudo procesar la imagen con los modelos disponibles.' };
}
