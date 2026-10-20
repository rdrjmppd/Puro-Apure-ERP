import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Building2,
  Calendar,
  CreditCard,
  Plus,
  Trash2,
  DollarSign,
  Save,
  AlertCircle,
  Package,
} from 'lucide-react';
import { DualEntity } from '../../../types/finance';
import { InventoryItem } from '../../../types/inventory';
import { PurchaseItem, SupplierTerms } from '../../../types/purchasing';
import { PurchasingService } from '../../../services/purchasingService';
import { SupplierQuickCreateModal } from './SupplierQuickCreateModal';
import { centsRound } from '../../../services/financialAnalyticsService';

interface PurchaseInvoiceFormProps {
  suppliers: DualEntity[];
  inventoryItems: InventoryItem[];
  bcvRate: number;
  onInvoiceCreated: () => void;
  onCancel: () => void;
  userId: string;
}

export const PurchaseInvoiceForm: React.FC<PurchaseInvoiceFormProps> = ({
  suppliers,
  inventoryItems,
  bcvRate,
  onInvoiceCreated,
  onCancel,
  userId,
}) => {
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [supplierTerms, setSupplierTerms] = useState<SupplierTerms | null>(null);
  const [numeroFactura, setNumeroFactura] = useState('');
  const [numeroControl, setNumeroControl] = useState('');
  const [fechaEmision, setFechaEmision] = useState(new Date().toISOString().split('T')[0]);
  const [modalidad, setModalidad] = useState<'CONTADO' | 'CREDITO'>('CREDITO');
  const [diasCalleInput, setDiasCalleInput] = useState<number>(15);
  const [notaRiesgo, setNotaRiesgo] = useState('');
  const [showQuickSupplierModal, setShowQuickSupplierModal] = useState(false);

  // Ítems de la compra
  const [items, setItems] = useState<PurchaseItem[]>([
    {
      id: `item_1`,
      descripcion: '',
      cantidad: 1,
      unidad: 'sacos',
      costoUnitarioUSD: 0,
      subtotalUSD: 0,
      ingresaAInventario: true,
    },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Proveedores filtrados
  const supplierList = useMemo(() => {
    return suppliers.filter((s) => s.roles.includes('PROVEEDOR'));
  }, [suppliers]);

  // Insumos disponibles
  const insumos = useMemo(() => {
    return inventoryItems.filter((i) => i.category === 'INSUMO');
  }, [inventoryItems]);

  // Al seleccionar proveedor, cargar términos
  useEffect(() => {
    if (!selectedSupplierId) {
      setSupplierTerms(null);
      return;
    }
    PurchasingService.getSupplierTerms(selectedSupplierId).then((terms) => {
      if (terms) {
        setSupplierTerms(terms);
        setDiasCalleInput(terms.diasCalle);
        if (terms.notaRiesgoManual) {
          setNotaRiesgo(terms.notaRiesgoManual);
        }
      } else {
        setSupplierTerms(null);
        setDiasCalleInput(15);
      }
    });
  }, [selectedSupplierId]);

  // Cálculo de totales
  const totalUSD = useMemo(() => {
    let sum = 0;
    for (const it of items) {
      sum += centsRound(it.cantidad * it.costoUnitarioUSD);
    }
    return centsRound(sum);
  }, [items]);

  const totalVES = useMemo(() => {
    return centsRound(totalUSD * bcvRate);
  }, [totalUSD, bcvRate]);

  // Fecha de vencimiento estimada
  const fechaVencimientoEstimada = useMemo(() => {
    if (modalidad === 'CONTADO') return fechaEmision;
    const [y, m, d] = fechaEmision.split('-').map(Number);
    const date = new Date(y, m - 1, d + (diasCalleInput || 0), 12, 0, 0);
    const vY = date.getFullYear();
    const vM = String(date.getMonth() + 1).padStart(2, '0');
    const vD = String(date.getDate()).padStart(2, '0');
    return `${vY}-${vM}-${vD}`;
  }, [fechaEmision, diasCalleInput, modalidad]);

  // Manejo de ítems
  const handleItemChange = (index: number, field: keyof PurchaseItem, value: any) => {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };

      if (field === 'cantidad' || field === 'costoUnitarioUSD') {
        const qty = field === 'cantidad' ? parseFloat(value) || 0 : item.cantidad;
        const cost = field === 'costoUnitarioUSD' ? parseFloat(value) || 0 : item.costoUnitarioUSD;
        item.subtotalUSD = centsRound(qty * cost);
      }

      // Si vincula un insumo existente de la lista, autocompletar descripción y unidad
      if (field === 'inventoryItemId') {
        const matchedInsumo = insumos.find((ins) => ins.id === value);
        if (matchedInsumo) {
          item.descripcion = matchedInsumo.name;
          item.unidad = matchedInsumo.unit;
          if (item.costoUnitarioUSD === 0 && matchedInsumo.unitCostUSD > 0) {
            item.costoUnitarioUSD = matchedInsumo.unitCostUSD;
            item.subtotalUSD = centsRound(item.cantidad * matchedInsumo.unitCostUSD);
          }
          item.ingresaAInventario = true;
        }
      }

      updated[index] = item;
      return updated;
    });
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item_${Date.now()}_${prev.length + 1}`,
        descripcion: '',
        cantidad: 1,
        unidad: 'sacos',
        costoUnitarioUSD: 0,
        subtotalUSD: 0,
        ingresaAInventario: true,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId) {
      setErrorMsg('Debe seleccionar o registrar un proveedor.');
      return;
    }
    if (!numeroFactura.trim()) {
      setErrorMsg('Indique el número de factura o comprobante del proveedor.');
      return;
    }
    if (totalUSD <= 0) {
      setErrorMsg('El total de la factura debe ser mayor a cero.');
      return;
    }

    const supplier = suppliers.find((s) => s.id === selectedSupplierId);
    if (!supplier) {
      setErrorMsg('Proveedor no encontrado.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      await PurchasingService.createPurchaseInvoice({
        numeroFacturaProveedor: numeroFactura.trim(),
        numeroControl: numeroControl.trim() || undefined,
        proveedorId: supplier.id,
        proveedorNombre: supplier.razonSocial || supplier.name,
        proveedorRif: supplier.identificacionFiscal || supplier.rifCedula,
        fechaEmision,
        modalidad,
        items,
        notaRiesgoManual: notaRiesgo.trim() || undefined,
        userId,
        customBcvRate: bcvRate,
      });

      onInvoiceCreated();
    } catch (err: any) {
      console.error('Error registrando factura de compra:', err);
      setErrorMsg(err.message || 'Error al emitir la factura de compra.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 animate-fadeIn">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Registro de Factura de Compra / Cuenta por Pagar
            </h3>
            <p className="text-xs text-slate-400">
              Carga transaccional con actualización de inventario físico y liquidación en base a días calle
            </p>
          </div>
        </div>
        <div className="text-right font-mono">
          <span className="text-[10px] text-slate-500 block uppercase">Tasa BCV Aplicable</span>
          <span className="text-xs font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
            {bcvRate.toFixed(4)} VES/USD
          </span>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-xs text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Fila 1: Proveedor y Datos Fiscales */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Proveedor *</span>
              </label>
              <button
                type="button"
                onClick={() => setShowQuickSupplierModal(true)}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold underline"
              >
                + Alta Rápida
              </button>
            </div>
            <select
              required
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-cyan-500"
            >
              <option value="">Seleccione un proveedor...</option>
              {supplierList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.razonSocial || s.name} ({s.identificacionFiscal || s.rifCedula})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              N° Factura / Nota Proveedor *
            </label>
            <input
              type="text"
              required
              value={numeroFactura}
              onChange={(e) => setNumeroFactura(e.target.value)}
              placeholder="ej. FAC-2026-9842"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              N° de Control SENIAT (Opcional)
            </label>
            <input
              type="text"
              value={numeroControl}
              onChange={(e) => setNumeroControl(e.target.value)}
              placeholder="ej. 00-128475"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* Fila 2: Modalidad Comercial y Vencimiento */}
        <div className="p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
          <div>
            <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-amber-400" />
              <span>Modalidad de Compra</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setModalidad('CONTADO')}
                className={`py-1.5 px-3 rounded-xl border text-xs font-semibold transition ${
                  modalidad === 'CONTADO'
                    ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                Contado
              </button>
              <button
                type="button"
                onClick={() => setModalidad('CREDITO')}
                className={`py-1.5 px-3 rounded-xl border text-xs font-semibold transition ${
                  modalidad === 'CREDITO'
                    ? 'bg-blue-950 border-blue-500 text-blue-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                Crédito (CxP)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Fecha de Emisión</span>
            </label>
            <input
              type="date"
              required
              value={fechaEmision}
              onChange={(e) => setFechaEmision(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-white font-mono"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-300 font-semibold">Días Calle Asignados</span>
              <span className="text-amber-400 font-mono text-[11px] font-bold">
                Vence: {fechaVencimientoEstimada}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="365"
                disabled={modalidad === 'CONTADO'}
                value={modalidad === 'CONTADO' ? 0 : diasCalleInput}
                onChange={(e) => setDiasCalleInput(parseInt(e.target.value) || 0)}
                className="w-24 bg-slate-900 border border-slate-700 rounded-xl p-2 text-white font-mono text-center disabled:opacity-50"
              />
              <span className="text-slate-400 text-[11px]">
                {modalidad === 'CONTADO' ? 'Pago inmediato' : 'Días de crédito'}
              </span>
            </div>
          </div>
        </div>

        {/* Fila 3: Tabla de Ítems Adquiridos */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-cyan-400" />
              <span>Ítems e Insumos Comprados</span>
            </span>
            <button
              type="button"
              onClick={handleAddItem}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold transition flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Añadir Renglón</span>
            </button>
          </div>

          <div className="bg-slate-950 rounded-2xl border border-slate-800 p-3 space-y-2">
            {items.map((item, idx) => (
              <div
                key={item.id}
                className="grid grid-cols-1 md:grid-cols-12 gap-2 p-2.5 bg-slate-900/60 rounded-xl border border-slate-800/80 items-center"
              >
                {/* Vínculo a Insumo */}
                <div className="md:col-span-4">
                  <label className="text-[10px] text-slate-400 block mb-0.5">Vincular a Insumo</label>
                  <select
                    value={item.inventoryItemId || ''}
                    onChange={(e) => handleItemChange(idx, 'inventoryItemId', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-white text-[11px]"
                  >
                    <option value="">(Insumo personalizado / gasto libre)</option>
                    {insumos.map((ins) => (
                      <option key={ins.id} value={ins.id}>
                        {ins.name} ({ins.quantity} {ins.unit} en stock)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Descripción libre */}
                <div className="md:col-span-3">
                  <label className="text-[10px] text-slate-400 block mb-0.5">Descripción</label>
                  <input
                    type="text"
                    required
                    value={item.descripcion}
                    onChange={(e) => handleItemChange(idx, 'descripcion', e.target.value)}
                    placeholder="ej. Alimento iniciador"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-white text-[11px]"
                  />
                </div>

                {/* Cantidad y Unidad */}
                <div className="md:col-span-2 grid grid-cols-2 gap-1">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Cant.</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={item.cantidad}
                      onChange={(e) => handleItemChange(idx, 'cantidad', parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-white font-mono text-center text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Unidad</label>
                    <select
                      value={item.unidad}
                      onChange={(e) => handleItemChange(idx, 'unidad', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-white text-[11px]"
                    >
                      <option value="sacos">sacos</option>
                      <option value="kg">kg</option>
                      <option value="toneladas">toneladas</option>
                      <option value="litros">litros</option>
                      <option value="unidades">unidades</option>
                    </select>
                  </div>
                </div>

                {/* Costo Unitario y Subtotal */}
                <div className="md:col-span-2 grid grid-cols-2 gap-1">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Costo ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={item.costoUnitarioUSD}
                      onChange={(e) => handleItemChange(idx, 'costoUnitarioUSD', parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-white font-mono text-right text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Subtotal ($)</label>
                    <div className="font-mono font-bold text-emerald-400 text-right p-1.5 text-[11px]">
                      ${item.subtotalUSD.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Checkbox y Eliminar */}
                <div className="md:col-span-1 flex items-center justify-end gap-2 pt-3">
                  <input
                    type="checkbox"
                    title="Sumar al inventario automáticamente"
                    checked={item.ingresaAInventario}
                    onChange={(e) => handleItemChange(idx, 'ingresaAInventario', e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-emerald-600 focus:ring-0"
                  />
                  <button
                    type="button"
                    disabled={items.length <= 1}
                    onClick={() => handleRemoveItem(idx)}
                    className="text-slate-500 hover:text-red-400 disabled:opacity-30 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Nota Manual de Riesgo y Totalizadores */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Nota Manual de Riesgo Contractual / Penalizaciones
            </label>
            <textarea
              rows={2}
              value={notaRiesgo}
              onChange={(e) => setNotaRiesgo(e.target.value)}
              placeholder="ej. Recargo del 3% si se sobrepasan los 15 días calle acordados con el proveedor..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white text-xs outline-none focus:border-cyan-500"
            />
          </div>

          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-right font-mono space-y-1">
            <span className="text-slate-400 text-xs block">TOTAL FACTURA DE COMPRA</span>
            <div className="text-2xl font-bold text-emerald-400">
              ${totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
            </div>
            <div className="text-sm font-bold text-cyan-400">
              Bs. {totalVES.toLocaleString(undefined, { minimumFractionDigits: 2 })} VES
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting || totalUSD <= 0}
            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold transition flex items-center gap-1.5 shadow-lg shadow-emerald-950/40"
          >
            <Save className="w-4 h-4" />
            <span>{isSubmitting ? 'Registrando Compra...' : 'Emitir y Cargar a CxP'}</span>
          </button>
        </div>
      </form>

      {/* Modal de Alta Rápida de Proveedor */}
      <SupplierQuickCreateModal
        isOpen={showQuickSupplierModal}
        onClose={() => setShowQuickSupplierModal(false)}
        onSupplierCreated={(newSupplier) => setSelectedSupplierId(newSupplier.id)}
        userId={userId}
      />
    </div>
  );
};
