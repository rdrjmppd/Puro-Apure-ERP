import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBrand } from '../context/BrandContext';
import {
  Upload,
  Image as ImageIcon,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  X,
  FileCheck,
  Eye,
  Info,
} from 'lucide-react';

export const BrandLogoModal: React.FC = () => {
  const { logoUrl, isCustom, uploadLogo, resetLogo, isUploadModalOpen, setIsUploadModalOpen } = useBrand();
  const { currentUser } = useAuth();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageMeta, setImageMeta] = useState<{ width: number; height: number; sizeFormatted: string } | null>(null);
  const [previewBackground, setPreviewBackground] = useState<'white' | 'cream' | 'dark'>('white');
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleClose = useCallback(() => {
    setPreviewUrl(null);
    setSelectedFile(null);
    setImageMeta(null);
    setFeedback(null);
    setIsUploadModalOpen(false);
  }, [setIsUploadModalOpen]);

  const processSelectedFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/') && !file.name.match(/\.(png|jpe?g|webp|svg|gif|bmp)$/i)) {
      setFeedback({
        text: 'Por favor seleccione un archivo de imagen válido (PNG, JPG, JPEG, SVG, WebP, GIF).',
        type: 'error',
      });
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setFeedback({ text: 'El archivo excede el tamaño máximo permitido de 20 MB.', type: 'error' });
      return;
    }

    setSelectedFile(file);
    setFeedback(null);

    const sizeFormatted = file.size > 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
      : `${Math.round(file.size / 1024)} KB`;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        setPreviewUrl(result);

        // Medir dimensiones reales
        const img = new Image();
        img.onload = () => {
          setImageMeta({
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height,
            sizeFormatted,
          });
        };
        img.src = result;
      }
    };
    reader.readAsDataURL(file);
  }, []);

  // Soporte para pegar imágenes directamente desde el portapapeles (Ctrl+V / Cmd+V)
  useEffect(() => {
    if (!isUploadModalOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            processSelectedFile(file);
            setFeedback({ text: 'Imagen pegada desde el portapapeles.', type: 'success' });
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isUploadModalOpen, processSelectedFile]);

  if (!isUploadModalOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleImageUpload = async () => {
    if (!selectedFile) {
      setFeedback({ text: 'Seleccione un archivo de imagen de su equipo antes de guardar.', type: 'error' });
      return;
    }

    setIsLoading(true);
    setFeedback(null);

    try {
      const res = await uploadLogo(selectedFile);
      if (!res.success) {
        throw new Error(res.error || 'Error al persistir el logotipo.');
      }

      setFeedback({
        text: '¡Logotipo cargado y registrado exitosamente en Cloud Firestore!',
        type: 'success',
      });

      setTimeout(() => {
        handleClose();
      }, 1200);
    } catch (err: any) {
      console.error('[BrandLogoModal] Error durante la mutación de identidad visual:', err);
      const errMsg = err?.message || 'Error de red o permisos al almacenar el logotipo.';
      setFeedback({
        text: `Error al subir imagen: ${errMsg}`,
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = handleImageUpload;

  const handleReset = async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await resetLogo();
      if (!res.success) {
        throw new Error(res.error || 'No fue posible restaurar el logotipo oficial.');
      }
      setPreviewUrl(null);
      setSelectedFile(null);
      setImageMeta(null);
      setFeedback({ text: 'Logotipo restablecido al diseño oficial del sistema.', type: 'success' });
      setTimeout(() => {
        handleClose();
      }, 1200);
    } catch (err: any) {
      setFeedback({ text: err?.message || 'Error al restablecer el logotipo.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fadeIn overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-lg w-full p-5 sm:p-7 space-y-4 shadow-2xl text-slate-100 my-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight font-heading">
                Cargar Logotipo desde este Equipo
              </h3>
              <p className="text-xs text-slate-400 font-body">
                Reemplaza el logo de la plataforma por la imagen corporativa oficial.
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition cursor-pointer"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-3 rounded-2xl flex items-center gap-2 text-xs font-medium border animate-fadeIn ${
              feedback.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200'
                : 'bg-red-950/80 border-red-500 text-red-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Drag & Drop Area con Explorador de Archivos */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-3xl p-5 sm:p-6 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-emerald-400 bg-emerald-950/40 scale-[1.01]'
              : 'border-slate-700 bg-slate-950/60 hover:border-emerald-500/70 hover:bg-slate-950/90'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,image/gif"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="w-12 h-12 rounded-2xl bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 mx-auto flex items-center justify-center mb-2.5 shadow-inner">
            <ImageIcon className="w-6 h-6" />
          </div>

          <p className="text-sm font-bold text-white mb-1">
            Haz clic aquí para seleccionar el archivo desde tu equipo
          </p>
          <p className="text-xs text-slate-400 mb-2">
            O arrastra y suelta tu archivo de imagen aquí (o presiona Ctrl+V para pegar)
          </p>
          <span className="inline-block text-[11px] font-mono px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            Admite PNG, JPG, JPEG, SVG y WebP (Hasta 20 MB)
          </span>
        </div>

        {/* Previsualización Activa con Cambio de Fondo */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
              <span>Previsualización del Logotipo:</span>
            </span>

            {/* Alternar fondo para verificar contraste de marca */}
            <div className="flex items-center gap-1 text-[11px] font-mono">
              <span className="text-slate-500 mr-1 hidden sm:inline">Fondo:</span>
              <button
                type="button"
                onClick={() => setPreviewBackground('white')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                  previewBackground === 'white'
                    ? 'bg-white text-slate-900 border-emerald-500 ring-1 ring-emerald-500'
                    : 'bg-white/10 text-slate-300 border-slate-700 hover:bg-white/20'
                }`}
              >
                Blanco
              </button>
              <button
                type="button"
                onClick={() => setPreviewBackground('cream')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                  previewBackground === 'cream'
                    ? 'bg-[#EAD2B2] text-slate-900 border-emerald-500 ring-1 ring-emerald-500'
                    : 'bg-[#EAD2B2]/20 text-slate-300 border-slate-700 hover:bg-[#EAD2B2]/30'
                }`}
              >
                Crema
              </button>
              <button
                type="button"
                onClick={() => setPreviewBackground('dark')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                  previewBackground === 'dark'
                    ? 'bg-slate-950 text-white border-emerald-500 ring-1 ring-emerald-500'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                Oscuro
              </button>
            </div>
          </div>

          <div
            className={`p-4 rounded-2xl border transition-all flex items-center justify-center min-h-[110px] sm:min-h-[120px] ${
              previewBackground === 'white'
                ? 'bg-white border-slate-200 shadow-md'
                : previewBackground === 'cream'
                ? 'bg-[#EAD2B2] border-[#D6451B]/20 shadow-md'
                : 'bg-slate-950 border-slate-800 shadow-inner'
            }`}
          >
            <img
              src={previewUrl || logoUrl}
              alt="Previsualización Logotipo"
              className="max-h-24 max-w-full w-auto object-contain block mx-auto transition-transform"
              onError={(e) => {
                // Fallback de seguridad en caso de error
                (e.currentTarget as HTMLImageElement).alt = 'Logotipo no cargado';
              }}
            />
          </div>

          {/* Información del archivo */}
          <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 px-1 font-mono gap-1">
            <div className="flex items-center gap-1.5 truncate max-w-[280px]">
              {selectedFile ? (
                <>
                  <FileCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">{selectedFile.name}</span>
                </>
              ) : (
                <>
                  <Info className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>{isCustom ? 'Logotipo personalizado activo' : 'Logotipo predeterminado del sistema'}</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {imageMeta && (
                <span className="text-slate-400">
                  {imageMeta.width}×{imageMeta.height} px • {imageMeta.sizeFormatted}
                </span>
              )}
              {isCustom && !selectedFile && (
                <span className="text-emerald-400 font-bold bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800">
                  Activo
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Botones de Acción */}
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-800">
          <div>
            {isCustom && (
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                title="Volver al logotipo original del sistema"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restablecer</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!selectedFile || isLoading}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-emerald-950/50 active:scale-95 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>{isLoading ? 'Optimizando...' : 'Reemplazar Logotipo'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
