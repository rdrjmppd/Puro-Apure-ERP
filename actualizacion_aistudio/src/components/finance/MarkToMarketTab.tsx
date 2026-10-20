import React from 'react';
import { Sliders } from 'lucide-react';
import { MarkToMarketResult } from '../../types/finance';

interface MarkToMarketTabProps {
  manualRateInput: number;
  setManualRateInput: (val: number) => void;
  markToMarketRows: MarkToMarketResult[];
}

export const MarkToMarketTab: React.FC<MarkToMarketTabProps> = ({
  manualRateInput,
  setManualRateInput,
  markToMarketRows,
}) => {
  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span>Simulador de Estrés Cambiario Mark-to-Market</span>
          </h3>
          <p className="text-[11px] text-slate-400">
            Ajuste la tasa simulada para evaluar la pérdida o ganancia por devaluación en pasivos o activos congelados.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-slate-400">Tasa Simulada:</span>
          <input
            type="number"
            step="0.1"
            value={manualRateInput}
            onChange={(e) => setManualRateInput(Number(e.target.value))}
            className="w-28 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white font-bold text-xs"
          />
          <span className="text-slate-400">VES/USD</span>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 uppercase tracking-wider text-[11px] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Referencia</th>
                <th className="py-3.5 px-4 font-semibold">Entidad</th>
                <th className="py-3.5 px-4 font-semibold text-right">Monto Original USD</th>
                <th className="py-3.5 px-4 font-semibold text-right">Tasa Congelada</th>
                <th className="py-3.5 px-4 font-semibold text-right">Tasa Simulada</th>
                <th className="py-3.5 px-4 font-semibold text-right">Monto Revaluado USD</th>
                <th className="py-3.5 px-4 font-semibold text-right">Delta Devaluación USD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {markToMarketRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 font-sans italic">
                    No hay pagos congelados para evaluar.
                  </td>
                </tr>
              ) : (
                markToMarketRows.map((row: MarkToMarketResult) => (
                  <tr key={row.paymentId} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-bold text-white font-mono">
                      {row.reference}
                    </td>
                    <td className="py-3.5 px-4 font-sans text-slate-300">
                      {row.entityName}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      ${row.originalAmountUSD.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-400">
                      {row.frozenRate.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-right text-cyan-400 font-bold">
                      {row.simulatedRate.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-right text-white font-bold">
                      ${row.revaluedAmountUSD.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-right text-amber-400 font-bold">
                      -${row.devaluationDeltaUSD.toFixed(2)} ({row.devaluationPercentage.toFixed(1)}%)
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
