/**
 * Puro Apure ERP - Módulo de Activos Documentales y Membrete Corporativo
 * Fase 1: Codificación de Activos (Base64) y Utilidades Base
 * Garantiza persistencia e incrustación Offline-First en reportes PDF y Excel
 */

import { DEFAULT_LOGO_BASE64 } from '../config/defaultLogoBase64';
import { getGlobalBrandLogo } from '../context/BrandContext';

/**
 * Cadena Base64 oficial del logotipo de Puro Apure (Data URI JPEG/PNG).
 * Incrustable de forma síncrona en motores de renderizado documental (jsPDF, ExcelJS, SheetJS)
 * sin requerir peticiones de red ni conexión a internet (Offline-First).
 */
export const PURO_APURE_LOGO_BASE64: string = DEFAULT_LOGO_BASE64;

/**
 * Interfaz formal de configuración de membrete corporativo estandarizado
 */
export interface CorporateHeaderConfig {
  companyName: string;
  tradeName: string;
  rif: string;
  headquartersAddress: string;
  phone: string;
  email: string;
  webDomain: string;
  fiscalRegime: string;
  colors: {
    primary: string;       // Verde agroindustrial oscuro (Emerald)
    secondary: string;     // Ámbar llanero / Dorado (Amber)
    accent: string;        // Verde fresco agropecuario (Emerald light)
    darkNeutral: string;   // Gris pizarra para textos (Slate 900)
    mediumNeutral: string; // Gris medio para subtítulos y bordes (Slate 500)
    lightNeutral: string;  // Fondo tenue institucional (Slate 50)
    white: string;         // Fondo puro blanco
  };
}

/**
 * Constante inmutable de configuración de membrete corporativo
 * Agropecuaria Puro Apure, C.A.
 */
export const CORPORATE_HEADER_CONFIG: CorporateHeaderConfig = {
  companyName: 'AGROPECUARIA PURO APURE, C.A.',
  tradeName: 'PURO APURE ERP',
  rif: 'J-40892182-3',
  headquartersAddress: 'Carretera Nacional San Fernando - Achaguas, Km 14, San Fernando de Apure, Estado Apure, República Bolivariana de Venezuela',
  phone: '+58 (247) 341-2099',
  email: 'administracion@puroapure.com.ve',
  webDomain: 'app.puroapure.com.ve',
  fiscalRegime: 'Contribuyente Ordinario - Régimen Especial Agroindustrial',
  colors: {
    primary: '#065F46',       // HEX: Esmeralda Oscuro Forestal
    secondary: '#D97706',     // HEX: Ámbar Dorado
    accent: '#10B981',        // HEX: Esmeralda Acento
    darkNeutral: '#0F172A',   // HEX: Slate 900
    mediumNeutral: '#64748B', // HEX: Slate 500
    lightNeutral: '#F8FAFC',  // HEX: Slate 50
    white: '#FFFFFF',         // HEX: Blanco puro
  },
};

/**
 * Obtiene el logotipo activo para incrustación en documentos.
 * Prioriza el logotipo personalizado configurado por el Superadministrador (desde BrandContext / localStorage)
 * y si no existe o falla, recurre a PURO_APURE_LOGO_BASE64 con garantía 100% Offline-First.
 */
export function getDocumentBrandingLogo(): string {
  try {
    if (typeof window !== 'undefined') {
      const activeLogo = getGlobalBrandLogo();
      if (activeLogo && activeLogo.startsWith('data:image/')) {
        return activeLogo;
      }
    }
  } catch (err) {
    console.warn('[documentAssets] Error al leer logotipo activo, recurriendo al oficial:', err);
  }
  return PURO_APURE_LOGO_BASE64;
}
