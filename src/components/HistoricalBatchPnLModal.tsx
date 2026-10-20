import React from 'react';
import {
  X,
  Printer,
  FileSpreadsheet,
  TrendingUp,
  Scale,
  DollarSign,
  Calendar,
  Layers,
  Award,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { HistoricalBatchRecord } from '../types/inventory';
import { calculateHistoricalBatchBalance, centsRound } from '../services/financialAnalyticsService';

interface HistoricalBatchPnLModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: HistoricalBatchRecord | null;
  bcvRate?: number;
  onExportPdf?: (batch: HistoricalBatchRecord) => void;
  onExportExcel?: (batch: HistoricalBatchRecord) => void;
}

export const HistoricalBatchPnLModal: React.FC<HistoricalBatchPnLModalProps> = ({
  isOpen,
  onClose,
  batch,
  bcvRate = 0,
  onExportPdf,
  onExportExcel,
}) => {
  if (!isOpen || !batch) return null;

  const balance = calculateHistoricalBatchBalance(batch);
  const isAvian = batch.especie === 'AVICOLA';
  const totalInv = balance.inversionTotalCamadaUsd;

  // Estructura porcentual de costos sobre inversión total
  const pctCompra = totalInv > 0 ? centsRound((batch.montoPagadoCompraUsd / totalInv) * 100) : 0;
  const pctAlimento = totalInv > 0 ? centsRound((batch.costoAlimentosUsd / totalInv) * 100) : 0;
  const pctVacunas = totalInv > 0 ? centsRound((batch.costoVacunasUsd / totalInv) * 100) : 0;
  const pctOtros = totalInv > 0 ? centsRound((batch.costoOtrosInsumosUsd / totalInv) * 100) : 0;
  const pctManoObra = totalInv > 0 ? centsRound((batch.costoManoObraCuidadoresUsd / totalInv) * 100) : 0;
  const pctVet = totalInv > 0 ? centsRound((batch.costoVeterinarioCertificacionesUsd / totalInv) * 100) : 0;

  const totalVentaVES = bcvRate > 0 ? centsRound(batch.montoTotalVentaUsd * bcvRate) : 0;
  const totalInvVES = bcvRate > 0 ? centsRound(totalInv * bcvRate) : 0;
  const utilidadVES = bcvRate > 0 ? centsRound(balance.utilidadNetaRealUsd * bcvRate) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div className="relative bg-slate-900 border border-slate-700/80 rounded-3xl max-w-4xl w-full my-6 p-5 sm:p-7 shadow-2xl space-y-6 text-slate-100 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-inner ${
                isAvian
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              }`}
            >
              {isAvian ? '🐔' : '🐖'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                  Estado de Resultados Individual • Lote Cerrado
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  {batch.tipoOrigenHistorico === 'COMPRA_ADQUISICION' ? 'Compra Externa' : 'Nacimiento en Granja'}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-0.5">
                {batch.codigoLoteHistorico}
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                {batch.lineaGeneticaRaza || (isAvian ? 'Línea Avícola' : 'Línea Porcina')} • Sexo: {batch.sexoParvadaPiara || 'Mixto'} • Cierre: {batch.fechaBeneficioCierre}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-6">
          {/* Tarjeta de Resumen Ejecutivo y ROI */}
          <div className="p-5 rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border-2 border-emerald-500/50 shadow-xl">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <span className="text-[10px] font-mono uppercase text-slate-400 block font-bold">
                  Inversión Total Lote
                </span>
                <span className="text-xl font-black font-mono text-slate-200 tabular-nums">
                  ${totalInv.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                {bcvRate > 0 && (
                  <span className="text-[9px] text-slate-500 font-mono block">
                    Bs. {totalInvVES.toLocaleString()}
                  </span>
                )}
              </div>

              <div>
                <span className="text-[10px] font-mono uppercase text-slate-400 block font-bold">
                  Ventas / Retorno
                </span>
                <span className="text-xl font-black font-mono text-purple-300 tabular-nums">
                  ${batch.montoTotalVentaUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                {bcvRate > 0 && (
                  <span className="text-[9px] text-slate-500 font-mono block">
                    Bs. {totalVentaVES.toLocaleString()}
                  </span>
                )}
              </div>

              <div>
                <span className="text-[10px] font-mono uppercase text-slate-400 block font-bold">
                  Utilidad Neta Real
                </span>
                <span
                  className={`text-xl font-black font-mono tabular-nums ${
                    balance.utilidadNetaRealUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  ${balance.utilidadNetaRealUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[9px] text-slate-400 font-mono block">
                  Margen: {balance.margenRentabilidadVentasPorcentaje.toFixed(2)}%
                </span>
              </div>

              <div className="p-2 rounded-2xl bg-emerald-500/10 border border-emerald-400/40">
                <span className="text-[10px] font-mono uppercase text-emerald-400 block font-bold">
                  % ROI Real Ganancia
                </span>
                <span
                  className={`text-2xl font-black font-mono tabular-nums ${
                    balance.porcentajeGananciaRealROI >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {balance.porcentajeGananciaRealROI.toFixed(2)}%
                </span>
                <span className="text-[9px] text-emerald-300 font-mono block">
                  Sobre Capital Invertido
                </span>
              </div>
            </div>
          </div>

          {/* 1. Estructura de Costos y Ponderación Porcentual */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              1. Estructura Porcentual de Inversión y Costos
            </h3>

            {/* Barra de progreso de ponderación */}
            <div className="w-full h-4 bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
              <div
                style={{ width: `${pctCompra}%` }}
                title={`Compra Animales: ${pctCompra}%`}
                className="bg-indigo-500 h-full"
              />
              <div
                style={{ width: `${pctAlimento}%` }}
                title={`Alimento: ${pctAlimento}%`}
                className="bg-amber-500 h-full"
              />
              <div
                style={{ width: `${pctVacunas}%` }}
                title={`Vacunación: ${pctVacunas}%`}
                className="bg-cyan-500 h-full"
              />
              <div
                style={{ width: `${pctOtros}%` }}
                title={`Otros Insumos: ${pctOtros}%`}
                className="bg-purple-500 h-full"
              />
              <div
                style={{ width: `${pctManoObra}%` }}
                title={`Mano de Obra: ${pctManoObra}%`}
                className="bg-emerald-500 h-full"
              />
              <div
                style={{ width: `${pctVet}%` }}
                title={`Veterinario: ${pctVet}%`}
                className="bg-rose-500 h-full"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-center text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-indigo-400 block text-[10px]">Compra Animales</span>
                <strong className="text-white">${batch.montoPagadoCompraUsd.toFixed(2)}</strong>
                <span className="text-slate-500 block text-[9px]">{pctCompra}%</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-amber-400 block text-[10px]">Alimento</span>
                <strong className="text-white">${batch.costoAlimentosUsd.toFixed(2)}</strong>
                <span className="text-slate-500 block text-[9px]">{pctAlimento}%</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-cyan-400 block text-[10px]">Vacunación</span>
                <strong className="text-white">${batch.costoVacunasUsd.toFixed(2)}</strong>
                <span className="text-slate-500 block text-[9px]">{pctVacunas}%</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-purple-400 block text-[10px]">Otros Insumos</span>
                <strong className="text-white">${batch.costoOtrosInsumosUsd.toFixed(2)}</strong>
                <span className="text-slate-500 block text-[9px]">{pctOtros}%</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-emerald-400 block text-[10px]">Mano de Obra</span>
                <strong className="text-white">${batch.costoManoObraCuidadoresUsd.toFixed(2)}</strong>
                <span className="text-slate-500 block text-[9px]">{pctManoObra}%</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-rose-400 block text-[10px]">Veterinario</span>
                <strong className="text-white">${batch.costoVeterinarioCertificacionesUsd.toFixed(2)}</strong>
                <span className="text-slate-500 block text-[9px]">{pctVet}%</span>
              </div>
            </div>
          </div>

          {/* 2. Rendimiento Zootécnico, Biomasa y Merma */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-400" />
              2. Rendimiento Zootécnico, Mortalidad y Biomasa Vendible
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800">
                <span className="text-slate-400 text-[10px] block">Población &amp; Supervivencia</span>
                <div className="text-white font-bold text-sm mt-0.5">
                  {balance.animalesBeneficiados} de {batch.cantidadAnimalesInicial}
                </div>
                <span className="text-emerald-400 text-[10px]">
                  {balance.porcentajeSupervivencia.toFixed(1)}% ({batch.mortalidadTotalAnimales} bajas)
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800">
                <span className="text-slate-400 text-[10px] block">Días en Ciclo</span>
                <div className="text-white font-bold text-sm mt-0.5">
                  {balance.diasEfectivosEnGranja} días en granja
                </div>
                <span className="text-slate-500 text-[10px]">
                  Edad al beneficio: {batch.edadBeneficioDias}d
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800">
                <span className="text-slate-400 text-[10px] block">Biomasa Bruta vs. Neta</span>
                <div className="text-emerald-400 font-bold text-sm mt-0.5">
                  {batch.pesoGlobalNetoVendibleKg.toLocaleString()} kg netos
                </div>
                <span className="text-slate-500 text-[10px]">
                  Bruto: {batch.pesoGlobalBrutoCierreKg.toLocaleString()} kg
                  {!isAvian && batch.mermaTotalBeneficioKg > 0 && (
                    <span className="text-rose-400"> (-{batch.mermaTotalBeneficioKg}kg merma)</span>
                  )}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800">
                <span className="text-slate-400 text-[10px] block">Costos de Producción Unitarios</span>
                <div className="text-white font-bold text-sm mt-0.5">
                  ${balance.costoProduccionPorKgVendibleUsd.toFixed(2)} / kg
                </div>
                <span className="text-slate-500 text-[10px]">
                  ${balance.costoProduccionPorAnimalBeneficiadoUsd.toFixed(2)} / animal
                </span>
              </div>
            </div>
          </div>

          {/* 3. Liquidación y Retorno Comercial */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-400" />
              3. Retorno Comercial y Liquidación de Venta
            </h3>

            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Precio Pactado de Venta</span>
                <strong className="text-white">${batch.precioVentaPorKgUsd.toFixed(2)} USD / kg</strong>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Kilos Netos Vendibles</span>
                <strong className="text-emerald-400">{batch.pesoGlobalNetoVendibleKg.toLocaleString()} kg</strong>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Total Facturación Bruta (USD)</span>
                <strong className="text-purple-300 text-sm">
                  ${batch.montoTotalVentaUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
                </strong>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">(-) Inversión y Costos Totales</span>
                <strong className="text-rose-400 text-sm">
                  -${totalInv.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
                </strong>
              </div>
              <div className="flex items-center justify-between py-1.5 pt-2 text-sm font-bold">
                <span className="text-white font-bold">Utilidad Neta Real Obtenida</span>
                <span
                  className={
                    balance.utilidadNetaRealUsd >= 0 ? 'text-emerald-400 text-base' : 'text-rose-400 text-base'
                  }
                >
                  ${balance.utilidadNetaRealUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
                </span>
              </div>
            </div>

            {batch.notas && (
              <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800 text-xs text-slate-400 font-sans">
                <strong>Observaciones de Lote: </strong> {batch.notas}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
            <span>ID: {batch.id}</span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {onExportExcel && (
              <button
                type="button"
                onClick={() => onExportExcel(batch)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition min-h-[44px]"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Acta en Excel</span>
              </button>
            )}
            {onExportPdf && (
              <button
                type="button"
                onClick={() => onExportPdf(batch)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md shadow-purple-950/40 transition min-h-[44px]"
              >
                <Printer className="w-4 h-4" />
                <span>Acta Oficial PDF</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs font-mono text-slate-400 hover:text-white hover:bg-slate-800 transition min-h-[44px]"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
