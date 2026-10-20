import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { NivelAlarma, EstadoVencimiento } from '../../../types/purchasing';

interface AlertLevelBadgeProps {
  nivel?: NivelAlarma;
  estadoVencimiento?: EstadoVencimiento;
  diasRestantes?: number;
  compact?: boolean;
}

export const AlertLevelBadge: React.FC<AlertLevelBadgeProps> = ({
  nivel,
  estadoVencimiento,
  diasRestantes,
  compact = false,
}) => {
  if (nivel) {
    switch (nivel) {
      case 'ROJO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-950/90 text-red-300 border border-red-700/80 font-mono shadow-sm animate-pulse">
            <AlertCircle className="w-3 h-3 text-red-400" />
            <span>CRÍTICO (ROJO)</span>
          </span>
        );
      case 'AMARILLO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-700 font-mono shadow-sm">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span>ALERTA (AMARILLO)</span>
          </span>
        );
      case 'VERDE':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800 font-mono">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>ÓPTIMO</span>
          </span>
        );
    }
  }

  if (estadoVencimiento) {
    switch (estadoVencimiento) {
      case 'VENCIDA':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-red-950 text-red-300 border border-red-800 font-mono">
            <AlertCircle className="w-3 h-3 text-red-400" />
            <span>VENCIDA {diasRestantes !== undefined ? `(${Math.abs(diasRestantes)}d)` : ''}</span>
          </span>
        );
      case 'EN_GRACIA':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-orange-950 text-orange-300 border border-orange-800 font-mono">
            <Clock className="w-3 h-3 text-orange-400" />
            <span>EN GRACIA</span>
          </span>
        );
      case 'VENCE_HOY':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-600 font-mono animate-pulse">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span>VENCE HOY</span>
          </span>
        );
      case 'POR_VENCER':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-yellow-950/80 text-yellow-300 border border-yellow-700 font-mono">
            <Clock className="w-3 h-3 text-yellow-400" />
            <span>POR VENCER {diasRestantes !== undefined ? `(${diasRestantes}d)` : ''}</span>
          </span>
        );
      case 'AL_DIA':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-950 text-slate-300 border border-slate-700 font-mono">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>AL DÍA</span>
          </span>
        );
    }
  }

  return null;
};
