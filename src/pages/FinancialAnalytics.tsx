import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { BiologicalBatch } from '../types/inventory';
import { PaymentRecord } from '../types/finance';
import { InventoryService } from '../services/inventoryService';
import { FinanceService } from '../services/financeService';
import {
  ReportingService,
  DateRange,
  FinancialAnalyticsSummary,
  CloudReportJob,
} from '../services/reportingService';
import { triggerDirectBlobDownload } from '../utils/pdfTemplateEngine';
import {
  Calendar,
  FileSpreadsheet,
  FileText,
  TrendingUp,
  DollarSign,
  PieChart,
  Download,
  AlertTriangle,
  Mail,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldAlert,
  Layers,
  ArrowRight,
} from 'lucide-react';

export const FinancialAnalytics: React.FC = () => {
  const { userProfile } = useAuth();

  // Range State (Default: Semana calendario actual Lunes a Domingo)
  const [dateRange, setDateRange] = useState<DateRange>(() =>
    ReportingService.getCurrentCalendarWeekRange()
  );

  // Collections Data
  const [batches, setBatches] = useState<BiologicalBatch[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [currentRate, setCurrentRate] = useState<number>(0);

  // Background Cloud Jobs State
  const [activeJobs, setActiveJobs] = useState<CloudReportJob[]>([]);
  const [isProcessingJob, setIsProcessingJob] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [rangeValidationMessage, setRangeValidationMessage] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  useEffect(() => {
    const unsubBatches = InventoryService.subscribeBatches((b) => setBatches(b));
    const unsubPayments = FinanceService.subscribePayments((p) => setPayments(p));
    FinanceService.fetchLatestBcvRate().then((r) => setCurrentRate(r));
    const unsubRate = FinanceService.subscribeLatestRate((r) => setCurrentRate(r));

    return () => {
      unsubBatches();
      unsubPayments();
      unsubRate();
    };
  }, []);

  const notify = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 7000);
  };

  // Validate Range
  const rangeValidation = useMemo(() => {
    return ReportingService.validateDateRange(dateRange);
  }, [dateRange]);

  // Compute Summary Metrics
  const summary: FinancialAnalyticsSummary = useMemo(() => {
    return ReportingService.computeAnalytics(dateRange, batches, payments, currentRate);
  }, [dateRange, batches, payments, currentRate]);

  const handleStartDateChange = (val: string) => {
    setDateRange((prev) => ({ ...prev, startDate: val }));
  };

  const handleEndDateChange = (val: string) => {
    setDateRange((prev) => ({ ...prev, endDate: val }));
  };

  const setPresetCurrentWeek = () => {
    setDateRange(ReportingService.getCurrentCalendarWeekRange());
  };

  const setPresetCurrentMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    setDateRange({ startDate: firstDay, endDate: lastDay });
  };

  const setPresetQuarter = () => {
    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(now.getMonth() - 3);
    setDateRange({
      startDate: threeMonthsAgo.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0],
    });
  };

  const setPresetAnnual = () => {
    const now = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);
    setDateRange({
      startDate: oneYearAgo.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0],
    });
  };

  // Export Handlers
  const handleExportExcel = async () => {
    if (!rangeValidation.isValid) {
      notify(rangeValidation.error || 'Rango de fechas inválido.', 'error');
      return;
    }

    setIsExportingExcel(true);
    try {
      const res = ReportingService.exportExcelReport(summary, batches, payments);
      if (res.requiresBackgroundJob) {
        // Regla de umbral > 3 meses: Encolar en Cloud Functions
        setIsProcessingJob(true);
        notify('Ventana superior a 3 meses detectada. Delegando procesamiento asíncrono a Cloud Function para prevenir sobrecarga de memoria del cliente...', 'info');
        try {
          const job = await ReportingService.dispatchBackgroundReportJob('EXCEL', dateRange);
          setActiveJobs((prev) => [job, ...prev]);
          notify(`Procesamiento en segundo plano completado. El enlace funcional del reporte Excel fue enviado al correo del administrador (${job.adminEmail}).`);
        } finally {
          setIsProcessingJob(false);
        }
      } else if (res.directDownload) {
        // Descarga directa e inmutable mediante Blob y Anchor (cero popups, cero window.open)
        triggerDirectBlobDownload(res.directDownload.blob, res.directDownload.filename);
        notify(`Reporte Excel descargado directamente con membrete corporativo oficial inmutable (${res.directDownload.filename}).`);
      }
    } catch (err: any) {
      console.error('[FinancialAnalytics] Error exportando Excel:', err);
      notify(`Error al procesar la exportación Excel: ${err?.message || 'Error desconocido'}`, 'error');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleExportPdf = async () => {
    if (!rangeValidation.isValid) {
      notify(rangeValidation.error || 'Rango de fechas inválido.', 'error');
      return;
    }

    setIsExportingPdf(true);
    try {
      const res = ReportingService.exportPdfReport(summary);
      if (res.requiresBackgroundJob) {
        setIsProcessingJob(true);
        notify('Ventana superior a 3 meses detectada. Encolando renderizado vectorial en Cloud Functions en segundo plano...', 'info');
        try {
          const job = await ReportingService.dispatchBackgroundReportJob('PDF', dateRange);
          setActiveJobs((prev) => [job, ...prev]);
          notify(`Reporte PDF generado en segundo plano y despachado al correo institucional (${job.adminEmail}).`);
        } finally {
          setIsProcessingJob(false);
        }
      } else if (res.directDownload) {
        // Descarga directa mediante Blob y Anchor
        triggerDirectBlobDownload(res.directDownload.blob, res.directDownload.filename);
        notify(`Reporte PDF descargado directamente a su dispositivo sin ventanas emergentes (${res.directDownload.filename}).`);
      } else {
        notify('Reporte PDF generado exitosamente.');
      }
    } catch (err: any) {
      console.error('[FinancialAnalytics] Error exportando PDF:', err);
      notify(`Error al procesar la exportación PDF: ${err?.message || 'Error desconocido'}`, 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between text-xs font-medium border shadow-xl animate-fadeIn ${
            notification.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
              : notification.type === 'info'
              ? 'bg-cyan-950/80 border-cyan-500/50 text-cyan-200'
              : 'bg-red-950/80 border-red-500/50 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : notification.type === 'info' ? (
              <Clock className="w-4 h-4 text-cyan-400 animate-spin" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400" />
            )}
            <span>{notification.text}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400">✕</button>
        </div>
      )}

      {/* Header and Controls */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Motor Analítico Temporal, EBITDA & Exportación
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-emerald-950 text-emerald-400 border border-emerald-800">
              Fase 4 Activa
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Cálculo de márgenes operativos, EBITDA y exportación delegada a Cloud Functions con arquitectura anti-colapso.
          </p>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            disabled={isProcessingJob || isExportingExcel || !rangeValidation.isValid}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold transition flex items-center gap-2 shadow-lg shadow-emerald-950/40"
          >
            {isExportingExcel ? (
              <Clock className="w-4 h-4 animate-spin text-white" />
            ) : (
              <FileSpreadsheet className="w-4 h-4" />
            )}
            <span>{isExportingExcel ? 'Generando XLSX...' : 'Exportar Excel (XLSX)'}</span>
          </button>
          <button
            onClick={handleExportPdf}
            disabled={isProcessingJob || isExportingPdf || !rangeValidation.isValid}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 text-slate-200 text-xs font-semibold transition flex items-center gap-2"
          >
            {isExportingPdf ? (
              <Clock className="w-4 h-4 animate-spin text-red-400" />
            ) : (
              <FileText className="w-4 h-4 text-red-400" />
            )}
            <span>{isExportingPdf ? 'Generando PDF...' : 'Exportar PDF'}</span>
          </button>
        </div>
      </div>

      {/* Date Range Selector Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="flex items-center gap-2 text-xs">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400">
                  Desde
                </label>
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-white font-mono outline-none"
                />
              </div>
              <span className="text-slate-500 mt-3">➔</span>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400">
                  Hasta
                </label>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-white font-mono outline-none"
                />
              </div>
            </div>
          </div>

          {/* Preset Buttons */}
          <div className="flex items-center gap-1.5 text-xs">
            <button
              onClick={setPresetCurrentWeek}
              className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white"
            >
              Semana Actual
            </button>
            <button
              onClick={setPresetCurrentMonth}
              className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white"
            >
              Mes Actual
            </button>
            <button
              onClick={setPresetQuarter}
              className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white"
            >
              Trimestre (90d)
            </button>
            <button
              onClick={setPresetAnnual}
              className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white"
            >
              Anual (Máx 1 año)
            </button>
          </div>
        </div>

        {/* Range Status & Cloud Function Threshold Warning */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-xs font-mono">
          <div className="text-slate-400 flex items-center gap-2">
            <span>Días en ventana: <strong className="text-white">{summary.daysInRange} días</strong></span>
            <span>•</span>
            <span>Tasa BCV vigente: <strong className="text-emerald-400">{summary.averageExchangeRate.toFixed(2)} Bs/$</strong></span>
          </div>

          {summary.isOverThreeMonths ? (
            <div className="flex items-center gap-1.5 text-amber-400 bg-amber-950/40 px-2.5 py-1 rounded-lg border border-amber-800/40">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>Rango &gt; 3 meses: Se activará Cloud Function en segundo plano hacia {userProfile?.email || 'rdrj.mppd@gmail.com'}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-800/40">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Rango estándar (&le; 3 meses): Procesamiento inmediato del cliente</span>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards: EBITDA and Financial Performance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Ingresos Brutos */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider">Ingresos Brutos</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            ${summary.totalRevenueUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-2 truncate">
            ≈ {(summary.totalRevenueUSD * summary.averageExchangeRate).toLocaleString()} Bs.
          </div>
        </div>

        {/* Card 2: Costos Operativos */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider">Costos de Producción</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-300">
            ${(summary.totalFeedCostUSD + summary.operatingExpensesUSD).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-2">
            Alimento: ${summary.totalFeedCostUSD.toFixed(0)} | Insumos: ${summary.operatingExpensesUSD.toFixed(0)}
          </div>
        </div>

        {/* Card 3: Margen Bruto */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider">Margen Bruto</span>
            <PieChart className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-cyan-300">
            ${summary.grossMarginUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-emerald-400 font-mono mt-2 font-bold">
            {summary.grossMarginPercent}% sobre facturación
          </div>
        </div>

        {/* Card 4: EBITDA Operativo */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-emerald-500/40 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider text-emerald-400">EBITDA Operativo</span>
            <span className="text-[10px] font-mono bg-emerald-950 px-2 py-0.5 rounded text-emerald-300 border border-emerald-800">
              EBITDA Real
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-300">
            ${summary.ebitdaUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-emerald-400 font-mono mt-2 flex items-center justify-between">
            <span>Margen EBITDA: {summary.ebitdaMarginPercent}%</span>
            <span>≈ {summary.ebitdaVES.toLocaleString()} Bs.</span>
          </div>
        </div>
      </div>

      {/* Tabla Desglosada de Estado de Resultados EBITDA */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white">
            Estado Analítico de Rendimiento Operativo (EBITDA)
          </h3>
          <span className="text-xs font-mono text-slate-400">
            {summary.range.startDate} al {summary.range.endDate}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 uppercase tracking-wider text-[11px] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Línea de Operación Agroindustrial</th>
                <th className="py-3 px-4 font-semibold">Monto USD</th>
                <th className="py-3 px-4 font-semibold">Equivalente VES</th>
                <th className="py-3 px-4 font-semibold text-right">% Margen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              <tr>
                <td className="py-3.5 px-4 font-sans font-medium text-white">
                  (+) Ingresos Brutos de Producción Biológica (Ventas Lotes)
                </td>
                <td className="py-3.5 px-4 text-emerald-400 font-bold">
                  ${summary.totalRevenueUSD.toFixed(2)}
                </td>
                <td className="py-3.5 px-4 text-slate-300">
                  {(summary.totalRevenueUSD * summary.averageExchangeRate).toLocaleString()} Bs.
                </td>
                <td className="py-3.5 px-4 text-right text-slate-400">100.00%</td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-sans text-slate-300 pl-6">
                  (-) Costos Directos de Alimentación (Avícola / Porcino 4 sacos a $40)
                </td>
                <td className="py-3.5 px-4 text-amber-400">
                  -${summary.totalFeedCostUSD.toFixed(2)}
                </td>
                <td className="py-3.5 px-4 text-slate-400">
                  -{(summary.totalFeedCostUSD * summary.averageExchangeRate).toLocaleString()} Bs.
                </td>
                <td className="py-3.5 px-4 text-right text-slate-400">
                  {summary.totalRevenueUSD > 0 ? ((summary.totalFeedCostUSD / summary.totalRevenueUSD) * 100).toFixed(2) : 0}%
                </td>
              </tr>
              <tr className="bg-slate-950/50 font-bold text-white">
                <td className="py-3.5 px-4 font-sans text-emerald-300 uppercase tracking-wide">
                  (=) MARGEN BRUTO OPERATIVO
                </td>
                <td className="py-3.5 px-4 text-emerald-300 text-sm">
                  ${summary.grossMarginUSD.toFixed(2)}
                </td>
                <td className="py-3.5 px-4 text-slate-200">
                  {(summary.grossMarginUSD * summary.averageExchangeRate).toLocaleString()} Bs.
                </td>
                <td className="py-3.5 px-4 text-right text-emerald-400">
                  {summary.grossMarginPercent}%
                </td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-sans text-slate-300 pl-6">
                  (-) Insumos Sanitarios, Vitaminas, Bioseguridad y Gastos de Campo
                </td>
                <td className="py-3.5 px-4 text-red-400">
                  -${summary.operatingExpensesUSD.toFixed(2)}
                </td>
                <td className="py-3.5 px-4 text-slate-400">
                  -{(summary.operatingExpensesUSD * summary.averageExchangeRate).toLocaleString()} Bs.
                </td>
                <td className="py-3.5 px-4 text-right text-slate-400">
                  {summary.totalRevenueUSD > 0 ? ((summary.operatingExpensesUSD / summary.totalRevenueUSD) * 100).toFixed(2) : 0}%
                </td>
              </tr>
              <tr className="bg-emerald-950/40 font-bold border-t-2 border-emerald-500/40">
                <td className="py-4 px-4 font-sans text-emerald-400 text-sm uppercase tracking-wide">
                  (=) EBITDA (Earnings Before Interest, Taxes, Depreciation &amp; Amortization)
                </td>
                <td className="py-4 px-4 text-emerald-300 text-base">
                  ${summary.ebitdaUSD.toFixed(2)}
                </td>
                <td className="py-4 px-4 text-emerald-400 text-sm">
                  {summary.ebitdaVES.toLocaleString()} Bs.
                </td>
                <td className="py-4 px-4 text-right text-emerald-300 text-sm">
                  {summary.ebitdaMarginPercent}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Cloud Functions Background Jobs Dispatch Monitor */}
      {activeJobs.length > 0 && (
        <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-cyan-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                Cola de Exportación en Segundo Plano (Cloud Functions)
              </h3>
            </div>
            <span className="text-[10px] font-mono bg-cyan-950 text-cyan-300 px-2.5 py-0.5 rounded border border-cyan-800">
              Background Processing Activo
            </span>
          </div>

          <div className="space-y-2">
            {activeJobs.map((job) => (
              <div
                key={job.id}
                className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs font-mono"
              >
                <div>
                  <div className="flex items-center gap-2 font-bold text-white font-sans">
                    <span>Reporte {job.reportType}</span>
                    <span className="text-[10px] text-slate-400">({job.id})</span>
                  </div>
                  <div className="text-slate-400 mt-1">
                    Ventana: {job.dateRange.startDate} al {job.dateRange.endDate} • Destino:{' '}
                    <strong className="text-cyan-300">{job.adminEmail}</strong>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Enviado al correo</span>
                  </span>
                  {job.downloadUrl && (
                    <a
                      href={job.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-sans font-semibold flex items-center gap-1.5 transition shadow"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Descargar Enlace Seguro</span>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
