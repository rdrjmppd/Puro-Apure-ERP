/**
 * Componente: Pestaña de Conciliación de Pagos & Deducción de Deuda
 * Puro Apure ERP - Módulo de Finanzas
 * 
 * Integra:
 * 1. Bandeja de Pre-Conciliación Forense OCR (Anti-IA / Anti-Fraude).
 * 2. Historial de Conciliaciones Contables y Cruces de Factura.
 * 3. Modal Split-View para auditoría y aprobación atómica.
 */

import React, { useState, useEffect } from 'react';
import { Receipt, Plus, CheckCheck, Sparkles, History, ShieldCheck } from 'lucide-react';
import { PaymentReconciliation, DualEntity, BillingInvoice } from '../../types/finance';
import { PagoReportadoOCR } from '../../types/ocrForensic';
import { BandejaPreConciliacionOCR } from '../finanzas/BandejaPreConciliacionOCR';
import { OcrForensicService } from '../../services/ocrForensicService';

const LectorComprobanteOCRModal = React.lazy(() =>
  import('../finanzas/LectorComprobanteOCRModal').then((m) => ({ default: m.LectorComprobanteOCRModal }))
);

interface ReconciliationTabProps {
  reconciliations: PaymentReconciliation[];
  recFiltroEstado: 'TODOS' | 'CONCILIADO' | 'PENDIENTE';
  setRecFiltroEstado: (estado: 'TODOS' | 'CONCILIADO' | 'PENDIENTE') => void;
  onOpenReconciliation: () => void;
  entities?: DualEntity[];
  invoices?: BillingInvoice[];
  bcvRate?: number;
}

export const ReconciliationTab: React.FC<ReconciliationTabProps> = ({
  reconciliations,
  recFiltroEstado,
  setRecFiltroEstado,
  onOpenReconciliation,
  entities = [],
  invoices = [],
  bcvRate = 1,
}) => {
  // Sub-vista activa: Pre-Conciliación OCR vs Historial Contable
  const [subView, setSubView] = useState<'PRE_CONCILIACION' | 'HISTORIAL'>('PRE_CONCILIACION');
  const [pendingOcrCount, setPendingOcrCount] = useState<number>(0);

  // Estado del Modal de Lectura OCR Forense
  const [isOCRModalOpen, setIsOCRModalOpen] = useState<boolean>(false);
  const [selectedOCRRecord, setSelectedOCRRecord] = useState<PagoReportadoOCR | null>(null);

  // Escuchar comprobantes pendientes en tiempo real para mostrar badge
  useEffect(() => {
    const unsub = OcrForensicService.subscribePendingReportedPayments((recs) => {
      const pending = recs.filter((r) => r.estadoConciliacion === 'pendiente_revision');
      setPendingOcrCount(pending.length);
    });
    return () => unsub();
  }, []);

  const handleOpenRecordInOCR = (record: PagoReportadoOCR) => {
    setSelectedOCRRecord(record);
    setIsOCRModalOpen(true);
  };

  const handleOpenNewOCRModal = () => {
    setSelectedOCRRecord(null);
    setIsOCRModalOpen(true);
  };

  const filteredList = reconciliations.filter(
    (r) => recFiltroEstado === 'TODOS' || r.estado === recFiltroEstado
  );

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Cabecera Principal y Acciones Rápidas */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-slate-900 border border-slate-800 rounded-3xl shadow-lg">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Receipt className="w-4 h-4 text-purple-400" />
            <span>Conciliación de Pagos, Deducción de Deuda &amp; OCR Forense</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Cruce atómico de cobros contra facturas de lotes biológicos, retenciones SENIAT, WhatsApp y validación anti-fraude.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleOpenNewOCRModal}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-lg shadow-emerald-950/40 cursor-pointer flex-1 sm:flex-none justify-center"
          >
            <Sparkles className="w-4 h-4" />
            <span>+ Analizar OCR / Ctrl+V</span>
          </button>

          <button
            onClick={onOpenReconciliation}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-lg shadow-purple-950/40 cursor-pointer flex-1 sm:flex-none justify-center"
          >
            <Plus className="w-4 h-4" />
            <span>+ Nueva Conciliación Manual</span>
          </button>
        </div>
      </div>

      {/* Selector de Sub-Vistas (Bandeja Pre-Conciliación OCR vs Historial Contable) */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setSubView('PRE_CONCILIACION')}
          className={`min-h-[44px] px-4 py-2 rounded-2xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            subView === 'PRE_CONCILIACION'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-950/40'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Bandeja Pre-Conciliación Forense OCR</span>
          {pendingOcrCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-400 text-slate-950 animate-pulse">
              {pendingOcrCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setSubView('HISTORIAL')}
          className={`min-h-[44px] px-4 py-2 rounded-2xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            subView === 'HISTORIAL'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-950/40'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Historial de Conciliaciones Contables &amp; Cruces</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-300">
            {reconciliations.length}
          </span>
        </button>
      </div>

      {/* CONTENIDO CONDICIONAL: Bandeja OCR vs Historial */}
      {subView === 'PRE_CONCILIACION' ? (
        <BandejaPreConciliacionOCR
          onSelectRecord={handleOpenRecordInOCR}
          onOpenNewOCRModal={handleOpenNewOCRModal}
          entities={entities}
          bcvRate={bcvRate}
        />
      ) : (
        <div className="space-y-4">
          {/* Tarjetas de Resumen de Conciliación */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <div className="text-xs text-slate-400 font-semibold uppercase">Total Conciliado (USD)</div>
              <div className="text-xl font-bold font-mono text-purple-400 mt-1">
                ${reconciliations.reduce((acc, r) => acc + (r.montoUSD || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                Bs. {reconciliations.reduce((acc, r) => acc + (r.montoVES || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <div className="text-xs text-slate-400 font-semibold uppercase">Cobranza a Crédito</div>
              <div className="text-xl font-bold font-mono text-blue-400 mt-1">
                ${reconciliations.filter((r) => r.modalidad === 'CREDITO').reduce((acc, r) => acc + (r.montoUSD || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                {reconciliations.filter((r) => r.modalidad === 'CREDITO').length} cuotas conciliadas
              </div>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <div className="text-xs text-slate-400 font-semibold uppercase">Cruce de Cuentas Dual</div>
              <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
                ${reconciliations.filter((r) => r.tipoImpacto === 'CRUCE_CUENTAS').reduce((acc, r) => acc + (r.montoUSD || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                Compensaciones entre roles
              </div>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <div className="text-xs text-slate-400 font-semibold uppercase">Retenciones Fiscales SENIAT</div>
              <div className="text-xl font-bold font-mono text-amber-400 mt-1">
                ${reconciliations.filter((r) => r.tipoImpacto === 'RETENCION_FISCAL').reduce((acc, r) => acc + (r.montoUSD || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                Comprobantes fiscales recibidos
              </div>
            </div>
          </div>

          {/* Filtros de Tabla */}
          <div className="flex items-center justify-between gap-3 p-3 bg-slate-900 border border-slate-800 rounded-2xl text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Filtrar por Estado:</span>
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                {(['TODOS', 'CONCILIADO', 'PENDIENTE'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setRecFiltroEstado(st)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      recFiltroEstado === st
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-slate-400 font-mono text-[11px]">
              Mostrando {filteredList.length} de {reconciliations.length} registros
            </div>
          </div>

          {/* Tabla de Conciliaciones */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/90 uppercase tracking-wider text-[11px] text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">Ref. Bancaria / Soporte</th>
                    <th className="py-3.5 px-4 font-semibold">Fecha</th>
                    <th className="py-3.5 px-4 font-semibold">Cliente / RIF</th>
                    <th className="py-3.5 px-4 font-semibold">Modalidad &amp; Método</th>
                    <th className="py-3.5 px-4 font-semibold">Factura / Lote Asignado</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Monto Recibido</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Monto USD ($)</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Monto Bs. (VES)</th>
                    <th className="py-3.5 px-4 font-semibold text-center">Impacto</th>
                    <th className="py-3.5 px-4 font-semibold text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredList.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-500 font-sans italic">
                        No hay conciliaciones de pago registradas con este criterio. Presione "+ Nueva Conciliación Manual" o analice un comprobante en la bandeja OCR.
                      </td>
                    </tr>
                  ) : (
                    filteredList.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3.5 px-4 font-bold text-white font-mono">
                          <div>{r.numeroReferencia}</div>
                          <div className="text-[10px] text-slate-400 font-sans">{r.bancoPlataforma || 'N/A'}</div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 font-sans">{r.fecha}</td>
                        <td className="py-3.5 px-4 font-sans text-slate-200">
                          <div>{r.clienteNombre}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{r.clienteRif}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              r.modalidad === 'CREDITO'
                                ? 'bg-blue-950 text-blue-300 border border-blue-800'
                                : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            }`}
                          >
                            {r.modalidad}
                          </span>
                          <div className="text-[10px] text-slate-400 mt-0.5 font-sans">{r.metodoPago}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-amber-300">{r.facturaNumero || r.facturaId}</span>
                          {r.loteId && (
                            <div className="text-[10px] text-emerald-400 flex items-center gap-1 mt-0.5 font-sans">
                              <span>Lote: {r.loteId}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-slate-200">
                          {r.monedaRecibida === 'USD' ? '$' : 'Bs. '}
                          {r.montoRecibido.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-emerald-400">
                          ${r.montoUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-cyan-400">
                          Bs. {r.montoVES.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-950 text-slate-300 border border-slate-700">
                            {r.tipoImpacto}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center justify-center gap-1 mx-auto ${
                              r.estado === 'CONCILIADO'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                                : 'bg-amber-950 text-amber-300 border border-amber-700'
                            }`}
                          >
                            <CheckCheck className="w-3 h-3 text-emerald-400" />
                            <span>{r.estado}</span>
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE LECTURA FORENSE OCR & PRE-CONCILIACIÓN */}
      {isOCRModalOpen && (
        <React.Suspense fallback={null}>
          <LectorComprobanteOCRModal
            isOpen={isOCRModalOpen}
            onClose={() => {
              setIsOCRModalOpen(false);
              setSelectedOCRRecord(null);
            }}
            initialRecord={selectedOCRRecord}
            entities={entities}
            invoices={invoices}
            bcvRate={bcvRate}
          />
        </React.Suspense>
      )}
    </div>
  );
};
