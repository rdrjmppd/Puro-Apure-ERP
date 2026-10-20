/**
 * Puro Apure ERP - Motor de KPIs Operativos (Big Data)
 * Vincula la gestión del talento humano (costo de nómina) con la producción agroindustrial de biomasa.
 * 
 * Indicadores Principales:
 * 1. Costo Laboral por Kilogramo Producido (Consolidado, Avícola y Porcino).
 * 2. Eficiencia de Conversión Asignada por Trabajador / Supervisor (Mortalidad, Consumo, FCA e IEZ).
 */

import React, { useState, useMemo } from 'react';
import {
  HumanResourceRecord,
  HRStats,
  LivestockSpecies,
  BiologicalBatch,
  FarmBiologicalControl,
} from '../types';
import {
  TrendingUp,
  Scale,
  Award,
  AlertTriangle,
  CheckCircle,
  BarChart2,
  DollarSign,
  Bird,
  Percent,
  Wheat,
  Activity,
  ArrowUpRight,
  ShieldAlert,
  ChevronDown,
} from 'lucide-react';

interface OperationalKPIsProps {
  employees: HumanResourceRecord[];
  hrStats: HRStats;
  batches: BiologicalBatch[];
  controls: FarmBiologicalControl[];
}

export const OperationalKPIs: React.FC<OperationalKPIsProps> = ({
  employees,
  hrStats,
  batches,
  controls,
}) => {
  const [selectedSpeciesFilter, setSelectedSpeciesFilter] = useState<'TODAS' | LivestockSpecies>('TODAS');
  const [selectedWorkerFilter, setSelectedWorkerFilter] = useState<string>('TODOS');

  // -------------------------------------------------------------------------
  // 1. CÁLCULO DE BIOMASA PRODUCIDA Y COSTO LABORAL POR KILOGRAMO
  // -------------------------------------------------------------------------
  const biomassAndLaborMetrics = useMemo(() => {
    // Biomasa Neta por Especie
    const avianBatches = batches.filter((b) => b.species === 'AVICOLA');
    const porcineBatches = batches.filter((b) => b.species === 'PORCINO');

    const avianNetKg = avianBatches.reduce((acc, b) => acc + (b.netWeightKg || b.grossWeightKg || 0), 0);
    const porcineNetKg = porcineBatches.reduce((acc, b) => acc + (b.netWeightKg || 0), 0);
    const totalNetKg = avianNetKg + porcineNetKg;

    // Masa Salarial Mensual Consolidada (desde hrStats)
    const totalMonthlyPayrollUSD =
      (hrStats.totalMonthlyNominaUSD || 0) + (hrStats.totalMonthlyHonorariosUSD || 0);

    // Segmentación de Nómina por Departamento
    let avianDeptPayrollUSD = 0;
    let porcineDeptPayrollUSD = 0;
    let generalSupportPayrollUSD = 0;

    employees
      .filter((e) => e.status === 'ACTIVO')
      .forEach((e) => {
        const cost =
          e.tipoContrato === 'NOMINA_FIJA'
            ? (e.sueldoBaseUSD || 0) + (e.aportesParafiscalesUSD || 0)
            : e.tarifaServicioUSD || 0;

        if (e.departamento === 'PRODUCCION_AVICOLA') {
          avianDeptPayrollUSD += cost;
        } else if (e.departamento === 'PRODUCCION_PORCINA') {
          porcineDeptPayrollUSD += cost;
        } else {
          generalSupportPayrollUSD += cost;
        }
      });

    // Ponderación de soporte general proporcional a los kilogramos
    const avianShare = totalNetKg > 0 ? avianNetKg / totalNetKg : 0.5;
    const porcineShare = totalNetKg > 0 ? porcineNetKg / totalNetKg : 0.5;

    const consolidatedAvianPayrollUSD = avianDeptPayrollUSD + generalSupportPayrollUSD * avianShare;
    const consolidatedPorcinePayrollUSD = porcineDeptPayrollUSD + generalSupportPayrollUSD * porcineShare;

    // Costo Laboral por Kilogramo Producido (USD/Kg) - MOD/kg
    const laborCostPerKgGlobal = totalNetKg > 0 ? totalMonthlyPayrollUSD / totalNetKg : 0;
    const laborCostPerKgAvian = avianNetKg > 0 ? consolidatedAvianPayrollUSD / avianNetKg : 0;
    const laborCostPerKgPorcine = porcineNetKg > 0 ? consolidatedPorcinePayrollUSD / porcineNetKg : 0;

    // Población de Animales y Costo de Mano de Obra por Animal (USD/animal o cabeza)
    const totalAvianAnimals = avianBatches.reduce((acc, b) => acc + (b.currentCount || b.initialCount || 0), 0);
    const totalPorcineAnimals = porcineBatches.reduce((acc, b) => acc + (b.currentCount || b.initialCount || 0), 0);
    const totalAnimals = totalAvianAnimals + totalPorcineAnimals;

    const laborCostPerAnimalGlobal = totalAnimals > 0 ? totalMonthlyPayrollUSD / totalAnimals : 0;
    const laborCostPerAnimalAvian = totalAvianAnimals > 0 ? consolidatedAvianPayrollUSD / totalAvianAnimals : 0;
    const laborCostPerAnimalPorcine = totalPorcineAnimals > 0 ? consolidatedPorcinePayrollUSD / totalPorcineAnimals : 0;

    // Precios oficiales de venta
    const officialPriceAvian = 4.0; // USD/kg pollo en pie
    const officialPricePorcine = 6.0; // USD/kg cerdo en pie

    // Incidencia porcentual de mano de obra sobre precio oficial
    const laborShareAvianPercent = officialPriceAvian > 0 ? (laborCostPerKgAvian / officialPriceAvian) * 100 : 0;
    const laborSharePorcinePercent = officialPricePorcine > 0 ? (laborCostPerKgPorcine / officialPricePorcine) * 100 : 0;

    return {
      avianNetKg,
      porcineNetKg,
      totalNetKg,
      totalMonthlyPayrollUSD,
      consolidatedAvianPayrollUSD,
      consolidatedPorcinePayrollUSD,
      laborCostPerKgGlobal,
      laborCostPerKgAvian,
      laborCostPerKgPorcine,
      totalAvianAnimals,
      totalPorcineAnimals,
      totalAnimals,
      laborCostPerAnimalGlobal,
      laborCostPerAnimalAvian,
      laborCostPerAnimalPorcine,
      officialPriceAvian,
      officialPricePorcine,
      laborShareAvianPercent,
      laborSharePorcinePercent,
      avianBatchesCount: avianBatches.length,
      porcineBatchesCount: porcineBatches.length,
    };
  }, [employees, hrStats, batches]);

  // -------------------------------------------------------------------------
  // 2. EFICIENCIA DE CONVERSIÓN ASIGNADA POR TRABAJADOR / SUPERVISOR
  // -------------------------------------------------------------------------
  const workerEfficiencyList = useMemo(() => {
    // Lista de trabajadores activos o supervisores
    const activeStaff = employees.filter((e) => e.status === 'ACTIVO');

    // Mapeo por trabajador
    return activeStaff.map((emp) => {
      // Buscar controles en los que participó el trabajador
      const empControls = controls.filter(
        (c) =>
          c.responsibleWorker &&
          (c.responsibleWorker.toLowerCase().includes(emp.nombreCompleto.toLowerCase()) ||
            emp.nombreCompleto.toLowerCase().includes(c.responsibleWorker.toLowerCase()))
      );

      // Determinar lotes asociados a este trabajador
      const batchIdsFromControls = Array.from(new Set(empControls.map((c) => c.batchId)));
      let assignedBatches = batches.filter(
        (b) =>
          batchIdsFromControls.includes(b.id) ||
          (b.updatedBy && b.updatedBy.toLowerCase().includes(emp.nombreCompleto.toLowerCase()))
      );

      // Si es del departamento de producción y no tiene controles explícitos, asociar lotes de su especie
      if (assignedBatches.length === 0) {
        if (emp.departamento === 'PRODUCCION_AVICOLA') {
          assignedBatches = batches.filter((b) => b.species === 'AVICOLA');
        } else if (emp.departamento === 'PRODUCCION_PORCINA') {
          assignedBatches = batches.filter((b) => b.species === 'PORCINO');
        }
      }

      // Agregación de indicadores
      const totalInitialCount = assignedBatches.reduce((acc, b) => acc + (b.initialCount || 0), 0);
      const totalCurrentCount = assignedBatches.reduce((acc, b) => acc + (b.currentCount || 0), 0);
      const totalMortality = Math.max(0, totalInitialCount - totalCurrentCount);

      const mortalityRate =
        totalInitialCount > 0 ? (totalMortality / totalInitialCount) * 100 : 0;

      const totalBiomassNetKg = assignedBatches.reduce(
        (acc, b) => acc + (b.netWeightKg || b.grossWeightKg || 0),
        0
      );
      const totalFeedSacks = assignedBatches.reduce((acc, b) => acc + (b.feedSacksConsumed || 0), 0);
      const totalFeedKg = totalFeedSacks * 40; // 40 kg por saco estándar

      // Factor de Conversión Alimenticia (FCA): Kg alimento consumido / Kg biomasa ganada
      const fca = totalBiomassNetKg > 0 ? totalFeedKg / totalBiomassNetKg : 0;

      // Índice de Eficiencia Zootécnica (IEZ) Escala 0 a 100
      // Penaliza alta mortalidad (>4%) y FCA descalibrado
      let score = 95;
      if (mortalityRate > 3) score -= (mortalityRate - 3) * 6;
      if (fca > 2.5) score -= (fca - 2.5) * 8;
      if (empControls.length > 5) score += 3; // Premio por rigurosidad en pesajes
      score = Math.max(40, Math.min(100, Math.round(score)));

      let ratingBadge: { label: string; color: string; bg: string } = {
        label: 'Sobresaliente',
        color: 'text-emerald-300',
        bg: 'bg-emerald-950/80 border-emerald-700',
      };

      if (score < 70) {
        ratingBadge = {
          label: 'Requiere Auditoría',
          color: 'text-red-300',
          bg: 'bg-red-950/80 border-red-700',
        };
      } else if (score < 85) {
        ratingBadge = {
          label: 'Estándar Aceptable',
          color: 'text-amber-300',
          bg: 'bg-amber-950/80 border-amber-700',
        };
      }

      return {
        employee: emp,
        assignedBatchesCount: assignedBatches.length,
        totalInitialCount,
        totalCurrentCount,
        totalMortality,
        mortalityRate,
        totalBiomassNetKg,
        totalFeedSacks,
        totalFeedKg,
        fca,
        controlsRecorded: empControls.length,
        iezScore: score,
        ratingBadge,
      };
    });
  }, [employees, controls, batches]);

  // Filtrado de la tabla de trabajadores
  const filteredWorkerEfficiency = useMemo(() => {
    return workerEfficiencyList.filter((item) => {
      const matchesWorker =
        selectedWorkerFilter === 'TODOS' || item.employee.id === selectedWorkerFilter;
      const matchesSpecies =
        selectedSpeciesFilter === 'TODAS' ||
        (selectedSpeciesFilter === 'AVICOLA' && item.employee.departamento === 'PRODUCCION_AVICOLA') ||
        (selectedSpeciesFilter === 'PORCINO' && item.employee.departamento === 'PRODUCCION_PORCINA');

      return matchesWorker && matchesSpecies;
    });
  }, [workerEfficiencyList, selectedWorkerFilter, selectedSpeciesFilter]);

  // -------------------------------------------------------------------------
  // 3. MATRIZ DE CORRELACIÓN: PERSONAL ACTIVO VS LOTES BIOLÓGICOS (BATCHES)
  // -------------------------------------------------------------------------
  const batchLaborCorrelation = useMemo(() => {
    return batches
      .filter((b) => selectedSpeciesFilter === 'TODAS' || b.species === selectedSpeciesFilter)
      .map((batch) => {
        const dept = batch.species === 'AVICOLA' ? 'PRODUCCION_AVICOLA' : 'PRODUCCION_PORCINA';
        const assignedStaff = employees.filter(
          (e) => e.status === 'ACTIVO' && e.departamento === dept
        );

        const currentAnimals = batch.currentCount || batch.initialCount || 0;
        const netKg = batch.netWeightKg || batch.grossWeightKg || 0;

        const totalSpeciesKg =
          batch.species === 'AVICOLA'
            ? Math.max(1, biomassAndLaborMetrics.avianNetKg)
            : Math.max(1, biomassAndLaborMetrics.porcineNetKg);

        const speciesPayroll =
          batch.species === 'AVICOLA'
            ? biomassAndLaborMetrics.consolidatedAvianPayrollUSD
            : biomassAndLaborMetrics.consolidatedPorcinePayrollUSD;

        const shareOfBiomass = netKg > 0 ? netKg / totalSpeciesKg : 1 / Math.max(1, batches.length);
        const proratedPayrollUSD = speciesPayroll * shareOfBiomass;

        const modPerKg = netKg > 0 ? proratedPayrollUSD / netKg : 0;
        const modPerAnimal = currentAnimals > 0 ? proratedPayrollUSD / currentAnimals : 0;

        return {
          batch,
          assignedStaff,
          currentAnimals,
          netKg,
          proratedPayrollUSD,
          modPerKg,
          modPerAnimal,
        };
      });
  }, [batches, employees, biomassAndLaborMetrics, selectedSpeciesFilter]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Banner de Presentación Big Data */}
      <div className="p-5 sm:p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-600/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  Motor de KPIs Operativos & Rendimiento Zootécnico
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-950 border border-amber-800 text-amber-300 font-bold uppercase">
                  Big Data Correlacional
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Cruce algorítmico entre costos de nómina (`human_resources`) y producción neta (`batches` + `farm_controls`).
              </p>
            </div>
          </div>

          {/* Filtro de Especie */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold hidden sm:inline">Filtrar Especie:</span>
            <div className="flex items-center p-1 bg-slate-950 rounded-xl border border-slate-800">
              <button
                onClick={() => setSelectedSpeciesFilter('TODAS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  selectedSpeciesFilter === 'TODAS'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Todas
              </button>
              <button
                onClick={() => setSelectedSpeciesFilter('AVICOLA')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                  selectedSpeciesFilter === 'AVICOLA'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Bird className="w-3.5 h-3.5" />
                <span>Avícola</span>
              </button>
              <button
                onClick={() => setSelectedSpeciesFilter('PORCINO')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                  selectedSpeciesFilter === 'PORCINO'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Porcino</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECCIÓN 1: TARJETAS DE FLUJO - COSTO LABORAL POR KILOGRAMO PRODUCIDO */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* KPI 1: Costo Laboral Global */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-400" />
              <span>Costo Laboral Consolidado</span>
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
              Granja Total
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-400 font-mono">
              ${biomassAndLaborMetrics.laborCostPerKgGlobal.toFixed(3)}
            </span>
            <span className="text-xs text-slate-400 font-mono">USD / kg producido</span>
          </div>

          <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-1.5 text-xs font-mono">
            <div className="flex justify-between text-slate-400">
              <span>Masa Salarial Total:</span>
              <strong className="text-white">${biomassAndLaborMetrics.totalMonthlyPayrollUSD.toFixed(2)} USD</strong>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Biomasa Neta Total:</span>
              <strong className="text-emerald-300">{biomassAndLaborMetrics.totalNetKg.toLocaleString()} kg</strong>
            </div>
          </div>
        </div>

        {/* KPI 2: Costo Laboral Avícola */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-blue-900/40 shadow-xl space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
              <Bird className="w-4 h-4 text-blue-400" />
              <span>Costo Laboral Avícola</span>
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800">
              Pollo de Engorde
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-blue-300 font-mono">
              ${biomassAndLaborMetrics.laborCostPerKgAvian.toFixed(3)}
            </span>
            <span className="text-xs text-slate-400 font-mono">USD / kg carne</span>
          </div>

          <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-1.5 text-xs font-mono">
            <div className="flex justify-between text-slate-400">
              <span>Precio Oficial de Venta:</span>
              <span className="text-white">${biomassAndLaborMetrics.officialPriceAvian.toFixed(2)} USD/kg</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Incidencia Mano de Obra:</span>
              <strong className="text-blue-300">{biomassAndLaborMetrics.laborShareAvianPercent.toFixed(1)}% del PVP</strong>
            </div>
          </div>
        </div>

        {/* KPI 3: Costo Laboral Porcino */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-purple-900/40 shadow-xl space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2">
              <Scale className="w-4 h-4 text-purple-400" />
              <span>Costo Laboral Porcino</span>
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800">
              Cerdos en Pie
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-purple-300 font-mono">
              ${biomassAndLaborMetrics.laborCostPerKgPorcine.toFixed(3)}
            </span>
            <span className="text-xs text-slate-400 font-mono">USD / kg neto</span>
          </div>

          <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-1.5 text-xs font-mono">
            <div className="flex justify-between text-slate-400">
              <span>Precio Oficial de Venta:</span>
              <span className="text-white">${biomassAndLaborMetrics.officialPricePorcine.toFixed(2)} USD/kg</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Incidencia Mano de Obra:</span>
              <strong className="text-purple-300">{biomassAndLaborMetrics.laborSharePorcinePercent.toFixed(1)}% del PVP</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Tarjetas Complementarias: Costo de Mano de Obra Directa por Animal (USD / Animal) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* MOD por Animal Global */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-semibold uppercase flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              <span>MOD por Animal (Consolidado)</span>
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300">
              {biomassAndLaborMetrics.totalAnimals.toLocaleString()} cabezas
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-emerald-400 font-mono">
              ${biomassAndLaborMetrics.laborCostPerAnimalGlobal.toFixed(2)}
            </span>
            <span className="text-xs text-slate-400 font-mono">USD / animal</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Prorrateo global de masa salarial entre el censo vivo total de la granja.
          </p>
        </div>

        {/* MOD por Ave Avícola */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-blue-900/40 shadow-lg space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-blue-400 font-semibold uppercase flex items-center gap-1.5">
              <Bird className="w-3.5 h-3.5 text-blue-400" />
              <span>MOD por Ave (Pollo de Engorde)</span>
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-300">
              {biomassAndLaborMetrics.totalAvianAnimals.toLocaleString()} aves
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-blue-300 font-mono">
              ${biomassAndLaborMetrics.laborCostPerAnimalAvian.toFixed(3)}
            </span>
            <span className="text-xs text-slate-400 font-mono">USD / ave en galpón</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Costo de mano de obra absorbido por cada pollo alojado durante su ciclo de engorde.
          </p>
        </div>

        {/* MOD por Cerdo Porcino */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-purple-900/40 shadow-lg space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-purple-400 font-semibold uppercase flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-purple-400" />
              <span>MOD por Cerdo (Ceba y Piara)</span>
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300">
              {biomassAndLaborMetrics.totalPorcineAnimals.toLocaleString()} cerdos
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-purple-300 font-mono">
              ${biomassAndLaborMetrics.laborCostPerAnimalPorcine.toFixed(2)}
            </span>
            <span className="text-xs text-slate-400 font-mono">USD / cerdo en ceba</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Costo de mano de obra absorbido por cada animal porcino en confinamiento.
          </p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECCIÓN 2: GRÁFICO COMPARATIVO - INCIDENCIA DE NÓMINA VS MARGEN BRUTO */}
      {/* ========================================================================= */}
      <div className="p-5 sm:p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
            <BarChart2 className="w-4 h-4 text-emerald-400" />
            <span>Estructura de Absorción de Costo Laboral por Kilogramo</span>
          </h3>
          <span className="text-[11px] text-slate-400 font-mono">
            Tarifas Oficiales: $4.00 (Aves) • $6.00 (Cerdos)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Barra Avícola */}
          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-blue-300 flex items-center gap-1.5">
                <Bird className="w-4 h-4" /> Línea Avícola ($4.00 USD/kg)
              </span>
              <span className="font-mono text-slate-400">
                ${biomassAndLaborMetrics.laborCostPerKgAvian.toFixed(3)} USD Mano de Obra
              </span>
            </div>

            <div className="w-full h-5 bg-slate-900 rounded-full overflow-hidden flex border border-slate-800">
              {/* Costo Laboral */}
              <div
                style={{ width: `${Math.min(100, biomassAndLaborMetrics.laborShareAvianPercent)}%` }}
                className="bg-blue-500 h-full flex items-center justify-center text-[10px] font-bold text-white font-mono"
                title={`Mano de Obra: ${biomassAndLaborMetrics.laborShareAvianPercent.toFixed(1)}%`}
              >
                {biomassAndLaborMetrics.laborShareAvianPercent > 10 && `${biomassAndLaborMetrics.laborShareAvianPercent.toFixed(0)}%`}
              </div>
              {/* Alimento y Operación Estimado (60%) */}
              <div
                style={{ width: '60%' }}
                className="bg-amber-600/70 h-full flex items-center justify-center text-[10px] font-bold text-white font-mono"
                title="Alimento e Insumos (60%)"
              >
                Alimento 60%
              </div>
              {/* Margen Remanente */}
              <div
                style={{ width: `${Math.max(0, 100 - biomassAndLaborMetrics.laborShareAvianPercent - 60)}%` }}
                className="bg-emerald-600 h-full flex items-center justify-center text-[10px] font-bold text-white font-mono"
                title="Margen Operativo Bruto"
              >
                Margen
              </div>
            </div>

            <div className="flex justify-between text-[11px] text-slate-400 font-mono">
              <span className="text-blue-400">■ Mano de Obra: {biomassAndLaborMetrics.laborShareAvianPercent.toFixed(1)}%</span>
              <span className="text-amber-400">■ Insumos: 60%</span>
              <span className="text-emerald-400">■ Margen Bruto: {(100 - biomassAndLaborMetrics.laborShareAvianPercent - 60).toFixed(1)}%</span>
            </div>
          </div>

          {/* Barra Porcina */}
          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-purple-300 flex items-center gap-1.5">
                <Scale className="w-4 h-4" /> Línea Porcina ($6.00 USD/kg)
              </span>
              <span className="font-mono text-slate-400">
                ${biomassAndLaborMetrics.laborCostPerKgPorcine.toFixed(3)} USD Mano de Obra
              </span>
            </div>

            <div className="w-full h-5 bg-slate-900 rounded-full overflow-hidden flex border border-slate-800">
              {/* Costo Laboral */}
              <div
                style={{ width: `${Math.min(100, biomassAndLaborMetrics.laborSharePorcinePercent)}%` }}
                className="bg-purple-500 h-full flex items-center justify-center text-[10px] font-bold text-white font-mono"
                title={`Mano de Obra: ${biomassAndLaborMetrics.laborSharePorcinePercent.toFixed(1)}%`}
              >
                {biomassAndLaborMetrics.laborSharePorcinePercent > 10 && `${biomassAndLaborMetrics.laborSharePorcinePercent.toFixed(0)}%`}
              </div>
              {/* Alimento y Operación Estimado (55%) */}
              <div
                style={{ width: '55%' }}
                className="bg-amber-600/70 h-full flex items-center justify-center text-[10px] font-bold text-white font-mono"
                title="Alimento e Insumos (55%)"
              >
                Alimento 55%
              </div>
              {/* Margen Remanente */}
              <div
                style={{ width: `${Math.max(0, 100 - biomassAndLaborMetrics.laborSharePorcinePercent - 55)}%` }}
                className="bg-emerald-600 h-full flex items-center justify-center text-[10px] font-bold text-white font-mono"
                title="Margen Operativo Bruto"
              >
                Margen
              </div>
            </div>

            <div className="flex justify-between text-[11px] text-slate-400 font-mono">
              <span className="text-purple-400">■ Mano de Obra: {biomassAndLaborMetrics.laborSharePorcinePercent.toFixed(1)}%</span>
              <span className="text-amber-400">■ Insumos: 55%</span>
              <span className="text-emerald-400">■ Margen Bruto: {(100 - biomassAndLaborMetrics.laborSharePorcinePercent - 55).toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECCIÓN 3: MATRIZ DE CORRELACIÓN - PERSONAL ACTIVO VS LOTES BIOLÓGICOS (BATCHES) */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl space-y-3">
        <div className="p-4 sm:p-5 bg-slate-950/70 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
              <BarChart2 className="w-4 h-4 text-blue-400" />
              <span>Matriz de Correlación: Personal Activo en Granja vs. Lotes Productivos (Batches)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Prorrateo de mano de obra directa e indirecta por lote biológico, MOD/kg y MOD/animal.
            </p>
          </div>
          <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-blue-950/80 border border-blue-800 text-blue-300">
            {batchLaborCorrelation.length} lotes analizados
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 uppercase tracking-wider text-[11px] text-slate-400 border-b border-slate-800 font-mono">
              <tr>
                <th className="py-3 px-4 font-semibold">Lote Biológico</th>
                <th className="py-3 px-4 font-semibold">Especie & Raza</th>
                <th className="py-3 px-4 font-semibold">Censo Vivo (Cabezas/Aves)</th>
                <th className="py-3 px-4 font-semibold">Biomasa Acumulada</th>
                <th className="py-3 px-4 font-semibold">Personal de Granja Asignado</th>
                <th className="py-3 px-4 font-semibold text-right">Mano de Obra Prorrateada</th>
                <th className="py-3 px-4 font-semibold text-right">MOD / kg</th>
                <th className="py-3 px-4 font-semibold text-right">MOD / Animal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {batchLaborCorrelation.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 italic font-sans">
                    No se registran lotes biológicos activos en este ciclo zootécnico.
                  </td>
                </tr>
              ) : (
                batchLaborCorrelation.map((item) => (
                  <tr key={item.batch.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-sans">
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <span>{item.batch.code || item.batch.id}</span>
                        {item.batch.status === 'ACTIVO' ? (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">{item.batch.status}</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        ID: {item.batch.id} • Días ciclo: {item.batch.daysInCycle || 0}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-sans">
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 w-fit ${
                          item.batch.species === 'AVICOLA'
                            ? 'bg-blue-950/80 text-blue-300 border border-blue-800/60'
                            : 'bg-purple-950/80 text-purple-300 border border-purple-800/60'
                        }`}
                      >
                        {item.batch.species === 'AVICOLA' ? <Bird className="w-3 h-3" /> : <Scale className="w-3 h-3" />}
                        {item.batch.species} • {item.batch.razaLineaGenetica || 'Cobb 500 / Landrace'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-white font-bold">{item.currentAnimals.toLocaleString()}</div>
                      <div className="text-[10px] text-slate-500">
                        inicial: {item.batch.initialCount?.toLocaleString() || 0}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-emerald-400 font-bold">{item.netKg.toLocaleString()} kg</div>
                      <div className="text-[10px] text-slate-500">
                        {item.currentAnimals > 0 ? (item.netKg / item.currentAnimals).toFixed(2) : 0} kg/cabeza
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-sans">
                      <div className="text-slate-200 text-xs">
                        {item.assignedStaff.length} colaboradores
                      </div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[200px]" title={item.assignedStaff.map(s => s.nombreCompleto).join(', ')}>
                        {item.assignedStaff.slice(0, 2).map(s => s.nombreCompleto).join(', ') || 'Rotativo de campo'}
                        {item.assignedStaff.length > 2 && ` +${item.assignedStaff.length - 2}`}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="text-white font-bold">
                        ${item.proratedPayrollUSD.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-500">USD / mes</div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-emerald-400 font-bold">
                        ${item.modPerKg.toFixed(3)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-cyan-400 font-bold">
                        ${item.modPerAnimal.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECCIÓN 4: EFICIENCIA DE CONVERSIÓN Y SUPERVISIÓN POR TRABAJADOR */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl space-y-3">
        <div className="p-4 sm:p-5 bg-slate-950/70 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
              <Award className="w-4 h-4 text-amber-400" />
              <span>Eficiencia Zootécnica Asignada por Operador / Supervisor</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Tasa de mortalidad, consumo de alimento por animal y Factor de Conversión Alimenticia (FCA).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedWorkerFilter}
              onChange={(e) => setSelectedWorkerFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 outline-none"
            >
              <option value="TODOS">Todos los Operadores</option>
              {workerEfficiencyList.map((item) => (
                <option key={item.employee.id} value={item.employee.id}>
                  {item.employee.nombreCompleto} ({item.employee.cargo})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 uppercase tracking-wider text-[11px] text-slate-400 border-b border-slate-800 font-mono">
              <tr>
                <th className="py-3 px-4 font-semibold">Operador / Supervisor</th>
                <th className="py-3 px-4 font-semibold">Departamento</th>
                <th className="py-3 px-4 font-semibold">Lotes & Controles</th>
                <th className="py-3 px-4 font-semibold">Población Gestionada</th>
                <th className="py-3 px-4 font-semibold">Mortalidad Registrada</th>
                <th className="py-3 px-4 font-semibold">Alimento Consumido</th>
                <th className="py-3 px-4 font-semibold">FCA Estimado</th>
                <th className="py-3 px-4 font-semibold text-center">Índice IEZ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredWorkerEfficiency.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500 font-sans italic">
                    No se encontraron registros de desempeño operativo para el filtro seleccionado.
                  </td>
                </tr>
              ) : (
                filteredWorkerEfficiency.map((item) => (
                  <tr key={item.employee.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-sans">
                      <div className="font-bold text-white">{item.employee.nombreCompleto}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {item.employee.cargo} • {item.employee.cedula}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-sans">
                      <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-[11px] text-slate-300">
                        {item.employee.departamento.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      <div>{item.assignedBatchesCount} lotes</div>
                      <span className="text-[10px] text-emerald-400">
                        {item.controlsRecorded} pesajes asentados
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-200">
                      <div>{item.totalCurrentCount.toLocaleString()} vivas</div>
                      <span className="text-[10px] text-slate-500">
                        de {item.totalInitialCount.toLocaleString()} iniciales
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className={`font-bold ${item.mortalityRate > 5 ? 'text-red-400' : 'text-slate-300'}`}>
                        {item.totalMortality.toLocaleString()} bajas
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          item.mortalityRate <= 3.5
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : item.mortalityRate <= 5.5
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : 'bg-red-950 text-red-400 border border-red-800'
                        }`}
                      >
                        {item.mortalityRate.toFixed(2)}% mort.
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      <div>{item.totalFeedSacks} sacos</div>
                      <span className="text-[10px] text-amber-400">
                        {item.totalFeedKg.toLocaleString()} kg alimento
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-200 font-bold">
                      {item.fca > 0 ? `${item.fca.toFixed(2)} kg/kg` : 'En ciclo'}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-base font-extrabold text-white font-mono">
                          {item.iezScore}
                          <span className="text-xs text-slate-500 font-normal">/100</span>
                        </span>
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase border font-sans ${item.ratingBadge.bg} ${item.ratingBadge.color}`}
                        >
                          {item.ratingBadge.label}
                        </span>
                      </div>
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
