/**
 * Backend Core: Gobernanza del Logotipo Corporativo (system_config/branding)
 *
 * Principios (Solución Definitiva – Fase B):
 *  - Única vía de escritura del branding: este backend con Admin SDK.
 *  - Toda mutación exige un ID Token de Firebase válido con autoridad SUPERADMIN.
 *  - Solo se aceptan DataURLs de imagen o URLs de Firebase Storage (nunca bytes arbitrarios).
 *  - El servidor NO escribe archivos en disco (src/, public/, dist/) en tiempo de ejecución.
 *  - Cada escritura incrementa `version` para invalidar cachés de cliente de forma determinista.
 */
import admin, { hasAdminCredentials } from './firebaseAdmin';

export const OFFICIAL_LOGO_PATH = '/puro_apure_logo.png';
const ROOT_SUPERADMIN_EMAIL = 'rdrj.mppd@gmail.com';
const BRANDING_SCHEMA = 2;
// Límite seguro bajo el máximo de 1 MiB por documento de Firestore
const MAX_LOGO_URL_LENGTH = 900_000;

const DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/;
const STORAGE_URL_PATTERN = /^https:\/\/(firebasestorage\.googleapis\.com|storage\.googleapis\.com)\//;

export interface UploadLogoPayload {
  logoDataUrl: string;
  systemName?: string;
}

interface BrandingMutationResult {
  success: boolean;
  status: number;
  message?: string;
  error?: string;
  logoUrl?: string;
  version?: number;
}

/**
 * Valida que la URL del logotipo sea un formato persistible y seguro.
 */
export function isAllowedLogoUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > MAX_LOGO_URL_LENGTH) return false;
  return trimmed === OFFICIAL_LOGO_PATH || DATA_URL_PATTERN.test(trimmed) || STORAGE_URL_PATTERN.test(trimmed);
}

/**
 * Verifica criptográficamente el ID Token y la autoridad SUPERADMIN del solicitante.
 * Replica los criterios de isSuperAdmin() de firestore.rules.
 */
async function verifySuperAdmin(
  authHeader?: string
): Promise<{ ok: true; uid: string; email: string } | { ok: false; status: number; error: string }> {
  if (!hasAdminCredentials) {
    return { ok: false, status: 503, error: 'CREDENTIALS_UNAVAILABLE: Operación administrativa no disponible en este entorno.' };
  }
  const match = /^Bearer\s+(.+)$/i.exec(authHeader || '');
  if (!match) {
    return { ok: false, status: 401, error: 'AUTENTICACION_REQUERIDA: Inicie sesión como Superadministrador.' };
  }

  let decoded: any;
  try {
    decoded = await admin.auth().verifyIdToken(match[1].trim());
  } catch {
    return { ok: false, status: 401, error: 'TOKEN_INVALIDO: La sesión expiró o el token no es válido.' };
  }

  const email = String(decoded.email || '').toLowerCase();
  let isSuper =
    email === ROOT_SUPERADMIN_EMAIL || decoded.role === 'SUPERADMIN' || decoded.isSuperAdmin === true;

  if (!isSuper) {
    try {
      const profile = await admin.firestore().collection('users').doc(decoded.uid).get();
      isSuper = profile.exists && profile.data()?.role === 'SUPERADMIN';
    } catch {
      // Sin perfil legible: se mantiene la denegación
    }
  }

  if (!isSuper) {
    return {
      ok: false,
      status: 403,
      error: 'ACCESO_DENEGADO: Solo un SUPERADMIN puede modificar la identidad visual del sistema.',
    };
  }

  return { ok: true, uid: decoded.uid, email };
}

/**
 * POST /api/uploadLogo – Registra un logotipo personalizado (solo SUPERADMIN).
 */
export async function uploadLogoHandler(
  payload: UploadLogoPayload,
  authHeader?: string
): Promise<BrandingMutationResult> {
  try {
    const authResult = await verifySuperAdmin(authHeader);
    if (authResult.ok === false) {
      return { success: false, status: authResult.status, error: authResult.error };
    }

    const { logoDataUrl, systemName = 'Puro Apure ERP' } = payload || ({} as UploadLogoPayload);
    if (!isAllowedLogoUrl(logoDataUrl)) {
      return {
        success: false,
        status: 400,
        error:
          'FORMATO_INVALIDO: Se requiere una imagen PNG/JPEG/WebP/SVG en DataURL (máx. ~650 KB) o una URL de Firebase Storage.',
      };
    }

    const version = Date.now();
    await admin
      .firestore()
      .collection('system_config')
      .doc('branding')
      .set({
        logoUrl: logoDataUrl.trim(),
        fallbackUrl: OFFICIAL_LOGO_PATH,
        systemName,
        isCustom: logoDataUrl.trim() !== OFFICIAL_LOGO_PATH,
        source: 'superadmin-upload',
        schema: BRANDING_SCHEMA,
        version,
        updatedAt: new Date().toISOString(),
        updatedBy: authResult.uid,
        updatedByEmail: authResult.email,
      });

    console.log(`[UploadLogo] Logotipo actualizado por ${authResult.email} (v${version}).`);
    return { success: true, status: 200, message: 'Logotipo actualizado en Cloud Firestore.', logoUrl: logoDataUrl, version };
  } catch (err: any) {
    console.error('[UploadLogo] Error al persistir el logotipo:', err);
    return { success: false, status: 500, error: err?.message || 'Error al persistir el logotipo en el backend.' };
  }
}

/**
 * POST /api/resetLogo – Restaura el logotipo oficial (solo SUPERADMIN).
 */
export async function resetLogoHandler(authHeader?: string): Promise<BrandingMutationResult> {
  try {
    const authResult = await verifySuperAdmin(authHeader);
    if (authResult.ok === false) {
      return { success: false, status: authResult.status, error: authResult.error };
    }

    const version = Date.now();
    await writeOfficialBranding('superadmin-reset', version, authResult.uid, authResult.email);
    return { success: true, status: 200, message: 'Logotipo oficial restaurado.', logoUrl: OFFICIAL_LOGO_PATH, version };
  } catch (err: any) {
    console.error('[ResetLogo] Error al restaurar el logotipo oficial:', err);
    return { success: false, status: 500, error: err?.message || 'Error al restaurar el logotipo oficial.' };
  }
}

/**
 * GET /api/getBranding – Lectura pública (respaldo cuando el SDK cliente de Firestore no está disponible).
 */
export async function getBrandingHandler(): Promise<{
  success: boolean;
  logoUrl: string;
  isCustom: boolean;
  version: number;
  systemName?: string;
}> {
  if (!hasAdminCredentials) {
    return { success: true, logoUrl: OFFICIAL_LOGO_PATH, isCustom: false, version: 0, systemName: 'Puro Apure ERP' };
  }
  try {
    const snap = await admin.firestore().collection('system_config').doc('branding').get();
    const data = snap.exists ? snap.data() : undefined;
    if (data && isAllowedLogoUrl(data.logoUrl)) {
      return {
        success: true,
        logoUrl: data.logoUrl,
        isCustom: data.isCustom === true && data.logoUrl !== OFFICIAL_LOGO_PATH,
        version: Number(data.version) || 0,
        systemName: data.systemName || 'Puro Apure ERP',
      };
    }
  } catch (err: any) {
    if (!(err?.code === 7 || err?.message?.includes('PERMISSION_DENIED') || err?.message?.includes('insufficient permissions'))) {
      console.warn('[getBrandingHandler] Error leyendo branding de Firestore:', err);
    }
  }
  return { success: true, logoUrl: OFFICIAL_LOGO_PATH, isCustom: false, version: 0, systemName: 'Puro Apure ERP' };
}

async function writeOfficialBranding(source: string, version: number, uid = 'system', email = 'system') {
  await admin.firestore().collection('system_config').doc('branding').set({
    logoUrl: OFFICIAL_LOGO_PATH,
    fallbackUrl: OFFICIAL_LOGO_PATH,
    systemName: 'Puro Apure ERP',
    isCustom: false,
    source,
    schema: BRANDING_SCHEMA,
    version,
    updatedAt: new Date().toISOString(),
    updatedBy: uid,
    updatedByEmail: email,
  });
}

/**
 * Migración idempotente de integridad (Fase D) ejecutada al iniciar el servidor.
 *
 * - Documento inexistente → siembra el logotipo oficial.
 * - Documento heredado (sin `schema` vigente, escrito por el pipeline anterior sin validación)
 *   o con una URL no permitida → se RESPALDA íntegro en system_config/branding_backup_<timestamp>
 *   y se restaura el logotipo oficial.
 * - Documento ya migrado (schema vigente y URL válida) → no se toca (respeta logos personalizados legítimos).
 */
export async function ensureBrandingIntegrity(): Promise<void> {
  if (!hasAdminCredentials) {
    // Sin credenciales administrativas en el servidor local.
    // La integridad del branding es gestionada por el cliente Web SDK autenticado con reglas de seguridad.
    return;
  }
  try {
    const db = admin.firestore();
    const docRef = db.collection('system_config').doc('branding');
    const snap = await docRef.get();

    if (!snap.exists) {
      await writeOfficialBranding('integrity-seed', Date.now());
      console.log('[Branding] Logotipo oficial sembrado en Cloud Firestore.');
      return;
    }

    const data = snap.data() || {};
    const isCurrentSchema = data.schema === BRANDING_SCHEMA;
    if (isCurrentSchema && isAllowedLogoUrl(data.logoUrl)) {
      return;
    }

    const backupId = `branding_backup_${Date.now()}`;
    await db.collection('system_config').doc(backupId).set({
      ...data,
      backedUpAt: new Date().toISOString(),
      backupReason: isCurrentSchema ? 'invalid-logo-url' : 'legacy-unvalidated-schema',
    });
    await writeOfficialBranding('integrity-migration', Date.now());
    console.log(`[Branding] Documento heredado respaldado en system_config/${backupId}; logotipo oficial restaurado.`);
  } catch (err: any) {
    const errMsg = String(err?.message || err || '');
    if (
      err?.code === 7 ||
      String(err?.code) === '7' ||
      errMsg.includes('PERMISSION_DENIED') ||
      errMsg.includes('insufficient permissions') ||
      errMsg.includes('Missing or insufficient permissions')
    ) {
      return;
    }
    console.warn('[Branding] Aviso en verificación de integridad de marca:', errMsg);
  }
}

/**
 * @deprecated Conservado por compatibilidad; delega en ensureBrandingIntegrity().
 */
export async function seedInitialBrandingIfMissing(): Promise<void> {
  return ensureBrandingIntegrity();
}
