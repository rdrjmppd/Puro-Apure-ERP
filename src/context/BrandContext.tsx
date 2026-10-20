import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase/config';

export const STATIC_FALLBACK_LOGO = '/puro_apure_logo.png';
export const BRAND_LOGO_STORAGE_KEY = 'agroerp_custom_brand_logo';
export const BRAND_LOGO_INDEXED_DB = 'agroerp_brand_db';
export const BRAND_LOGO_STORE = 'settings';

/**
 * Versión del esquema de caché local del logotipo.
 * Al cambiar este valor, TODOS los navegadores purgan automáticamente el logotipo cacheado
 * (incluida la imagen impostora heredada) sin intervención manual.
 */
const BRAND_CACHE_VERSION_KEY = 'agroerp_brand_cache_version';
const BRAND_CACHE_SCHEMA = 'brand-cache-2026-10-13-v2';

// Límite de seguridad alineado con el backend (documento Firestore ≤ 1 MiB)
const MAX_LOGO_DATA_URL_LENGTH = 850_000;

/**
 * Validador estricto de URLs de identidad corporativa persistibles.
 * Acepta: ruta estática local, DataURL de imagen y URLs HTTPS (Firebase Storage).
 * Rechaza blob:, http: y rutas protocol-relative (//).
 */
export function isValidLogoUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('https://') ||
    (trimmed.startsWith('/') && !trimmed.startsWith('//'))
  );
}

/**
 * Purga única por navegador del caché heredado (esquema anterior sin versionado).
 */
function purgeLegacyBrandCache(): void {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(BRAND_CACHE_VERSION_KEY) !== BRAND_CACHE_SCHEMA) {
      localStorage.removeItem(BRAND_LOGO_STORAGE_KEY);
      localStorage.setItem(BRAND_CACHE_VERSION_KEY, BRAND_CACHE_SCHEMA);
    }
  } catch {
    // localStorage no disponible (modo privado / cuota): se opera sin caché
  }
}

purgeLegacyBrandCache();

function cacheLogo(url: string): void {
  try {
    localStorage.setItem(BRAND_LOGO_STORAGE_KEY, url);
    localStorage.setItem(BRAND_CACHE_VERSION_KEY, BRAND_CACHE_SCHEMA);
  } catch {
    // Cuota excedida: el logotipo sigue vigente en memoria y en Firestore
  }
}

/**
 * Función utilitaria síncrona para obtener el logotipo vigente fuera de componentes React
 * (por ejemplo en servicios de exportación como reportingService.ts o scripts de impresión).
 * El caché local es solo una optimización; la autoridad es Cloud Firestore.
 */
export function getGlobalBrandLogo(): string {
  if (typeof window !== 'undefined') {
    try {
      purgeLegacyBrandCache();
      const stored = localStorage.getItem(BRAND_LOGO_STORAGE_KEY);
      if (isValidLogoUrl(stored)) {
        return stored!;
      }
    } catch (e) {
      console.warn('[BrandContext] Error accediendo a localStorage:', e);
    }
  }
  return STATIC_FALLBACK_LOGO;
}

type BrandResult = { success: boolean; error?: string };

interface BrandContextType {
  logoUrl: string;
  isCustom: boolean;
  uploadLogo: (file: File) => Promise<BrandResult>;
  uploadLogoFromBase64: (dataUrl: string) => Promise<BrandResult>;
  resetLogo: () => Promise<BrandResult>;
  isUploadModalOpen: boolean;
  setIsUploadModalOpen: (open: boolean) => void;
  openUploadModal: () => void;
}

const BrandContext = createContext<BrandContextType | undefined>(undefined);

/**
 * Optimiza y redimensiona la imagen usando HTML5 Canvas, garantizando que el DataURL
 * resultante quepa en un documento de Firestore (preserva transparencia con PNG/WebP).
 */
function optimizeImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Ocurrió un error al leer el archivo desde el equipo.'));
    reader.onload = (e) => {
      const rawDataUrl = e.target?.result;
      if (typeof rawDataUrl !== 'string') {
        reject(new Error('Error obteniendo datos del archivo seleccionado.'));
        return;
      }

      // SVG: se conserva vectorial si cabe en el límite
      if (file.type === 'image/svg+xml') {
        if (rawDataUrl.length <= MAX_LOGO_DATA_URL_LENGTH) resolve(rawDataUrl);
        else reject(new Error('El archivo SVG es demasiado pesado. Simplifíquelo o use PNG.'));
        return;
      }

      const img = new Image();
      img.onerror = () => reject(new Error('El archivo seleccionado no pudo ser decodificado como imagen válida.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          if (rawDataUrl.length <= MAX_LOGO_DATA_URL_LENGTH) resolve(rawDataUrl);
          else reject(new Error('No fue posible optimizar la imagen en este navegador.'));
          return;
        }

        for (const maxDimension of [1200, 1000, 800, 600, 400]) {
          const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const png = canvas.toDataURL('image/png');
          if (png.length <= MAX_LOGO_DATA_URL_LENGTH) {
            resolve(png);
            return;
          }
          const webp = canvas.toDataURL('image/webp', 0.92);
          if (webp.startsWith('data:image/webp') && webp.length <= MAX_LOGO_DATA_URL_LENGTH) {
            resolve(webp);
            return;
          }
        }
        reject(new Error('La imagen es demasiado compleja para almacenarse. Use un archivo más liviano.'));
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Obtiene el ID Token del usuario autenticado para las llamadas de gobernanza al backend.
 */
async function getAuthHeader(): Promise<string | null> {
  const user = auth?.currentUser;
  if (!user) return null;
  try {
    return `Bearer ${await user.getIdToken()}`;
  } catch {
    return null;
  }
}

async function callBrandingApi(endpoint: string, body?: unknown): Promise<BrandResult> {
  const authHeader = await getAuthHeader();
  if (!authHeader) {
    return { success: false, error: 'Debe iniciar sesión como Superadministrador para modificar el logotipo.' };
  }
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify(body ?? {}),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return { success: false, error: data?.error || `El servidor rechazó la operación (HTTP ${res.status}).` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error de red al contactar el servidor.' };
  }
}

export const BrandProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [logoUrl, setLogoUrl] = useState<string>(() => getGlobalBrandLogo());
  const [isCustom, setIsCustom] = useState<boolean>(() => getGlobalBrandLogo() !== STATIC_FALLBACK_LOGO);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);

  /**
   * Punto único de aplicación del logotipo vigente en la interfaz.
   */
  const applyBranding = useCallback((url: string | null | undefined, customFlag?: boolean) => {
    const resolved = isValidLogoUrl(url) ? url!.trim() : STATIC_FALLBACK_LOGO;
    const custom = resolved !== STATIC_FALLBACK_LOGO && customFlag !== false;
    setLogoUrl(resolved);
    setIsCustom(custom);
    cacheLogo(resolved);
    const favicon = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
    if (favicon) favicon.href = resolved;
  }, []);

  // Fuente única de verdad: suscripción en tiempo real a Cloud Firestore (/system_config/branding).
  // /api/getBranding se usa solo como respaldo si el SDK cliente no está disponible o falla.
  useEffect(() => {
    let cancelled = false;

    const loadFromBackend = () => {
      fetch('/api/getBranding', { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && data?.success) applyBranding(data.logoUrl, data.isCustom);
        })
        .catch(() => {
          // Sin red: se mantiene el logotipo en caché o el oficial estático
        });
    };

    if (!db) {
      loadFromBackend();
      return () => {
        cancelled = true;
      };
    }

    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = onSnapshot(
        doc(db, 'system_config', 'branding'),
        (snapshot) => {
          if (cancelled) return;
          if (snapshot.exists()) {
            const data = snapshot.data();
            applyBranding(data?.logoUrl, data?.isCustom);
          } else {
            applyBranding(STATIC_FALLBACK_LOGO, false);
          }
        },
        (err) => {
          console.warn('[BrandContext] Firestore no disponible, usando respaldo del backend:', err);
          loadFromBackend();
        }
      );
    } catch (listenerErr) {
      console.warn('[BrandContext] Error configurando onSnapshot para branding:', listenerErr);
      loadFromBackend();
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [applyBranding]);

  // Sincronización entre pestañas del mismo navegador
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === BRAND_LOGO_STORAGE_KEY) {
        const next = isValidLogoUrl(e.newValue) ? e.newValue! : STATIC_FALLBACK_LOGO;
        setLogoUrl(next);
        setIsCustom(next !== STATIC_FALLBACK_LOGO);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  /**
   * Escritor único: optimiza la imagen y la registra vía backend autenticado (SUPERADMIN).
   * La interfaz se actualiza cuando Firestore confirma (onSnapshot) y también de forma optimista.
   */
  const uploadLogo = useCallback(
    async (file: File): Promise<BrandResult> => {
      if (!file) {
        return { success: false, error: 'No se seleccionó ningún archivo de imagen.' };
      }
      if (!file.type.startsWith('image/') && !file.name.match(/\.(png|jpe?g|webp|svg)$/i)) {
        return { success: false, error: 'El archivo debe ser una imagen válida (PNG, JPG, JPEG, WebP, SVG).' };
      }
      if (file.size > 20 * 1024 * 1024) {
        return { success: false, error: 'El archivo supera el tamaño máximo permitido de 20 MB.' };
      }

      let dataUrl: string;
      try {
        dataUrl = await optimizeImageFile(file);
      } catch (err: any) {
        return { success: false, error: err?.message || 'No fue posible procesar la imagen.' };
      }

      const result = await callBrandingApi('/api/uploadLogo', { logoDataUrl: dataUrl, systemName: 'Puro Apure ERP' });
      if (result.success) applyBranding(dataUrl, true);
      return result;
    },
    [applyBranding]
  );

  /**
   * Registra una cadena DataURL (por ejemplo desde portapapeles) por la misma vía autenticada.
   */
  const uploadLogoFromBase64 = useCallback(
    async (dataUrl: string): Promise<BrandResult> => {
      if (!dataUrl || !dataUrl.startsWith('data:image/') || dataUrl.length > MAX_LOGO_DATA_URL_LENGTH) {
        return { success: false, error: 'Formato o tamaño de imagen inválido.' };
      }
      const result = await callBrandingApi('/api/uploadLogo', { logoDataUrl: dataUrl, systemName: 'Puro Apure ERP' });
      if (result.success) applyBranding(dataUrl, true);
      return result;
    },
    [applyBranding]
  );

  /**
   * Restaura el logotipo oficial en Cloud Firestore (persistente para todos los dispositivos).
   */
  const resetLogo = useCallback(async (): Promise<BrandResult> => {
    const result = await callBrandingApi('/api/resetLogo');
    if (result.success) applyBranding(STATIC_FALLBACK_LOGO, false);
    return result;
  }, [applyBranding]);

  const openUploadModal = useCallback(() => {
    setIsUploadModalOpen(true);
  }, []);

  return (
    <BrandContext.Provider
      value={{
        logoUrl,
        isCustom,
        uploadLogo,
        uploadLogoFromBase64,
        resetLogo,
        isUploadModalOpen,
        setIsUploadModalOpen,
        openUploadModal,
      }}
    >
      {children}
    </BrandContext.Provider>
  );
};

export const useBrand = (): BrandContextType => {
  const context = useContext(BrandContext);
  if (!context) {
    throw new Error('useBrand debe ser utilizado dentro de un BrandProvider');
  }
  return context;
};
