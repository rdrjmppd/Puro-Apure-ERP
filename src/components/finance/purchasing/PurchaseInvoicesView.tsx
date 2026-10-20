import React, { useState, useMemo } from 'react';
import {
  FileText,
  DollarSign,
  AlertTriangle,
  Clock,
  Plus,
  Receipt,
  XCircle,
  Search,
  Filter,
  Info,
} from 'lucide-react';
import { PurchaseInvoice, EstadoVencimiento } from '../../../types/purchasing';
import { AlertLevelBadge } from './AlertLevelBadge';
import { evaluatePayableInvoice, getTodayLocalDateString } from '../../../services/supplyAlertService';
import { centsRound } from '../../../services/financialAnalyticsService';
import { PurchasingService } from '../../../services/purchasingService';

interface PurchaseInvoicesViewProps {
  invoices: PurchaseInvoice[];
  bcvRate: number;
  onNewPurchase: () => void;
  onOpenPayment: (invoice: PurchaseInvoice) => void;
  userId: string;
}

export const PurchaseInvoicesView: React.FC<PurchaseInvoicesViewProps> = ({
  invoices,
  bcvRate,
  onNewPurchase,
  onOpenPayment,
  userId,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBucket, setFilterBucket] = useState<'TODAS' | EstadoVencimiento | 'PAGADAS'>('TODAS');
  const [adjustingInvoice, setAdjustingInvoice] = useState<PurchaseInvoice | null>(null);
  const [lateFeeAmount, setLateFeeAmount] = useState<number>(0);
  const [lateFeeReason, setLateFeeReason] = useState<string>('');

  const todayStr = useMemo(() => getTodayLocalDateString(), []);

  // Evaluaciones reactivas
  const evaluatedInvoices = useMemo(() => {
    return invoices.map((inv) => ({
      invoice: inv,
      evaluation: evaluatePayableInvoice(inv, todayStr),
    }));
  }, [invoices, todayStr]);

  // Totales para KPIs
  const kpis = useMemo(() => {
    let totalPorPagarUSD = 0;
    let totalVencidoUSD = 0;
    let totalPorVencer7dUSD = 0;
    let totalMoraProyectadaUSD = 0;

    for (const item of evaluatedInvoices) {
      const inv = item.invoice;
      const ev = item.evaluation;
      if (inv.estadoPago === 'PAGADA' || inv.estadoPago === 'ANULADA' || inv.saldoPendienteUSD <= 0) {
        continue;
      }
      totalPorPagarUSD += inv.saldoPendienteUSD;
      if (ev.estadoVencimiento === 'VENCIDA' || ev.estadoVencimiento === 'EN_GRACIA') {
        totalVencidoUSD += inv.saldoPendienteUSD;
        totalMoraProyectadaUSD += ev.moraProyectadaUSD + ev.penalizacionFijaUSD;
      } else if (ev.estadoVencimiento === 'POR_VENCER' || ev.estadoVencimiento === 'VENCE_HOY') {
        if (ev.diasRestantes <= 7) {
          totalPorVencer7dUSD += inv.saldoPendienteUSD;
        }
      }
    }

    return {
      totalPorPagarUSD: centsRound(totalPorPagarUSD),
      totalVencidoUSD: centsRound(totalVencidoUSD),
      totalPorVencer7dUSD: centsRound(totalPorVencer7dUSD),
      totalMoraProyectadaUSD: centsRound(totalMoraProyectadaUSD),
      totalMoraRiesgoUSD: centsRound(totalMoraProyectadaUSD),
    };
  }, [evaluatedInvoices]);

  // Filtrado de la tabla
  const filteredList = useMemo(() => {
    return evaluatedInvoices.filter((item) => {
      const inv = item.invoice;
      const ev = item.evaluation;

      // Filtro de texto
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesNumber = inv.numeroFacturaProveedor.toLowerCase().includes(q);
        const matchesName = inv.proveedorNombre.toLowerCase().includes(q);
        const matchesRif = inv.proveedorRif.toLowerCase().includes(q);
        if (!matchesNumber && !matchesName && !matchesRif) return false;
      }

      // Filtro de estado / bucket
      if (filterBucket === 'TODAS') return true;
      if (filterBucket === 'PAGADAS') return inv.estadoPago === 'PAGADA';
      if (inv.estadoPago === 'PAGADA' || inv.estadoPago === 'ANULADA') return false;
      return ev.estadoVencimiento === filterBucket;
    });
  }, [evaluatedInvoices, searchTerm, filterBucket]);

  const handleApplyLateFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingInvoice || lateFeeAmount <= 0) return;
    try {
      await PurchasingService.applyLateFeeAdjustment(
        adjustingInvoice.id,
        lateFeeAmount,
        lateFeeReason,
        userId
      );
      setAdjustingInvoice(null);
      setLateFeeAmount(0);
      setLateFeeReason('');
    } catch (err: any) {
      alert(`Error al aplicar recargo: ${err.message}`);
    }
  };

  const handleAnnulInvoice = async (invoice: PurchaseInvoice) => {
    const reason = prompt(`Indique el motivo de anulación para la factura #${invoice.numeroFacturaProveedor}:`);
    if (!reason || !reason.trim()) return;
    try {
      await PurchasingService.annulPurchaseInvoice(invoice.id, reason.trim(), userId);
    } catch (err: any) {
      alert(`No se pudo anular: ${err.message}`);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Barra Superior */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-400" />
            <span>Gestión de Compras y Cuentas por Pagar a Proveedores (CxP)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Control de facturas comerciales, días calle, proyecciones de mora y liquidaciones bimonetarias
          </p>
        </div>
        <button
          onClick={onNewPurchase}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition flex items-center gap-2 shadow-lg shadow-emerald-950/40"
        >
          <Plus className="w-4 h-4" />
          <span>+ Registrar Compra / Factura</span>
        </button>
      </div>

      {/* Tarjetas KPI de Cuentas por Pagar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow">
          <div className="text-xs text-slate-400 font-semibold uppercase flex items-center justify-between">
            <span>Total por Pagar (CxP)</span>
            <DollarSign className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="text-xl font-bold font-mono text-white mt-1">
            ${kpis.totalPorPagarUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
            Bs. {(kpis.totalPorPagarUSD * bcvRate).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="p-4 bg-slate-900 border border-red-950/60 rounded-2xl shadow">
          <div className="text-xs text-red-300 font-semibold uppercase flex items-center justify-between">
            <span>Deuda Vencida (Alerta Roja)</span>
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
          </div>
          <div className="text-xl font-bold font-mono text-red-400 mt-1">
            ${kpis.totalVencidoUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-red-500/80 font-mono mt-0.5">
            Riesgo de corte o bloqueo de suministros
          </div>
        </div>

        <div className="p-4 bg-slate-900 border border-amber-950/60 rounded-2xl shadow">
          <div className="text-xs text-amber-300 font-semibold uppercase flex items-center justify-between">
            <span>Por Vencer (&le; 7 días)</span>
            <Clock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-400 mt-1">
            ${kpis.totalPorVencer7dUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
            Requiere programación de tesorería
          </div>
        </div>

        <div className="p-4 bg-slate-900 border border-purple-950/60 rounded-2xl shadow">
          <div className="text-xs text-purple-300 font-semibold uppercase flex items-center justify-between">
            <span>Riesgo Mora Proyectada</span>
            <Info className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-xl font-bold font-mono text-purple-400 mt-1">
            +${kpis.totalMoraRiesgoUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
            Estimado acumulado si no se liquida
          </div>
        </div>
      </div>

      {/* Filtros y Búsqueda */}
      <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-1 max-w-sm bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por N° Factura, proveedor o RIF..."
            className="bg-transparent border-none outline-none text-white text-xs w-full font-mono placeholder:font-sans placeholder:text-slate-500"
          />
        </div>

        {/* Píldoras de Filtro */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {(['TODAS', 'VENCIDA', 'EN_GRACIA', 'VENCE_HOY', 'POR_VENCER', 'AL_DIA', 'PAGADAS'] as const).map((b) => (
            <button
              key={b}
              onClick={() => setFilterBucket(b)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition whitespace-nowrap font-mono ${
                filterBucket === b
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla de Facturas */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 uppercase tracking-wider text-[11px] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Factura / Control</th>
                <th className="py-3 px-4 font-semibold">Proveedor & RIF</th>
                <th className="py-3 px-4 font-semibold">Emisión / Vence</th>
                <th className="py-3 px-4 font-semibold">Estado & Semáforo</th>
                <th className="py-3 px-4 font-semibold text-right">Total Factura</th>
                <th className="py-3 px-4 font-semibold text-right">Saldo Pendiente</th>
                <th className="py-3 px-4 font-semibold text-right">Mora Proyectada</th>
                <th className="py-3 px-4 font-semibold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500 font-sans italic">
                    No se encontraron facturas con los filtros seleccionados. Pulse "+ Registrar Compra / Factura" para cargar una nueva.
                  </td>
                </tr>
              ) : (
                filteredList.map((item) => {
                  const inv = item.invoice;
                  const ev = item.evaluation;
                  const isPagada = inv.estadoPago === 'PAGADA';
                  const isAnulada = inv.estadoPago === 'ANULADA';

                  return (
                    <tr key={inv.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 font-bold text-white">
                        <div>#{inv.numeroFacturaProveedor}</div>
                        {inv.numeroControl && (
                          <div className="text-[10px] text-slate-400 font-sans">
                            Control: {inv.numeroControl}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-sans">
                        <div className="font-bold text-slate-200">{inv.proveedorNombre}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{inv.proveedorRif}</div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 font-sans">
                        <div>Emitida: {inv.fechaEmision}</div>
                        <div className="text-white font-semibold flex items-center gap-1 font-mono text-[11px]">
                          Vence: {inv.fechaVencimiento}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {isPagada ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                            PAGADA
                          </span>
                        ) : isAnulada ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-950 text-slate-500 border border-slate-800">
                            ANULADA
                          </span>
                        ) : (
                          <AlertLevelBadge
                            estadoVencimiento={ev.estadoVencimiento}
                            diasRestantes={ev.diasRestantes}
                          />
                        )}
                        {inv.notaRiesgoManual && (
                          <div className="text-[10px] text-amber-400/90 font-sans mt-0.5 truncate max-w-[180px]" title={inv.notaRiesgoManual}>
                            ⚠ {inv.notaRiesgoManual}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-200">
                        ${inv.totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        <div className="text-[10px] text-slate-500 font-sans">
                          Bs. {inv.totalVES.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold">
                        <span className={inv.saldoPendienteUSD > 0 ? 'text-amber-400' : 'text-slate-500'}>
                          ${inv.saldoPendienteUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                        {inv.saldoPendienteUSD > 0 && (
                          <div className="text-[10px] text-cyan-400/80">
                            Bs. {(inv.saldoPendienteUSD * bcvRate).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {ev.moraProyectadaUSD > 0 || ev.penalizacionFijaUSD > 0 ? (
                          <div className="text-red-400 font-bold">
                            +${(ev.moraProyectadaUSD + ev.penalizacionFijaUSD).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            <div className="text-[9px] text-red-500/80 font-sans">
                              {inv.condicionesAplicadas?.tasaMoraPorcentaje}% {inv.condicionesAplicadas?.periodicidadMora}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-600 font-mono text-[11px]">$0.00</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {!isPagada && !isAnulada && inv.saldoPendienteUSD > 0 && (
                            <button
                              onClick={() => onOpenPayment(inv)}
                              className="px-2.5 py-1.5 rounded-lg bg-purple-950 hover:bg-purple-900 text-purple-300 border border-purple-800 font-sans text-xs flex items-center gap-1 shadow transition"
                              title="Registrar pago o abono"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              <span>Abonar</span>
                            </button>
                          )}

                          {!isPagada && !isAnulada && (
                            <button
                              onClick={() => {
                                setAdjustingInvoice(inv);
                                setLateFeeAmount(ev.moraProyectadaUSD + ev.penalizacionFijaUSD || 5);
                              }}
                              className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-sans text-xs transition"
                              title="Aplicar recargo de mora formal al saldo"
                            >
                              <span>+ Recargo</span>
                            </button>
                          )}

                          {!isPagada && !isAnulada && (!inv.pagosIds || inv.pagosIds.length === 0) && (
                            <button
                              onClick={() => handleAnnulInvoice(inv)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition"
                              title="Anular factura sin pagos"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal para Aplicar Recargo de Mora Manualmente */}
      {adjustingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <form
            onSubmit={handleApplyLateFee}
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-5 space-y-3.5 shadow-2xl animate-fadeIn text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="font-bold text-white uppercase tracking-wider text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Aplicar Recargo de Mora a Factura</span>
              </h3>
              <button
                type="button"
                onClick={() => setAdjustingInvoice(null)}
                className="text-slate-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <div className="text-slate-300">
              Factura #{adjustingInvoice.numeroFacturaProveedor} • {adjustingInvoice.proveedorNombre}
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Monto de Recargo en Dólares ($ USD)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={lateFeeAmount}
                onChange={(e) => setLateFeeAmount(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold text-sm outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Motivo / Justificación del Recargo</label>
              <input
                type="text"
                value={lateFeeReason}
                onChange={(e) => setLateFeeReason(e.target.value)}
                placeholder="ej. Penalización pactada por 15 días de retraso"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setAdjustingInvoice(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition shadow"
              >
                Confirmar y Sumar a Saldo
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
