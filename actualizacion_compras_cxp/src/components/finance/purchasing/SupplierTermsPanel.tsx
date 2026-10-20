import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Calendar,
  AlertTriangle,
  Clock,
  DollarSign,
  FileText,
  Search,
  Plus,
  Save,
  CheckCircle2,
  HelpCircle,
  Percent,
} from 'lucide-react';
import { DualEntity } from '../../../types/finance';
import { SupplierTerms, PeriodicidadMora } from '../../../types/purchasing';
import { FinanceService } from '../../../services/financeService';
import { PurchasingService } from '../../../services/purchasingService';
import { SupplierQuickCreateModal } from './SupplierQuickCreateModal';

interface SupplierTermsPanelProps {
  userId: string;
}

interface TermsFormState {
  diasCalle: number;
  diasGracia: number;
  diasAnticipacionAlerta: number;
  aplicaMora: boolean;
  tasaMoraPorcentaje: number;
  periodicidadMora: PeriodicidadMora;
  penalizacionFijaUSD: number;
  notaRiesgoManual: string;
}

export const SupplierTermsPanel: React.FC<SupplierTermsPanelProps> = ({ userId }) => {
  const [entities, setEntities] = useState<DualEntity[]>([]);
  const [termsMap, setTermsMap] = useState<Record<string, SupplierTerms>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [showCreateSupplierModal, setShowCreateSupplierModal] = useState<boolean>(false);
  const [savingEntityId, setSavingEntityId] = useState<string | null>(null);
  const [saveSuccessEntityId, setSaveSuccessEntityId] = useState<string | null>(null);

  // Form state for current selected supplier in edit modal
  const [formState, setFormState] = useState<TermsFormState>({
    diasCalle: 0,
    diasGracia: 0,
    diasAnticipacionAlerta: 3,
    aplicaMora: false,
    tasaMoraPorcentaje: 0,
    periodicidadMora: 'DIARIA',
    penalizacionFijaUSD: 0,
    notaRiesgoManual: '',
  });

  // Subscribe to entities
  useEffect(() => {
    const unsubEntities = FinanceService.subscribeDualEntities((list) => {
      setEntities(list);
      setLoading(false);
    });

    // Load initial terms
    PurchasingService.listSupplierTerms().then((termsList) => {
      const map: Record<string, SupplierTerms> = {};
      termsList.forEach((t) => {
        map[t.entityId] = t;
      });
      setTermsMap(map);
    });

    return () => unsubEntities();
  }, []);

  // Filter suppliers (rol PROVEEDOR or both)
  const suppliers = useMemo(() => {
    return entities.filter((e) => {
      const isProv = e.roles?.includes('PROVEEDOR');
      if (!isProv) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        e.nombre.toLowerCase().includes(q) ||
        (e.rif && e.rif.toLowerCase().includes(q))
      );
    });
  }, [entities, search]);

  const openEditModal = (entity: DualEntity) => {
    setSelectedEntityId(entity.id);
    const existing = termsMap[entity.id];
    if (existing) {
      setFormState({
        diasCalle: existing.diasCalle ?? 0,
        diasGracia: existing.diasGracia ?? 0,
        diasAnticipacionAlerta: existing.diasAnticipacionAlerta ?? 3,
        aplicaMora: existing.aplicaMora ?? false,
        tasaMoraPorcentaje: existing.tasaMoraPorcentaje ?? 0,
        periodicidadMora: existing.periodicidadMora ?? 'DIARIA',
        penalizacionFijaUSD: existing.penalizacionFijaUSD ?? 0,
        notaRiesgoManual: existing.notaRiesgoManual ?? '',
      });
    } else {
      setFormState({
        diasCalle: 0,
        diasGracia: 0,
        diasAnticipacionAlerta: 3,
        aplicaMora: false,
        tasaMoraPorcentaje: 0,
        periodicidadMora: 'DIARIA',
        penalizacionFijaUSD: 0,
        notaRiesgoManual: '',
      });
    }
  };

  const handleSaveTerms = async () => {
    if (!selectedEntityId) return;
    setSavingEntityId(selectedEntityId);

    const payload: Omit<SupplierTerms, 'updatedAt'> = {
      entityId: selectedEntityId,
      diasCalle: Math.max(0, Number(formState.diasCalle) || 0),
      diasGracia: Math.max(0, Number(formState.diasGracia) || 0),
      diasAnticipacionAlerta: Math.max(0, Number(formState.diasAnticipacionAlerta) || 0),
      aplicaMora: Boolean(formState.aplicaMora),
      tasaMoraPorcentaje: Math.max(0, Number(formState.tasaMoraPorcentaje) || 0),
      periodicidadMora: formState.periodicidadMora,
      penalizacionFijaUSD: Math.max(0, Number(formState.penalizacionFijaUSD) || 0),
      notaRiesgoManual: formState.notaRiesgoManual.trim(),
      updatedBy: userId,
    };

    try {
      await PurchasingService.saveSupplierTerms(payload, userId);
      setTermsMap((prev) => ({
        ...prev,
        [selectedEntityId]: {
          ...payload,
          updatedAt: Date.now(),
        },
      }));
      setSaveSuccessEntityId(selectedEntityId);
      setTimeout(() => setSaveSuccessEntityId(null), 3000);
      setSelectedEntityId(null);
    } catch (e) {
      console.error('Error saving terms:', e);
      alert('Error al guardar las condiciones comerciales del proveedor');
    } finally {
      setSavingEntityId(null);
    }
  };

  const selectedEntity = entities.find((e) => e.id === selectedEntityId);

  return (
    <div className="space-y-6">
      {/* Top action header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-400" />
            Condiciones Comerciales y Días Calle de Proveedores
          </h2>
          <p className="text-xs text-slate-400">
            Define plazos de crédito, días de gracia, recargos de mora proyectados y notas contractuales de riesgo.
          </p>
        </div>

        <button
          onClick={() => setShowCreateSupplierModal(true)}
          className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition shadow-lg shadow-emerald-950/40"
        >
          <Plus className="w-4 h-4" />
          Nuevo Proveedor
        </button>
      </div>

      {/* Search and stats bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o RIF..."
            className="w-full pl-9 pr-3 py-2 bg-slate-900/90 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
          />
        </div>

        <div className="text-xs text-slate-400">
          Mostrando <span className="font-semibold text-slate-200">{suppliers.length}</span> proveedores registrados
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950/60 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Proveedor / RIF</th>
                <th className="px-4 py-3 text-center">Días Calle (Crédito)</th>
                <th className="px-4 py-3 text-center">Días Gracia</th>
                <th className="px-4 py-3 text-center">Anticipación Alerta</th>
                <th className="px-4 py-3 text-center">Régimen Mora</th>
                <th className="px-4 py-3">Nota de Riesgo</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Cargando condiciones comerciales...
                  </td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No se encontraron proveedores activos con rol PROVEEDOR.
                  </td>
                </tr>
              ) : (
                suppliers.map((supplier) => {
                  const terms = termsMap[supplier.id];
                  const diasCalle = terms?.diasCalle ?? 0;
                  const diasGracia = terms?.diasGracia ?? 0;
                  const anticipacion = terms?.diasAnticipacionAlerta ?? 3;
                  const tieneMora = terms?.aplicaMora ?? false;

                  return (
                    <tr
                      key={supplier.id}
                      className="hover:bg-slate-800/40 transition group"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-100">{supplier.nombre}</div>
                        <div className="text-xs text-slate-400 font-mono">
                          {supplier.rif || 'Sin RIF'}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            diasCalle === 0
                              ? 'bg-slate-800 text-slate-400 border border-slate-700'
                              : 'bg-cyan-950/70 text-cyan-300 border border-cyan-800/50'
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          {diasCalle === 0 ? 'Contado (0d)' : `${diasCalle} días`}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-center font-mono text-xs">
                        {diasGracia > 0 ? (
                          <span className="text-amber-400 font-semibold">+{diasGracia}d</span>
                        ) : (
                          <span className="text-slate-500">0d</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center font-mono text-xs text-slate-400">
                        {anticipacion}d antes
                      </td>

                      <td className="px-4 py-3 text-center">
                        {tieneMora ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-950/50 text-amber-300 border border-amber-800/60">
                            <AlertTriangle className="w-3 h-3 text-amber-400" />
                            {terms?.tasaMoraPorcentaje ?? 0}% ({terms?.periodicidadMora})
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">Sin recargo</span>
                        )}
                      </td>

                      <td className="px-4 py-3 max-w-xs truncate text-xs text-slate-400">
                        {terms?.notaRiesgoManual ? (
                          <span
                            title={terms.notaRiesgoManual}
                            className="text-amber-300/90 italic truncate block"
                          >
                            "{terms.notaRiesgoManual}"
                          </span>
                        ) : (
                          <span className="text-slate-600 italic">Sin observaciones</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openEditModal(supplier)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 border border-slate-700 rounded-lg text-xs font-semibold transition"
                        >
                          Configurar
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Terms Modal */}
      {selectedEntityId && selectedEntity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-100 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-400" />
                  Condiciones Comerciales de Crédito
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedEntity.nombre} ({selectedEntity.rif || 'Sin RIF'})
                </p>
              </div>
              <button
                onClick={() => setSelectedEntityId(null)}
                className="text-slate-400 hover:text-slate-200 text-lg font-bold"
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Días Calle y Gracia */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                    Días Calle (Crédito)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="180"
                    value={formState.diasCalle}
                    onChange={(e) =>
                      setFormState({ ...formState, diasCalle: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 font-mono focus:border-cyan-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500">
                    0 = Facturación de estricto contado
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    Días de Gracia
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={formState.diasGracia}
                    onChange={(e) =>
                      setFormState({ ...formState, diasGracia: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 font-mono focus:border-amber-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500">
                    Días de tolerancia tras vencimiento
                  </span>
                </div>
              </div>

              {/* Días de anticipación para alerta amarilla */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
                  Anticipación de Alerta de Vencimiento
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={formState.diasAnticipacionAlerta}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        diasAnticipacionAlerta: Number(e.target.value),
                      })
                    }
                    className="w-28 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 font-mono focus:border-yellow-500 focus:outline-none"
                  />
                  <span className="text-xs text-slate-400">
                    días antes de la fecha límite para emitir alarma amarilla en el inicio
                  </span>
                </div>
              </div>

              {/* Régimen de Mora */}
              <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formState.aplicaMora}
                      onChange={(e) =>
                        setFormState({ ...formState, aplicaMora: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-amber-500 bg-slate-800 border-slate-700 focus:ring-0"
                    />
                    ¿El proveedor estipula recargos por mora?
                  </label>
                  {formState.aplicaMora && (
                    <span className="text-[10px] text-amber-400 font-semibold px-2 py-0.5 bg-amber-950/60 border border-amber-800/60 rounded">
                      Proyección Informativa
                    </span>
                  )}
                </div>

                {formState.aplicaMora && (
                  <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-800/80 animate-fadeIn">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                        <Percent className="w-3 h-3 text-amber-400" />
                        Tasa de Mora (%)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={formState.tasaMoraPorcentaje}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            tasaMoraPorcentaje: Number(e.target.value),
                          })
                        }
                        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-100 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Periodicidad
                      </label>
                      <select
                        value={formState.periodicidadMora}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            periodicidadMora: e.target.value as PeriodicidadMora,
                          })
                        }
                        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-100"
                      >
                        <option value="DIARIA">Diaria</option>
                        <option value="SEMANAL">Semanal</option>
                        <option value="MENSUAL">Mensual</option>
                        <option value="UNICA">Única (Flat)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                        <DollarSign className="w-3 h-3 text-emerald-400" />
                        Cargo Fijo ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formState.penalizacionFijaUSD}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            penalizacionFijaUSD: Number(e.target.value),
                          })
                        }
                        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-100 font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Nota contractual / manual de riesgo */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  Nota Contractual / Advertencia de Riesgo
                </label>
                <textarea
                  rows={2}
                  value={formState.notaRiesgoManual}
                  onChange={(e) =>
                    setFormState({ ...formState, notaRiesgoManual: e.target.value })
                  }
                  placeholder="Ej: Si se atrasa el pago suspende despacho de melaza y cobra $20 administrativos."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                onClick={() => setSelectedEntityId(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveTerms}
                disabled={savingEntityId === selectedEntityId}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50 shadow-lg shadow-emerald-950/50"
              >
                <Save className="w-4 h-4" />
                {savingEntityId === selectedEntityId ? 'Guardando...' : 'Guardar Condiciones'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Quick Create Modal */}
      <SupplierQuickCreateModal
        isOpen={showCreateSupplierModal}
        onClose={() => setShowCreateSupplierModal(false)}
        userId={userId}
        onSuccess={(created) => {
          setShowCreateSupplierModal(false);
          openEditModal(created);
        }}
      />
    </div>
  );
};
