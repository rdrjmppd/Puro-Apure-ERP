import React, { useState } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  Clock,
  Boxes,
  Receipt,
  X,
  ChevronRight,
  TrendingDown,
  Calendar,
  DollarSign,
  ArrowRight,
} from 'lucide-react';
import { StartupAlertDigest } from '../types/purchasing';
import { AlertLevelBadge } from './finance/purchasing/AlertLevelBadge';

interface StartupAlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSnooze24h: () => void;
  digest: StartupAlertDigest;
  isObrero?: boolean;
  onNavigateToPurchasing?: () => void;
}

export const StartupAlertsModal: React.FC<StartupAlertsModalProps> = ({
  isOpen,
  onClose,
  onSnooze24h,
  digest,
  isObrero = false,
  onNavigateToPurchasing,
}) => {
  if (!isOpen) return null;

  const totalInsumosAlerts =
    digest.insumosCriticosRojos.length + digest.insumosAlertaAmarillos.length;
  const totalCxPAlerts = isObrero
    ? 0
    : digest.facturasVencidasRojas.length + digest.facturasPorVencerAmarillas.length;

  const [activeTab, setActiveTab] = useState<'INSUMOS' | 'CXP'>(
    totalInsumosAlerts > 0 ? 'INSUMOS' : 'CXP'
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Recordatorio de Niveles Críticos y Vencimientos
              </h2>
              <p className="text-xs text-slate-400">
                Puro Apure ERP • {digest.fechaLocal}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation if Admin has both alert types */}
        {!isObrero && totalCxPAlerts > 0 && totalInsumosAlerts > 0 && (
          <div className="flex border-b border-slate-800 bg-slate-950/50 px-4 pt-2 gap-2">
            <button
              onClick={() => setActiveTab('INSUMOS')}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-bold border-b-2 transition ${
                activeTab === 'INSUMOS'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              <Boxes className="w-4 h-4" />
              Insumos Críticos ({totalInsumosAlerts})
            </button>
            <button
              onClick={() => setActiveTab('CXP')}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-bold border-b-2 transition ${
                activeTab === 'CXP'
                  ? 'border-red-500 text-red-400'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              <Receipt className="w-4 h-4" />
              Facturas CxP ({totalCxPAlerts})
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Section 1: Insumos (Visible to ALL, including OBRERO) */}
          {(activeTab === 'INSUMOS' || isObrero || totalCxPAlerts === 0) && (
            <div className="space-y-4">
              {/* Insumos Rojos */}
              {digest.insumosCriticosRojos.length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5 mb-2">
                    <AlertCircle className="w-4 h-4" />
                    Nivel Rojo: Punto Crítico de Agotamiento ({digest.insumosCriticosRojos.length})
                  </div>
                  <div className="space-y-2">
                    {digest.insumosCriticosRojos.map((item) => (
                      <div
                        key={item.itemId}
                        className="p-3 bg-red-950/25 border border-red-800/60 rounded-xl flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-100">{item.nombreInsumo}</div>
                          <div className="text-[11px] text-red-300/90 mt-0.5">
                            Existencia actual:{' '}
                            <span className="font-mono font-bold">
                              {item.existenciaActual} {item.unidad}
                            </span>{' '}
                            (Umbral crítico: {item.puntoCritico} {item.unidad})
                          </div>
                          {item.notaReorden && (
                            <div className="text-[10px] text-slate-400 italic mt-1">
                              Nota: "{item.notaReorden}"
                            </div>
                          )}
                        </div>

                        <div className="text-right">
                          <AlertLevelBadge nivel="ROJO" />
                          {item.diasCobertura !== undefined && (
                            <div className="text-[10px] font-mono text-red-400 mt-1 font-bold">
                              Cobertura: {item.diasCobertura}d
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Insumos Amarillos */}
              {digest.insumosAlertaAmarillos.length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    Nivel Amarillo: Proximidad a Punto Crítico ({digest.insumosAlertaAmarillos.length})
                  </div>
                  <div className="space-y-2">
                    {digest.insumosAlertaAmarillos.map((item) => (
                      <div
                        key={item.itemId}
                        className="p-3 bg-amber-950/20 border border-amber-800/50 rounded-xl flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-100">{item.nombreInsumo}</div>
                          <div className="text-[11px] text-amber-300/90 mt-0.5">
                            Existencia actual:{' '}
                            <span className="font-mono font-bold">
                              {item.existenciaActual} {item.unidad}
                            </span>{' '}
                            (Alerta bajo {Math.round(item.umbralAmarillo)} {item.unidad})
                          </div>
                          {item.notaReorden && (
                            <div className="text-[10px] text-slate-400 italic mt-1">
                              Nota: "{item.notaReorden}"
                            </div>
                          )}
                        </div>

                        <div className="text-right">
                          <AlertLevelBadge nivel="AMARILLO" />
                          {item.diasCobertura !== undefined && (
                            <div className="text-[10px] font-mono text-amber-300 mt-1">
                              Cobertura: {item.diasCobertura}d
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {totalInsumosAlerts === 0 && (
                <div className="p-6 text-center text-xs text-slate-400">
                  No hay insumos en nivel crítico ni amarillo en este momento.
                </div>
              )}
            </div>
          )}

          {/* Section 2: Cuentas por Pagar (HIDDEN to OBRERO) */}
          {!isObrero && (activeTab === 'CXP' || totalInsumosAlerts === 0) && (
            <div className="space-y-4">
              {/* Financial Risk Summary Banner */}
              <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400">Deuda Vencida Exigible:</span>
                  <span className="ml-2 font-mono font-bold text-red-400 text-sm">
                    ${digest.totalDeudaVencidaUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {digest.totalMoraRiesgoUSD > 0 && (
                  <div>
                    <span className="text-slate-400">Mora Proyectada:</span>
                    <span className="ml-2 font-mono font-bold text-amber-400 text-sm">
                      +${digest.totalMoraRiesgoUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>

              {/* Facturas Vencidas (Rojo) */}
              {digest.facturasVencidasRojas.length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5 mb-2">
                    <AlertCircle className="w-4 h-4" />
                    Facturas Vencidas / En Período de Gracia ({digest.facturasVencidasRojas.length})
                  </div>
                  <div className="space-y-2">
                    {digest.facturasVencidasRojas.map((inv) => (
                      <div
                        key={inv.facturaId}
                        className="p-3 bg-red-950/25 border border-red-800/60 rounded-xl flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-100 flex items-center gap-2">
                            <span>Factura #{inv.numeroFacturaProveedor}</span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({inv.proveedorNombre})
                            </span>
                          </div>
                          <div className="text-[11px] text-red-300/90 mt-0.5">
                            Saldo: <span className="font-mono font-bold">${inv.saldoPendienteUSD.toFixed(2)}</span>
                            {inv.moraProyectadaUSD > 0 && (
                              <span className="ml-2 text-amber-400 font-mono">
                                (+${inv.moraProyectadaUSD.toFixed(2)} recargo)
                              </span>
                            )}
                          </div>
                          {inv.notaRiesgoManual && (
                            <div className="text-[10px] text-amber-300 italic mt-1">
                              Riesgo: "{inv.notaRiesgoManual}"
                            </div>
                          )}
                        </div>

                        <div className="text-right">
                          <AlertLevelBadge
                            estadoVencimiento={inv.estadoVencimiento}
                            diasRestantes={inv.diasRestantes}
                          />
                          <div className="text-[10px] text-slate-400 font-mono mt-1">
                            Límite: {inv.fechaVencimiento}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Facturas Por Vencer (Amarillo) */}
              {digest.facturasPorVencerAmarillas.length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-2">
                    <Clock className="w-4 h-4" />
                    Facturas Próximas a Vencer ({digest.facturasPorVencerAmarillas.length})
                  </div>
                  <div className="space-y-2">
                    {digest.facturasPorVencerAmarillas.map((inv) => (
                      <div
                        key={inv.facturaId}
                        className="p-3 bg-amber-950/20 border border-amber-800/50 rounded-xl flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-100 flex items-center gap-2">
                            <span>Factura #{inv.numeroFacturaProveedor}</span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({inv.proveedorNombre})
                            </span>
                          </div>
                          <div className="text-[11px] text-amber-300/90 mt-0.5">
                            Saldo: <span className="font-mono font-bold">${inv.saldoPendienteUSD.toFixed(2)}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <AlertLevelBadge
                            estadoVencimiento={inv.estadoVencimiento}
                            diasRestantes={inv.diasRestantes}
                          />
                          <div className="text-[10px] text-slate-400 font-mono mt-1">
                            Límite: {inv.fechaVencimiento}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={onSnooze24h}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition"
          >
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            Posponer recordatorio hasta mañana
          </button>

          <div className="flex items-center gap-2">
            {!isObrero && onNavigateToPurchasing && (
              <button
                onClick={() => {
                  onClose();
                  onNavigateToPurchasing();
                }}
                className="flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition shadow-md"
              >
                Ir a Compras &amp; CxP
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
