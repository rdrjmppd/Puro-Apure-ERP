import React from 'react';
import { Receipt, Plus, CheckCheck } from 'lucide-react';
import { PaymentReconciliation } from '../../types/finance';

interface ReconciliationTabProps {
  reconciliations: PaymentReconciliation[];
  recFiltroEstado: 'TODOS' | 'CONCILIADO' | 'PENDIENTE';
  setRecFiltroEstado: (estado: 'TODOS' | 'CONCILIADO' | 'PENDIENTE') => void;
  onOpenReconciliation: () => void;
}

export const ReconciliationTab: React.FC<ReconciliationTabProps> = ({
  reconciliations,
  recFiltroEstado,
  setRecFiltroEstado,
  onOpenReconciliation,
}) => {
  const filteredList = reconciliations.filter(
    (r) => recFiltroEstado === 'TODOS' || r.estado === recFiltroEstado
  );

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Receipt className="w-4 h-4 text-purple-400" />
            <span>Conciliación de Pagos &amp; Deducción de Deuda</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Cruce atómico de cobros contra facturas de lotes biológicos, abonos a créditos, retenciones SENIAT y compensación dual.
          </p>
        </div>
        <button
          onClick={onOpenReconciliation}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition flex items-center gap-2 shadow-lg shadow-purple-950/40"
        >
          <Plus className="w-4 h-4" />
          <span>+ Nueva Conciliación / Abono</span>
        </button>
      </div>

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
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  recFiltroEstado === st
                    ? 'bg-purple-600 text-white shadow-sm'
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
                    No hay conciliaciones de pago registradas con este criterio. Presione "+ Nueva Conciliación / Abono" para procesar una cobranza.
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
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        r.modalidad === 'CREDITO' ? 'bg-blue-950 text-blue-300 border border-blue-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      }`}>
                        {r.modalidad}
                      </span>
                      <div className="text-[10px] text-slate-400 mt-0.5">{r.metodoPago}</div>
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
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center justify-center gap-1 mx-auto ${
                        r.estado === 'CONCILIADO'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                          : 'bg-amber-950 text-amber-300 border border-amber-700'
                      }`}>
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
  );
};
