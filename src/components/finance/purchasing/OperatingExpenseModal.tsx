/**
 * ============================================================================
 * PURO APURE ERP — COMPONENTE: OperatingExpenseModal
 * ============================================================================
 * Modal interactivo para el registro dual de Gastos:
 * 1. Gasto Operativo del Día / Contado (Factura requerida si aplica, BCV en vivo)
 * 2. Gasto o Compra Pasada (Histórico Retroactivo: Factura opcional, fecha libre,
 *    descripción detallada, monto en USD del momento y soporte para pagos a
 *    proveedores o empleados).
 * Soporte de OCR Multimodal bajo demanda y atajo Ctrl + V para comprobantes.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  DollarSign,
  Calendar,
  Building2,
  Tag,
  FileText,
  Upload,
  Sparkles,
  Clock,
  Briefcase,
  Wrench,
  HardHat,
  Laptop,
  Users,
  CheckCircle2,
  AlertCircle,
  Receipt,
  Layers,
} from 'lucide-react';
import {
  OperatingExpense,
  GastoCategoria,
  GastoNaturaleza,
  GastoTipoRegistro,
  GastoMetodoPago,
} from '../../../types/purchasing';
import { DualEntity } from '../../../types/finance';
import { ExpensesService } from '../../../services/expensesService';
import { OcrForensicService } from '../../../services/ocrForensicService';
import { centsRound } from '../../../services/financialAnalyticsService';

interface OperatingExpenseModalProps {
  isOpen: boolean;
  bcvRate: number;
  userId: string;
  suppliers: DualEntity[];
  expenseToEdit?: OperatingExpense | null;
  onClose: () => void;
  onExpenseSaved: () => void;
}

export const OperatingExpenseModal: React.FC<OperatingExpenseModalProps> = ({
  isOpen,
  bcvRate,
  userId,
  suppliers,
  expenseToEdit,
  onClose,
  onExpenseSaved,
}) => {
  if (!isOpen) return null;

  // Estado del conmutador de modo de registro
  const [tipoRegistro, setTipoRegistro] = useState<GastoTipoRegistro>(
    expenseToEdit?.tipoRegistro || 'OPERATIVO_ACTUAL'
  );

  // Formulario
  const [fecha, setFecha] = useState<string>(
    expenseToEdit?.fecha || new Date().toISOString().split('T')[0]
  );
  const [categoria, setCategoria] = useState<GastoCategoria>(
    expenseToEdit?.categoria || 'GASTOS_OPERATIVOS_GENERALES'
  );
  const [naturaleza, setNaturaleza] = useState<GastoNaturaleza>(
    expenseToEdit?.naturaleza || 'OPEX'
  );
  const [concepto, setConcepto] = useState<string>(expenseToEdit?.concepto || '');
  const [descripcionDetallada, setDescripcionDetallada] = useState<string>(
    expenseToEdit?.descripcionDetallada || ''
  );
  const [numeroComprobante, setNumeroComprobante] = useState<string>(
    expenseToEdit?.numeroComprobante || ''
  );
  const [proveedorComercio, setProveedorComercio] = useState<string>(
    expenseToEdit?.proveedorComercio || ''
  );
  const [proveedorRifCedula, setProveedorRifCedula] = useState<string>(
    expenseToEdit?.proveedorRifCedula || ''
  );
  const [montoUSD, setMontoUSD] = useState<string>(
    expenseToEdit?.montoUSD ? expenseToEdit.montoUSD.toString() : ''
  );
  const [metodoPago, setMetodoPago] = useState<GastoMetodoPago>(
    (expenseToEdit?.metodoPago as GastoMetodoPago) || 'EFECTIVO_USD'
  );
  const [cuentaOrigen, setCuentaOrigen] = useState<string>(
    expenseToEdit?.cuentaOrigen || 'Caja Chica Operativa'
  );
  const [comprobanteUrl, setComprobanteUrl] = useState<string | undefined>(
    expenseToEdit?.comprobanteUrl
  );

  // Estado de análisis OCR y guardado
  const [isAnalyzingOcr, setIsAnalyzingOcr] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Auto-ajustar naturaleza según categoría sugerida
  useEffect(() => {
    if (categoria === 'EQUIPOS_TECNOLOGIA') {
      setNaturaleza('CAPEX');
    } else if (
      categoria === 'CONSTRUCCION_INFRAESTRUCTURA' ||
      categoria === 'PAPELERIA_OFICINA' ||
      categoria === 'GASTOS_OPERATIVOS_GENERALES' ||
      categoria === 'PAGO_EMPLEADOS_MANO_OBRA' ||
      categoria === 'PAGO_PROVEEDORES_HISTORICO'
    ) {
      setNaturaleza('OPEX');
    }
  }, [categoria]);

  // Manejar captura pegada con Ctrl + V
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            setComprobanteUrl(dataUrl);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  // Manejar subida de archivo
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setComprobanteUrl(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  // Extraer datos con OCR Forense
  const handleExtractOcr = async () => {
    if (!comprobanteUrl) {
      setFormError('Adjunte o pegue primero una imagen del comprobante para extraer datos.');
      return;
    }

    setIsAnalyzingOcr(true);
    setFormError(null);
    try {
      const mimeType = comprobanteUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
      const result = await OcrForensicService.analyzeReceiptImage(comprobanteUrl, mimeType, bcvRate, []);
      if (result) {
        if (result.bancoEmisor && !proveedorComercio) {
          setProveedorComercio(result.bancoEmisor);
        } else if (result.telefonoNombreEmisor && !proveedorComercio) {
          setProveedorComercio(result.telefonoNombreEmisor);
        }
        if (result.montoEquivalenteUSD && result.montoEquivalenteUSD > 0) {
          setMontoUSD(result.montoEquivalenteUSD.toFixed(2));
        } else if (result.montoOriginal && result.montoOriginal > 0) {
          setMontoUSD(result.montoOriginal.toFixed(2));
        }
        if (result.numeroReferencia) {
          setNumeroComprobante(result.numeroReferencia);
        }
        if (result.fechaComprobante && result.fechaComprobante.length >= 8) {
          setFecha(result.fechaComprobante);
        }
        if (result.rifCedula && !proveedorRifCedula) {
          setProveedorRifCedula(result.rifCedula);
        }
      }
    } catch (err: any) {
      console.warn('[OCR] Error al extraer:', err);
      setFormError('No se pudo extraer información automática del recibo. Puede completarla manualmente.');
    } finally {
      setIsAnalyzingOcr(false);
    }
  };

  // Guardar gasto
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsedMontoUSD = parseFloat(montoUSD);
    if (isNaN(parsedMontoUSD) || parsedMontoUSD <= 0) {
      setFormError('Ingrese un monto válido en USD mayor a 0.');
      return;
    }

    if (!concepto.trim()) {
      setFormError('Indique un concepto o título descriptivo del gasto.');
      return;
    }

    if (!fecha) {
      setFormError('Seleccione la fecha en que se realizó el gasto.');
      return;
    }

    if (tipoRegistro === 'OPERATIVO_ACTUAL' && !proveedorComercio.trim()) {
      setFormError('Indique el nombre del comercio, ferretería o proveedor.');
      return;
    }

    setIsSubmitting(true);
    try {
      const expensePayload: Omit<OperatingExpense, 'id' | 'createdAt' | 'updatedAt' | 'idempotencyKey'> = {
        tipoRegistro,
        fecha,
        categoria,
        naturaleza,
        concepto: concepto.trim(),
        descripcionDetallada: descripcionDetallada.trim() || concepto.trim(),
        numeroComprobante: numeroComprobante.trim() || (tipoRegistro === 'HISTORICO_RETROACTIVO' ? 'S/F' : undefined),
        tieneComprobanteFisico: !!numeroComprobante.trim() || !!comprobanteUrl,
        comprobanteUrl,
        proveedorComercio: proveedorComercio.trim() || 'Comercio Local / Caja Chica',
        proveedorRifCedula: proveedorRifCedula.trim() || undefined,
        montoUSD: centsRound(parsedMontoUSD),
        tasaBcv: bcvRate > 0 ? bcvRate : undefined,
        montoVES: bcvRate > 0 ? centsRound(parsedMontoUSD * bcvRate) : undefined,
        metodoPago,
        cuentaOrigen,
        estadoPago: 'PAGADO',
        esGastoEstructuralEmpresa: true,
        createdBy: userId,
      };

      if (expenseToEdit) {
        await ExpensesService.updateExpense(expenseToEdit.id, expensePayload);
      } else {
        await ExpensesService.createExpense(expensePayload, userId);
      }

      onExpenseSaved();
      onClose();
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar el gasto en la base de datos.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculatedVES = (parseFloat(montoUSD) || 0) * (bcvRate || 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xs animate-in fade-in overflow-y-auto"
      onPaste={handlePaste}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full shadow-2xl space-y-5 my-8 max-h-[90vh] overflow-y-auto">
        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Receipt className="w-5 h-5 text-emerald-400" />
              <span>{expenseToEdit ? 'Editar Gasto Registrado' : 'Registrar Gasto o Compra'}</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Materiales, construcción, tecnología, mantenimiento, pagos a proveedores o mano de obra
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition cursor-pointer p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONMUTADOR DUAL DE MODO: Gasto Presente vs Gasto Histórico Pasado */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-2xl border border-slate-800">
          <button
            type="button"
            onClick={() => setTipoRegistro('OPERATIVO_ACTUAL')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
              tipoRegistro === 'OPERATIVO_ACTUAL'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Gasto Operativo del Día</span>
          </button>

          <button
            type="button"
            onClick={() => setTipoRegistro('HISTORICO_RETROACTIVO')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
              tipoRegistro === 'HISTORICO_RETROACTIVO'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-950/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Gasto o Compra Pasada (Histórico)</span>
          </button>
        </div>

        {/* Banner Informativo del Modo */}
        {tipoRegistro === 'HISTORICO_RETROACTIVO' ? (
          <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-300 text-xs flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-bold">Modo Histórico Retroactivo Activo:</span> Permite registrar compras pasadas de materiales, pagos a empleados o proveedores ocurridos en meses o años anteriores. El número de factura es <strong>opcional</strong> y el monto se registra con el valor de referencia en dólares del momento.
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/30 text-emerald-300 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-bold">Gasto del Día a Día:</span> Impacta el flujo de caja operativo actual con cálculo dual en Bolívares a la Tasa Oficial BCV del día (Bs. {bcvRate.toFixed(2)}).
            </div>
          </div>
        )}

        {formError && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Fila 1: Fecha y Categoría */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                Fecha del Gasto {tipoRegistro === 'HISTORICO_RETROACTIVO' ? '(Pasada / Histórica)' : '(Hoy)'} *
              </label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 transition min-h-[44px]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                Categoría del Desembolso *
              </label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as GastoCategoria)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 transition min-h-[44px]"
              >
                <option value="CONSTRUCCION_INFRAESTRUCTURA">Construcción & Reparaciones (Galpones, Mallas, Cemento)</option>
                <option value="EQUIPOS_TECNOLOGIA">Equipos & Tecnología (Computadoras, UPS, Routers, Cables)</option>
                <option value="PAPELERIA_OFICINA">Papelería & Suministros Administrativos</option>
                <option value="HERRAMIENTAS_OPERATIVAS">Herramientas & Maquinaria Menor</option>
                <option value="MANTENIMIENTO_SERVICIOS">Mantenimiento de Vehículos, Plomería & Electricidad</option>
                <option value="PAGO_PROVEEDORES_HISTORICO">Pago a Proveedores (Histórico / Pendiente)</option>
                <option value="PAGO_EMPLEADOS_MANO_OBRA">Pago a Empleados / Jornales / Mano de Obra</option>
                <option value="GASTOS_OPERATIVOS_GENERALES">Gastos Operativos & Consumibles Generales</option>
              </select>
            </div>
          </div>

          {/* Fila 2: Concepto y Naturaleza */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                Concepto / Título del Gasto *
              </label>
              <input
                type="text"
                placeholder="Ej. Compra de 5 sacos de cemento y mallas para galpón 3"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 transition min-h-[44px]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                Naturaleza Contable
              </label>
              <select
                value={naturaleza}
                onChange={(e) => setNaturaleza(e.target.value as GastoNaturaleza)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 transition min-h-[44px]"
              >
                <option value="OPEX">OPEX (Gasto Operativo Corriente)</option>
                <option value="CAPEX">CAPEX (Inversión / Activo Menor)</option>
              </select>
            </div>
          </div>

          {/* Fila 3: Monto USD y Referencia Dual BCV */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-slate-950/70 border border-slate-800/80 rounded-2xl">
            <div>
              <label className="block text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4" />
                Monto Referencial en Dólares (USD) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={montoUSD}
                onChange={(e) => setMontoUSD(e.target.value)}
                className="w-full bg-slate-900 border border-emerald-500/40 rounded-xl px-3 py-2 text-sm font-bold font-mono text-emerald-300 focus:outline-none focus:border-emerald-400 transition min-h-[44px]"
                required
              />
            </div>

            <div className="flex flex-col justify-center">
              <span className="text-[11px] text-slate-400 font-semibold uppercase">
                Equivalencia Oficial BCV (Bs. {bcvRate.toFixed(2)})
              </span>
              <div className="text-base font-bold font-mono text-amber-300 mt-1">
                ≈ Bs. {centsRound(calculatedVES).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-slate-500">
                Aritmética decimal exacta con redondeo financiero
              </span>
            </div>
          </div>

          {/* Fila 4: Comercio/Beneficiario y Número de Factura */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                Comercio / Proveedor / Beneficiario *
              </label>
              <input
                type="text"
                placeholder="Ej. Ferretería El Progreso C.A. o Nombre de Empleado"
                value={proveedorComercio}
                onChange={(e) => setProveedorComercio(e.target.value)}
                list="suppliers-suggestions"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 transition min-h-[44px]"
                required
              />
              <datalist id="suppliers-suggestions">
                {suppliers.map((s) => (
                  <option key={s.id} value={s.razonSocial || s.name || s.nombre} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                N° Factura / Control / Ticket {tipoRegistro === 'HISTORICO_RETROACTIVO' ? '(Opcional)' : ''}
              </label>
              <input
                type="text"
                placeholder={tipoRegistro === 'HISTORICO_RETROACTIVO' ? 'Opcional (Ej. S/F o Nro. Recibo)' : 'Ej. 001234'}
                value={numeroComprobante}
                onChange={(e) => setNumeroComprobante(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 transition min-h-[44px]"
              />
            </div>
          </div>

          {/* Fila 5: Método de Pago y Cuenta Origen */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                Método de Liquidación
              </label>
              <select
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value as GastoMetodoPago)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 transition min-h-[44px]"
              >
                <option value="EFECTIVO_USD">Efectivo USD (Divisas en Mano)</option>
                <option value="PAGO_MOVIL">Pago Móvil VES</option>
                <option value="TRANSFERENCIA_VES">Transferencia Bancaria VES</option>
                <option value="ZELLE">Zelle USD</option>
                <option value="BINANCE_USDT">Cripto / Binance USDT</option>
                <option value="EFECTIVO_VES">Efectivo Bolívares</option>
                <option value="TRANSFERENCIA_USD">Transferencia Internacional USD</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                Cuenta o Fondo de Origen
              </label>
              <input
                type="text"
                placeholder="Ej. Caja Chica Granja, Banesco VES, Custodia"
                value={cuentaOrigen}
                onChange={(e) => setCuentaOrigen(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 transition min-h-[44px]"
              />
            </div>
          </div>

          {/* Fila 6: Descripción Global y Detallada */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
              Descripción Exacta y Desglose Operativo
            </label>
            <textarea
              rows={3}
              placeholder="Detalle exactamente qué se compró, justificación del gasto, seriales de equipos o especificaciones de construcción..."
              value={descripcionDetallada}
              onChange={(e) => setDescripcionDetallada(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 transition resize-none"
            />
          </div>

          {/* Fila 7: Adjunto de Comprobante y Extracción OCR */}
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5 text-cyan-400" />
                Comprobante Digital (Foto o PDF)
              </span>
              <span className="text-[10px] text-slate-500">
                Pega con Ctrl + V o selecciona archivo
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold cursor-pointer transition min-h-[44px] flex items-center gap-2">
                <Upload className="w-4 h-4 text-slate-400" />
                <span>Seleccionar Imagen</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {comprobanteUrl && (
                <button
                  type="button"
                  onClick={handleExtractOcr}
                  disabled={isAnalyzingOcr}
                  className="px-3 py-2 rounded-xl bg-purple-600/30 hover:bg-purple-600/40 text-purple-200 border border-purple-500/40 text-xs font-semibold transition cursor-pointer min-h-[44px] flex items-center gap-2 disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>{isAnalyzingOcr ? 'Analizando con OCR...' : 'Extraer Datos con OCR'}</span>
                </button>
              )}

              {comprobanteUrl && (
                <button
                  type="button"
                  onClick={() => setComprobanteUrl(undefined)}
                  className="text-xs text-rose-400 hover:text-rose-300 p-2"
                >
                  Quitar foto
                </button>
              )}
            </div>

            {comprobanteUrl && (
              <div className="mt-2 w-24 h-24 rounded-xl border border-slate-700 overflow-hidden bg-slate-900">
                <img src={comprobanteUrl} alt="Comprobante adjunto" className="w-full h-full object-cover" />
              </div>
            )}
          </div>

          {/* Botones de Acción */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer min-h-[44px]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 transition cursor-pointer min-h-[44px] flex items-center gap-2 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Guardando...' : expenseToEdit ? 'Actualizar Gasto' : 'Asentar Gasto Formal'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
