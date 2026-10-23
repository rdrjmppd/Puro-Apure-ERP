/**
 * Componente: Lector OCR Multimodal y Modal de Pre-Conciliación Forense Anti-IA / Anti-Fraude
 * Puro Apure ERP - Módulo de Finanzas & Conciliación
 * Captura por Archivo, Cámara o Ctrl+V • Disparo 100% Manual • Cuatro Candados de Veracidad
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText,
  Sparkles,
  Upload,
  Camera,
  ClipboardPaste,
  ShieldCheck,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  X,
  RefreshCw,
  Maximize2,
  DollarSign,
  Receipt,
  User,
  Calendar,
  Building,
  Info,
  Lock,
} from 'lucide-react';
import {
  PagoReportadoOCR,
  DictamenVeracidadOCR,
  VeredictoVeracidad,
} from '../../types/ocrForensic';
import { DualEntity, BillingInvoice } from '../../types/finance';
import { OcrForensicService } from '../../services/ocrForensicService';
import { centsRound } from '../../services/financialAnalyticsService';
import { sanitizeFirestorePayload } from '../../utils/sanitizeFirestorePayload';
import { getCaracasToday } from '../../utils/bankReceiptParser';
import { useAuth } from '../../context/AuthContext';

interface LectorComprobanteOCRModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialImageDataUrl?: string | null;
  initialRecord?: PagoReportadoOCR | null;
  initialClientPhone?: string;
  entities: DualEntity[];
  invoices: BillingInvoice[];
  bcvRate: number;
  onPaymentReconciled?: (paymentRecordId: string) => void;
}

export const LectorComprobanteOCRModal: React.FC<LectorComprobanteOCRModalProps> = ({
  isOpen,
  onClose,
  initialImageDataUrl,
  initialRecord,
  initialClientPhone,
  entities,
  invoices,
  bcvRate,
  onPaymentReconciled,
}) => {
  const { userProfile, role, isAdmin, isSuperAdmin } = useAuth();

  // 1. Imagen y Captura
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(initialImageDataUrl || null);
  const [imageMimeType, setImageMimeType] = useState<string>('image/jpeg');
  const [isZoomed, setIsZoomed] = useState<boolean>(false);

  // 2. Estado de Análisis Forense OCR
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analyzedRecord, setAnalyzedRecord] = useState<PagoReportadoOCR | null>(null);
  const [existingRecords, setExistingRecords] = useState<PagoReportadoOCR[]>([]);

  // 3. Formulario de Pre-Conciliación
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [tipoComprobante, setTipoComprobante] = useState<string>('PAGO_MOVIL');
  const [bancoEmisor, setBancoEmisor] = useState<string>('');
  const [bancoReceptor, setBancoReceptor] = useState<string>('');
  const [numeroReferencia, setNumeroReferencia] = useState<string>('');
  const [fechaComprobante, setFechaComprobante] = useState<string>('');
  const [monedaOriginal, setMonedaOriginal] = useState<'VES' | 'USD'>('VES');
  const [montoOriginal, setMontoOriginal] = useState<number>(0);
  const [tasaBcvSnapshot, setTasaBcvSnapshot] = useState<number>(bcvRate || 1);
  const [notasRevision, setNotasRevision] = useState<string>('');
  const [justificacionSuperAdmin, setJustificacionSuperAdmin] = useState<string>('');

  // 4. Feedback
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Cargar registros existentes para validación de Candado 1 (Anti-Reciclaje)
  useEffect(() => {
    if (!isOpen) return;
    const unsub = OcrForensicService.subscribePendingReportedPayments((recs) => {
      setExistingRecords(recs);
    });
    return () => unsub();
  }, [isOpen]);

  // Actualizar imagen inicial si se recibe por props y restaurar desde memoria persistente
  useEffect(() => {
    if (initialImageDataUrl) {
      setImageDataUrl(initialImageDataUrl);
      const cached = OcrForensicService.getTranscriptionFromMemory(initialImageDataUrl);
      if (cached) {
        setAnalyzedRecord(cached);
        if (cached.clienteIdSugerido) setSelectedEntityId(cached.clienteIdSugerido);
        if (cached.facturaIdSeleccionada) setSelectedInvoiceId(cached.facturaIdSeleccionada);
        if (cached.tipoComprobante) setTipoComprobante(cached.tipoComprobante);
        if (cached.bancoEmisor) setBancoEmisor(cached.bancoEmisor);
        if (cached.bancoReceptor) setBancoReceptor(cached.bancoReceptor);
        if (cached.numeroReferencia) setNumeroReferencia(cached.numeroReferencia);
        if (cached.fechaComprobante) setFechaComprobante(cached.fechaComprobante);
        if (cached.monedaOriginal) setMonedaOriginal(cached.monedaOriginal);
        if (cached.montoOriginal) setMontoOriginal(cached.montoOriginal);
        if (cached.tasaBcvSnapshot) setTasaBcvSnapshot(cached.tasaBcvSnapshot);
        if (cached.notasRevision) setNotasRevision(cached.notasRevision);
      } else {
        setAnalyzedRecord(null);
      }
    }
  }, [initialImageDataUrl]);

  // Si se recibe un comprobante existente o pre-analizado desde la bandeja
  useEffect(() => {
    if (initialRecord) {
      setAnalyzedRecord(initialRecord);
      setImageDataUrl(initialRecord.comprobanteOriginalUrl || null);
      if (initialRecord.clienteIdSugerido) setSelectedEntityId(initialRecord.clienteIdSugerido);
      if (initialRecord.facturaIdSeleccionada) setSelectedInvoiceId(initialRecord.facturaIdSeleccionada);
      if (initialRecord.tipoComprobante) setTipoComprobante(initialRecord.tipoComprobante);
      if (initialRecord.bancoEmisor) setBancoEmisor(initialRecord.bancoEmisor);
      if (initialRecord.bancoReceptor) setBancoReceptor(initialRecord.bancoReceptor);
      if (initialRecord.numeroReferencia) setNumeroReferencia(initialRecord.numeroReferencia);
      if (initialRecord.fechaComprobante) setFechaComprobante(initialRecord.fechaComprobante);
      if (initialRecord.monedaOriginal) setMonedaOriginal(initialRecord.monedaOriginal);
      if (initialRecord.montoOriginal) setMontoOriginal(initialRecord.montoOriginal);
      if (initialRecord.tasaBcvSnapshot) setTasaBcvSnapshot(initialRecord.tasaBcvSnapshot);
      if (initialRecord.notasRevision) setNotasRevision(initialRecord.notasRevision);
    }
  }, [initialRecord]);

  // Auto-selección de entidad basada en teléfono si se provee
  useEffect(() => {
    if (initialClientPhone && entities.length > 0) {
      const cleanPhone = initialClientPhone.replace(/\+/g, '');
      const matched = entities.find(
        (e) => (e.phone && e.phone.includes(cleanPhone)) || (e.telefonoContacto && e.telefonoContacto.includes(cleanPhone))
      );
      if (matched) {
        setSelectedEntityId(matched.id);
      }
    }
  }, [initialClientPhone, entities]);

  // Manejo de pegado desde portapapeles (Ctrl + V)
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const dataUrl = event.target?.result as string;
              setImageDataUrl(dataUrl);
              setImageMimeType(blob.type);
              setAnalyzedRecord(null);
              setErrorMsg(null);
            };
            reader.readAsDataURL(blob);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  // Facturas del cliente seleccionado
  const clientPendingInvoices = useMemo(() => {
    if (!selectedEntityId) return [];
    return invoices.filter((inv) => inv.customerId === selectedEntityId && inv.paymentStatus !== 'PAGADO');
  }, [invoices, selectedEntityId]);

  // Auto-seleccionar primera factura pendiente si existe
  useEffect(() => {
    if (clientPendingInvoices.length > 0 && !selectedInvoiceId) {
      setSelectedInvoiceId(clientPendingInvoices[0].id);
    }
  }, [clientPendingInvoices, selectedInvoiceId]);

  // Cálculos bimonetarios reactivos exactos
  const montoEquivalenteUSD = useMemo(() => {
    const rate = tasaBcvSnapshot > 0 ? tasaBcvSnapshot : 1;
    if (monedaOriginal === 'USD') return centsRound(montoOriginal);
    return centsRound(montoOriginal / rate);
  }, [montoOriginal, monedaOriginal, tasaBcvSnapshot]);

  const montoEquivalenteVES = useMemo(() => {
    const rate = tasaBcvSnapshot > 0 ? tasaBcvSnapshot : 1;
    if (monedaOriginal === 'VES') return centsRound(montoOriginal);
    return centsRound(montoOriginal * rate);
  }, [montoOriginal, monedaOriginal, tasaBcvSnapshot]);

  if (!isOpen) return null;

  // Cargar archivo
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setImageDataUrl(dataUrl);
      setImageMimeType(file.type);
      setErrorMsg(null);
      const cached = OcrForensicService.getTranscriptionFromMemory(dataUrl);
      if (cached) {
        setAnalyzedRecord(cached);
        if (cached.tipoComprobante) setTipoComprobante(cached.tipoComprobante);
        if (cached.bancoEmisor) setBancoEmisor(cached.bancoEmisor);
        if (cached.bancoReceptor) setBancoReceptor(cached.bancoReceptor);
        if (cached.numeroReferencia) setNumeroReferencia(cached.numeroReferencia);
        if (cached.fechaComprobante) setFechaComprobante(cached.fechaComprobante);
        if (cached.monedaOriginal) setMonedaOriginal(cached.monedaOriginal);
        if (cached.montoOriginal) setMontoOriginal(cached.montoOriginal);
        if (cached.tasaBcvSnapshot) setTasaBcvSnapshot(cached.tasaBcvSnapshot);
        if (cached.notasRevision) setNotasRevision(cached.notasRevision);
      } else {
        setAnalyzedRecord(null);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Disparo 100% Manual Bajo Demanda del OCR Forense
  const handleRunOcrAnalysis = async () => {
    if (!imageDataUrl || isAnalyzing) return;

    setIsAnalyzing(true);
    setErrorMsg(null);

    try {
      const result = await OcrForensicService.analyzeReceiptImage(
        imageDataUrl,
        imageMimeType,
        bcvRate,
        existingRecords
      );

      setAnalyzedRecord(result);
      OcrForensicService.saveTranscriptionToMemory(result);
      setTipoComprobante(result.tipoComprobante);
      setBancoEmisor(result.bancoEmisor || '');
      setBancoReceptor(result.bancoReceptor || '');
      setNumeroReferencia(result.numeroReferencia || '');
      setFechaComprobante(result.fechaComprobante || getCaracasToday());
      setMonedaOriginal(result.monedaOriginal);
      setMontoOriginal(result.montoOriginal);
      setTasaBcvSnapshot(result.tasaBcvSnapshot);

      // Autocompletar Observaciones de Auditoría con los datos complementarios del comprobante
      const auditDetails = [
        `Banco Emisor: ${result.bancoEmisor || 'N/A'}`,
        `Banco Destino: ${result.bancoReceptor || 'N/A'}`,
        `Fecha y Hora: ${result.fechaHoraDisplay || result.fechaComprobante || 'N/A'}`,
        `Ref: ${result.numeroReferencia || 'N/A'}`,
        `Beneficiario: ${result.telefonoNombreEmisor || 'N/A'}`,
        `CI/RIF: ${result.rifCedula || 'N/A'}`,
        `Cuenta Origen: ${result.cuentaOrigen || 'N/A'}`,
        `Concepto: ${result.concepto || 'N/A'}`,
        `Dictamen: ${result.dictamenVeracidad?.veredicto || 'N/A'} (${result.dictamenVeracidad?.score ?? 0}/100)`,
      ].join(' • ');
      setNotasRevision(auditDetails);

      // Intentar vincular cliente sugerido si existe coincidencia de RIF, Cédula o Teléfono
      if (entities.length > 0) {
        let matched: DualEntity | undefined;
        if (result.rifCedula) {
          const cleanRif = result.rifCedula.replace(/[^0-9A-Za-z]/g, '').toLowerCase();
          matched = entities.find((e) =>
            (e.rifCedula || '').replace(/[^0-9A-Za-z]/g, '').toLowerCase().includes(cleanRif)
          );
        }
        if (!matched && result.telefonoNombreEmisor) {
          const cleanPhone = result.telefonoNombreEmisor.replace(/\D/g, '');
          if (cleanPhone.length >= 7) {
            matched = entities.find((e) =>
              (e.phone || '').replace(/\D/g, '').includes(cleanPhone) ||
              (e.telefonoContacto || '').replace(/\D/g, '').includes(cleanPhone)
            );
          }
        }
        if (!matched && initialClientPhone) {
          const cleanInit = initialClientPhone.replace(/\D/g, '');
          matched = entities.find((e) =>
            (e.phone || '').replace(/\D/g, '').includes(cleanInit) ||
            (e.telefonoContacto || '').replace(/\D/g, '').includes(cleanInit)
          );
        }
        if (matched) {
          setSelectedEntityId(matched.id);
        }
      }
    } catch (err: any) {
      setErrorMsg(`Error ejecutando análisis forense OCR: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Guardar en Bandeja de Pre-Conciliación (sin conciliar aún)
  const handleSaveToPendingTray = async () => {
    if (!analyzedRecord) return;
    setIsSaving(true);
    setErrorMsg(null);

    const recordToSave: PagoReportadoOCR = sanitizeFirestorePayload({
      ...analyzedRecord,
      clienteIdSugerido: selectedEntityId || '',
      clienteNombreSugerido: entities.find((e) => e.id === selectedEntityId)?.name || '',
      facturaIdSeleccionada: selectedInvoiceId || '',
      facturaCodigoSeleccionada: invoices.find((i) => i.id === selectedInvoiceId)?.invoiceNumber || '',
      tipoComprobante: (tipoComprobante as any) || 'PAGO_MOVIL',
      bancoEmisor: bancoEmisor || '',
      bancoReceptor: bancoReceptor || '',
      numeroReferencia: numeroReferencia || '',
      referenciaNormalizada: (numeroReferencia || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
      monedaOriginal: monedaOriginal || 'VES',
      montoOriginal: centsRound(montoOriginal || 0),
      tasaBcvSnapshot: tasaBcvSnapshot || 1,
      montoEquivalenteUSD: montoEquivalenteUSD || 0,
      montoEquivalenteVES: montoEquivalenteVES || 0,
      notasRevision: notasRevision || '',
      updatedTimestamp: Date.now(),
    });

    const res = await OcrForensicService.saveReportedPayment(recordToSave);
    setIsSaving(false);

    if (res.success) {
      setSuccessMsg('Comprobante guardado exitosamente en la Bandeja de Pre-Conciliación.');
      setTimeout(() => {
        onClose();
      }, 1200);
    } else {
      setErrorMsg(`Error al guardar comprobante: ${res.error}`);
    }
  };

  // CIERRE TRANSACCIONAL ATÓMICO: Conciliar y Cruzar Factura
  const handleReconcileAndSettle = async () => {
    if (!analyzedRecord) return;
    setIsSaving(true);
    setErrorMsg(null);

    const entity = entities.find((e) => e.id === selectedEntityId);

    // Guardar primero el registro en Firestore para asegurar que existe
    const recordToSave: PagoReportadoOCR = sanitizeFirestorePayload({
      ...analyzedRecord,
      clienteIdSugerido: selectedEntityId || '',
      clienteNombreSugerido: entity?.name || '',
      facturaIdSeleccionada: selectedInvoiceId || '',
      facturaCodigoSeleccionada: invoices.find((i) => i.id === selectedInvoiceId)?.invoiceNumber || '',
      tipoComprobante: (tipoComprobante as any) || 'PAGO_MOVIL',
      bancoEmisor: bancoEmisor || '',
      bancoReceptor: bancoReceptor || '',
      numeroReferencia: numeroReferencia || '',
      referenciaNormalizada: (numeroReferencia || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
      monedaOriginal: monedaOriginal || 'VES',
      montoOriginal: centsRound(montoOriginal || 0),
      tasaBcvSnapshot: tasaBcvSnapshot || 1,
      montoEquivalenteUSD: montoEquivalenteUSD || 0,
      montoEquivalenteVES: montoEquivalenteVES || 0,
      notasRevision: notasRevision || '',
      updatedTimestamp: Date.now(),
    });

    await OcrForensicService.saveReportedPayment(recordToSave);

    const res = await OcrForensicService.approveAndReconcilePayment(analyzedRecord.id, {
      invoiceId: selectedInvoiceId || undefined,
      entityId: selectedEntityId || undefined,
      entityName: entity?.name || 'Cliente Puro Apure',
      bcvRate: tasaBcvSnapshot,
      userId: userProfile?.uid || 'operador_finanzas',
      userRole: role,
      notasRevision,
      justificacionSuperAdmin,
    });

    setIsSaving(false);

    if (res.success) {
      setSuccessMsg('¡Pago validado y CONCILIADO exitosamente! Factura cruzada en el libro mayor.');
      if (onPaymentReconciled && res.paymentRecordId) {
        onPaymentReconciled(res.paymentRecordId);
      }
      setTimeout(() => {
        onClose();
      }, 1500);
    } else {
      setErrorMsg(res.error || 'Error conciliando el pago.');
    }
  };

  const dictamen = analyzedRecord?.dictamenVeracidad;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-xs overflow-y-auto animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Cabecera del Modal */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Lector OCR Forense &amp; Pre-Conciliación de Pagos
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                  Anti-IA &amp; Anti-Fraude
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Verificación matemática e inspección de metadatos EXIF bajo demanda
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-2 rounded-xl hover:bg-slate-800 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensajes de Alerta / Éxito */}
        {errorMsg && (
          <div className="mx-5 mt-4 p-3.5 bg-rose-950/50 border border-rose-800/80 rounded-2xl text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-5 mt-4 p-3.5 bg-emerald-950/50 border border-emerald-800/80 rounded-2xl text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* CUERPO DIVIDIDO (SPLIT VIEW): Imagen vs Datos Extraídos */}
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* COLUMNA IZQUIERDA (5 COLS): Visor de Imagen y Semáforo de Veracidad */}
          <div className="lg:col-span-5 space-y-4 flex flex-col">
            {/* Contenedor de Captura / Imagen */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex flex-col items-center justify-center relative overflow-hidden min-h-[260px]">
              {imageDataUrl ? (
                <div className="relative w-full flex flex-col items-center">
                  <img
                    src={imageDataUrl}
                    alt="Comprobante a analizar"
                    className={`rounded-xl object-contain transition-all ${
                      isZoomed ? 'max-h-[500px] w-full' : 'max-h-64'
                    }`}
                  />
                  <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl backdrop-blur-xs border border-slate-700">
                    <button
                      onClick={() => setIsZoomed(!isZoomed)}
                      className="p-1.5 text-slate-300 hover:text-white"
                      title="Expandir imagen"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setImageDataUrl(null);
                        setAnalyzedRecord(null);
                      }}
                      className="p-1.5 text-rose-400 hover:text-rose-200"
                      title="Quitar imagen"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center p-6 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-purple-950/50 border border-purple-800/40 text-purple-400 mx-auto flex items-center justify-center">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <strong className="text-xs text-white block">Cargue o Pegue el Comprobante</strong>
                    <span className="text-[11px] text-slate-400">
                      Soporta presionar <strong>Ctrl + V</strong> directamente, subir archivo o tomar foto
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <label className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition cursor-pointer min-h-[44px] flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Subir Imagen</span>
                      <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* BOTÓN DISPARO 100% MANUAL BAJO DEMANDA */}
            {imageDataUrl && !analyzedRecord && (
              <button
                onClick={handleRunOcrAnalysis}
                disabled={isAnalyzing}
                className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:opacity-95 text-white font-extrabold text-xs shadow-lg shadow-emerald-950/50 transition flex items-center justify-center gap-2 cursor-pointer min-h-[44px] disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Ejecutando Peritaje Forense y OCR...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>🔍 Analizar con OCR y Verificar Autenticidad</span>
                  </>
                )}
              </button>
            )}

            {/* SEMÁFORO Y CUATRO CANDADOS DE VERACIDAD (Si ya fue analizado) */}
            {dictamen && (
              <div
                className={`p-4 rounded-2xl border space-y-3 ${
                  dictamen.veredicto === 'AUTENTICO_ALTA_CONFIANZA'
                    ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-200'
                    : dictamen.veredicto === 'SOSPECHOSO_REVISION_HUMANA'
                    ? 'bg-amber-950/20 border-amber-500/40 text-amber-200'
                    : 'bg-rose-950/30 border-rose-500/50 text-rose-200'
                }`}
              >
                {/* Cabecera del Semáforo */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                  <div className="flex items-center gap-2">
                    {dictamen.veredicto === 'AUTENTICO_ALTA_CONFIANZA' ? (
                      <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    ) : dictamen.veredicto === 'SOSPECHOSO_REVISION_HUMANA' ? (
                      <AlertTriangle className="w-5 h-5 text-amber-400" />
                    ) : (
                      <ShieldAlert className="w-5 h-5 text-rose-400" />
                    )}
                    <div>
                      <strong className="text-xs uppercase font-extrabold block">
                        {dictamen.veredicto === 'AUTENTICO_ALTA_CONFIANZA'
                          ? '🟢 Auténtico (Alta Confianza)'
                          : dictamen.veredicto === 'SOSPECHOSO_REVISION_HUMANA'
                          ? '🟡 Sospechoso (Revisión Manual)'
                          : '🔴 Alerta Fraude / Edición / IA'}
                      </strong>
                      <span className="text-[10px] opacity-80">
                        Score Forense: {dictamen.score} / 100 • {dictamen.tiempoAnalisisMs}ms
                      </span>
                    </div>
                  </div>
                  <span className="text-2xl font-black font-mono">{dictamen.score}%</span>
                </div>

                {/* Desglose de los 4 Candados */}
                <div className="space-y-1.5 text-[11px] font-sans">
                  <div className="flex items-start gap-1.5">
                    <span className="font-bold">Candado 1:</span>
                    <span className={dictamen.candado1_reciclaje.esDuplicado ? 'text-rose-400 font-bold' : 'opacity-85'}>
                      {dictamen.candado1_reciclaje.detalle}
                    </span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="font-bold">Candado 2:</span>
                    <span className={dictamen.candado2_exif_ia.tieneFirmasIAOEdicion ? 'text-rose-400 font-bold' : 'opacity-85'}>
                      {dictamen.candado2_exif_ia.detalle}
                    </span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="font-bold">Candado 3:</span>
                    <span className="opacity-85">{dictamen.candado3_visual_gemini.detalle}</span>
                  </div>
                  {analyzedRecord?.anomaliaSospechosa && dictamen.veredicto === 'SOSPECHOSO_REVISION_HUMANA' && (
                    <div className="mt-2 p-2 rounded-lg bg-amber-900/40 border border-amber-600/50 text-[11px] text-amber-200">
                      <strong className="block font-bold">⚠️ Criterio Técnico de Revisión:</strong>
                      <span>{analyzedRecord.anomaliaSospechosa}</span>
                    </div>
                  )}
                  <div className="pt-1 text-[10px] font-mono opacity-60 truncate">
                    SHA-256: {analyzedRecord.sha256Bytes.substring(0, 24)}...
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* COLUMNA DERECHA (7 COLS): Datos Extraídos y Pre-Conciliación Contable */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-purple-400" />
                <span>Datos del Comprobante &amp; Cruce Contable</span>
              </h4>

              {/* Fila 1: Selección de Cliente y Factura */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Cliente / Entidad Asociada *
                  </label>
                  <select
                    value={selectedEntityId}
                    onChange={(e) => {
                      setSelectedEntityId(e.target.value);
                      setSelectedInvoiceId('');
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 min-h-[44px]"
                  >
                    <option value="">-- Seleccionar Cliente --</option>
                    {entities.map((ent) => (
                      <option key={ent.id} value={ent.id}>
                        {ent.nombre} ({ent.rifCedula})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Factura Pendiente a Cruzar
                  </label>
                  <select
                    value={selectedInvoiceId}
                    onChange={(e) => setSelectedInvoiceId(e.target.value)}
                    disabled={!selectedEntityId || clientPendingInvoices.length === 0}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 min-h-[44px] disabled:opacity-50"
                  >
                    <option value="">-- Cruce como Anticipo Libre --</option>
                    {clientPendingInvoices.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNumber || inv.id} • Saldo: ${Number(inv.saldoPendienteUSD !== undefined ? inv.saldoPendienteUSD : inv.totalUSD).toFixed(2)} USD
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Fila 2: Modalidad, Bancos y Referencia */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Modalidad</label>
                  <select
                    value={tipoComprobante}
                    onChange={(e) => setTipoComprobante(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white min-h-[44px]"
                  >
                    <option value="PAGO_MOVIL">Pago Móvil</option>
                    <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                    <option value="ZELLE">Zelle</option>
                    <option value="CRIPTOACTIVOS">Criptoactivos / Binance</option>
                    <option value="RETENCION_FISCAL">Retención Fiscal SENIAT</option>
                    <option value="RIF">Comprobante RIF</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Banco Emisor</label>
                  <input
                    type="text"
                    value={bancoEmisor}
                    onChange={(e) => setBancoEmisor(e.target.value)}
                    placeholder="ej. Banesco"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white min-h-[44px]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">N° Referencia *</label>
                  <input
                    type="text"
                    value={numeroReferencia}
                    onChange={(e) => setNumeroReferencia(e.target.value)}
                    placeholder="Referencia numérica"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono min-h-[44px]"
                  />
                </div>
              </div>

              {/* Fila 3: Montos, Moneda y Tasa BCV Snapshot */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Moneda Original</label>
                  <select
                    value={monedaOriginal}
                    onChange={(e) => setMonedaOriginal(e.target.value as 'VES' | 'USD')}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white min-h-[44px]"
                  >
                    <option value="VES">Bolívares (VES)</option>
                    <option value="USD">Dólares (USD)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Monto Comprobante *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={montoOriginal || ''}
                    onChange={(e) => setMontoOriginal(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono min-h-[44px]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Tasa BCV Congelada (VES/USD)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={tasaBcvSnapshot}
                    onChange={(e) => setTasaBcvSnapshot(parseFloat(e.target.value) || 1)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono min-h-[44px]"
                  />
                </div>
              </div>

              {/* Conversión Exacta en Vivo */}
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between text-xs font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 block">Equivalente USD Contable:</span>
                  <span className="text-base font-bold text-emerald-400">
                    ${montoEquivalenteUSD.toFixed(2)} USD
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block">Equivalente VES:</span>
                  <span className="text-base font-bold text-white">
                    Bs. {montoEquivalenteVES.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Campo Abierto de Observaciones */}
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Observaciones de Auditoría (notas_revision)
                </label>
                <textarea
                  rows={2}
                  placeholder="Detalles sobre el titular, notas de conciliación o retenciones SENIAT..."
                  value={notasRevision}
                  onChange={(e) => setNotasRevision(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Justificación de Excepción si el semáforo es ALERTA_FRAUDE */}
              {dictamen?.veredicto === 'ALERTA_FRAUDE_EDICION_O_IA' && (
                <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-rose-300 font-bold text-xs">
                    <Lock className="w-4 h-4 text-rose-400" />
                    <span>Autorización Exclusiva de SuperAdmin Requerida</span>
                  </div>
                  <p className="text-[11px] text-rose-200">
                    Este comprobante posee alerta roja. Para forzar su conciliación en el libro contable, debe ingresar una justificación detallada.
                  </p>
                  <textarea
                    rows={2}
                    placeholder="Motivo de aprobación manual bajo riesgo del auditor..."
                    value={justificacionSuperAdmin}
                    onChange={(e) => setJustificacionSuperAdmin(e.target.value)}
                    disabled={!isSuperAdmin}
                    className="w-full bg-slate-950 border border-rose-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 disabled:opacity-50"
                  />
                </div>
              )}
            </div>

            {/* BOTONES FINALES DE ACCIÓN */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleSaveToPendingTray}
                disabled={!analyzedRecord || isSaving}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition cursor-pointer min-h-[44px] disabled:opacity-50"
              >
                Guardar en Bandeja Pre-Conciliación
              </button>

              <button
                type="button"
                onClick={handleReconcileAndSettle}
                disabled={
                  !analyzedRecord ||
                  isSaving ||
                  !numeroReferencia.trim() ||
                  montoOriginal <= 0 ||
                  (dictamen?.veredicto === 'ALERTA_FRAUDE_EDICION_O_IA' && !isSuperAdmin)
                }
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-950/50 transition cursor-pointer min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Conciliando en Libro Mayor...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Registrar Pago Conciliado y Cruzar Factura</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LectorComprobanteOCRModal;
