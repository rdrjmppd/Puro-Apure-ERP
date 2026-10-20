import React from 'react';
import { Plus, Printer, Receipt } from 'lucide-react';
import { BillingInvoice } from '../../types/finance';

interface BillingTabProps {
  invoices: BillingInvoice[];
  onNewInvoice: () => void;
  onPrintInvoice: (invoice: BillingInvoice) => void;
  onOpenReconciliation: (invoice: BillingInvoice) => void;
}

export const BillingTab: React.FC<BillingTabProps> = ({
  invoices,
  onNewInvoice,
  onPrintInvoice,
  onOpenReconciliation,
}) => {
  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="text-xs text-slate-400">
          Generador de proformas de facturación con reglas biológicas y cálculo amortizado de crédito • Comprobantes imprimibles.
        </div>
        <button
          onClick={onNewInvoice}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition flex items-center gap-2 shadow-lg shadow-amber-950/40"
        >
          <Plus className="w-4 h-4" />
          <span>+ Emitir Proforma Fiscal</span>
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 uppercase tracking-wider text-[11px] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Proforma #</th>
                <th className="py-3.5 px-4 font-semibold">Fecha Emisión</th>
                <th className="py-3.5 px-4 font-semibold">Cliente / Razón Social</th>
                <th className="py-3.5 px-4 font-semibold">Modalidad &amp; Estado</th>
                <th className="py-3.5 px-4 font-semibold text-right">Total USD ($)</th>
                <th className="py-3.5 px-4 font-semibold text-right">Saldo Pend. ($)</th>
                <th className="py-3.5 px-4 font-semibold text-right">Total Bs. (BCV)</th>
                <th className="py-3.5 px-4 font-semibold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 font-sans italic">
                    No hay proformas fiscales emitidas. Presione "+ Emitir Proforma Fiscal" para facturar lotes avícolas o porcinos.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const isCredito = inv.modalidadTransaccion === 'CREDITO';
                  const isPending =
                    inv.paymentStatus === 'PENDIENTE' ||
                    (inv.saldoPendienteUSD !== undefined && inv.saldoPendienteUSD > 0);
                  const saldo =
                    inv.saldoPendienteUSD !== undefined
                      ? inv.saldoPendienteUSD
                      : isCredito
                      ? inv.totalUSD
                      : 0;

                  return (
                    <tr key={inv.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 font-bold text-white font-mono">
                        {inv.invoiceNumber}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 font-sans">
                        {inv.date}
                      </td>
                      <td className="py-3.5 px-4 font-sans text-slate-200">
                        <div>{inv.customerName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{inv.customerRif}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isCredito
                              ? 'bg-blue-950 text-blue-300 border border-blue-800'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          }`}
                        >
                          {inv.modalidadTransaccion || 'CONTADO'}
                        </span>
                        <span
                          className={`ml-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                            isPending
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          }`}
                        >
                          {isPending ? 'PENDIENTE' : 'PAGADO'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-emerald-400">
                        ${inv.totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right font-bold ${
                          saldo > 0 ? 'text-amber-400' : 'text-slate-500'
                        }`}
                      >
                        ${saldo.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-cyan-400">
                        Bs. {inv.totalVES.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {isPending && (
                            <button
                              onClick={() => onOpenReconciliation(inv)}
                              className="px-2.5 py-1.5 rounded-lg bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-800 font-sans text-xs flex items-center justify-center gap-1 transition shadow"
                              title="Registrar abono / liquidación de saldo para esta factura"
                            >
                              <Receipt className="w-3.5 h-3.5 text-purple-400" />
                              <span>Abonar</span>
                            </button>
                          )}
                          <button
                            onClick={() => onPrintInvoice(inv)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white font-sans text-xs flex items-center justify-center gap-1 transition"
                            title="Imprimir Comprobante Fiscal Bimonetario"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>PDF</span>
                          </button>
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
    </div>
  );
};
