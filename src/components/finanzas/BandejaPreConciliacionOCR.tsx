/**
 * Componente: Bandeja de Pre-Conciliación de Comprobantes OCR & Auditoría Forense
 * Puro Apure ERP - Módulo de Finanzas & Conciliación
 * 
 * Regla de Oro: Separación estricta entre reporte de pago y conciliación contable.
 * Ningún comprobante altera el libro mayor hasta ser auditado y aprobado atómicamente.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Receipt,
  Search,
  Filter,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Eye,
  Calendar,
  Building,
  User,
  DollarSign,
  RefreshCw,
  Plus,
} from 'lucide-react';
import {
  PagoReportadoOCR,
  VeredictoVeracidad,
  TipoComprobanteOCR,
} from '../../types/ocrForensic';
import { DualEntity } from '../../types/finance';
import { OcrForensicService } from '../../services/ocrForensicService';

interface BandejaPreConciliacionOCRProps {
  onSelectRecord: (record: PagoReportadoOCR) => void;
  onOpenNewOCRModal: () => void;
  entities: DualEntity[];
  bcvRate: number;
}

type FiltroBandeja =
  | 'TODOS'
  | 'PENDIENTES'
  | 'ALTA_CONFIANZA'
  | 'SOSPECHOSOS'
  | 'ALERTA_FRAUDE'
  | 'CONCILIADOS';

export const BandejaPreConciliacionOCR: React.FC<BandejaPreConciliacionOCRProps> = ({
  onSelectRecord,
  onOpenNewOCRModal,
  entities,
  bcvRate,
}) => {
  const [payments, setPayments] = useState<PagoReportadoOCR[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [filtro, setFiltro] = useState<FiltroBandeja>('PENDIENTES');
  const [busqueda, setBusqueda] = useState<string>('');

  // Suscripción reactiva en tiempo real a la colección 'pagos_reportados_ocr'
  useEffect(() => {
    setIsLoading(true);
    const unsub = OcrForensicService.subscribePendingReportedPayments((recs) => {
      setPayments(recs);
      setIsLoading(false);
    });
    return () => unsub();
  }, []);

  // Filtrado reactivo en memoria
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      // 1. Filtro por categoría / estado
      if (filtro === 'PENDIENTES' && p.estadoConciliacion !== 'pendiente_revision') {
        return false;
      }
      if (filtro === 'CONCILIADOS' && p.estadoConciliacion !== 'aprobado_conciliado') {
        return false;
      }
      if (filtro === 'ALTA_CONFIANZA' && p.dictamenVeracidad?.veredicto !== 'AUTENTICO_ALTA_CONFIANZA') {
        return false;
      }
      if (filtro === 'SOSPECHOSOS' && p.dictamenVeracidad?.veredicto !== 'SOSPECHOSO_REVISION_HUMANA') {
        return false;
      }
      if (filtro === 'ALERTA_FRAUDE' && p.dictamenVeracidad?.veredicto !== 'ALERTA_FRAUDE_EDICION_O_IA') {
        return false;
      }

      // 2. Filtro por texto de búsqueda
      if (busqueda.trim()) {
        const query = busqueda.toLowerCase().trim();
        const ref = (p.numeroReferencia || '').toLowerCase();
        const refNorm = (p.referenciaNormalizada || '').toLowerCase();
        const banco = (p.bancoEmisor || '').toLowerCase();
        const cliente = (p.clienteNombreSugerido || '').toLowerCase();
        const rif = (p.rifCedula || '').toLowerCase();
        const emisor = (p.telefonoNombreEmisor || '').toLowerCase();

        return (
          ref.includes(query) ||
          refNorm.includes(query) ||
          banco.includes(query) ||
          cliente.includes(query) ||
          rif.includes(query) ||
          emisor.includes(query)
        );
      }

      return true;
    });
  }, [payments, filtro, busqueda]);

  // Contadores y métricas KPI
  const stats = useMemo(() => {
    const pendientes = payments.filter((p) => p.estadoConciliacion === 'pendiente_revision');
    const totalUSD = pendientes.reduce((acc, p) => acc + (p.montoEquivalenteUSD || 0), 0);
    const autenticos = payments.filter((p) => p.dictamenVeracidad?.veredicto === 'AUTENTICO_ALTA_CONFIANZA');
    const sospechosos = payments.filter((p) => p.dictamenVeracidad?.veredicto === 'SOSPECHOSO_REVISION_HUMANA');
    const fraudes = payments.filter((p) => p.dictamenVeracidad?.veredicto === 'ALERTA_FRAUDE_EDICION_O_IA');

    return {
      pendientesCount: pendientes.length,
      pendientesUSD: totalUSD,
      autenticosCount: autenticos.length,
      sospechososCount: sospechosos.length,
      fraudesCount: fraudes.length,
    };
  }, [payments]);

  // Helper para renderizar insignia de veracidad
  const renderVeracityBadge = (veredicto?: VeredictoVeracidad, score?: number) => {
    const finalScore = score !== undefined ? score : 0;
    if (veredicto === 'AUTENTICO_ALTA_CONFIANZA') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700/80 shadow-xs">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Auténtico ({finalScore} pts)</span>
        </span>
      );
    }
    if (veredicto === 'SOSPECHOSO_REVISION_HUMANA') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-950/80 text-amber-300 border border-amber-700/80 shadow-xs">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Sospechoso ({finalScore} pts)</span>
        </span>
      );
    }
    if (veredicto === 'ALERTA_FRAUDE_EDICION_O_IA') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-950/90 text-rose-300 border border-rose-700 shadow-xs animate-pulse">
          <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span>Alerta Fraude ({finalScore} pts)</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
        <Clock className="w-3.5 h-3.5" />
        <span>Sin Analizar</span>
      </span>
    );
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Cabecera y Botón de Acción Principal */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-slate-900 border border-slate-800 rounded-3xl shadow-lg">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Receipt className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <span>Bandeja de Pre-Conciliación Forense OCR</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800">
                Auditoría Anti-Fraude
              </span>
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Evidencias de pago recibidas por WhatsApp o captura directa. Los pagos permanecen aislados hasta su cruce y conciliación formal.
          </p>
        </div>

        <button
          onClick={onOpenNewOCRModal}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold transition flex items-center gap-2 shadow-lg shadow-purple-950/40 cursor-pointer w-full sm:w-auto justify-center"
        >
          <Sparkles className="w-4 h-4" />
          <span>+ Cargar Comprobante (OCR / Ctrl+V)</span>
        </button>
      </div>

      {/* Tarjetas KPI de la Bandeja */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl">
          <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider flex items-center justify-between">
            <span>Pendientes por Conciliar</span>
            <Clock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-300 mt-1">
            {stats.pendientesCount} <span className="text-xs text-slate-400 font-sans font-normal">comprobantes</span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
            ${stats.pendientesUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
          </div>
        </div>

        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl">
          <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider flex items-center justify-between">
            <span>Auténticos (Alta Confianza)</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
            {stats.autenticosCount}
          </div>
          <div className="text-[11px] text-emerald-500/80 font-sans mt-0.5">
            Score verificado &ge; 80 pts
          </div>
        </div>

        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl">
          <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider flex items-center justify-between">
            <span>Revisión Humana</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-400 mt-1">
            {stats.sospechososCount}
          </div>
          <div className="text-[11px] text-amber-500/80 font-sans mt-0.5">
            Discrepancia leve o tipográfica
          </div>
        </div>

        <div className="p-4 bg-slate-900/90 border border-rose-900/40 rounded-2xl">
          <div className="text-[11px] text-rose-300 font-semibold uppercase tracking-wider flex items-center justify-between">
            <span>Alertas de Fraude / IA</span>
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-xl font-bold font-mono text-rose-400 mt-1">
            {stats.fraudesCount}
          </div>
          <div className="text-[11px] text-rose-400/80 font-sans mt-0.5">
            Hash duplicado o edición detectada
          </div>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Pestañas de Filtro */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
          {(
            [
              { key: 'PENDIENTES', label: 'Pendientes' },
              { key: 'ALTA_CONFIANZA', label: 'Auténticos' },
              { key: 'SOSPECHOSOS', label: 'Sospechosos' },
              { key: 'ALERTA_FRAUDE', label: 'Fraude / IA' },
              { key: 'CONCILIADOS', label: 'Conciliados' },
              { key: 'TODOS', label: 'Todos' },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              onClick={() => setFiltro(item.key)}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center justify-center ${
                filtro === item.key
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Buscador */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por referencia, banco, cliente, RIF o teléfono..."
            className="w-full min-h-[44px] pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-purple-500 transition font-sans"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Tabla / Lista de Comprobantes */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/90 uppercase tracking-wider text-[11px] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Captura</th>
                <th className="py-3.5 px-4 font-semibold">Fecha &amp; Tipo</th>
                <th className="py-3.5 px-4 font-semibold">Remitente / Cliente Sugerido</th>
                <th className="py-3.5 px-4 font-semibold">Banco &amp; Referencia</th>
                <th className="py-3.5 px-4 font-semibold text-right">Monto Original</th>
                <th className="py-3.5 px-4 font-semibold text-right">Equivalente USD</th>
                <th className="py-3.5 px-4 font-semibold text-center">Veracidad (4 Candados)</th>
                <th className="py-3.5 px-4 font-semibold text-center">Estado</th>
                <th className="py-3.5 px-4 font-semibold text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-sans">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                      <span>Cargando comprobantes de pre-conciliación...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500 italic">
                    <div className="max-w-md mx-auto space-y-2">
                      <div className="w-10 h-10 rounded-2xl bg-slate-800/60 text-slate-400 flex items-center justify-center mx-auto">
                        <Receipt className="w-5 h-5" />
                      </div>
                      <div className="font-semibold text-slate-300 text-xs">
                        No hay comprobantes para este criterio de búsqueda o filtro.
                      </div>
                      <p className="text-[11px] text-slate-500 font-normal">
                        Las evidencias de pago recibidas en el chat de WhatsApp o cargadas manualmente aparecerán aquí para su análisis forense antes de afectar el libro mayor.
                      </p>
                      <button
                        onClick={onOpenNewOCRModal}
                        className="mt-2 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 text-xs font-semibold border border-purple-500/40 transition cursor-pointer min-h-[44px]"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Analizar un Comprobante Ahora</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => {
                  const isConciliado = p.estadoConciliacion === 'aprobado_conciliado';
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-800/40 transition group cursor-pointer"
                      onClick={() => onSelectRecord(p)}
                    >
                      {/* Miniatura */}
                      <td className="py-3 px-4">
                        <div className="w-12 h-12 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden relative shrink-0 flex items-center justify-center">
                          {p.comprobanteOriginalUrl ? (
                            <img
                              src={p.comprobanteOriginalUrl}
                              alt="Comprobante"
                              className="w-full h-full object-cover group-hover:scale-110 transition duration-200"
                            />
                          ) : (
                            <Receipt className="w-5 h-5 text-slate-600" />
                          )}
                          <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                            <Eye className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      </td>

                      {/* Fecha & Tipo */}
                      <td className="py-3 px-4">
                        <div className="font-mono text-white text-xs">{p.fechaComprobante || 'N/A'}</div>
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700 mt-0.5">
                          {p.tipoComprobante}
                        </span>
                      </td>

                      {/* Remitente / Cliente Sugerido */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">
                          {p.clienteNombreSugerido || p.telefonoNombreEmisor || 'Remitente no asignado'}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
                          {p.rifCedula && <span>RIF: {p.rifCedula}</span>}
                          {p.whatsappMessageIdOrigen && (
                            <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-1 rounded">
                              WhatsApp
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Banco & Referencia */}
                      <td className="py-3 px-4 font-mono">
                        <div className="text-white font-bold">{p.referenciaNormalizada || p.numeroReferencia || 'S/R'}</div>
                        <div className="text-[11px] text-slate-400 font-sans">{p.bancoEmisor || 'Banco no especificado'}</div>
                      </td>

                      {/* Monto Original */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-200">
                        {p.monedaOriginal === 'USD' ? '$' : 'Bs. '}
                        {p.montoOriginal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Equivalente USD */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                        ${p.montoEquivalenteUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <div className="text-[10px] text-slate-500 font-sans font-normal">
                          Tasa: Bs. {p.tasaBcvSnapshot.toFixed(2)}
                        </div>
                      </td>

                      {/* Semáforo de Veracidad */}
                      <td className="py-3 px-4 text-center">
                        {renderVeracityBadge(p.dictamenVeracidad?.veredicto, p.dictamenVeracidad?.score)}
                      </td>

                      {/* Estado */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                            isConciliado
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                              : 'bg-amber-950 text-amber-300 border border-amber-700'
                          }`}
                        >
                          {isConciliado ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>Conciliado</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3 text-amber-400" />
                              <span>Pendiente</span>
                            </>
                          )}
                        </span>
                      </td>

                      {/* Acción */}
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onSelectRecord(p)}
                          className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ml-auto ${
                            isConciliado
                              ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                              : 'bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-950/40'
                          }`}
                        >
                          <span>{isConciliado ? 'Ver Registro' : 'Revisar y Conciliar'}</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
