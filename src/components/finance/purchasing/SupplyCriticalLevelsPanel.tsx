import React, { useState, useEffect, useMemo } from 'react';
import {
  Boxes,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Search,
  ShoppingCart,
  Sliders,
  Save,
  Clock,
  Building2,
  TrendingDown,
  Info,
} from 'lucide-react';
import { InventoryItem } from '../../../types/inventory';
import { DualEntity } from '../../../types/finance';
import { SupplyAlertConfig, InsumoAlertEvaluation } from '../../../types/purchasing';
import { InventoryService } from '../../../services/inventoryService';
import { FinanceService } from '../../../services/financeService';
import { PurchasingService } from '../../../services/purchasingService';
import { evaluateInsumoAlert } from '../../../services/supplyAlertService';
import { AlertLevelBadge } from './AlertLevelBadge';

interface SupplyCriticalLevelsPanelProps {
  userId: string;
  onReorderItem?: (item: InventoryItem, config?: SupplyAlertConfig) => void;
}

interface ConfigFormState {
  activo: boolean;
  puntoCritico: number;
  porcentajeAmarillo: number;
  consumoDiarioEstimado: number;
  proveedorPreferidoId: string;
  notaReorden: string;
}

export const SupplyCriticalLevelsPanel: React.FC<SupplyCriticalLevelsPanelProps> = ({
  userId,
  onReorderItem,
}) => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [configs, setConfigs] = useState<Record<string, SupplyAlertConfig>>({});
  const [suppliers, setSuppliers] = useState<DualEntity[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [selectedSubtype, setSelectedSubtype] = useState<string>('TODOS');
  const [activeFilter, setActiveFilter] = useState<'TODOS' | 'ROJO' | 'AMARILLO' | 'VERDE'>('TODOS');

  // Modal editor state
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [formState, setFormState] = useState<ConfigFormState>({
    activo: true,
    puntoCritico: 0,
    porcentajeAmarillo: 20,
    consumoDiarioEstimado: 0,
    proveedorPreferidoId: '',
    notaReorden: '',
  });

  // Subscribe to Inventory
  useEffect(() => {
    const unsubInv = InventoryService.subscribeInventory((invItems) => {
      // Default to INSUMO, but include all non-livestock if any
      const insumos = invItems.filter((i) => i.category === 'INSUMO');
      setItems(insumos.length > 0 ? insumos : invItems);
      setLoading(false);
    });

    // Subscribe to Alert configs
    const unsubConfigs = PurchasingService.subscribeSupplyAlertConfigs((cfgList) => {
      const map: Record<string, SupplyAlertConfig> = {};
      cfgList.forEach((c) => {
        map[c.inventoryItemId] = c;
      });
      setConfigs(map);
    });

    // Subscribe to suppliers
    const unsubSuppliers = FinanceService.subscribeDualEntities((ents) => {
      setSuppliers(ents.filter((e) => e.roles?.includes('PROVEEDOR')));
    });

    return () => {
      unsubInv();
      unsubConfigs();
      unsubSuppliers();
    };
  }, []);

  // Compute evaluations for all items
  const evaluatedItems = useMemo(() => {
    return items.map((item) => {
      const cfg = configs[item.id];
      const evaluation = evaluateInsumoAlert(item, cfg);
      const supplierName = cfg?.proveedorPreferidoId
        ? suppliers.find((s) => s.id === cfg.proveedorPreferidoId)?.nombre
        : undefined;

      return {
        item,
        cfg,
        evaluation: {
          ...evaluation,
          proveedorPreferidoNombre: supplierName,
        },
      };
    });
  }, [items, configs, suppliers]);

  // Summary counts
  const summary = useMemo(() => {
    let rojos = 0;
    let amarillos = 0;
    let verdes = 0;

    evaluatedItems.forEach(({ evaluation }) => {
      if (evaluation.nivel === 'ROJO') rojos++;
      else if (evaluation.nivel === 'AMARILLO') amarillos++;
      else verdes++;
    });

    return { rojos, amarillos, verdes, total: evaluatedItems.length };
  }, [evaluatedItems]);

  // Filtered items
  const filteredList = useMemo(() => {
    return evaluatedItems.filter(({ item, evaluation }) => {
      if (activeFilter !== 'TODOS' && evaluation.nivel !== activeFilter) {
        return false;
      }
      if (selectedSubtype !== 'TODOS' && item.subtype !== selectedSubtype) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesSubtype = item.subtype?.toLowerCase().includes(q) ?? false;
        if (!matchesName && !matchesSubtype) return false;
      }
      return true;
    });
  }, [evaluatedItems, activeFilter, selectedSubtype, search]);

  const openConfigModal = (item: InventoryItem) => {
    setEditingItem(item);
    const existing = configs[item.id];
    if (existing) {
      setFormState({
        activo: existing.activo ?? true,
        puntoCritico: existing.puntoCritico ?? 0,
        porcentajeAmarillo: existing.porcentajeAmarillo ?? 20,
        consumoDiarioEstimado: existing.consumoDiarioEstimado ?? 0,
        proveedorPreferidoId: existing.proveedorPreferidoId ?? '',
        notaReorden: existing.notaReorden ?? '',
      });
    } else {
      setFormState({
        activo: true,
        puntoCritico: 0,
        porcentajeAmarillo: 20,
        consumoDiarioEstimado: 0,
        proveedorPreferidoId: '',
        notaReorden: '',
      });
    }
  };

  const handleSaveConfig = async () => {
    if (!editingItem) return;
    setSavingItemId(editingItem.id);

    const payload: Omit<SupplyAlertConfig, 'updatedAt'> = {
      inventoryItemId: editingItem.id,
      activo: formState.activo,
      puntoCritico: Math.max(0, Number(formState.puntoCritico) || 0),
      porcentajeAmarillo: Math.max(0, Number(formState.porcentajeAmarillo) || 0),
      consumoDiarioEstimado:
        formState.consumoDiarioEstimado > 0
          ? Number(formState.consumoDiarioEstimado)
          : undefined,
      proveedorPreferidoId: formState.proveedorPreferidoId || undefined,
      notaReorden: formState.notaReorden.trim() || undefined,
      updatedBy: userId,
    };

    try {
      await PurchasingService.saveSupplyAlertConfig(payload, userId);
      setEditingItem(null);
    } catch (e) {
      console.error('Error saving supply alert config:', e);
      alert('Error al guardar la configuración de niveles de alerta');
    } finally {
      setSavingItemId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Boxes className="w-5 h-5 text-amber-400" />
            Niveles Críticos y Alarmas de Insumos
          </h2>
          <p className="text-xs text-slate-400">
            Establece manualmente puntos de reorden (Rojo) y márgenes de cercanía porcentual (Amarillo) para disparar recordatorios al inicio de sesión.
          </p>
        </div>
      </div>

      {/* Metric Cards Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <button
          onClick={() => setActiveFilter('TODOS')}
          className={`p-3 rounded-xl border text-left transition ${
            activeFilter === 'TODOS'
              ? 'bg-slate-800/90 border-slate-600 shadow-md'
              : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/40'
          }`}
        >
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Total Insumos
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono mt-0.5">
            {summary.total}
          </div>
        </button>

        <button
          onClick={() => setActiveFilter('ROJO')}
          className={`p-3 rounded-xl border text-left transition ${
            activeFilter === 'ROJO'
              ? 'bg-red-950/60 border-red-700 shadow-md shadow-red-950/40'
              : 'bg-slate-900/60 border-slate-800 hover:bg-red-950/20'
          }`}
        >
          <div className="text-[11px] font-semibold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            Nivel Rojo (Crítico)
          </div>
          <div className="text-2xl font-bold text-red-300 font-mono mt-0.5">
            {summary.rojos}
          </div>
        </button>

        <button
          onClick={() => setActiveFilter('AMARILLO')}
          className={`p-3 rounded-xl border text-left transition ${
            activeFilter === 'AMARILLO'
              ? 'bg-amber-950/60 border-amber-700 shadow-md shadow-amber-950/40'
              : 'bg-slate-900/60 border-slate-800 hover:bg-amber-950/20'
          }`}
        >
          <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Nivel Amarillo (Alerta)
          </div>
          <div className="text-2xl font-bold text-amber-300 font-mono mt-0.5">
            {summary.amarillos}
          </div>
        </button>

        <button
          onClick={() => setActiveFilter('VERDE')}
          className={`p-3 rounded-xl border text-left transition ${
            activeFilter === 'VERDE'
              ? 'bg-emerald-950/60 border-emerald-700 shadow-md shadow-emerald-950/40'
              : 'bg-slate-900/60 border-slate-800 hover:bg-emerald-950/20'
          }`}
        >
          <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Existencia Óptima
          </div>
          <div className="text-2xl font-bold text-emerald-300 font-mono mt-0.5">
            {summary.verdes}
          </div>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar insumo por nombre o tipo..."
            className="w-full pl-9 pr-3 py-2 bg-slate-900/90 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-xs text-slate-400 whitespace-nowrap">Subtipo:</label>
          <select
            value={selectedSubtype}
            onChange={(e) => setSelectedSubtype(e.target.value)}
            className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none"
          >
            <option value="TODOS">Todos los insumos</option>
            <option value="ALIMENTO">Alimento</option>
            <option value="POLLITOS">Pollitos</option>
            <option value="VITAMINAS">Vitaminas</option>
            <option value="CAL">Cal</option>
            <option value="OTRO">Otro</option>
          </select>
        </div>
      </div>

      {/* Inventory Items Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950/60 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Insumo / Subtipo</th>
                <th className="px-4 py-3 text-right">Existencia Física</th>
                <th className="px-4 py-3 text-center">Punto Crítico (Rojo)</th>
                <th className="px-4 py-3 text-center">Colchón Amarillo</th>
                <th className="px-4 py-3 text-center">Cobertura Estimada</th>
                <th className="px-4 py-3 text-center">Estado Alarma</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Cargando inventario de insumos...
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No se encontraron insumos con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredList.map(({ item, cfg, evaluation }) => {
                  const hasCustomConfig = Boolean(cfg && cfg.activo);
                  const isRed = evaluation.nivel === 'ROJO';
                  const isYellow = evaluation.nivel === 'AMARILLO';

                  return (
                    <tr
                      key={item.id}
                      className={`transition group ${
                        isRed
                          ? 'bg-red-950/20 hover:bg-red-950/30'
                          : isYellow
                          ? 'bg-amber-950/15 hover:bg-amber-950/25'
                          : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-100 flex items-center gap-2">
                          {item.name}
                          {!hasCustomConfig && (
                            <span className="text-[10px] text-slate-500 font-mono italic">
                              (Sin calibrar)
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400">
                          {item.subtype || 'INSUMO'} • Costo Prom: $
                          {(item.unitCostUSD || 0).toFixed(2)} / {item.unit}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-bold">
                        <span
                          className={
                            isRed
                              ? 'text-red-400'
                              : isYellow
                              ? 'text-amber-300'
                              : 'text-emerald-300'
                          }
                        >
                          {(item.quantity || 0).toLocaleString()} {item.unit}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-center font-mono text-xs">
                        {cfg && cfg.activo && cfg.puntoCritico > 0 ? (
                          <span className="text-red-400 font-semibold">
                            {cfg.puntoCritico.toLocaleString()} {item.unit}
                          </span>
                        ) : (
                          <span className="text-slate-600">0</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center font-mono text-xs">
                        {cfg && cfg.activo && cfg.puntoCritico > 0 ? (
                          <div>
                            <span className="text-amber-400 font-semibold">
                              +{cfg.porcentajeAmarillo}%
                            </span>
                            <div className="text-[10px] text-slate-500">
                              (≤ {Math.round(evaluation.umbralAmarillo)} {item.unit})
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center font-mono text-xs">
                        {evaluation.diasCobertura !== undefined ? (
                          <span
                            className={`inline-flex items-center gap-1 font-bold ${
                              evaluation.esAltaRotacionCritica
                                ? 'text-red-400 animate-pulse'
                                : 'text-slate-300'
                            }`}
                          >
                            <TrendingDown className="w-3 h-3 text-slate-400" />
                            {evaluation.diasCobertura} días
                          </span>
                        ) : (
                          <span className="text-slate-600 italic text-[11px]">N/D</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <AlertLevelBadge nivel={evaluation.nivel} />
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openConfigModal(item)}
                            title="Calibrar umbrales de alarma"
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 border border-slate-700 rounded-lg text-xs transition"
                          >
                            <Sliders className="w-3.5 h-3.5" />
                          </button>

                          {onReorderItem && (
                            <button
                              onClick={() => onReorderItem(item, cfg)}
                              title="Registrar factura de compra / reposición"
                              className="px-2.5 py-1.5 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition shadow-sm"
                            >
                              <ShoppingCart className="w-3 h-3" />
                              Comprar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Config Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-100 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-400" />
                  Calibración de Alarma Crítica de Insumo
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {editingItem.name} • Existencia actual:{' '}
                  <span className="text-emerald-400 font-mono font-bold">
                    {(editingItem.quantity || 0).toLocaleString()} {editingItem.unit}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-slate-200 text-lg font-bold"
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Checkbox Activo */}
              <label className="flex items-center gap-2 text-xs font-bold text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.activo}
                  onChange={(e) =>
                    setFormState({ ...formState, activo: e.target.checked })
                  }
                  className="w-4 h-4 rounded text-amber-500 bg-slate-800 border-slate-700"
                />
                Activar monitoreo de niveles críticos para este insumo
              </label>

              {/* Punto Crítico (Rojo) */}
              <div>
                <label className="block text-xs font-medium text-red-400 mb-1 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Punto Crítico Absoluto (Umbral ROJO)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formState.puntoCritico}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        puntoCritico: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 font-mono focus:border-red-500 focus:outline-none"
                  />
                  <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
                    {editingItem.unit}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500">
                  Si la existencia cae por debajo o igual a este valor, se dispara Alarma Roja de agotamiento inminente.
                </span>
              </div>

              {/* Porcentaje de Cercanía (Amarillo) */}
              <div>
                <label className="block text-xs font-medium text-amber-400 mb-1 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Porcentaje de Proximidad al Punto Crítico (Umbral AMARILLO)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formState.porcentajeAmarillo}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        porcentajeAmarillo: Number(e.target.value),
                      })
                    }
                    className="w-32 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 font-mono focus:border-amber-500 focus:outline-none"
                  />
                  <span className="text-xs text-slate-400 font-mono">%</span>
                  <div className="text-xs text-slate-400 pl-2">
                    Dispara alerta cuando el stock sea ≤{' '}
                    <span className="font-bold font-mono text-amber-300">
                      {Math.round(
                        formState.puntoCritico * (1 + formState.porcentajeAmarillo / 100)
                      )}{' '}
                      {editingItem.unit}
                    </span>
                  </div>
                </div>
              </div>

              {/* Consumo Diario Estimado */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  Consumo Diario Promedio Estimado (Opcional)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={formState.consumoDiarioEstimado}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        consumoDiarioEstimado: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 font-mono focus:border-cyan-500 focus:outline-none"
                  />
                  <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
                    {editingItem.unit}/día
                  </span>
                </div>
                <span className="text-[10px] text-slate-500">
                  Permite proyectar los días de cobertura y alertar sobre insumos de alta rotación crítica (≤ 3 días).
                </span>
              </div>

              {/* Proveedor Preferido */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  Proveedor Habitual Recomendado
                </label>
                <select
                  value={formState.proveedorPreferidoId}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      proveedorPreferidoId: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">-- Sin proveedor preferido --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre} ({s.rif || 'Sin RIF'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Nota de Reorden */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Instrucción Operativa de Reorden
                </label>
                <textarea
                  rows={2}
                  value={formState.notaReorden}
                  onChange={(e) =>
                    setFormState({ ...formState, notaReorden: e.target.value })
                  }
                  placeholder="Ej: Pedir mínimo 50 sacos con 48h de antelación para asegurar flete."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveConfig}
                disabled={savingItemId === editingItem.id}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50 shadow-lg shadow-amber-950/50"
              >
                <Save className="w-4 h-4" />
                {savingItemId === editingItem.id ? 'Guardando...' : 'Guardar Umbrales'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
