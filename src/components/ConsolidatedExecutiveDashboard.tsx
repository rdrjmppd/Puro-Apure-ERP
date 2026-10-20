import React, { useState, useMemo, useEffect } from 'react';
import {
  BiologicalBatch,
  FarmBiologicalControl,
  InventoryItem,
  LivestockSpecies,
} from '../types/inventory';
import { PaymentRecord } from '../types/finance';
import { useBrand } from '../context/BrandContext';
import { InventoryService, evaluateGrowthDeviation } from '../services/inventoryService';
import { FinanceService } from '../services/financeService';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Package,
  DollarSign,
  Scale,
  Bird,
  Layers,
  Calendar,
  Filter,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  Clock,
  Wheat,
  Syringe,
  Sparkles,
} from 'lucide-react';

interface ConsolidatedExecutiveDashboardProps {
  onNavigateToModule?: (moduleId: string) => void;
}

export const ConsolidatedExecutiveDashboard: React.FC<ConsolidatedExecutiveDashboardProps> = ({
  onNavigateToModule,
}) => {
  const { logoUrl } = useBrand();
  // Real-time collections data
  const [batches, setBatches] = useState<BiologicalBatch[]>([]);
  const [controls, setControls] = useState<FarmBiologicalControl[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [bcvRate, setBcvRate] = useState<number>(42.50);

  // Dynamic Filters
  const [selectedSpecies, setSelectedSpecies] = useState<'TODAS' | LivestockSpecies>('TODAS');
  const [dateRangeFilter, setDateRangeFilter] = useState<'ULTIMOS_7_DIAS' | 'ULTIMOS_30_DIAS' | 'CICLO_ACTUAL' | 'TODO'>('CICLO_ACTUAL');

  // Subscriptions
  useEffect(() => {
    const unsubBatches = InventoryService.subscribeBatches((b) => setBatches(b));
    const unsubControls = InventoryService.subscribeFarmControls((c) => setControls(c));
    const unsubInv = InventoryService.subscribeInventory((i) => setInventory(i));
    const unsubPayments = FinanceService.subscribePayments((p) => setPayments(p));
    const unsubRate = FinanceService.subscribeLatestRate((r) => setBcvRate(r));

    FinanceService.fetchLatestBcvRate().then((r) => setBcvRate(r));

    return () => {
      unsubBatches();
      unsubControls();
      unsubInv();
      unsubPayments();
      unsubRate();
    };
  }, []);

  // Filter batches by species
  const filteredBatches = useMemo(() => {
    if (selectedSpecies === 'TODAS') return batches;
    return batches.filter((b) => b.species === selectedSpecies);
  }, [batches, selectedSpecies]);

  // Filter controls by species and date range
  const filteredControls = useMemo(() => {
    let result = controls;
    if (selectedSpecies !== 'TODAS') {
      result = result.filter((c) => c.species === selectedSpecies);
    }

    const now = Date.now();
    if (dateRangeFilter === 'ULTIMOS_7_DIAS') {
      const cut = now - 7 * 24 * 60 * 60 * 1000;
      result = result.filter((c) => new Date(c.date).getTime() >= cut);
    } else if (dateRangeFilter === 'ULTIMOS_30_DIAS') {
      const cut = now - 30 * 24 * 60 * 60 * 1000;
      result = result.filter((c) => new Date(c.date).getTime() >= cut);
    }
    return result;
  }, [controls, selectedSpecies, dateRangeFilter]);

  // ====================================================
  // KPI 1: GANANCIA DIARIA DE PESO (GDP) PROMEDIO
  // ====================================================
  const gdpStats = useMemo(() => {
    if (filteredBatches.length === 0) {
      return { avgGdpGrams: 0, status: 'NORMAL', countBatches: 0 };
    }

    let totalGdpGrams = 0;
    let evaluatedCount = 0;

    filteredBatches.forEach((b) => {
      if (b.daysInCycle > 0 && b.currentCount > 0) {
        const isAvian = b.species === 'AVICOLA';
        const initialWeightKg = isAvian ? 0.042 : 25.0; // peso al nacer o al destete
        const currentAvgWeightKg = b.grossWeightKg / b.currentCount;
        const gainKg = Math.max(0, currentAvgWeightKg - initialWeightKg);
        const gdpGrams = (gainKg / b.daysInCycle) * 1000;

        totalGdpGrams += gdpGrams;
        evaluatedCount++;
      }
    });

    const avgGdpGrams = evaluatedCount > 0 ? Number((totalGdpGrams / evaluatedCount).toFixed(1)) : 0;
    return {
      avgGdpGrams,
      evaluatedCount,
    };
  }, [filteredBatches]);

  // ====================================================
  // KPI 2: MORTALIDAD ACUMULADA POR LOTE / ESPECIE
  // ====================================================
  const mortalityStats = useMemo(() => {
    if (filteredBatches.length === 0) {
      return { totalLost: 0, mortalityRate: 0, survivalRate: 100, totalInitial: 0, totalCurrent: 0 };
    }

    let totalInitial = 0;
    let totalCurrent = 0;

    filteredBatches.forEach((b) => {
      totalInitial += b.initialCount;
      totalCurrent += b.currentCount;
    });

    const totalLost = Math.max(0, totalInitial - totalCurrent);
    const mortalityRate = totalInitial > 0 ? Number(((totalLost / totalInitial) * 100).toFixed(2)) : 0;
    const survivalRate = Number((100 - mortalityRate).toFixed(2));

    return {
      totalLost,
      mortalityRate,
      survivalRate,
      totalInitial,
      totalCurrent,
    };
  }, [filteredBatches]);

  // ====================================================
  // KPI 3: CONSUMO ACUMULADO DE INSUMOS VS. INVENTARIO RESTANTE
  // ====================================================
  const insumoStats = useMemo(() => {
    // Sum feed consumed from controls
    const feedControls = filteredControls.filter((c) => c.type === 'ALIMENTACION');
    const feedSacksFromControls = feedControls.reduce((sum, c) => sum + (c.metricValue || 0), 0);

    // Sum feed from porcine batches (4 sacks each)
    const porcineFeedSacks = filteredBatches
      .filter((b) => b.species === 'PORCINO')
      .reduce((sum, b) => sum + (b.feedSacksConsumed || 0), 0);

    const totalFeedConsumedSacks = feedSacksFromControls + porcineFeedSacks;

    // Remaining feed in stock
    const feedItems = inventory.filter((i) => i.subtype === 'ALIMENTO');
    const remainingFeedSacks = feedItems.reduce((sum, i) => sum + (i.quantity || 0), 0);

    // Estimate daily consumption rate
    const dailyBurnRate = filteredBatches.length > 0 ? Math.max(1, Math.round(filteredBatches.length * 1.5)) : 1;
    const daysOfCoverage = remainingFeedSacks > 0 ? Math.round(remainingFeedSacks / dailyBurnRate) : 0;

    // Vaccine doses applied
    const vaccineControls = filteredControls.filter((c) => c.type === 'VACUNACION');
    const totalVaccineDoses = vaccineControls.reduce((sum, c) => sum + (c.metricValue || 0), 0);

    return {
      totalFeedConsumedSacks,
      remainingFeedSacks,
      daysOfCoverage,
      totalVaccineDoses,
    };
  }, [filteredControls, filteredBatches, inventory]);

  // ====================================================
  // KPI 4: FLUJO DE CAJA NETO BIMONETARIO (USD / Bs.)
  // ====================================================
  const cashFlowStats = useMemo(() => {
    const totalIncomeUSD = payments.filter((p) => p.impactType === 'INGRESO').reduce((acc, p) => acc + p.amountUSD, 0);
    const totalIncomeVES = payments.filter((p) => p.impactType === 'INGRESO').reduce((acc, p) => acc + p.amountVES, 0);
    const totalExpenseUSD = payments.filter((p) => p.impactType === 'EGRESO').reduce((acc, p) => acc + p.amountUSD, 0);
    const totalExpenseVES = payments.filter((p) => p.impactType === 'EGRESO').reduce((acc, p) => acc + p.amountVES, 0);

    const netUSD = totalIncomeUSD - totalExpenseUSD;
    const netVES = totalIncomeVES - totalExpenseVES;

    return {
      totalIncomeUSD,
      totalIncomeVES,
      totalExpenseUSD,
      totalExpenseVES,
      netUSD,
      netVES,
    };
  }, [payments]);

  // ====================================================
  // ALERTAS PREVENTIVAS TEMPRANAS
  // ====================================================
  const alerts = useMemo(() => {
    const list: {
      id: string;
      type: 'GROWTH_LAG' | 'LOW_INVENTORY' | 'MORTALITY_SPIKE';
      severity: 'ALERTA' | 'CRITICO';
      title: string;
      description: string;
      batchCode?: string;
      actionText: string;
      targetModule: string;
    }[] = [];

    // 1. Escaneo de Retrasos Ponderales en Lotes
    filteredBatches.forEach((batch) => {
      if (batch.daysInCycle > 0 && batch.currentCount > 0) {
        const avgWeightKg = Number((batch.grossWeightKg / batch.currentCount).toFixed(3));
        const evaluation = evaluateGrowthDeviation(batch.species, batch.daysInCycle, avgWeightKg);

        if (evaluation.isLagging) {
          list.push({
            id: `lag_${batch.id}`,
            type: 'GROWTH_LAG',
            severity: evaluation.severity === 'CRITICO' ? 'CRITICO' : 'ALERTA',
            title: `Retraso de Crecimiento: Lote ${batch.code} (${batch.species})`,
            description: `Peso promedio actual ${avgWeightKg} kg vs. estándar esperado ${evaluation.expectedKg} kg en Día ${batch.daysInCycle} (${evaluation.deviationPercent}%). ${evaluation.recommendation}`,
            batchCode: batch.code,
            actionText: 'Ver Curva de Crecimiento',
            targetModule: 'INVENTARIOS',
          });
        }
      }
    });

    // 2. Escaneo de Insumos Críticos con Stock Bajo
    inventory.forEach((item) => {
      const threshold = item.subtype === 'ALIMENTO' ? 25 : 10;
      if (item.quantity <= threshold) {
        list.push({
          id: `inv_${item.id}`,
          type: 'LOW_INVENTORY',
          severity: item.quantity <= 5 ? 'CRITICO' : 'ALERTA',
          title: `Stock Crítico de Insumo: ${item.name}`,
          description: `Disponibilidad física de solo ${item.quantity} ${item.unit}. Se requiere reabastecimiento urgente de almacén central.`,
          actionText: 'Reponer Insumo',
          targetModule: 'INVENTARIOS',
        });
      }
    });

    // 3. Escaneo de Mortalidad Anómala
    filteredBatches.forEach((batch) => {
      if (batch.initialCount > 0) {
        const lost = batch.initialCount - batch.currentCount;
        const rate = (lost / batch.initialCount) * 100;
        const maxThreshold = batch.species === 'AVICOLA' ? 5.0 : 3.0;

        if (rate > maxThreshold) {
          list.push({
            id: `mort_${batch.id}`,
            type: 'MORTALITY_SPIKE',
            severity: 'CRITICO',
            title: `Alerta Sanitaria: Mortalidad Anómala en Lote ${batch.code}`,
            description: `Tasa de bajas del ${rate.toFixed(2)}% (${lost} animales perdidos). Supera el umbral biológico máximo de ${maxThreshold}%.`,
            batchCode: batch.code,
            actionText: 'Auditar Lote Biológico',
            targetModule: 'INVENTARIOS',
          });
        }
      }
    });

    return list;
  }, [filteredBatches, inventory]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Filters Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-slate-900 border border-slate-800 rounded-3xl">
        <div className="flex items-center gap-3">
          <div className="px-2.5 py-1 rounded-xl bg-white border border-slate-200 shadow-sm shrink-0">
            <img
              src={logoUrl}
              alt="Puro Apure ERP"
              className="w-[95px] min-w-[90px] h-auto object-contain block"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/puro_apure_logo.png';
              }}
            />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-heading flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Consolidado Ejecutivo y KPIs de Granja</span>
            </h2>
            <p className="text-[11px] text-slate-400 font-body">
              Puro Apure ERP • Agropecuaria Puro Apure, C.A.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
          {/* Species Filter */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs">
            <span className="text-slate-400 px-2 font-semibold">Especie:</span>
            <button
              onClick={() => setSelectedSpecies('TODAS')}
              className={`px-3 py-1 rounded-xl transition ${
                selectedSpecies === 'TODAS'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Todas
            </button>
            <button
              onClick={() => setSelectedSpecies('AVICOLA')}
              className={`px-3 py-1 rounded-xl transition flex items-center gap-1 ${
                selectedSpecies === 'AVICOLA'
                  ? 'bg-amber-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Bird className="w-3 h-3" />
              <span>Avícola</span>
            </button>
            <button
              onClick={() => setSelectedSpecies('PORCINO')}
              className={`px-3 py-1 rounded-xl transition flex items-center gap-1 ${
                selectedSpecies === 'PORCINO'
                  ? 'bg-pink-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Scale className="w-3 h-3" />
              <span>Porcino</span>
            </button>
          </div>

          {/* Date Range Filter */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400 ml-2" />
            <select
              value={dateRangeFilter}
              onChange={(e) => setDateRangeFilter(e.target.value as typeof dateRangeFilter)}
              className="bg-transparent text-slate-200 outline-none p-1 font-semibold cursor-pointer"
            >
              <option value="CICLO_ACTUAL">Ciclo Activo Actual</option>
              <option value="ULTIMOS_7_DIAS">Últimos 7 días</option>
              <option value="ULTIMOS_30_DIAS">Últimos 30 días</option>
              <option value="TODO">Histórico Completo</option>
            </select>
          </div>
        </div>
      </div>

      {/* Alertas Preventivas Tempranas (Early Warning Banner Cards) */}
      {alerts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              <span>Alertas Preventivas de Campo ({alerts.length} eventos detectados)</span>
            </h3>
            <span className="text-[11px] font-mono text-slate-400">
              Evaluación automatizada contra curvas de crecimiento y umbrales biológicos
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alerts.map((al) => (
              <div
                key={al.id}
                className={`p-4 rounded-2xl border flex items-start justify-between gap-3 text-xs transition ${
                  al.severity === 'CRITICO'
                    ? 'bg-red-950/40 border-red-500/50 text-red-200'
                    : 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    className={`w-5 h-5 shrink-0 mt-0.5 ${
                      al.severity === 'CRITICO' ? 'text-red-400' : 'text-amber-400'
                    }`}
                  />
                  <div className="space-y-1">
                    <div className="font-bold text-white">{al.title}</div>
                    <p className="text-slate-300 leading-relaxed font-sans">{al.description}</p>
                  </div>
                </div>

                {onNavigateToModule && (
                  <button
                    onClick={() => onNavigateToModule(al.targetModule)}
                    className="shrink-0 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-white font-semibold text-[11px] transition"
                  >
                    {al.actionText}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid de KPIs Consolidados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: GANANCIA DIARIA DE PESO (GDP) */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider">Ganancia Diaria de Peso (GDP)</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black font-mono text-emerald-400">
            {gdpStats.avgGdpGrams}{' '}
            <span className="text-xs font-normal text-slate-400">g/animal/día</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Promedio ponderado en {gdpStats.evaluatedCount} lotes biológicos activos.
          </p>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] font-mono text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded-lg border border-emerald-800 inline-flex">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>Conversión Alimenticia Activa</span>
          </div>
        </div>

        {/* KPI 2: MORTALIDAD ACUMULADA & SUPERVIVENCIA */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider">Mortalidad / Supervivencia</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-black font-mono text-cyan-300">
            {mortalityStats.survivalRate}%{' '}
            <span className="text-xs font-normal text-slate-400">supervivencia</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Bajas acumuladas: {mortalityStats.totalLost.toLocaleString()} de {mortalityStats.totalInitial.toLocaleString()} ({mortalityStats.mortalityRate}% mortalidad).
          </p>
          <div
            className={`mt-3 flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-lg border inline-flex ${
              mortalityStats.mortalityRate > 5
                ? 'bg-red-950 text-red-300 border-red-800'
                : 'bg-cyan-950 text-cyan-300 border-cyan-800'
            }`}
          >
            <span>Población viva actual: {mortalityStats.totalCurrent.toLocaleString()} animales</span>
          </div>
        </div>

        {/* KPI 3: CONSUMO DE INSUMOS VS. INVENTARIO */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider">Insumos &amp; Alimento</span>
            <Wheat className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black font-mono text-amber-300">
            {insumoStats.remainingFeedSacks}{' '}
            <span className="text-xs font-normal text-slate-400">sacos en stock</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Consumo acumulado: {insumoStats.totalFeedConsumedSacks} sacos • {insumoStats.totalVaccineDoses} vacunas.
          </p>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] font-mono text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded-lg border border-amber-800 inline-flex">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>Cobertura estimada: ~{insumoStats.daysOfCoverage} días</span>
          </div>
        </div>

        {/* KPI 4: FLUJO DE CAJA NETO BIMONETARIO */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider">Flujo de Caja Neto</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className={`text-2xl font-black font-mono ${cashFlowStats.netUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ${cashFlowStats.netUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs font-mono text-slate-400 mt-1">
            Bs. {cashFlowStats.netVES.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] font-mono text-emerald-300 bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800 inline-flex">
            <span>Tasa BCV: {bcvRate.toFixed(4)} Bs./USD</span>
          </div>
        </div>
      </div>

      {/* Tabla Desglosada de Rendimiento por Lote Biológico */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Monitor de Rendimiento Longitudinal de Lotes
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Supervisión de peso medio registrado vs. curva estándar Cobb 500 y Ceba Porcina
            </p>
          </div>
          {onNavigateToModule && (
            <button
              onClick={() => onNavigateToModule('INVENTARIOS')}
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition flex items-center gap-1"
            >
              <span>Ir a Gestión de Lotes</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 uppercase tracking-wider text-[11px] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Código / Especie</th>
                <th className="py-3.5 px-4 font-semibold">Población</th>
                <th className="py-3.5 px-4 font-semibold">Mortalidad</th>
                <th className="py-3.5 px-4 font-semibold">Día Ciclo</th>
                <th className="py-3.5 px-4 font-semibold">Peso Medio Actual</th>
                <th className="py-3.5 px-4 font-semibold">Estándar Cobb/Ceba</th>
                <th className="py-3.5 px-4 font-semibold">Desviación Ponderal</th>
                <th className="py-3.5 px-4 font-semibold text-center">Estado Zootécnico</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 font-sans italic">
                    No hay lotes que coincidan con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredBatches.map((batch) => {
                  const avgWeightKg = batch.currentCount > 0 ? Number((batch.grossWeightKg / batch.currentCount).toFixed(3)) : 0;
                  const evaluation = evaluateGrowthDeviation(batch.species, batch.daysInCycle, avgWeightKg);
                  const lost = batch.initialCount - batch.currentCount;
                  const mortRate = batch.initialCount > 0 ? ((lost / batch.initialCount) * 100).toFixed(1) : '0';

                  return (
                    <tr key={batch.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-sans font-bold text-white flex items-center gap-1.5">
                          {batch.species === 'AVICOLA' ? (
                            <Bird className="w-3.5 h-3.5 text-amber-400" />
                          ) : (
                            <Scale className="w-3.5 h-3.5 text-pink-400" />
                          )}
                          <span>{batch.code}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-sans uppercase">
                          {batch.species}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-200">
                        {batch.currentCount.toLocaleString()} / {batch.initialCount.toLocaleString()}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            Number(mortRate) > (batch.species === 'AVICOLA' ? 5 : 3)
                              ? 'bg-red-950 text-red-300 border border-red-800'
                              : 'text-slate-400'
                          }`}
                        >
                          {mortRate}% ({lost})
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-300">
                        Día {batch.daysInCycle}
                      </td>

                      <td className="py-3.5 px-4 font-bold text-white">
                        {avgWeightKg} kg
                      </td>

                      <td className="py-3.5 px-4 text-cyan-400">
                        {evaluation.expectedKg} kg
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`font-bold ${
                            evaluation.deviationPercent < -5
                              ? 'text-red-400'
                              : evaluation.deviationPercent > 5
                              ? 'text-emerald-400'
                              : 'text-slate-300'
                          }`}
                        >
                          {evaluation.deviationPercent > 0 ? `+${evaluation.deviationPercent}` : evaluation.deviationPercent}%
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            evaluation.severity === 'CRITICO'
                              ? 'bg-red-950 text-red-300 border border-red-800'
                              : evaluation.severity === 'ALERTA'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          }`}
                        >
                          {evaluation.severity === 'CRITICO' ? (
                            <>
                              <AlertTriangle className="w-3 h-3 text-red-400" />
                              <span>Retraso Crítico</span>
                            </>
                          ) : evaluation.severity === 'ALERTA' ? (
                            <>
                              <AlertCircle className="w-3 h-3 text-amber-400" />
                              <span>En Observación</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>Conforme a Curva</span>
                            </>
                          )}
                        </span>
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
