import React from 'react';
import { ConcurrencyConflict } from '../types/inventory';
import { AlertTriangle, Clock, Cloud, Smartphone, Check, X, ShieldAlert } from 'lucide-react';

interface ConcurrencyConflictModalProps {
  conflict: ConcurrencyConflict | null;
  isOpen: boolean;
}

export const ConcurrencyConflictModal: React.FC<ConcurrencyConflictModalProps> = ({
  conflict,
  isOpen,
}) => {
  if (!isOpen || !conflict) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border-2 border-amber-500/50 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 text-slate-100 relative">
        {/* Header with Warning Indicator */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
              Modal de Bloqueo de Concurrencia • Spec Fase 2
            </span>
            <h2 className="text-lg font-bold text-white mt-1">
              Conflicto de Sincronización Detectado
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Otro terminal u operador sincronizó una versión más reciente en la nube para{' '}
              <strong className="text-emerald-400 font-mono">
                {conflict.entityName} ({conflict.entityId})
              </strong>.
            </p>
          </div>
        </div>

        {/* Timestamp Comparison */}
        <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-cyan-400 font-semibold uppercase tracking-wider">
              <Cloud className="w-3.5 h-3.5" />
              <span>Versión en la Nube (Prevalente)</span>
            </div>
            <div className="font-mono text-slate-300">
              {new Date(conflict.cloudTimestamp).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 font-mono truncate">
              Por: {conflict.cloudUpdatedBy || 'Terminal Remoto'}
            </div>
          </div>

          <div className="space-y-1 border-l border-slate-800 pl-3">
            <div className="flex items-center gap-1.5 text-amber-400 font-semibold uppercase tracking-wider">
              <Smartphone className="w-3.5 h-3.5" />
              <span>Tu Versión Local</span>
            </div>
            <div className="font-mono text-slate-300">
              {new Date(conflict.localTimestamp).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              En buffer local del cliente
            </div>
          </div>
        </div>

        {/* Differences Table */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Discrepancia de Campos:</span>
          </h3>
          <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
            {conflict.fieldDifferences.map((diff, idx) => (
              <div
                key={idx}
                className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5 flex items-center justify-between text-xs"
              >
                <span className="font-medium text-slate-300">{diff.label}</span>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40">
                    Nube: {String(diff.cloudValue)}
                  </span>
                  <span className="text-slate-600">➔</span>
                  <span className="text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
                    Local: {String(diff.localValue)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Instructions */}
        <p className="text-xs text-slate-400 leading-relaxed bg-slate-950/40 p-3 rounded-xl border border-slate-800/50">
          La política de integridad temporal otorga prioridad a la marca de tiempo más reciente de la nube.
          Para reemplazar el dato existente y sobrescribirlo con tu valor local, debes pulsar explícitamente el botón de confirmación.
        </p>

        {/* Actions (Strict Confirmation Required) */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={conflict.onCancel}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition flex items-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            <span>Descartar y Usar Dato de Nube</span>
          </button>
          <button
            type="button"
            onClick={conflict.onConfirmOverwrite}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white text-xs font-bold transition shadow-lg shadow-red-950/40 flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>Confirmar Sobrescritura</span>
          </button>
        </div>
      </div>
    </div>
  );
};
