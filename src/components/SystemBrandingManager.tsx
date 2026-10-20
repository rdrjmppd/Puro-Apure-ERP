/**
 * AgroERP Pro - Módulo DevSecOps: Gestión de Identidad Visual y Logotipo Corporativo
 * Componente: SystemBrandingManager (Fases 2 y 3)
 *
 * Implementa Control de Acceso Basado en Atributos (ABAC) y Reclamaciones Personalizadas (Custom Claims):
 * - SUPERADMIN: Renderizado completo con <input type="file"> y botón "Actualizar Fotografía".
 * - Flujo Asíncrono de Mutación: uploadBytes -> getDownloadURL -> setDoc(system_config/branding).
 * - Manejo de Excepciones: Captura de HTTP 403 / storage/unauthorized con Modal de Violación de Seguridad.
 * - ADMIN / EMPLEADO / OBRERO: Renderizado restringido en MODO LECTURA exclusivamente (etiqueta <img> sin controles).
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBrand } from '../context/BrandContext';
import {
  ShieldAlert,
  ShieldCheck,
  Upload,
  Lock,
  Eye,
  FileCheck,
  AlertTriangle,
  Info,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

interface SystemBrandingManagerProps {
  onImageUploaded?: (newUrl: string) => void;
  className?: string;
}

export const SystemBrandingManager: React.FC<SystemBrandingManagerProps> = ({
  onImageUploaded,
  className = '',
}) => {
  const { currentUser, userProfile, isSuperAdmin, role } = useAuth();
  const { logoUrl, uploadLogo } = useBrand();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [tokenClaims, setTokenClaims] = useState<Record<string, any> | null>(null);
  const [isVerifyingClaims, setIsVerifyingClaims] = useState<boolean>(true);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [cloudLogoUrl, setCloudLogoUrl] = useState<string | null>(null);
  const [securityViolationModal, setSecurityViolationModal] = useState<string | null>(null);

  // 1. Evaluación Criptográfica de Custom Claims en el JWT del usuario autenticado
  useEffect(() => {
    let isMounted = true;

    async function evaluateCryptographicClaims() {
      setIsVerifyingClaims(true);
      if (currentUser) {
        try {
          const idTokenResult = await currentUser.getIdTokenResult(false);
          if (isMounted) {
            setTokenClaims(idTokenResult.claims);
          }
        } catch (claimsErr) {
          console.warn('[ABAC SystemBrandingManager] Error inspeccionando token JWT:', claimsErr);
        }
      }
      if (isMounted) {
        setIsVerifyingClaims(false);
      }
    }

    evaluateCryptographicClaims();
    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  // Sincronización inmediata con el logotipo corporativo vigente en BrandContext
  useEffect(() => {
    setCloudLogoUrl(logoUrl);
  }, [logoUrl]);

  // 2. Determinación Estricta de Autoridad (ABAC Authority Resolver)
  const isSuperAdminAuthority = useMemo(() => {
    // Evaluación 1: Reclamación personalizada en token JWT (Custom Claim 'role' == 'SUPERADMIN')
    if (tokenClaims?.role === 'SUPERADMIN' || tokenClaims?.isSuperAdmin === true) {
      return true;
    }
    // Evaluación 2: Identidad raíz de seguridad (Root Security Anchor)
    if (currentUser?.email?.toLowerCase() === 'rdrj.mppd@gmail.com') {
      return true;
    }
    // Evaluación 3: Perfil validado en IAM
    if (userProfile?.role === 'SUPERADMIN' || isSuperAdmin) {
      return true;
    }
    return false;
  }, [tokenClaims, currentUser, userProfile, isSuperAdmin]);

  // Limpieza de memoria: Revocar URL de objeto al desmontar el componente o cambiar de archivo
  useEffect(() => {
    return () => {
      if (localPreviewUrl && localPreviewUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(localPreviewUrl);
        } catch {
          // Safe revoke
        }
      }
    };
  }, [localPreviewUrl]);

  // Manejo de selección de archivo en memoria local para previsualización
  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validación de seguridad de tipo MIME
    if (!file.type.startsWith('image/')) {
      alert('Solo se permiten archivos de imagen válidos (PNG, JPG, JPEG, SVG, WebP).');
      return;
    }

    // Liberar URL de objeto previa para evitar fugas de memoria
    if (localPreviewUrl && localPreviewUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(localPreviewUrl);
      } catch {
        // Safe revoke
      }
    }

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setLocalPreviewUrl(objectUrl);
    setUploadSuccess(null);
  };

  /**
   * Fase 3: Lógica Asíncrona de Mutación y Manejo de Excepciones
   * 1. Sube archivo a Cloud Storage (/system_branding/{imageId}) mediante uploadBytes.
   * 2. Obtiene URL pública del recurso mediante getDownloadURL.
   * 3. Actualiza el documento en Cloud Firestore (/system_config/branding) mediante setDoc.
   * 4. En caso de interceptación o 403, captura el error y despliega el Modal de Violación de Seguridad.
   */
  const handleImageUpload = async () => {
    if (!selectedFile) {
      alert('Por favor seleccione un archivo de imagen antes de actualizar.');
      return;
    }

    setIsUploading(true);
    setUploadSuccess(null);

    try {
      const res = await uploadLogo(selectedFile);
      if (!res.success) {
        throw new Error(res.error || 'Fallo al actualizar el logotipo corporativo.');
      }

      setUploadSuccess('Fotografía actualizada y registrada exitosamente en Cloud Firestore.');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      if (onImageUploaded) {
        onImageUploaded(logoUrl);
      }
    } catch (err: any) {
      console.error('[SystemBrandingManager] Error durante la mutación de identidad visual:', err);
      const errString = err?.message || String(err);
      const errCode = err?.code || '';

      // Detección de HTTP 403 / unauthorized / permission-denied
      const isForbiddenOrUnauthorized =
        errCode === 'storage/unauthorized' ||
        errCode === 'permission-denied' ||
        errString.includes('403') ||
        errString.includes('unauthorized') ||
        errString.includes('permission-denied') ||
        errString.includes('insufficient') ||
        errString.includes('AUTENTICACION_REQUERIDA') ||
        errString.includes('ACCESO_DENEGADO');

      if (isForbiddenOrUnauthorized) {
        setSecurityViolationModal('Violación de Seguridad: Privilegios insuficientes (solo SUPERADMIN)');
      } else {
        alert(`Ocurrió un error al cargar la imagen: ${errString}`);
      }
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={`p-6 rounded-3xl bg-slate-900 border border-slate-800 text-slate-100 shadow-2xl space-y-6 ${className}`}>
      {/* Encabezado del Módulo con Estado de Gobernanza y ABAC */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
              isSuperAdminAuthority
                ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40'
                : 'bg-amber-600/20 text-amber-400 border-amber-500/40'
            }`}
          >
            {isSuperAdminAuthority ? <ShieldCheck className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight font-heading">
              Gobernanza de Identidad Visual (Logotipo del Sistema)
            </h3>
            <p className="text-xs text-slate-400 font-body">
              Control de Acceso Basado en Atributos (ABAC) con validación criptográfica en Cloud Storage & Firestore.
            </p>
          </div>
        </div>

        {/* Badge de Rol y Nivel de Autoridad */}
        <div className="flex items-center gap-2">
          {isVerifyingClaims ? (
            <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-slate-800 text-slate-400 flex items-center gap-1.5 border border-slate-700">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>Verificando JWT...</span>
            </span>
          ) : isSuperAdminAuthority ? (
            <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700 font-bold flex items-center gap-1.5 shadow-sm">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>SUPERADMIN • Autoridad Total</span>
            </span>
          ) : (
            <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-slate-800 text-amber-400 border border-slate-700 font-semibold flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              <span>{role || 'ADMIN / EMPLEADO'} • Solo Lectura</span>
            </span>
          )}
        </div>
      </div>

      {/* Alerta de Éxito de Subida */}
      {uploadSuccess && (
        <div className="p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 flex items-center gap-3 text-xs text-emerald-200 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{uploadSuccess}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONDITIONAL RENDERING ESTRICTO */}
      {/* ========================================================================= */}
      {isSuperAdminAuthority ? (
        /* ----------------------------------------------------------------------- */
        /* CASO 1: SUPERADMIN - Renderizado con controles de mutación (<input> + botón) */
        /* ----------------------------------------------------------------------- */
        <div className="space-y-6 animate-fadeIn">
          {/* Banner de Autorización */}
          <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex items-center gap-3 text-xs text-emerald-200">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>
              <strong>Autoridad Confirmada:</strong> Su token JWT contiene las credenciales de <code>SUPERADMIN</code>.
              Está facultado para mutar la fotografía del sistema mediante Cloud Storage (<code>/system_branding</code>) y Firestore (<code>system_config/branding</code>).
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* Visualización de Logotipo Vigente / Previsualización */}
            <div className="space-y-2">
              <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block">
                Previsualización de Imagen:
              </span>
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-md flex items-center justify-center min-h-[140px]">
                <img
                  src={localPreviewUrl || cloudLogoUrl || logoUrl}
                  alt="Logotipo Corporativo del Sistema"
                  className="max-h-24 max-w-full w-auto object-contain block mx-auto transition-transform"
                />
              </div>
              <p className="text-[11px] text-slate-400 font-mono text-center">
                {localPreviewUrl
                  ? 'Archivo local seleccionado listo para subida asíncrona'
                  : cloudLogoUrl
                  ? 'Imagen alojada en Firebase Cloud Storage'
                  : 'Imagen activa actualmente en la plataforma'}
              </p>
            </div>

            {/* Controles de Carga (<input type="file"> y botón "Actualizar Fotografía") */}
            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                <label className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider block">
                  Seleccionar Nueva Fotografía / Logotipo:
                </label>

                {/* Input de archivo estricto */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                  onChange={handleFileSelection}
                  disabled={isUploading}
                  className="block w-full text-xs text-slate-300 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500 file:cursor-pointer border border-slate-800 rounded-xl bg-slate-900 cursor-pointer disabled:opacity-50"
                />

                {selectedFile && (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono">
                    <FileCheck className="w-4 h-4" />
                    <span className="truncate">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                  </div>
                )}
              </div>

              {/* Botón de Actualizar Fotografía con Lógica Asíncrona (Fase 3) */}
              <button
                type="button"
                onClick={handleImageUpload}
                disabled={!selectedFile || isUploading}
                className="w-full py-3 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 active:scale-95 cursor-pointer"
              >
                {isUploading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Subiendo a Cloud Storage & Firestore...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Actualizar Fotografía</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ----------------------------------------------------------------------- */
        /* CASO 2: ADMIN / EMPLEADO / OBRERO - Modo Lectura Exclusivo (<img> sin controles) */
        /* ----------------------------------------------------------------------- */
        <div className="space-y-6 animate-fadeIn">
          {/* Banner de Restricción ABAC */}
          <div className="p-4 rounded-2xl bg-slate-950/90 border border-amber-500/30 flex items-start gap-3 text-xs text-slate-300">
            <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-300">Modo Lectura Protegido (ABAC Restrictivo)</p>
              <p className="text-slate-400 mt-1">
                Su rol actual (<code>{role || 'ADMIN / EMPLEADO'}</code>) no posee autorización criptográfica para mutar los activos de identidad visual.
                Los controles de carga han sido inhabilitados en la interfaz y bloqueados a nivel de servidor en Cloud Storage y Firestore.
              </p>
            </div>
          </div>

          {/* Renderizado Exclusivo de <img> en Modo Lectura */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-md flex items-center justify-center min-h-[140px]">
            <img
              src={cloudLogoUrl || logoUrl}
              alt="Puro Apure ERP Logotipo Oficial"
              className="max-h-28 max-w-full w-auto object-contain block mx-auto select-none pointer-events-none"
            />
          </div>
          <p className="text-[11px] text-slate-400 font-mono text-center">
            Visualización oficial de identidad corporativa en modo solo lectura.
          </p>
        </div>
      )}

      {/* Modal de Violación de Seguridad (Error 403 / Privilegios Insuficientes) */}
      {securityViolationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border-2 border-red-500 rounded-3xl max-w-md w-full p-6 sm:p-7 space-y-5 shadow-2xl text-slate-100 animate-scaleIn">
            <div className="w-14 h-14 rounded-2xl bg-red-950/90 text-red-400 border border-red-500/50 flex items-center justify-center mx-auto shadow-inner">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div className="text-center space-y-2">
              <h4 className="text-lg font-black text-white tracking-tight font-heading">
                Violación de Seguridad
              </h4>
              <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-xs font-mono font-bold text-red-200">
                {securityViolationModal}
              </div>
              <p className="text-xs text-slate-400 font-body">
                El servidor de Cloud Storage / Firestore ha rechazado la operación con código HTTP 403.
                Solo los usuarios con Custom Claim de <code>SUPERADMIN</code> en su token JWT poseen autoridad de escritura.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSecurityViolationModal(null)}
              className="w-full py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition shadow-lg shadow-red-950/50 active:scale-95 cursor-pointer"
            >
              Entendido / Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
