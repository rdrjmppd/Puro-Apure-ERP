import React, { useState } from 'react';
import { X, Building2, Save } from 'lucide-react';
import { PurchasingService } from '../../../services/purchasingService';
import { DualEntity } from '../../../types/finance';

interface SupplierQuickCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSupplierCreated: (supplier: DualEntity) => void;
  userId: string;
}

export const SupplierQuickCreateModal: React.FC<SupplierQuickCreateModalProps> = ({
  isOpen,
  onClose,
  onSupplierCreated,
  userId,
}) => {
  const [rif, setRif] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [diasCalle, setDiasCalle] = useState(15);
  const [diasGracia, setDiasGracia] = useState(3);
  const [aplicaMora, setAplicaMora] = useState(false);
  const [tasaMora, setTasaMora] = useState(0);
  const [notaRiesgo, setNotaRiesgo] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rif.trim() || !name.trim()) {
      setErrorMsg('RIF y Razón Social son campos requeridos.');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');

    try {
      // 1. Crear o actualizar entidad con rol PROVEEDOR
      const supplier = await PurchasingService.findOrCreateSupplierByRif(
        rif,
        name,
        phone,
        address,
        userId
      );

      // 2. Guardar condiciones comerciales si se especificaron
      await PurchasingService.saveSupplierTerms(
        {
          entityId: supplier.id,
          diasCalle: Number(diasCalle) || 0,
          diasGracia: Number(diasGracia) || 0,
          diasAnticipacionAlerta: 3,
          aplicaMora,
          tasaMoraPorcentaje: Number(tasaMora) || 0,
          periodicidadMora: 'MENSUAL',
          penalizacionFijaUSD: 0,
          notaRiesgoManual: notaRiesgo.trim(),
          updatedBy: userId,
        },
        userId
      );

      onSupplierCreated(supplier);
      onClose();
    } catch (err: any) {
      console.error('Error registrando proveedor:', err);
      setErrorMsg(err.message || 'Error al guardar el proveedor.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-3xl p-6 space-y-4 shadow-2xl animate-fadeIn">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Alta Rápida de Proveedor
              </h3>
              <p className="text-[11px] text-slate-400">
                Registra un nuevo proveedor o amplía un cliente existente al directorio VRM
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-xs text-red-300">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                RIF / Cédula Fiscal <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={rif}
                onChange={(e) => setRif(e.target.value)}
                placeholder="ej. J-12345678-9"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono uppercase outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Razón Social / Nombre Comercial <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej. Agroinsumos Los Llanos C.A."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Teléfono</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="ej. 0414-1234567"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Dirección Fiscal</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="ej. Av. Miranda, San Fernando"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Términos de Crédito */}
          <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-2.5">
            <div className="font-bold text-slate-300 text-[11px] uppercase tracking-wider">
              Condiciones de Crédito Asignadas por el Proveedor
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Días Calle (Crédito)</label>
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={diasCalle}
                  onChange={(e) => setDiasCalle(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Días de Gracia</label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={diasGracia}
                  onChange={(e) => setDiasGracia(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-white font-mono"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aplicaMora}
                  onChange={(e) => setAplicaMora(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-cyan-600 focus:ring-0"
                />
                <span>Aplica recargos o penalización por mora</span>
              </label>
              {aplicaMora && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={tasaMora}
                    onChange={(e) => setTasaMora(parseFloat(e.target.value) || 0)}
                    className="w-16 bg-slate-900 border border-slate-700 rounded-lg p-1 text-white font-mono text-center"
                  />
                  <span className="text-slate-400 font-mono">% mensual</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-slate-400 text-[11px] mb-1">Nota Manual de Riesgo Contractual</label>
              <textarea
                rows={2}
                value={notaRiesgo}
                onChange={(e) => setNotaRiesgo(e.target.value)}
                placeholder="ej. Penalización del 2% semanal si excede 15 días de vencimiento..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-white text-xs outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition flex items-center gap-1.5 shadow-lg shadow-cyan-950/40"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Guardando...' : 'Crear Proveedor'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
