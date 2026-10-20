import React from 'react';
import { Plus, CheckCircle2, Clock } from 'lucide-react';
import { PaymentRecord, FinancialImpactType } from '../../types/finance';

export const IMPACT_CONFIG: Record<
  FinancialImpactType,
  {
    label: string;
    shortLabel: string;
    flow: 'INGRESO' | 'EGRESO';
    badgeClass: string;
    borderClass: string;
    bgLightClass: string;
    description: string;
    categoryGroup: string;
  }
> = {
  INGRESO_VENTA: {
    label: 'Ingreso por Venta (Facturación / Cobro Clientes)',
    shortLabel: 'Ingreso Venta',
    flow: 'INGRESO',
    badgeClass: 'bg-emerald-950 text-emerald-300 border-emerald-700',
    borderClass: 'border-emerald-500',
    bgLightClass: 'bg-emerald-500/10 text-emerald-400',
    description: 'Cobro por ventas y despachos de lotes avícolas, cerdos en pie o canales beneficiadas.',
    categoryGroup: 'Ingresos Operativos',
  },
  EGRESO_PROVEEDOR: {
    label: 'Egreso a Proveedor (Materia Prima / Alimento)',
    shortLabel: 'Egreso Proveedor',
    flow: 'EGRESO',
    badgeClass: 'bg-rose-950 text-rose-300 border-rose-700',
    borderClass: 'border-rose-500',
    bgLightClass: 'bg-rose-500/10 text-rose-400',
    description: 'Pagos por alimento concentrado, pollas iniciadoras, lechones, materias primas y medicamentos.',
    categoryGroup: 'Egresos Operativos',
  },
  EGRESO_NOMINA: {
    label: 'Egreso por Nómina (Personal Fijo / Obrero)',
    shortLabel: 'Egreso Nómina',
    flow: 'EGRESO',
    badgeClass: 'bg-indigo-950 text-indigo-300 border-indigo-700',
    borderClass: 'border-indigo-500',
    bgLightClass: 'bg-indigo-500/10 text-indigo-400',
    description: 'Sueldos, salarios, cestatickets y beneficios laborales devengados por el equipo de granja.',
    categoryGroup: 'Gastos de Personal',
  },
  EGRESO_HONORARIOS: {
    label: 'Egreso por Honorarios Profesionales',
    shortLabel: 'Egreso Honorarios',
    flow: 'EGRESO',
    badgeClass: 'bg-purple-950 text-purple-300 border-purple-700',
    borderClass: 'border-purple-500',
    bgLightClass: 'bg-purple-500/10 text-purple-400',
    description: 'Servicios de asesoría veterinaria, ingeniería zootécnica, contabilidad externa o legal.',
    categoryGroup: 'Servicios Profesionales',
  },
  EGRESO_SERVICIOS: {
    label: 'Egreso por Servicios Operativos y Logística',
    shortLabel: 'Egreso Servicios',
    flow: 'EGRESO',
    badgeClass: 'bg-amber-950 text-amber-300 border-amber-700',
    borderClass: 'border-amber-500',
    bgLightClass: 'bg-amber-500/10 text-amber-400',
    description: 'Fletes, electricidad, agua, gasoil, mantenimiento de galpones y transporte de biomasa.',
    categoryGroup: 'Costos Operativos',
  },
  EGRESO_IMPUESTOS: {
    label: 'Egreso Tributario / Retenciones SENIAT',
    shortLabel: 'Egreso SENIAT',
    flow: 'EGRESO',
    badgeClass: 'bg-red-950 text-red-300 border-red-700',
    borderClass: 'border-red-500',
    bgLightClass: 'bg-red-500/10 text-red-400',
    description: 'Anticipos de ISLR, retenciones de IVA a proveedores y tributos municipales agropecuarios.',
    categoryGroup: 'Obligaciones Fiscales',
  },
  INGRESO: {
    label: 'Ingreso Operativo General',
    shortLabel: 'Ingreso General',
    flow: 'INGRESO',
    badgeClass: 'bg-emerald-950 text-emerald-300 border-emerald-700',
    borderClass: 'border-emerald-500',
    bgLightClass: 'bg-emerald-500/10 text-emerald-400',
    description: 'Ingresos varios de caja chica o actividades agropecuarias secundarias.',
    categoryGroup: 'Ingresos Operativos',
  },
  EGRESO: {
    label: 'Egreso Operativo General',
    shortLabel: 'Egreso General',
    flow: 'EGRESO',
    badgeClass: 'bg-rose-950 text-rose-300 border-rose-700',
    borderClass: 'border-rose-500',
    bgLightClass: 'bg-rose-500/10 text-rose-400',
    description: 'Egresos varios de caja chica no clasificados.',
    categoryGroup: 'Egresos Operativos',
  },
};

interface BookkeepingTabProps {
  payments: PaymentRecord[];
  onNewEntry: () => void;
}

export const BookkeepingTab: React.FC<BookkeepingTabProps> = ({
  payments,
  onNewEntry,
}) => {
  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="text-xs text-slate-400">
          Libro diario de ingresos y egresos con doble columna contable simultánea en USD ($) y Bolívares (Bs.).
        </div>
        <button
          onClick={onNewEntry}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition flex items-center gap-2 shadow-lg shadow-emerald-950/40"
        >
          <Plus className="w-4 h-4" />
          <span>+ Nuevo Asiento Contable</span>
        </button>
      </div>

      {/* Tabla Libro Diario Bimonetario */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 uppercase tracking-wider text-[11px] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Fecha / Referencia</th>
                <th className="py-3.5 px-4 font-semibold">Entidad / Razón Social</th>
                <th className="py-3.5 px-4 font-semibold">Tipo Impacto</th>
                <th className="py-3.5 px-4 font-semibold">Método / Banco</th>
                <th className="py-3.5 px-4 font-semibold text-right">Monto USD ($)</th>
                <th className="py-3.5 px-4 font-semibold text-right">Monto Bs. (VES)</th>
                <th className="py-3.5 px-4 font-semibold">Tasa BCV Aplicada</th>
                <th className="py-3.5 px-4 font-semibold text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 font-sans italic">
                    No hay movimientos contables registrados. Presione "+ Nuevo Asiento Contable" para ingresar pagos o cobros.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white font-sans">{p.reference}</div>
                      <span className="text-[10px] text-slate-400">{p.date}</span>
                    </td>
                    <td className="py-3.5 px-4 font-sans text-slate-200">
                      {p.entityName}
                      {p.idDocument && (
                        <span className="block text-[10px] text-slate-500 font-mono">{p.idDocument}</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {(() => {
                        const conf = IMPACT_CONFIG[p.impactType] || IMPACT_CONFIG.INGRESO;
                        return (
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 border ${conf.badgeClass}`}
                            title={conf.description}
                          >
                            <span>{conf.flow === 'INGRESO' ? '↑' : '↓'}</span>
                            <span>{conf.shortLabel}</span>
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 font-sans">
                      {p.paymentMode} - {p.platform}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-white">
                      ${p.amountUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-cyan-400">
                      Bs. {p.amountVES.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      {p.bcvRate.toFixed(4)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {p.isReconciled ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                          <CheckCircle2 className="w-3 h-3" />
                          Conciliado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800">
                          <Clock className="w-3 h-3" />
                          Pendiente
                        </span>
                      )}
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
