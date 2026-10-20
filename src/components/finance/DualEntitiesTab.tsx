import React from 'react';
import { Users, Plus, ArrowRightLeft, Phone, MapPin } from 'lucide-react';
import { DualEntity } from '../../types/finance';

interface DualEntitiesTabProps {
  entities: DualEntity[];
  onNewEntity: () => void;
  onOpenCrossClearing: (entity: DualEntity) => void;
  onSelectEntityForPayment: (entityId: string) => void;
}

export const DualEntitiesTab: React.FC<DualEntitiesTabProps> = ({
  entities,
  onNewEntity,
  onOpenCrossClearing,
  onSelectEntityForPayment,
}) => {
  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <span>Directorio Unificado CRM / VRM con Perfilamiento Fiscal SENIAT</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Gestión canónica de Clientes y Proveedores con liquidación por compensación atómica de saldos (Account Cross-Clearing).
          </p>
        </div>
        <button
          onClick={onNewEntity}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition flex items-center gap-2 shadow-lg shadow-cyan-950/40"
        >
          <Plus className="w-4 h-4" />
          <span>+ Alta de Entidad Dual</span>
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/90 uppercase tracking-wider text-[11px] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Razón Social &amp; Perfil Fiscal</th>
                <th className="py-3.5 px-4 font-semibold">Identificación Fiscal</th>
                <th className="py-3.5 px-4 font-semibold">Roles Operativos</th>
                <th className="py-3.5 px-4 font-semibold">Contacto &amp; Domicilio Fiscal</th>
                <th className="py-3.5 px-4 font-semibold text-right">Saldo USD ($)</th>
                <th className="py-3.5 px-4 font-semibold text-right">Saldo Bs. (VES)</th>
                <th className="py-3.5 px-4 font-semibold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {entities.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-sans italic">
                    No hay entidades registradas en el CRM/VRM. Pulse "+ Alta de Entidad Dual" para registrar una.
                  </td>
                </tr>
              ) : (
                entities.map((e) => {
                  const isDual = e.roles.includes('CLIENTE') && e.roles.includes('PROVEEDOR');
                  return (
                    <tr key={e.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 font-sans">
                        <div className="font-bold text-white flex items-center gap-2">
                          <span>{e.razonSocial || e.name}</span>
                          {e.perfilFiscal?.contribuyenteEspecial === 'ESPECIAL' && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                              SENIAT Especial
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                          ID: {e.id}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-cyan-300 font-mono font-bold text-[11px]">
                          {e.identificacionFiscal || e.rifCedula}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex gap-1.5 flex-wrap items-center">
                          {e.roles.map((r) => (
                            <span
                              key={r}
                              className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                r === 'CLIENTE'
                                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                                  : 'bg-amber-950 text-amber-300 border border-amber-800'
                              }`}
                            >
                              {r}
                            </span>
                          ))}
                          {isDual && (
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-purple-950 text-purple-300 border border-purple-800 flex items-center gap-1">
                              <ArrowRightLeft className="w-2.5 h-2.5" />
                              <span>CLEARING</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-sans text-slate-300">
                        <div className="flex items-center gap-1.5 text-slate-200">
                          <Phone className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span className="font-mono text-[11px]">{e.telefonoContacto || e.phone || 'Sin teléfono'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-400 text-[10px] mt-0.5 truncate max-w-xs">
                          <MapPin className="w-3 h-3 text-cyan-400 shrink-0" />
                          <span className="truncate">{e.direccionFiscal || e.address || e.city || 'San Fernando de Apure'}</span>
                        </div>
                      </td>
                      <td className={`py-3.5 px-4 text-right font-bold ${e.balanceUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        ${e.balanceUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-400">
                        Bs. {e.balanceVES.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {isDual && (
                            <button
                              onClick={() => onOpenCrossClearing(e)}
                              className="px-2.5 py-1 rounded-lg bg-purple-950 text-purple-300 border border-purple-800 hover:bg-purple-900 text-[10px] font-sans font-medium transition flex items-center gap-1 shadow"
                              title="Compensar deudas mutuas de cliente y proveedor"
                            >
                              <ArrowRightLeft className="w-3 h-3" />
                              <span>Compensar</span>
                            </button>
                          )}
                          <button
                            onClick={() => onSelectEntityForPayment(e.id)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-sans transition flex items-center gap-1"
                            title="Crear asiento contable para esta entidad"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Asiento</span>
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
