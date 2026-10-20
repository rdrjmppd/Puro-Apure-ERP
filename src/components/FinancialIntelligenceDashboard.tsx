/**
 * Puro Apure ERP - Módulo de Inteligencia Financiera (Fase 2)
 * Estado de Resultados (P&L) y Balance General en Tiempo Real con Filtros Temporales y ABAC
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  FinancialAnalyticsService,
  IncomeStatementBreakdown,
  BalanceSheetBreakdown,
  centsRound,
} from '../services/financialAnalyticsService';
import {
  generateCorporatePDF,
  generateCorporateExcel,
  FinancialExportPayload,
} from '../utils/financialExportEngine';
import { triggerDirectBlobDownload } from '../utils/pdfTemplateEngine';
import { PaymentRecord, DualEntity } from '../types/finance';
import { BiologicalBatch, InventoryItem, HistoricalBatchRecord } from '../types/inventory';
import { InventoryService } from '../services/inventoryService';
import { calculateCumulativeBusinessProfitability } from '../services/financialAnalyticsService';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  PieChart,
  BarChart3,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Layers,
  Scale,
  Building,
  CheckCircle2,
  Clock,
  Sparkles,
  HelpCircle,
  AlertCircle,
  FileText,
  FileSpreadsheet,
  History,
} from 'lucide-react';

interface FinancialIntelligenceDashboardProps {
  payments: PaymentRecord[];
  entities: DualEntity[];
  batches: BiologicalBatch[];
  bcvRate: number;
  initialInventory?: InventoryItem[];
  historicalBatches?: HistoricalBatchRecord[];
  onExportPdf?: (income: IncomeStatementBreakdown, balance: BalanceSheetBreakdown) => void;
  onExportExcel?: (income: IncomeStatementBreakdown, balance: BalanceSheetBreakdown) => void;
}

export const FinancialIntelligenceDashboard: React.FC<FinancialIntelligenceDashboardProps> = ({
  payments,
  entities,
  batches,
  bcvRate,
  initialInventory = [],
  historicalBatches: propHistoricalBatches,
  onExportPdf,
  onExportExcel,
}) => {
  const { userProfile, isAdmin, isSuperAdmin } = useAuth();

  // 1. ABAC: Restricción estricta de acceso solo a ADMIN y SUPERADMIN
  const isAuthorized = isAdmin || isSuperAdmin;

  // 2. Control de Fechas (Default: Mes calendario actual)
  const [startDate, setStartDate] = useState<string>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Inventario local si no fue provisto
  const [inventory, setInventory] = useState<InventoryItem[]>(initialInventory);

  // Lotes históricos para sustentación gerencial (Fase 3)
  const [historicalList, setHistoricalList] = useState<HistoricalBatchRecord[]>(propHistoricalBatches || []);
  const [includeHistorical, setIncludeHistorical] = useState(false);

  useEffect(() => {
    if (propHistoricalBatches) {
      setHistoricalList(propHistoricalBatches);
    } else {
      const unsub = InventoryService.subscribeHistoricalBatches((items) => {
        setHistoricalList(items);
      });
      return () => unsub();
    }
  }, [propHistoricalBatches]);

  const historicalProfitability = useMemo(() => {
    return calculateCumulativeBusinessProfitability(historicalList);
  }, [historicalList]);

  useEffect(() => {
    if (initialInventory.length === 0) {
      const unsub = InventoryService.subscribeInventory((items) => {
        setInventory(items);
      });
      return () => unsub();
    }
  }, [initialInventory]);

  // Presets temporales
  const setPresetCurrentWeek = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    setStartDate(monday.toISOString().split('T')[0]);
    setEndDate(sunday.toISOString().split('T')[0]);
  };

  const setPresetCurrentMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    setStartDate(firstDay);
    setEndDate(lastDay);
  };

  const setPresetQuarter = () => {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3);
    const firstDay = new Date(now.getFullYear(), quarter * 3, 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), quarter * 3 + 3, 0).toISOString().split('T')[0];
    setStartDate(firstDay);
    setEndDate(lastDay);
  };

  const setPresetYear = () => {
    const now = new Date();
    const firstDay = `${now.getFullYear()}-01-01`;
    const lastDay = `${now.getFullYear()}-12-31`;
    setStartDate(firstDay);
    setEndDate(lastDay);
  };

  // 3. useMemo: Memorización de los motores analíticos para erradicar Bucles de Re-renderizado
  const incomeStatement: IncomeStatementBreakdown = useMemo(() => {
    return FinancialAnalyticsService.computeIncomeStatement(
      payments,
      startDate,
      endDate,
      bcvRate
    );
  }, [payments, startDate, endDate, bcvRate]);

  const balanceSheet: BalanceSheetBreakdown = useMemo(() => {
    return FinancialAnalyticsService.computeBalanceSheet(
      payments,
      entities,
      batches,
      inventory,
      bcvRate,
      endDate
    );
  }, [payments, entities, batches, inventory, bcvRate, endDate]);

  // Tab interno entre Estado de Resultados y Balance General
  const [activeView, setActiveView] = useState<'PL' | 'BALANCE'>('PL');

  // Estados de exportación documental
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  // Fase 3: Descarga Directa (Blob & Anchor) de Reporte Corporativo Oficial PDF
  const handleExportPdf = () => {
    try {
      setIsExportingPdf(true);
      const startFormatted = startDate.split('-').reverse().join('/');
      const endFormatted = endDate.split('-').reverse().join('/');
      const periodText = `Período: ${startFormatted} al ${endFormatted}`;

      const payload: FinancialExportPayload = {
        reportTitle: 'REPORTE OFICIAL DE INTELIGENCIA FINANCIERA',
        periodText,
        startDate,
        endDate,
        bcvRate,
        incomeStatement,
        balanceSheet,
      };

      if (onExportPdf) {
        onExportPdf(incomeStatement, balanceSheet);
      }

      const { filename, blob } = generateCorporatePDF(payload);
      triggerDirectBlobDownload(blob, filename);

      setExportFeedback(`Reporte PDF generado exitosamente: ${filename}`);
      setTimeout(() => setExportFeedback(null), 4500);
    } catch (err) {
      console.error('[FinancialIntelligenceDashboard] Error al generar PDF:', err);
      setExportFeedback('Error al compilar reporte PDF corporativo');
      setTimeout(() => setExportFeedback(null), 4000);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Fase 3: Descarga Directa (Blob & Anchor) de Matriz Corporativa Oficial Excel
  const handleExportExcel = () => {
    try {
      setIsExportingExcel(true);
      const startFormatted = startDate.split('-').reverse().join('/');
      const endFormatted = endDate.split('-').reverse().join('/');
      const periodText = `Período: ${startFormatted} al ${endFormatted}`;

      const payload: FinancialExportPayload = {
        reportTitle: 'CONSOLIDADO DE INTELIGENCIA FINANCIERA (EXCEL)',
        periodText,
        startDate,
        endDate,
        bcvRate,
        incomeStatement,
        balanceSheet,
      };

      if (onExportExcel) {
        onExportExcel(incomeStatement, balanceSheet);
      }

      const { filename, blob } = generateCorporateExcel(payload);
      triggerDirectBlobDownload(blob, filename);

      setExportFeedback(`Matriz Excel exportada exitosamente: ${filename}`);
      setTimeout(() => setExportFeedback(null), 4500);
    } catch (err) {
      console.error('[FinancialIntelligenceDashboard] Error al generar Excel:', err);
      setExportFeedback('Error al generar matriz contable Excel');
      setTimeout(() => setExportFeedback(null), 4000);
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Si no cuenta con permisos ABAC
  if (!isAuthorized) {
    return (
      <div className="bg-slate-900/90 border border-amber-500/30 rounded-3xl p-8 text-center max-w-lg mx-auto my-8 space-y-4 shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mx-auto flex items-center justify-center">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-white tracking-tight">
          Acceso Restringido • Inteligencia Financiera
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed font-sans">
          El sub-módulo de <strong>Estado de Resultados y Balance General</strong> contiene datos estratégicos de solvencia, liquidez y márgenes operativos. Su acceso requiere nivel de autoridad <strong>ADMIN</strong> o <strong>SUPERADMIN</strong>.
        </p>
        <div className="text-[11px] font-mono text-slate-500 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
          Rol actual: <span className="text-amber-400 font-bold">{userProfile?.role ?? 'OPERARIO'}</span> • Estatus ABAC: DENEGADO
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Barra de Filtros Temporales y Rango de Fechas */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-bold text-white tracking-tight">
                Módulo de Inteligencia Financiera
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">
                P&amp;L y Balance General
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Consolidación bimonetaria en tiempo real (Tasa Oficial BCV: Bs. {bcvRate.toFixed(4)}/USD).
            </p>
          </div>

          {/* Botones Principales de Exportación Corporativa (Fase 3: PDF / Excel) e Inclusión Histórica */}
          <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
            <button
              type="button"
              onClick={() => setIncludeHistorical(!includeHistorical)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md ${
                includeHistorical
                  ? 'bg-purple-600 text-white shadow-purple-950/50'
                  : 'bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-900/40'
              }`}
              title="Conmutar inclusión de camadas y paridas pasadas para sustentar la rentabilidad real"
            >
              <History className="w-3.5 h-3.5 text-purple-300" />
              <span>{includeHistorical ? 'Histórico: Incluido' : 'Incluir Histórico'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-900/40 text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5 text-rose-400" />
              <span>{isExportingPdf ? 'Generando PDF...' : 'Exportar Reporte (PDF)'}</span>
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExportingExcel}
              className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-900/40 text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isExportingExcel ? 'Generando Excel...' : 'Exportar Datos (Excel)'}</span>
            </button>
          </div>
        </div>

        {/* Banner de Sustentación Histórica de Rentabilidad Real (Fase 3) */}
        {includeHistorical && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/60 via-slate-900 to-emerald-950/60 border border-purple-500/40 space-y-2 animate-fadeIn shadow-lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <span className="text-xs font-black uppercase text-purple-300 flex items-center gap-1.5 font-mono">
                <Sparkles className="w-4 h-4 text-purple-400" />
                Sustentación de Rentabilidad Real Acumulada del Negocio Hasta Ahora
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800">
                {historicalProfitability.consolidated.totalBatches} Lotes Auditados (Sin alterar libro de caja)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center font-mono">
              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-bold">ROI Real Global</span>
                <strong className="text-base text-emerald-400 font-black">
                  {historicalProfitability.consolidated.roiPercentage.toFixed(2)}%
                </strong>
                <span className="text-[9px] text-slate-500 block">Sobre inversión total</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-bold">Utilidad Real Acumulada</span>
                <strong className="text-base text-white font-black">
                  ${historicalProfitability.consolidated.netProfitUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </strong>
                <span className="text-[9px] text-slate-500 block">Ventas: ${historicalProfitability.consolidated.totalSalesUSD.toLocaleString()}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-bold">ROI Línea Avícola</span>
                <strong className="text-base text-amber-300 font-black">
                  {historicalProfitability.avian.roiPercentage.toFixed(2)}%
                </strong>
                <span className="text-[9px] text-slate-500 block">{historicalProfitability.avian.totalBatches} camadas cerradas</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-bold">ROI Línea Porcina</span>
                <strong className="text-base text-pink-300 font-black">
                  {historicalProfitability.porcine.roiPercentage.toFixed(2)}%
                </strong>
                <span className="text-[9px] text-slate-500 block">{historicalProfitability.porcine.totalBatches} paridas con merma</span>
              </div>
            </div>
          </div>
        )}

        {/* Feedback visual de descarga de documentos */}
        {exportFeedback && (
          <div className="px-3.5 py-2 bg-emerald-950/40 border border-emerald-700/50 rounded-xl text-xs font-mono text-emerald-300 flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{exportFeedback}</span>
          </div>
        )}

        {/* Date Range Picker y Presets */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400 font-mono text-[11px]">Desde:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-white font-mono text-xs outline-none cursor-pointer"
              />
            </div>
            <span className="text-slate-600 font-bold">→</span>
            <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400 font-mono text-[11px]">Hasta:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-white font-mono text-xs outline-none cursor-pointer"
              />
            </div>
          </div>

          {/* Presets de Tiempo */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 w-full sm:w-auto">
            <button
              onClick={setPresetCurrentWeek}
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              Semana
            </button>
            <button
              onClick={setPresetCurrentMonth}
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              Mes Actual
            </button>
            <button
              onClick={setPresetQuarter}
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              Trimestre
            </button>
            <button
              onClick={setPresetYear}
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              Año Completo
            </button>
          </div>
        </div>

        {/* Selector de Pestaña Principal (Estado de Resultados vs Balance General) */}
        <div className="flex gap-2 p-1 bg-slate-950 rounded-2xl border border-slate-800">
          <button
            onClick={() => setActiveView('PL')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeView === 'PL'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Estado de Resultados (P&amp;L Operativo)</span>
          </button>
          <button
            onClick={() => setActiveView('BALANCE')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeView === 'BALANCE'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>Balance General (Fotografía Patrimonial)</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VISTA 1: ESTADO DE RESULTADOS (P&L) */}
      {/* ========================================================================= */}
      {activeView === 'PL' && (
        <div className="space-y-6">
          {/* Banner Zero-State Informativo si no hay transacciones en el período */}
          {incomeStatement.transactionCount === 0 && (
            <div className="bg-slate-900/95 border border-amber-500/40 rounded-2xl p-4 flex items-start sm:items-center gap-3 text-xs text-amber-200/90 shadow-xl">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5 sm:mt-0" />
              <div className="flex-1">
                <span className="font-bold text-amber-300">Sin actividad operativa registrada en el período:</span>{' '}
                No se identificaron transacciones contables en el rango del {startDate} al {endDate}. Las métricas se muestran en $0.00 / Bs. 0,00 de forma determinista y sin inferencias artificiales.
              </div>
            </div>
          )}
          {/* Tarjetas KPI de Resumen Ejecutivo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Ingresos Brutos */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold">Ingresos Brutos</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                  {incomeStatement.transactionCount} movs
                </span>
              </div>
              <div className="text-xl font-bold font-mono text-emerald-400">
                ${incomeStatement.revenue.totalGrossRevenueUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
              </div>
              <div className="text-xs font-mono text-slate-400">
                Bs. {incomeStatement.revenue.totalGrossRevenueVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
                Ventas de biomasa y rubros procesados
              </p>
            </div>

            {/* Costos Operativos Directos (COGS) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold">Costos Directos (COGS)</span>
                <TrendingDown className="w-4 h-4 text-rose-400" />
              </div>
              <div className="text-xl font-bold font-mono text-rose-400">
                ${incomeStatement.cogs.totalCogsUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
              </div>
              <div className="text-xs font-mono text-slate-400">
                Bs. {incomeStatement.cogs.totalCogsVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
                Alimento balanceado y materias primas
              </p>
            </div>

            {/* EBITDA */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold">EBITDA Operativo</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold">
                  {incomeStatement.ebitda.marginPercent}%
                </span>
              </div>
              <div className="text-xl font-bold font-mono text-cyan-300">
                ${incomeStatement.ebitda.amountUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
              </div>
              <div className="text-xs font-mono text-slate-400">
                Bs. {incomeStatement.ebitda.amountVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
                Flujo de caja operativo antes de tributos
              </p>
            </div>

            {/* Utilidad Neta */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold">Utilidad Neta</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                  {incomeStatement.netIncome.marginPercent}%
                </span>
              </div>
              <div className="text-xl font-bold font-mono text-white">
                ${incomeStatement.netIncome.profitUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
              </div>
              <div className="text-xs font-mono text-slate-400">
                Bs. {incomeStatement.netIncome.profitVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
                Rendimiento neto final del ejercicio
              </p>
            </div>
          </div>

          {/* Tabla Desglosada del Estado de Resultados */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                  <span>Estructura Detallada del Estado de Resultados</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  Período evaluado: {startDate} al {endDate}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold font-mono uppercase text-[11px]">
                    <th className="py-3 px-4">Partida Contable / Concepto</th>
                    <th className="py-3 px-4 text-right">Monto (USD)</th>
                    <th className="py-3 px-4 text-right">Equivalente Oficial (VES)</th>
                    <th className="py-3 px-4 text-right">% Ingresos Brutos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {/* Ingresos Brutos */}
                  <tr className="bg-emerald-950/20 font-bold">
                    <td className="py-3 px-4 text-emerald-300 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      1. INGRESOS BRUTOS OPERATIVOS
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-300 font-bold">
                      ${incomeStatement.revenue.totalGrossRevenueUSD.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-400">
                      Bs. {incomeStatement.revenue.totalGrossRevenueVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-300">100.00%</td>
                  </tr>
                  <tr className="hover:bg-slate-800/30 text-slate-300">
                    <td className="py-2.5 px-4 pl-8">↳ Ventas de Biomasa Ganadera (Pollo / Porcino)</td>
                    <td className="py-2.5 px-4 text-right">${incomeStatement.revenue.biomassSalesUSD.toFixed(2)}</td>
                    <td className="py-2.5 px-4 text-right">Bs. {incomeStatement.revenue.biomassSalesVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right text-slate-400">
                      {incomeStatement.revenue.totalGrossRevenueUSD > 0
                        ? ((incomeStatement.revenue.biomassSalesUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2)
                        : '0.00'}%
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-800/30 text-slate-300">
                    <td className="py-2.5 px-4 pl-8">↳ Otros Ingresos Operativos y Facturación</td>
                    <td className="py-2.5 px-4 text-right">${incomeStatement.revenue.generalSalesUSD.toFixed(2)}</td>
                    <td className="py-2.5 px-4 text-right">Bs. {incomeStatement.revenue.generalSalesVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right text-slate-400">
                      {incomeStatement.revenue.totalGrossRevenueUSD > 0
                        ? ((incomeStatement.revenue.generalSalesUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2)
                        : '0.00'}%
                    </td>
                  </tr>

                  {/* COGS */}
                  <tr className="bg-rose-950/20 font-bold">
                    <td className="py-3 px-4 text-rose-300 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                      2. (-) COSTOS OPERATIVOS DIRECTOS (COGS)
                    </td>
                    <td className="py-3 px-4 text-right text-rose-300 font-bold">
                      ${incomeStatement.cogs.totalCogsUSD.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right text-rose-400">
                      Bs. {incomeStatement.cogs.totalCogsVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-300">
                      {incomeStatement.revenue.totalGrossRevenueUSD > 0
                        ? ((incomeStatement.cogs.totalCogsUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2)
                        : '0.00'}%
                    </td>
                  </tr>

                  {/* Utilidad Bruta */}
                  <tr className="bg-slate-800/40 font-bold border-y border-slate-700">
                    <td className="py-3 px-4 text-white">3. MARGEN BRUTO AGROINDUSTRIAL</td>
                    <td className="py-3 px-4 text-right text-white">
                      ${incomeStatement.grossProfit.profitUSD.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-300">
                      Bs. {incomeStatement.grossProfit.profitVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-400 font-bold">
                      {isNaN(incomeStatement.grossProfit.marginPercent) ? 0 : (incomeStatement.grossProfit.marginPercent ?? 0)}%
                    </td>
                  </tr>

                  {/* OPEX */}
                  <tr className="bg-amber-950/15 font-bold">
                    <td className="py-3 px-4 text-amber-300 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                      4. (-) GASTOS OPERATIVOS (OPEX)
                    </td>
                    <td className="py-3 px-4 text-right text-amber-300 font-bold">
                      ${incomeStatement.opex.totalOpexUSD.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right text-amber-400">
                      Bs. {incomeStatement.opex.totalOpexVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-300">
                      {incomeStatement.revenue.totalGrossRevenueUSD > 0
                        ? ((incomeStatement.opex.totalOpexUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2)
                        : '0.00'}%
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-800/30 text-slate-300">
                    <td className="py-2.5 px-4 pl-8">↳ Nómina Fija de Campo y Galponeros</td>
                    <td className="py-2.5 px-4 text-right">${incomeStatement.opex.payrollUSD.toFixed(2)}</td>
                    <td className="py-2.5 px-4 text-right">Bs. {incomeStatement.opex.payrollVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right text-slate-400">
                      {incomeStatement.revenue.totalGrossRevenueUSD > 0
                        ? ((incomeStatement.opex.payrollUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2)
                        : '0.00'}%
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-800/30 text-slate-300">
                    <td className="py-2.5 px-4 pl-8">↳ Honorarios Veterinarios y Profesionales</td>
                    <td className="py-2.5 px-4 text-right">${incomeStatement.opex.professionalFeesUSD.toFixed(2)}</td>
                    <td className="py-2.5 px-4 text-right">Bs. {incomeStatement.opex.professionalFeesVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right text-slate-400">
                      {incomeStatement.revenue.totalGrossRevenueUSD > 0
                        ? ((incomeStatement.opex.professionalFeesUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2)
                        : '0.00'}%
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-800/30 text-slate-300">
                    <td className="py-2.5 px-4 pl-8">↳ Servicios Operativos, Fletes y Mantenimiento</td>
                    <td className="py-2.5 px-4 text-right">${incomeStatement.opex.servicesAndLogisticsUSD.toFixed(2)}</td>
                    <td className="py-2.5 px-4 text-right">Bs. {incomeStatement.opex.servicesAndLogisticsVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right text-slate-400">
                      {incomeStatement.revenue.totalGrossRevenueUSD > 0
                        ? ((incomeStatement.opex.servicesAndLogisticsUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2)
                        : '0.00'}%
                    </td>
                  </tr>

                  {/* EBITDA */}
                  <tr className="bg-cyan-950/20 font-bold border-y border-cyan-800/50">
                    <td className="py-3 px-4 text-cyan-300">5. EBITDA OPERATIVO (Flujo de Caja Bruto)</td>
                    <td className="py-3 px-4 text-right text-cyan-300">
                      ${incomeStatement.ebitda.amountUSD.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right text-cyan-400">
                      Bs. {incomeStatement.ebitda.amountVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-right text-cyan-300 font-bold">
                      {isNaN(incomeStatement.ebitda.marginPercent) ? 0 : (incomeStatement.ebitda.marginPercent ?? 0)}%
                    </td>
                  </tr>

                  {/* Impuestos */}
                  <tr className="hover:bg-slate-800/30 text-slate-300">
                    <td className="py-2.5 px-4 pl-8 text-slate-400">6. (-) Cargas Tributarias / Impuestos SENIAT</td>
                    <td className="py-2.5 px-4 text-right text-rose-300">${incomeStatement.taxes.totalTaxesUSD.toFixed(2)}</td>
                    <td className="py-2.5 px-4 text-right text-rose-400">Bs. {incomeStatement.taxes.totalTaxesVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right text-slate-400">
                      {incomeStatement.revenue.totalGrossRevenueUSD > 0
                        ? ((incomeStatement.taxes.totalTaxesUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2)
                        : '0.00'}%
                    </td>
                  </tr>

                  {/* Utilidad Neta */}
                  <tr className="bg-emerald-950/40 text-white font-extrabold text-sm border-t-2 border-emerald-500">
                    <td className="py-4 px-4 text-emerald-300 flex items-center gap-2 font-sans">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      7. UTILIDAD NETA DEL EJERCICIO
                    </td>
                    <td className="py-4 px-4 text-right text-white">
                      ${incomeStatement.netIncome.profitUSD.toFixed(2)} USD
                    </td>
                    <td className="py-4 px-4 text-right text-emerald-400">
                      Bs. {incomeStatement.netIncome.profitVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-4 px-4 text-right text-emerald-300">
                      {isNaN(incomeStatement.netIncome.marginPercent) ? 0 : (incomeStatement.netIncome.marginPercent ?? 0)}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 2: BALANCE GENERAL (FOTOGRAFÍA PATRIMONIAL) */}
      {/* ========================================================================= */}
      {activeView === 'BALANCE' && (
        <div className="space-y-6">
          {/* Banner Zero-State Informativo si no hay saldos patrimoniales */}
          {balanceSheet.assets.totalAssetsUSD === 0 && balanceSheet.liabilities.totalLiabilitiesUSD === 0 && (
            <div className="bg-slate-900/95 border border-sky-500/40 rounded-2xl p-4 flex items-start sm:items-center gap-3 text-xs text-sky-200/90 shadow-xl">
              <AlertCircle className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5 sm:mt-0" />
              <div className="flex-1">
                <span className="font-bold text-sky-300">Sin balances patrimoniales acumulados:</span>{' '}
                No se registran activos ni pasivos al corte del {endDate}. La fotografía patrimonial se expone en estado base ($0.00 / Bs. 0,00) de forma determinista.
              </div>
            </div>
          )}
          {/* Tarjetas KPI de Solvencia y Balance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Activos */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold">Activo Total</span>
                <Building className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-xl font-bold font-mono text-emerald-400">
                ${balanceSheet.assets.totalAssetsUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
              </div>
              <div className="text-xs font-mono text-slate-400">
                Bs. {balanceSheet.assets.totalAssetsVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
                Caja, CRM, Biomasa en galpones e insumos
              </p>
            </div>

            {/* Total Pasivos */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold">Pasivo Total</span>
                <TrendingDown className="w-4 h-4 text-rose-400" />
              </div>
              <div className="text-xl font-bold font-mono text-rose-400">
                ${balanceSheet.liabilities.totalLiabilitiesUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
              </div>
              <div className="text-xs font-mono text-slate-400">
                Bs. {balanceSheet.liabilities.totalLiabilitiesVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
                Proveedores CRM, Nómina y Pasivo Técnico MTM
              </p>
            </div>

            {/* Patrimonio Neto */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold">Patrimonio Neto</span>
                <Scale className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-xl font-bold font-mono text-cyan-300">
                ${balanceSheet.equity.totalEquityUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
              </div>
              <div className="text-xs font-mono text-slate-400">
                Bs. {balanceSheet.equity.totalEquityVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
                Capital acumulado de los socios
              </p>
            </div>

            {/* Razón Corriente / Liquidez */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold">Razón Corriente</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                  {isNaN(balanceSheet.ratios.currentRatio) ? 0 : (balanceSheet.ratios.currentRatio ?? 0)}x
                </span>
              </div>
              <div className="text-xl font-bold font-mono text-white">
                ${(balanceSheet.ratios.netWorkingCapitalUSD ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
              </div>
              <div className="text-xs font-mono text-slate-400">
                Capital de Trabajo Neto
              </div>
              <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
                Endeudamiento: {isNaN(balanceSheet.ratios.debtToAssetsRatioPercent) ? 0 : (balanceSheet.ratios.debtToAssetsRatioPercent ?? 0)}% sobre activos
              </p>
            </div>
          </div>

          {/* Dos Columnas: Activo vs Pasivo + Patrimonio */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Columna Izquierda: ACTIVO */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl flex flex-col justify-between">
              <div>
                <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                    <Building className="w-4 h-4" />
                    <span>ESTRUCTURA DE ACTIVOS (RECURSOS)</span>
                  </h3>
                  <span className="text-xs font-mono text-emerald-400 font-bold">
                    ${balanceSheet.assets.totalAssetsUSD.toFixed(2)} USD
                  </span>
                </div>

                <div className="p-4 space-y-3 font-mono text-xs">
                  <div className="font-bold text-slate-300 text-[11px] uppercase tracking-wider pb-1 border-b border-slate-800">
                    Activo Corriente (Circulante)
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">↳ Efectivo en Caja y Bancos (Flujo Líquido)</span>
                    <span className="text-white font-bold">${balanceSheet.assets.current.cashAndBanksUSD.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">↳ Cuentas por Cobrar a Clientes (CRM)</span>
                    <span className="text-white font-bold">${balanceSheet.assets.current.accountsReceivableUSD.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">↳ Biomasa Ganadera Viva en Galpones (PEPS)</span>
                    <span className="text-emerald-400 font-bold">${balanceSheet.assets.current.liveBiologicalInventoryUSD.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">↳ Inventario de Alimento e Insumos en Almacén</span>
                    <span className="text-white font-bold">${balanceSheet.assets.current.processedAndSuppliesInventoryUSD.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center py-2 bg-emerald-950/20 px-3 rounded-xl border border-emerald-900/40 font-bold text-emerald-300">
                    <span>Subtotal Activo Corriente</span>
                    <span>${balanceSheet.assets.current.totalCurrentAssetsUSD.toFixed(2)} USD</span>
                  </div>

                  <div className="font-bold text-slate-300 text-[11px] uppercase tracking-wider pt-2 pb-1 border-b border-slate-800">
                    Activo No Corriente (Fijo)
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">↳ Infraestructura y Equipamiento de Campo</span>
                    <span className="text-white font-bold">${balanceSheet.assets.nonCurrent.farmInfrastructureUSD.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between font-mono font-bold text-sm text-emerald-400">
                <span>TOTAL ACTIVO:</span>
                <span>${balanceSheet.assets.totalAssetsUSD.toFixed(2)} USD</span>
              </div>
            </div>

            {/* Columna Derecha: PASIVO Y PATRIMONIO */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl flex flex-col justify-between">
              <div>
                <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-rose-300 flex items-center gap-2">
                    <Scale className="w-4 h-4" />
                    <span>PASIVO Y PATRIMONIO NETO</span>
                  </h3>
                  <span className="text-xs font-mono text-cyan-400 font-bold">
                    ${(balanceSheet.liabilities.totalLiabilitiesUSD + balanceSheet.equity.totalEquityUSD).toFixed(2)} USD
                  </span>
                </div>

                <div className="p-4 space-y-3 font-mono text-xs">
                  <div className="font-bold text-slate-300 text-[11px] uppercase tracking-wider pb-1 border-b border-slate-800">
                    Pasivo Corriente (Obligaciones a Corto Plazo)
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">↳ Cuentas por Pagar a Proveedores (CRM)</span>
                    <span className="text-rose-300 font-bold">${balanceSheet.liabilities.current.accountsPayableUSD.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">↳ Pasivos Laborales y Prestaciones Devengadas</span>
                    <span className="text-rose-300 font-bold">${balanceSheet.liabilities.current.laborLiabilitiesUSD.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">↳ Pasivo Técnico Mark-to-Market (Diferencial VES)</span>
                    <span className="text-amber-300 font-bold">${balanceSheet.liabilities.current.markToMarketTechnicalLiabilityUSD.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center py-2 bg-rose-950/20 px-3 rounded-xl border border-rose-900/40 font-bold text-rose-300">
                    <span>Subtotal Pasivo Corriente</span>
                    <span>${balanceSheet.liabilities.totalLiabilitiesUSD.toFixed(2)} USD</span>
                  </div>

                  <div className="font-bold text-slate-300 text-[11px] uppercase tracking-wider pt-2 pb-1 border-b border-slate-800">
                    Patrimonio Neto (Capital y Resultados)
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">↳ Resultados y Reservas Acumuladas</span>
                    <span className="text-cyan-300 font-bold">${balanceSheet.equity.retainedEarningsUSD.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center py-2 bg-cyan-950/20 px-3 rounded-xl border border-cyan-900/40 font-bold text-cyan-300">
                    <span>Subtotal Patrimonio Neto</span>
                    <span>${balanceSheet.equity.totalEquityUSD.toFixed(2)} USD</span>
                  </div>
                </div>
              </div>

              {/* Cuadre Contable */}
              <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between font-mono font-bold text-sm">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>TOTAL PASIVO + PATRIMONIO:</span>
                </span>
                <span className="text-white">
                  ${(balanceSheet.liabilities.totalLiabilitiesUSD + balanceSheet.equity.totalEquityUSD).toFixed(2)} USD
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
