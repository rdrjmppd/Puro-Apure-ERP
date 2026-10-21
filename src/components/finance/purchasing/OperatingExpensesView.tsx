/**
 * ============================================================================
 * PURO APURE ERP — COMPONENTE: OperatingExpensesView
 * ============================================================================
 * Vista ejecutiva para la gestión de Gastos Operativos, Materiales, Equipos
 * y Registro Histórico Retroactivo con Cruce Contable de Camadas Pasadas.
 * 100% React nativo, sin bloqueos, responsive PC y móvil (>= 375px).
 * ============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Receipt,
  Plus,
  Clock,
  Search,
  Filter,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Building2,
  Laptop,
  HardHat,
  Users,
  Wrench,
  Sparkles,
  FileText,
  FileSpreadsheet,
  Trash2,
  Edit2,
  ExternalLink,
  Layers,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import {
  OperatingExpense,
  GastoCategoria,
  GastoTipoRegistro,
  HistoricalConsolidatedPnl,
} from '../../../types/purchasing';
import { DualEntity } from '../../../types/finance';
import { HistoricalBatchRecord } from '../../../types/inventory';
import { ExpensesService } from '../../../services/expensesService';
import { InventoryService } from '../../../services/inventoryService';
import { OperatingExpenseModal } from './OperatingExpenseModal';
import {
  exportExpensesPdf,
  exportExpensesToExcel,
  exportConsolidatedHistoricalPnlPdf,
} from '../../../utils/expensesExportEngine';
import { centsRound } from '../../../services/financialAnalyticsService';

interface OperatingExpensesViewProps {
  bcvRate: number;
  userId: string;
  suppliers: DualEntity[];
  onExportPdf?: (expenses: OperatingExpense[]) => void;
  onExportExcel?: (expenses: OperatingExpense[]) => void;
  onExportPnlPdf?: (pnl: HistoricalConsolidatedPnl) => void;
}

export const OperatingExpensesView: React.FC<OperatingExpensesViewProps> = ({
  bcvRate,
  userId,
  suppliers,
  onExportPdf,
  onExportExcel,
  onExportPnlPdf,
}) => {
  // Estado de gastos y camadas históricas
  const [expenses, setExpenses] = useState<OperatingExpense[]>([]);
  const [historicalBatches, setHistoricalBatches] = useState<HistoricalBatchRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Sub-pestaña interna: 'LISTADO' | 'CRUCE_HISTORICO'
  const [viewTab, setViewTab] = useState<'LISTADO' | 'CRUCE_HISTORICO'>('LISTADO');

  // Filtros
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('TODAS');
  const [selectedTipo, setSelectedTipo] = useState<string>('TODOS');

  // Modal de gasto
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [expenseToEdit, setExpenseToEdit] = useState<OperatingExpense | null>(null);
  const [modalInitialMode, setModalInitialMode] = useState<GastoTipoRegistro>('OPERATIVO_ACTUAL');

  // Modal de comprobante adjunto
  const [viewReceiptUrl, setViewReceiptUrl] = useState<string | null>(null);

  // Suscripción a gastos y camadas históricas
  useEffect(() => {
    const unsubExpenses = ExpensesService.subscribeExpenses((list) => {
      setExpenses(list);
      setLoading(false);
    });

    const unsubBatches = InventoryService.subscribeHistoricalBatches((batches) => {
      setHistoricalBatches(batches);
    });

    return () => {
      unsubExpenses();
      unsubBatches();
    };
  }, []);

  // Calcular Cruce Histórico Consolidado
  const consolidatedPnl = useMemo(() => {
    return ExpensesService.calculateConsolidatedHistoricalPnl(expenses, historicalBatches);
  }, [expenses, historicalBatches]);

  // Métricas rápidas de gastos del mes actual y totales
  const metrics = useMemo(() => {
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    let totalMesUSD = 0;
    let totalCapexUSD = 0;
    let totalConstruccionUSD = 0;
    let totalHistoricosUSD = 0;

    expenses.forEach((exp) => {
      const amount = Number(exp.montoUSD) || 0;
      if (exp.tipoRegistro === 'HISTORICO_RETROACTIVO') {
        totalHistoricosUSD = centsRound(totalHistoricosUSD + amount);
      } else if (exp.fecha.startsWith(currentMonth)) {
        totalMesUSD = centsRound(totalMesUSD + amount);
      }

      if (exp.naturaleza === 'CAPEX' || exp.categoria === 'EQUIPOS_TECNOLOGIA') {
        totalCapexUSD = centsRound(totalCapexUSD + amount);
      }
      if (exp.categoria === 'CONSTRUCCION_INFRAESTRUCTURA') {
        totalConstruccionUSD = centsRound(totalConstruccionUSD + amount);
      }
    });

    return {
      totalMesUSD: centsRound(totalMesUSD),
      totalMesVES: centsRound(totalMesUSD * bcvRate),
      totalHistoricosUSD: centsRound(totalHistoricosUSD),
      totalCapexUSD: centsRound(totalCapexUSD),
      totalConstruccionUSD: centsRound(totalConstruccionUSD),
    };
  }, [expenses, bcvRate]);

  // Filtrado de gastos
  const filteredExpenses = useMemo(() => {
    return expenses.filter((exp) => {
      // Filtro por búsqueda
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesConcept = exp.concepto.toLowerCase().includes(q);
        const matchesComercio = exp.proveedorComercio.toLowerCase().includes(q);
        const matchesFactura = exp.numeroComprobante?.toLowerCase().includes(q);
        const matchesDesc = exp.descripcionDetallada?.toLowerCase().includes(q);
        if (!matchesConcept && !matchesComercio && !matchesFactura && !matchesDesc) {
          return false;
        }
      }

      // Filtro por categoría
      if (selectedCategory !== 'TODAS' && exp.categoria !== selectedCategory) {
        return false;
      }

      // Filtro por tipo de registro
      if (selectedTipo === 'SOLO_ACTUALES' && exp.tipoRegistro !== 'OPERATIVO_ACTUAL') {
        return false;
      }
      if (selectedTipo === 'SOLO_HISTORICOS' && exp.tipoRegistro !== 'HISTORICO_RETROACTIVO') {
        return false;
      }

      return true;
    });
  }, [expenses, searchQuery, selectedCategory, selectedTipo]);

  const handleOpenNewActual = () => {
    setExpenseToEdit(null);
    setModalInitialMode('OPERATIVO_ACTUAL');
    setIsModalOpen(true);
  };

  const handleOpenNewHistorical = () => {
    setExpenseToEdit(null);
    setModalInitialMode('HISTORICO_RETROACTIVO');
    setIsModalOpen(true);
  };

  const handleEdit = (exp: OperatingExpense) => {
    setExpenseToEdit(exp);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('¿Está seguro de eliminar este registro de gasto? Esta acción actualizará los balances contables.')) {
      await ExpensesService.deleteExpense(id);
    }
  };

  const formatCategoryLabel = (cat: GastoCategoria) => {
    switch (cat) {
      case 'CONSTRUCCION_INFRAESTRUCTURA':
        return 'Construcción';
      case 'EQUIPOS_TECNOLOGIA':
        return 'Tecnología / Equipos';
      case 'PAPELERIA_OFICINA':
        return 'Papelería';
      case 'HERRAMIENTAS_OPERATIVAS':
        return 'Herramientas';
      case 'MANTENIMIENTO_SERVICIOS':
        return 'Mantenimiento';
      case 'PAGO_PROVEEDORES_HISTORICO':
        return 'Pago Proveedor';
      case 'PAGO_EMPLEADOS_MANO_OBRA':
        return 'Mano de Obra / Nómina';
      case 'GASTOS_OPERATIVOS_GENERALES':
      default:
        return 'Operativo General';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. BARRA SUPERIOR: Título, Conmutador de Pestaña y Botones de Acción */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-4 rounded-2xl shadow-lg">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-400" />
            <span>Gastos Operativos, Misceláneos e Histórico</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Materiales, tecnología, reparaciones y cruce con ganancias de camadas pasadas
          </p>
        </div>

        {/* Conmutador de Sub-Pestaña */}
        <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800">
          <button
            onClick={() => setViewTab('LISTADO')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              viewTab === 'LISTADO'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Listado de Gastos</span>
          </button>

          <button
            onClick={() => setViewTab('CRUCE_HISTORICO')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              viewTab === 'CRUCE_HISTORICO'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Balance Histórico Consolidado</span>
          </button>
        </div>

        {/* Botones de Registro Rápido */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleOpenNewActual}
            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-md shadow-emerald-950/50 flex items-center gap-1.5 cursor-pointer min-h-[44px]"
            title="Registrar compra o gasto del día a día con factura"
          >
            <Plus className="w-4 h-4" />
            <span>Gasto del Día</span>
          </button>

          <button
            onClick={handleOpenNewHistorical}
            className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition shadow-md shadow-purple-950/50 flex items-center gap-1.5 cursor-pointer min-h-[44px]"
            title="Registrar compras, pagos a proveedores o empleados de fechas pasadas (factura opcional)"
          >
            <Clock className="w-4 h-4" />
            <span>Gasto Histórico Pasado</span>
          </button>

          {viewTab === 'LISTADO' ? (
            <>
              <button
                onClick={() => exportExpensesPdf(filteredExpenses, bcvRate)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition cursor-pointer min-h-[44px] flex items-center gap-1.5"
                title="Descargar listado en PDF"
              >
                <FileText className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">PDF</span>
              </button>
              <button
                onClick={() => exportExpensesToExcel(filteredExpenses, bcvRate)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition cursor-pointer min-h-[44px] flex items-center gap-1.5"
                title="Descargar listado en Excel"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">Excel</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => exportConsolidatedHistoricalPnlPdf(consolidatedPnl, bcvRate)}
              className="px-3 py-2 rounded-xl bg-purple-900/60 hover:bg-purple-800/80 text-purple-200 border border-purple-700/60 text-xs font-bold transition cursor-pointer min-h-[44px] flex items-center gap-1.5 shadow-md shadow-purple-950/40"
              title="Descargar Estado de Resultados Histórico Consolidado en PDF"
            >
              <FileText className="w-4 h-4 text-purple-300" />
              <span>Exportar Balance PDF</span>
            </button>
          )}
        </div>
      </div>

      {/* PESTAÑA 1: LISTADO DE GASTOS */}
      {viewTab === 'LISTADO' && (
        <>
          {/* Métricas Rápidas en Tarjetas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow-lg">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <span>Gastos del Mes (USD)</span>
                <DollarSign className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-2 text-2xl font-bold font-mono text-slate-100">
                ${metrics.totalMesUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-slate-400 font-mono mt-0.5">
                ≈ Bs. {metrics.totalMesVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow-lg">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <span>Gastos Históricos Pasados</span>
                <Clock className="w-4 h-4 text-purple-400" />
              </div>
              <div className="mt-2 text-2xl font-bold font-mono text-purple-300">
                ${metrics.totalHistoricosUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-purple-400/80 mt-0.5">
                Cuentas y compras retroactivas registradas
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow-lg">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <span>Tecnología & Equipos (CAPEX)</span>
                <Laptop className="w-4 h-4 text-amber-400" />
              </div>
              <div className="mt-2 text-2xl font-bold font-mono text-amber-300">
                ${metrics.totalCapexUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Inversión en equipamiento menor
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow-lg">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <span>Construcción & Reparaciones</span>
                <HardHat className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="mt-2 text-2xl font-bold font-mono text-cyan-300">
                ${metrics.totalConstruccionUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Infraestructura y galpones
              </div>
            </div>
          </div>

          {/* Barra de Filtros y Búsqueda */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 p-3 rounded-2xl">
            {/* Buscador */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por concepto, comercio, factura o descripción..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition min-h-[44px]"
              />
            </div>

            {/* Selector de Categoría */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition min-h-[44px]"
              >
                <option value="TODAS">Todas las Categorías</option>
                <option value="CONSTRUCCION_INFRAESTRUCTURA">Construcción</option>
                <option value="EQUIPOS_TECNOLOGIA">Tecnología / Equipos</option>
                <option value="PAPELERIA_OFICINA">Papelería</option>
                <option value="HERRAMIENTAS_OPERATIVAS">Herramientas</option>
                <option value="MANTENIMIENTO_SERVICIOS">Mantenimiento</option>
                <option value="PAGO_PROVEEDORES_HISTORICO">Pagos a Proveedor</option>
                <option value="PAGO_EMPLEADOS_MANO_OBRA">Mano de Obra / Nómina</option>
                <option value="GASTOS_OPERATIVOS_GENERALES">Operativo General</option>
              </select>

              {/* Selector de Tipo */}
              <select
                value={selectedTipo}
                onChange={(e) => setSelectedTipo(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition min-h-[44px]"
              >
                <option value="TODOS">Todos los Tipos</option>
                <option value="SOLO_ACTUALES">Solo Gastos del Día</option>
                <option value="SOLO_HISTORICOS">Solo Históricos Pasados</option>
              </select>
            </div>
          </div>

          {/* Tabla de Gastos Responsiva */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold text-[11px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Fecha</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Concepto / Descripción</th>
                    <th className="py-3 px-4">Categoría</th>
                    <th className="py-3 px-4">Comercio / Beneficiario</th>
                    <th className="py-3 px-4">N° Factura</th>
                    <th className="py-3 px-4 text-right">Monto USD</th>
                    <th className="py-3 px-4 text-right">Monto VES</th>
                    <th className="py-3 px-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-500">
                        <Receipt className="w-12 h-12 text-slate-700 mx-auto mb-2" />
                        <div className="text-sm font-semibold text-slate-400">No hay gastos registrados</div>
                        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                          Utilice los botones superiores para registrar compras del día o compras/pagos pasados.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredExpenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4 font-mono font-medium whitespace-nowrap">
                          {exp.fecha}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {exp.tipoRegistro === 'HISTORICO_RETROACTIVO' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950/60 text-purple-300 border border-purple-800/40 flex items-center gap-1 w-fit">
                              <Clock className="w-3 h-3" />
                              <span>Histórico</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 flex items-center gap-1 w-fit">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Del Día</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          <div className="font-semibold text-slate-100 truncate" title={exp.concepto}>
                            {exp.concepto}
                          </div>
                          {exp.descripcionDetallada && exp.descripcionDetallada !== exp.concepto && (
                            <div className="text-[11px] text-slate-400 line-clamp-1" title={exp.descripcionDetallada}>
                              {exp.descripcionDetallada}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                            {formatCategoryLabel(exp.categoria)}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-200">
                          {exp.proveedorComercio}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                          {exp.numeroComprobante || 'S/F'}
                        </td>
                        <td className="py-3 px-4 text-right font-bold font-mono text-emerald-400 whitespace-nowrap">
                          ${exp.montoUSD.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-400 whitespace-nowrap text-[11px]">
                          {exp.montoVES ? `Bs. ${exp.montoVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : 'N/A'}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {exp.comprobanteUrl && (
                              <button
                                onClick={() => setViewReceiptUrl(exp.comprobanteUrl || null)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 transition"
                                title="Ver comprobante adjunto"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleEdit(exp)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                              title="Editar gasto"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(exp.id)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-400 transition"
                              title="Eliminar gasto"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* PESTAÑA 2: CRUCE HISTÓRICO CONSOLIDADO (CAMADAS VS GASTOS) */}
      {viewTab === 'CRUCE_HISTORICO' && (
        <div className="space-y-6">
          {/* Banner de Introducción Estratégica */}
          <div className="p-4 rounded-2xl bg-purple-950/30 border border-purple-800/40 text-purple-200 text-xs flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-sm text-purple-300">
                Estado de Resultados Integral Histórico de Agropecuaria Puro Apure C.A.
              </h4>
              <p className="text-xs text-purple-200/80 mt-1">
                Este motor consolida las ganancias de todos los ciclos productivos cerrados (camadas de pollos y paridas de cerdos) contra los gastos históricos globales de infraestructura, tecnología, mano de obra y proveedores, deduciendo la rentabilidad neta real acumulada de la empresa.
              </p>
            </div>
          </div>

          {/* Tres Tarjetas Hero de Cruce Financiero */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Tarjeta 1: Ganancias de Camadas */}
            <div className="bg-slate-900 border border-emerald-500/30 p-5 rounded-2xl shadow-xl">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-400 uppercase tracking-wider">
                <span>(+) Ganancias Camadas Pasadas</span>
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-3 text-3xl font-extrabold font-mono text-emerald-300">
                ${consolidatedPnl.totalGananciasCamadasUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Provenientes de {consolidatedPnl.conteoCamadas} lotes históricos cerrados
              </div>
              <div className="text-[11px] text-slate-500 mt-2 font-mono">
                Ventas: ${consolidatedPnl.totalIngresosCamadasUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })} | Costos: ${consolidatedPnl.totalCostosCamadasUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>

            {/* Tarjeta 2: Gastos Históricos Generales */}
            <div className="bg-slate-900 border border-rose-500/30 p-5 rounded-2xl shadow-xl">
              <div className="flex items-center justify-between text-xs font-bold text-rose-400 uppercase tracking-wider">
                <span>(-) Gastos Históricos Registrados</span>
                <TrendingDown className="w-4 h-4 text-rose-400" />
              </div>
              <div className="mt-3 text-3xl font-extrabold font-mono text-rose-400">
                ${consolidatedPnl.totalGastosHistoricosUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Agrupados en {consolidatedPnl.conteoGastos} comprobantes y desembolsos
              </div>
              <div className="text-[11px] text-slate-500 mt-2 font-mono">
                OPEX: ${consolidatedPnl.totalGastosOpexUSD.toFixed(2)} | CAPEX: ${consolidatedPnl.totalGastosCapexUSD.toFixed(2)}
              </div>
            </div>

            {/* Tarjeta 3: Rentabilidad Neta Consolidada */}
            <div className={`p-5 rounded-2xl shadow-xl border ${
              consolidatedPnl.utilidadNetaConsolidadaUSD >= 0
                ? 'bg-slate-900 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-900 border-red-500/40 text-red-300'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
                <span>(=) Rentabilidad Neta Consolidada</span>
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="mt-3 text-3xl font-extrabold font-mono">
                ${consolidatedPnl.utilidadNetaConsolidadaUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Margen Real sobre Ventas: {consolidatedPnl.margenRentabilidadReal.toFixed(2)}%
              </div>
              <div className="mt-2 text-[11px] font-bold">
                {consolidatedPnl.utilidadNetaConsolidadaUSD >= 0 ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Superávit Financiero Acumulado
                  </span>
                ) : (
                  <span className="text-rose-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Déficit Contable Histórico
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Desglose de Gastos Pasados por Categoría con Barras Visuales */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              <span>Desglose Estructural de Gastos Pasados</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(consolidatedPnl.desgloseGastosPorCategoria).map(([catKey, amount]) => {
                const total = consolidatedPnl.totalGastosHistoricosUSD || 1;
                const percentage = centsRound((amount / total) * 100);

                return (
                  <div key={catKey} className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-300">
                        {formatCategoryLabel(catKey as GastoCategoria)}
                      </span>
                      <span className="font-mono font-bold text-purple-300">
                        ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ({percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-purple-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, percentage)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: REGISTRO O EDICIÓN DE GASTO */}
      <OperatingExpenseModal
        isOpen={isModalOpen}
        bcvRate={bcvRate}
        userId={userId}
        suppliers={suppliers}
        expenseToEdit={expenseToEdit}
        onClose={() => setIsModalOpen(false)}
        onExpenseSaved={() => setIsModalOpen(false)}
      />

      {/* MODAL 2: VISOR DE COMPROBANTE ADJUNTO */}
      {viewReceiptUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 max-w-xl w-full shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-emerald-400" />
                <span>Comprobante Digital Registrado</span>
              </h4>
              <button
                onClick={() => setViewReceiptUrl(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-800 bg-slate-950 flex items-center justify-center p-2">
              <img src={viewReceiptUrl} alt="Comprobante" className="max-w-full max-h-[65vh] object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
