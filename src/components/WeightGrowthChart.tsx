import React, { useState, useMemo } from 'react';
import {
  BiologicalBatch,
  FarmBiologicalControl,
  StandardGrowthPoint,
} from '../types/inventory';
import {
  AVIAN_STANDARD_CURVE,
  PORCINE_STANDARD_CURVE,
  getExpectedWeight,
  evaluateGrowthDeviation,
} from '../services/inventoryService';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Scale,
  Plus,
  Info,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
} from 'lucide-react';

interface WeightGrowthChartProps {
  batch: BiologicalBatch;
  controls: FarmBiologicalControl[];
  onAddControl?: (data: {
    batchId: string;
    batchCode: string;
    species: BiologicalBatch['species'];
    date: string;
    weightKg: number;
    observations: string;
  }) => Promise<void>;
}

export const WeightGrowthChart: React.FC<WeightGrowthChartProps> = ({
  batch,
  controls,
  onAddControl,
}) => {
  const isAvian = batch.species === 'AVICOLA';
  const isExternal = batch.tipoIngreso === 'ADQUISICION_EXTERNA';

  // Calibración de Origen Cartesiano (Spec-Driven Fase 2):
  // Si es ADQUISICION_EXTERNA, los ejes X e Y parten de edadInicialDias y pesoInicialKg
  const initialAge = (isExternal && batch.edadInicialDias && batch.edadInicialDias > 0)
    ? Math.min(batch.edadInicialDias, isAvian ? 39 : 149)
    : 1;
  const initialWeight = (isExternal && batch.pesoInicialKg && batch.pesoInicialKg > 0)
    ? batch.pesoInicialKg
    : 0;

  const maxDays = isAvian ? 40 : 150;
  const maxWeightKg = isAvian ? 3.2 : 130;

  // Filter and sort weight controls for this batch
  const weightControls = useMemo(() => {
    return controls
      .filter((c) => c.batchId === batch.id && c.type === 'PESAJE' && c.metricValue > 0)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [controls, batch.id]);

  // Compute points with day in cycle and comparison
  const plotData = useMemo(() => {
    const startDate = new Date(batch.startDate).getTime();

    const loggedPoints = weightControls.map((ctrl) => {
      const recordDate = new Date(ctrl.date).getTime();
      const elapsedDays = Math.max(0, Math.round((recordDate - startDate) / (1000 * 60 * 60 * 24)));
      const diffDays = Math.max(
        initialAge,
        Math.min(maxDays, isExternal ? initialAge + elapsedDays : elapsedDays + 1)
      );
      const evaluation = evaluateGrowthDeviation(batch.species, diffDays, ctrl.metricValue);

      return {
        id: ctrl.id,
        date: ctrl.date,
        day: diffDays,
        actualKg: ctrl.metricValue,
        expectedKg: evaluation.expectedKg,
        deviationPercent: evaluation.deviationPercent,
        isLagging: evaluation.isLagging,
        severity: evaluation.severity,
        recommendation: evaluation.recommendation,
        worker: ctrl.responsibleWorker,
        observations: ctrl.observations,
        isOriginPoint: false,
      };
    });

    // Si es Adquisición Externa con peso inicial registrado, inyectar el punto de origen inicial
    if (isExternal && initialWeight > 0) {
      const hasInitialPoint = loggedPoints.some((p) => p.day === initialAge);
      if (!hasInitialPoint) {
        const evaluation = evaluateGrowthDeviation(batch.species, initialAge, initialWeight);
        const originPoint = {
          id: `origin_${batch.id}`,
          date: batch.startDate,
          day: initialAge,
          actualKg: initialWeight,
          expectedKg: evaluation.expectedKg,
          deviationPercent: evaluation.deviationPercent,
          isLagging: evaluation.isLagging,
          severity: evaluation.severity,
          recommendation: evaluation.recommendation,
          worker: 'Recepción Externa',
          observations: `Punto de partida de compra (Raza: ${batch.razaLineaGenetica || 'N/A'}, Sexo: ${batch.sexo || 'N/A'})`,
          isOriginPoint: true,
        };
        return [originPoint, ...loggedPoints].sort((a, b) => a.day - b.day);
      }
    }

    return loggedPoints;
  }, [
    weightControls,
    batch.startDate,
    batch.species,
    batch.id,
    batch.razaLineaGenetica,
    batch.sexo,
    maxDays,
    isExternal,
    initialAge,
    initialWeight,
  ]);

  // Latest analysis
  const latestPoint = plotData.length > 0 ? plotData[plotData.length - 1] : null;

  // Form states for quick daily logging
  const [quickDate, setQuickDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [quickWeight, setQuickWeight] = useState<number>(() => {
    const currentDay = Math.min(maxDays, isExternal ? initialAge + (batch.daysInCycle || 0) : (batch.daysInCycle || 1));
    return getExpectedWeight(batch.species, currentDay);
  });
  const [quickObs, setQuickObs] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<string | null>(null);

  // SVG dimensions & scales
  const svgWidth = 640;
  const svgHeight = 280;
  const padLeft = 54;
  const padRight = 30;
  const padTop = 30;
  const padBottom = 40;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  // Escala Eje X: parte desde initialAge si es Adquisición Externa
  const getX = (day: number) => {
    if (isExternal && initialAge > 1) {
      const range = maxDays - initialAge;
      if (range <= 0) return padLeft;
      const progress = Math.max(0, Math.min(1, (day - initialAge) / range));
      return padLeft + progress * chartW;
    }
    return padLeft + (day / maxDays) * chartW;
  };

  // Escala Eje Y: parte desde initialWeight si es Adquisición Externa con peso inicial registrado
  const getY = (kg: number) => {
    if (isExternal && initialWeight > 0) {
      const range = maxWeightKg - initialWeight;
      if (range <= 0) return padTop + chartH;
      const progress = Math.max(0, Math.min(1, (kg - initialWeight) / range));
      return padTop + chartH - progress * chartH;
    }
    return padTop + chartH - (kg / maxWeightKg) * chartH;
  };

  // Curva estándar ajustada al rango visible
  const standardCurve = useMemo(() => {
    const rawCurve = isAvian ? AVIAN_STANDARD_CURVE : PORCINE_STANDARD_CURVE;
    if (!isExternal || initialAge <= 1) return rawCurve;

    const filtered = rawCurve.filter((p) => p.day >= initialAge);
    const hasExact = filtered.some((p) => p.day === initialAge);
    if (!hasExact) {
      const expectedAtOrigin = getExpectedWeight(batch.species, initialAge);
      const originStandard: StandardGrowthPoint = {
        day: initialAge,
        expectedWeightKg: expectedAtOrigin,
        minAcceptableKg: Number((expectedAtOrigin * 0.9).toFixed(3)),
        maxAcceptableKg: Number((expectedAtOrigin * 1.1).toFixed(3)),
      };
      return [originStandard, ...filtered].sort((a, b) => a.day - b.day);
    }
    return filtered;
  }, [isAvian, isExternal, initialAge, batch.species]);

  const standardPathD = useMemo(() => {
    return standardCurve.reduce((acc, pt, index) => {
      const x = getX(pt.day);
      const y = getY(pt.expectedWeightKg);
      return index === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
    }, '');
  }, [standardCurve, getX, getY]);

  // Actual weights path
  const actualPathD = useMemo(() => {
    if (plotData.length === 0) return '';
    return plotData.reduce((acc, pt, index) => {
      const x = getX(pt.day);
      const y = getY(pt.actualKg);
      return index === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
    }, '');
  }, [plotData, getX, getY]);

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddControl) return;
    if (quickWeight <= 0) return;

    setIsSubmitting(true);
    setSubmitFeedback(null);
    try {
      await onAddControl({
        batchId: batch.id,
        batchCode: batch.code,
        species: batch.species,
        date: quickDate,
        weightKg: Number(quickWeight),
        observations: quickObs.trim() || 'Control diario de peso longitudinal',
      });
      setSubmitFeedback('Pesaje asentado y graficado exitosamente.');
      setQuickObs('');
    } catch (err) {
      setSubmitFeedback('Error al guardar pesaje.');
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setSubmitFeedback(null), 4000);
    }
  };

  // Cálculo de marcas de los ejes X e Y
  const xAxisTicks = useMemo(() => {
    const defaultTicks = isAvian ? [1, 7, 14, 21, 28, 35, 40] : [1, 30, 60, 90, 120, 150];
    if (!isExternal || initialAge <= 1) return defaultTicks;
    const ticksAfter = defaultTicks.filter((d) => d > initialAge);
    return [initialAge, ...ticksAfter];
  }, [isAvian, isExternal, initialAge]);

  const yAxisTicks = useMemo(() => {
    if (isExternal && initialWeight > 0) {
      const diff = maxWeightKg - initialWeight;
      return [
        initialWeight,
        Number((initialWeight + diff * 0.33).toFixed(1)),
        Number((initialWeight + diff * 0.66).toFixed(1)),
        maxWeightKg,
      ];
    }
    return [0.25, 0.5, 0.75, 1.0].map((r) => Number((maxWeightKg * r).toFixed(isAvian ? 1 : 0)));
  }, [isExternal, initialWeight, maxWeightKg, isAvian]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-6">
      {/* Header with Batch Info & Status */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Scale className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white tracking-tight">
              Control Longitudinal de Peso — Lote {batch.code}
            </h3>
            <span
              className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold ${
                isAvian
                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                  : 'bg-pink-950 text-pink-300 border border-pink-800'
              }`}
            >
              {batch.species}
            </span>
            <span
              className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold flex items-center gap-1 ${
                isExternal
                  ? 'bg-blue-950 text-blue-300 border border-blue-800'
                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              {isExternal ? 'Adquisición Externa' : 'Nacimiento Granja'}
            </span>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Población: {batch.currentCount} animales • Ciclo actual: {batch.daysInCycle} días • Inicio: {batch.startDate}
            {isExternal && (
              <span className="text-cyan-400 font-semibold ml-2">
                • Origen: Día {initialAge}, {initialWeight} kg inicial ({batch.razaLineaGenetica || 'Genética estándar'}, {batch.sexo || 'Mixto'})
              </span>
            )}
          </p>
        </div>

        {/* Global Lag Indicator Badge */}
        {latestPoint ? (
          <div
            className={`px-3.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
              latestPoint.severity === 'CRITICO'
                ? 'bg-red-950/80 border-red-500 text-red-200'
                : latestPoint.severity === 'ALERTA'
                ? 'bg-amber-950/80 border-amber-500 text-amber-200'
                : 'bg-emerald-950/80 border-emerald-500 text-emerald-200'
            }`}
          >
            {latestPoint.isLagging ? (
              <>
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Retraso Ponderal: {latestPoint.deviationPercent}% vs. Estándar
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Crecimiento Óptimo: +{latestPoint.deviationPercent}% vs. Estándar
                </span>
              </>
            )}
          </div>
        ) : (
          <div className="text-xs font-mono text-slate-400 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
            Aún sin pesajes diarios registrados
          </div>
        )}
      </div>

      {/* Lag Alert Banner (If deviation < -5%) */}
      {latestPoint && latestPoint.isLagging && (
        <div className="p-4 rounded-2xl bg-amber-950/50 border border-amber-500/50 text-amber-200 flex items-start gap-3 text-xs animate-fadeIn">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-amber-300">
              Alerta Zootécnica: Retraso de Ganancia Diaria de Peso ({latestPoint.deviationPercent}% respecto a la curva de referencia)
            </div>
            <p className="text-amber-200/90 leading-relaxed font-sans">
              <strong>Diagnóstico zootécnico:</strong> {latestPoint.recommendation}
            </p>
            <p className="text-[11px] font-mono text-amber-400/80">
              Último pesaje: {latestPoint.actualKg} kg (Esperado: {latestPoint.expectedKg} kg en Día {latestPoint.day}) • Registrado por: {latestPoint.worker}
            </p>
          </div>
        </div>
      )}

      {/* SVG Chart Layout */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 bg-cyan-400 inline-block border-t border-cyan-400 border-dashed" />
              <span>Curva Estándar Parametrizada ({isAvian ? 'Cobb 500 / Ross 308' : 'Ceba Porcina'})</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-1 bg-emerald-400 inline-block rounded-full" />
              <span className="text-emerald-300 font-semibold">Pesaje Real Diario</span>
            </span>
          </div>
          <span className="font-mono text-[11px]">Eje Y: kg/animal • Eje X: Día de Ciclo</span>
        </div>

        {/* Vectorial SVG Graph Container */}
        <div className="w-full overflow-x-auto bg-slate-950 rounded-2xl border border-slate-800 p-2">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-auto min-w-[580px] max-h-[300px]"
          >
            {/* Background Grid Lines & Y-axis labels (calibrados según origen inicial) */}
            {yAxisTicks.map((val) => {
              const y = getY(val);
              return (
                <g key={val}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={padLeft + chartW}
                    y2={y}
                    stroke="#1e293b"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 4}
                    fill={isExternal && val === initialWeight ? '#38bdf8' : '#64748b'}
                    fontWeight={isExternal && val === initialWeight ? 'bold' : 'normal'}
                    fontSize="10"
                    textAnchor="end"
                    fontFamily="monospace"
                  >
                    {val}kg{isExternal && val === initialWeight ? '₀' : ''}
                  </text>
                </g>
              );
            })}

            {/* X-axis ticks (calibrados partiendo de edadInicialDias si es Adquisición Externa) */}
            {xAxisTicks.map((day) => {
              const x = getX(day);
              const isOriginTick = isExternal && day === initialAge;
              return (
                <g key={day}>
                  <line
                    x1={x}
                    y1={padTop + chartH}
                    x2={x}
                    y2={padTop + chartH + 5}
                    stroke={isOriginTick ? '#38bdf8' : '#475569'}
                  />
                  <text
                    x={x}
                    y={padTop + chartH + 18}
                    fill={isOriginTick ? '#38bdf8' : '#64748b'}
                    fontWeight={isOriginTick ? 'bold' : 'normal'}
                    fontSize="10"
                    textAnchor="middle"
                    fontFamily="monospace"
                  >
                    D{day}{isOriginTick ? '₀' : ''}
                  </text>
                </g>
              );
            })}

            {/* Axes */}
            <line
              x1={padLeft}
              y1={padTop}
              x2={padLeft}
              y2={padTop + chartH}
              stroke="#334155"
              strokeWidth="1.5"
            />
            <line
              x1={padLeft}
              y1={padTop + chartH}
              x2={padLeft + chartW}
              y2={padTop + chartH}
              stroke="#334155"
              strokeWidth="1.5"
            />

            {/* Standard Curve Line (Dashed Cyan) */}
            <path
              d={standardPathD}
              fill="none"
              stroke="#06b6d4"
              strokeWidth="2"
              strokeDasharray="5 4"
              opacity="0.8"
            />

            {/* Standard Curve Control Dots */}
            {standardCurve.map((pt) => (
              <circle
                key={pt.day}
                cx={getX(pt.day)}
                cy={getY(pt.expectedWeightKg)}
                r="3"
                fill="#0891b2"
              />
            ))}

            {/* Real Recorded Data Path (Solid Line) */}
            {actualPathD && (
              <path
                d={actualPathD}
                fill="none"
                stroke={latestPoint?.isLagging ? '#f59e0b' : '#10b981'}
                strokeWidth="3"
              />
            )}

            {/* Real Recorded Data Points */}
            {plotData.map((pt) => {
              const cx = getX(pt.day);
              const cy = getY(pt.actualKg);
              const fillColor = pt.isLagging ? '#ef4444' : '#10b981';

              return (
                <g key={pt.id} className="cursor-pointer group">
                  <circle
                    cx={cx}
                    cy={cy}
                    r="5"
                    fill={fillColor}
                    stroke="#0f172a"
                    strokeWidth="2"
                  />
                  {/* Tooltip on hover */}
                  <text
                    x={cx}
                    y={cy - 10}
                    fill="#ffffff"
                    fontSize="10"
                    fontWeight="bold"
                    textAnchor="middle"
                    className="opacity-90 font-mono"
                  >
                    {pt.actualKg}kg
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Fast Daily Weight Entry Panel */}
      {onAddControl && (
        <form
          onSubmit={handleQuickSubmit}
          className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>Registrar Pesaje Diario de Lote</span>
            </h4>
            <span className="text-[11px] font-mono text-slate-400">
              Actualiza automáticamente la curva de crecimiento
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Fecha del Pesaje
              </label>
              <input
                type="date"
                required
                value={quickDate}
                onChange={(e) => setQuickDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Peso Registrado ({isAvian ? 'kg/ave' : 'kg/cerdo'})
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={quickWeight}
                onChange={(e) => setQuickWeight(Number(e.target.value))}
                placeholder={isAvian ? 'Ej. 2.15' : 'Ej. 75.0'}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Observaciones Sanitarias / Galpón
              </label>
              <input
                type="text"
                value={quickObs}
                onChange={(e) => setQuickObs(e.target.value)}
                placeholder="Ej. Galpón 4, lote uniforme, buen consumo"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            {submitFeedback ? (
              <span className="text-xs font-mono text-emerald-400 font-bold">
                {submitFeedback}
              </span>
            ) : (
              <span className="text-[11px] text-slate-500 font-mono">
                Se contrastará inmediatamente contra la curva Cobb 500 / Ceba Porcina
              </span>
            )}

            <button
              type="submit"
              disabled={isSubmitting || quickWeight <= 0}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-md transition active:scale-95"
            >
              <Scale className="w-4 h-4" />
              <span>{isSubmitting ? 'Guardando...' : 'Asentar Pesaje Diario'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
