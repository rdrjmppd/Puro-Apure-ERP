import React, { useState } from 'react';
import { X, Receipt, CheckCheck } from 'lucide-react';
import { PurchasingService } from '../../../services/purchasingService';
import { PurchaseInvoice } from '../../../types/purchasing';
import { centsRound } from '../../../services/financialAnalyticsService';

interface SupplierPaymentModalProps {
  invoice: PurchaseInvoice | null;
  isOpen: boolean;
  onClose: () => void;
  onPaymentSuccess: () => void;
  bcvRate: number;
  userId: string;
}

export const SupplierPaymentModal: React.FC<SupplierPaymentModalProps> = ({
  invoice,
  isOpen,
  onClose,
  onPaymentSuccess,
  bcvRate,
  userId,
}) => {
  if (!isOpen || !invoice) return null;

  const [moneda, setMoneda] = useState<'USD' | 'VES'>('USD');
  const [montoIngresado, setMontoIngresado] = useState<number>(invoice.saldoPendienteUSD);
  const [metodoPago, setMetodoPago] = useState('TRANSFERENCIA');
  const [bancoPlataforma, setBancoPlataforma] = useState('Banesco');
  const [referencia, setReferencia] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Conversión
  const montoUSD = moneda === 'USD' ? centsRound(montoIngresado) : centsRound(bcvRate > 0 ? montoIngresado / bcvRate : 0);
  const montoVES = moneda === 'VES' ? centsRound(montoIngresado) : centsRound(montoUSD * bcvRate);
  const nuevoSaldoEstimado = centsRound(Math.max(0, invoice.saldoPendienteUSD - montoUSD));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (montoUSD <= 0) {
      setErrorMsg('El monto a pagar debe ser mayor a cero.');
      return;
    }
    if (montoUSD > invoice.saldoPendienteUSD + 0.01) {
      setErrorMsg(`El monto ($${montoUSD}) excede el saldo pendiente ($${invoice.saldoPendienteUSD}).`);
      return;
    }
    if (!referencia.trim()) {
      setErrorMsg('Debe indicar el número de referencia bancaria o soporte.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      await PurchasingService.registerSupplierPayment({
        facturaId: invoice.id,
        montoUSD,
        metodoPago,
        bancoPlataforma,
        referencia: referencia.trim(),
        fecha,
        userId,
        customBcvRate: bcvRate,
      });

      onPaymentSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error registrando pago a proveedor:', err);
      setErrorMsg(err.message || 'Error al procesar el pago.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-3xl p-6 space-y-4 shadow-2xl animate-fadeIn">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Liquidación / Abono a Proveedor (CxP)
              </h3>
              <p className="text-[11px] text-slate-400">
                Factura #{invoice.numeroFacturaProveedor} • {invoice.proveedorNombre}
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

        {/* Resumen de la Factura */}
        <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 grid grid-cols-2 gap-3 text-xs font-mono">
          <div>
            <span className="text-slate-500 block text-[10px] uppercase">Saldo Pendiente Original</span>
            <span className="text-amber-400 font-bold text-base">
              ${invoice.saldoPendienteUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <span className="text-slate-400 block text-[10px]">
              Bs. {(invoice.saldoPendienteUSD * bcvRate).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="text-right">
            <span className="text-slate-500 block text-[10px] uppercase">Saldo Tras Este Abono</span>
            <span className={`font-bold text-base ${nuevoSaldoEstimado <= 0 ? 'text-emerald-400' : 'text-cyan-400'}`}>
              ${nuevoSaldoEstimado.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <span className="text-slate-400 block text-[10px]">
              {nuevoSaldoEstimado <= 0 ? 'LIQUIDADA AL 100%' : 'ABONO PARCIAL'}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Moneda y Monto */}
          <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-slate-300 font-semibold">Moneda del Egreso</label>
              <div className="grid grid-cols-2 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    setMoneda('USD');
                    setMontoIngresado(invoice.saldoPendienteUSD);
                  }}
                  className={`px-3 py-1 rounded-lg font-bold font-mono text-[11px] transition ${
                    moneda === 'USD' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  USD ($)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMoneda('VES');
                    setMontoIngresado(centsRound(invoice.saldoPendienteUSD * bcvRate));
                  }}
                  className={`px-3 py-1 rounded-lg font-bold font-mono text-[11px] transition ${
                    moneda === 'VES' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  VES (Bs.)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-slate-400 text-[11px] mb-1">
                Monto a Abonar en {moneda}
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={montoIngresado}
                onChange={(e) => setMontoIngresado(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold text-base outline-none focus:border-purple-500"
              />
            </div>

            <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/80">
              <span>Tasa BCV: {bcvRate.toFixed(4)} VES/USD</span>
              <span className="text-slate-200">
                Equivalente: {moneda === 'USD' ? `Bs. ${montoVES.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `$ ${montoUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Método de Pago</label>
              <select
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none"
              >
                <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                <option value="PAGO_MOVIL">Pago Móvil</option>
                <option value="EFECTIVO_USD">Efectivo USD ($)</option>
                <option value="EFECTIVO_VES">Efectivo Bs. (VES)</option>
                <option value="BINANCE_USDT">Binance USDT</option>
                <option value="ZELLE">Zelle</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Banco / Plataforma</label>
              <input
                type="text"
                required
                value={bancoPlataforma}
                onChange={(e) => setBancoPlataforma(e.target.value)}
                placeholder="ej. Banesco, Venezuela, Zelle"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none"
              >
              </input>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">N° Referencia Bancaria</label>
              <input
                type="text"
                required
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="ej. 98452136"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Fecha de Pago</label>
              <input
                type="date"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || montoUSD <= 0}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold transition flex items-center gap-1.5 shadow-lg shadow-purple-950/40"
            >
              <CheckCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'Procesando...' : 'Confirmar Egreso y Liquidar'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
