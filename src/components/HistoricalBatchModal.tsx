import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Bird,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Save,
  CheckCircle2,
  Calendar,
  Layers,
  Scale,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import {
  HistoricalBatchRecord,
  HistoricalBatchOriginType,
  LivestockSpecies,
  LivestockSex,
} from '../types/inventory';
import {
  calculateHistoricalBatchBalance,
  centsRound,
  round2,
} from '../services/financialAnalyticsService';
import { InventoryService } from '../services/inventoryService';

interface HistoricalBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchToEdit?: HistoricalBatchRecord | null;
  onSaved: () => void;
  userId: string;
}

export const HistoricalBatchModal: React.FC<HistoricalBatchModalProps> = ({
  isOpen,
  onClose,
  batchToEdit,
  onSaved,
  userId,
}) => {
  // 1. Clasificación y Origen
  const [especie, setEspecie] = useState<LivestockSpecies>('AVICOLA');
  const [tipoOrigenHistorico, setTipoOrigenHistorico] =
    useState<HistoricalBatchOriginType>('COMPRA_ADQUISICION');
  const [codigoLoteHistorico, setCodigoLoteHistorico] = useState('');
  const [sexoParvadaPiara, setSexoParvadaPiara] = useState<LivestockSex>('MIXTO');
  const [lineaGeneticaRaza, setLineaGeneticaRaza] = useState('Cobb 500');
  const [fechaInicioLote, setFechaInicioLote] = useState(
    new Date(Date.now() - 40 * 86400000).toISOString().split('T')[0]
  );
  const [fechaBeneficioCierre, setFechaBeneficioCierre] = useState(
    new Date().toISOString().split('T')[0]
  );

  // 2. Recepción, Parida o Compra Inicial
  const [cantidadAnimalesInicial, setCantidadAnimalesInicial] = useState<number>(1000);
  const [diasNacidosInicio, setDiasNacidosInicio] = useState<number>(1);
  const [pesoGlobalInicialKg, setPesoGlobalInicialKg] = useState<number>(42.0);
  const [montoPagadoCompraUsd, setMontoPagadoCompraUsd] = useState<number>(800.0);

  // 3. Costos Consolidados de Inversión y Mantenimiento
  const [costoAlimentosUsd, setCostoAlimentosUsd] = useState<number>(1400.0);
  const [cantidadSacosOKilosAlimento, setCantidadSacosOKilosAlimento] = useState<number>(35);
  const [costoVacunasUsd, setCostoVacunasUsd] = useState<number>(120.0);
  const [costoOtrosInsumosUsd, setCostoOtrosInsumosUsd] = useState<number>(80.0);
  const [costoManoObraCuidadoresUsd, setCostoManoObraCuidadoresUsd] = useState<number>(200.0);
  const [costoVeterinarioCertificacionesUsd, setCostoVeterinarioCertificacionesUsd] =
    useState<number>(50.0);

  // 4. Métricas de Producción, Mortalidad, Merma y Beneficio
  const [mortalidadTotalAnimales, setMortalidadTotalAnimales] = useState<number>(40);
  const [edadBeneficioDias, setEdadBeneficioDias] = useState<number>(38);
  const [pesoGlobalBrutoCierreKg, setPesoGlobalBrutoCierreKg] = useState<number>(2300.0);
  // Merma post-mortem para porcinos
  const [mermaModo, setMermaModo] = useState<'TOTAL' | 'POR_ANIMAL'>('POR_ANIMAL');
  const [mermaPorAnimalKg, setMermaPorAnimalKg] = useState<number>(18.0);
  const [mermaTotalBeneficioKg, setMermaTotalBeneficioKg] = useState<number>(0);

  // 5. Retorno Comercial y Cierre
  const [precioVentaPorKgUsd, setPrecioVentaPorKgUsd] = useState<number>(1.85);
  const [montoTotalVentaUsd, setMontoTotalVentaUsd] = useState<number>(4255.0);
  const [isManualVentaEdit, setIsManualVentaEdit] = useState(false);
  const [notas, setNotas] = useState('');

  // Estados de control
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Inicializar o resetear formulario según batchToEdit o especie
  useEffect(() => {
    if (batchToEdit) {
      setEspecie(batchToEdit.especie);
      setTipoOrigenHistorico(batchToEdit.tipoOrigenHistorico);
      setCodigoLoteHistorico(batchToEdit.codigoLoteHistorico);
      setSexoParvadaPiara(batchToEdit.sexoParvadaPiara || 'MIXTO');
      setLineaGeneticaRaza(batchToEdit.lineaGeneticaRaza || '');
      setFechaInicioLote(batchToEdit.fechaInicioLote);
      setFechaBeneficioCierre(batchToEdit.fechaBeneficioCierre);
      setCantidadAnimalesInicial(batchToEdit.cantidadAnimalesInicial);
      setDiasNacidosInicio(batchToEdit.diasNacidosInicio);
      setPesoGlobalInicialKg(batchToEdit.pesoGlobalInicialKg);
      setMontoPagadoCompraUsd(batchToEdit.montoPagadoCompraUsd);
      setCostoAlimentosUsd(batchToEdit.costoAlimentosUsd);
      setCantidadSacosOKilosAlimento(batchToEdit.cantidadSacosOKilosAlimento || 0);
      setCostoVacunasUsd(batchToEdit.costoVacunasUsd);
      setCostoOtrosInsumosUsd(batchToEdit.costoOtrosInsumosUsd);
      setCostoManoObraCuidadoresUsd(batchToEdit.costoManoObraCuidadoresUsd);
      setCostoVeterinarioCertificacionesUsd(batchToEdit.costoVeterinarioCertificacionesUsd);
      setMortalidadTotalAnimales(batchToEdit.mortalidadTotalAnimales);
      setEdadBeneficioDias(batchToEdit.edadBeneficioDias);
      setPesoGlobalBrutoCierreKg(batchToEdit.pesoGlobalBrutoCierreKg);
      setMermaTotalBeneficioKg(batchToEdit.mermaTotalBeneficioKg || 0);
      setPrecioVentaPorKgUsd(batchToEdit.precioVentaPorKgUsd);
      setMontoTotalVentaUsd(batchToEdit.montoTotalVentaUsd);
      setIsManualVentaEdit(true);
      setNotas(batchToEdit.notas || '');
    } else {
      // Valores por defecto para nuevo registro
      resetDefaults(especie, tipoOrigenHistorico);
    }
  }, [batchToEdit, isOpen]);

  const resetDefaults = (spec: LivestockSpecies, orig: HistoricalBatchOriginType) => {
    const isAv = spec === 'AVICOLA';
    const isComp = orig === 'COMPRA_ADQUISICION';
    const year = new Date().getFullYear();
    const rand = Math.floor(100 + Math.random() * 900);

    setCodigoLoteHistorico(isAv ? `CAM-POLLOS-${year}-${rand}` : `PAR-CERDOS-${year}-${rand}`);
    setLineaGeneticaRaza(isAv ? 'Cobb 500' : 'Landrace x Pietrain');
    setSexoParvadaPiara('MIXTO');

    if (isAv) {
      setCantidadAnimalesInicial(1000);
      setDiasNacidosInicio(isComp ? 1 : 0);
      setPesoGlobalInicialKg(42.0);
      setMontoPagadoCompraUsd(isComp ? 800.0 : 0.0);
      setCostoAlimentosUsd(1400.0);
      setCantidadSacosOKilosAlimento(35);
      setCostoVacunasUsd(120.0);
      setCostoOtrosInsumosUsd(80.0);
      setCostoManoObraCuidadoresUsd(200.0);
      setCostoVeterinarioCertificacionesUsd(50.0);
      setMortalidadTotalAnimales(40);
      setEdadBeneficioDias(38);
      setPesoGlobalBrutoCierreKg(2300.0);
      setMermaTotalBeneficioKg(0);
      setPrecioVentaPorKgUsd(1.85);
      setMontoTotalVentaUsd(4255.0);
    } else {
      setCantidadAnimalesInicial(12);
      setDiasNacidosInicio(isComp ? 30 : 0);
      setPesoGlobalInicialKg(18.0);
      setMontoPagadoCompraUsd(isComp ? 360.0 : 0.0);
      setCostoAlimentosUsd(1200.0);
      setCantidadSacosOKilosAlimento(30);
      setCostoVacunasUsd(150.0);
      setCostoOtrosInsumosUsd(50.0);
      setCostoManoObraCuidadoresUsd(180.0);
      setCostoVeterinarioCertificacionesUsd(70.0);
      setMortalidadTotalAnimales(1);
      setEdadBeneficioDias(150);
      setPesoGlobalBrutoCierreKg(1210.0);
      setMermaModo('POR_ANIMAL');
      setMermaPorAnimalKg(18.0);
      setMermaTotalBeneficioKg(198.0);
      setPrecioVentaPorKgUsd(2.60);
      setMontoTotalVentaUsd(2631.20);
    }
    setIsManualVentaEdit(false);
  };

  const handleEspecieChange = (newSpec: LivestockSpecies) => {
    setEspecie(newSpec);
    if (!batchToEdit) {
      resetDefaults(newSpec, tipoOrigenHistorico);
    }
  };

  const handleOrigenChange = (newOrig: HistoricalBatchOriginType) => {
    setTipoOrigenHistorico(newOrig);
    if (newOrig === 'PARIDA_NACIMIENTO_GRANJA') {
      setDiasNacidosInicio(0);
      setMontoPagadoCompraUsd(0.0);
    } else {
      if (diasNacidosInicio === 0) {
        setDiasNacidosInicio(especie === 'AVICOLA' ? 1 : 30);
      }
      if (montoPagadoCompraUsd === 0) {
        setMontoPagadoCompraUsd(especie === 'AVICOLA' ? 800.0 : 360.0);
      }
    }
  };

  // Cálculo de merma dinámica para Cerdos
  const computedMermaKg = useMemo(() => {
    if (especie === 'AVICOLA') return 0;
    if (mermaModo === 'POR_ANIMAL') {
      const benef = Math.max(0, (Number(cantidadAnimalesInicial) || 0) - (Number(mortalidadTotalAnimales) || 0));
      return centsRound(benef * (Number(mermaPorAnimalKg) || 0));
    }
    return centsRound(Number(mermaTotalBeneficioKg) || 0);
  }, [especie, mermaModo, mermaPorAnimalKg, mermaTotalBeneficioKg, cantidadAnimalesInicial, mortalidadTotalAnimales]);

  // Peso global neto vendible autocalculado
  const computedPesoNetoKg = useMemo(() => {
    const bruto = centsRound(Number(pesoGlobalBrutoCierreKg) || 0);
    return centsRound(Math.max(0, bruto - computedMermaKg));
  }, [pesoGlobalBrutoCierreKg, computedMermaKg]);

  // Autocalcular monto total de venta si no se editó manualmente
  useEffect(() => {
    if (!isManualVentaEdit) {
      const precio = Number(precioVentaPorKgUsd) || 0;
      setMontoTotalVentaUsd(centsRound(computedPesoNetoKg * precio));
    }
  }, [computedPesoNetoKg, precioVentaPorKgUsd, isManualVentaEdit]);

  // SIMULACIÓN DE BALANCE EN TIEMPO REAL (useMemo)
  const simulation = useMemo(() => {
    const mockRecord: HistoricalBatchRecord = {
      id: batchToEdit?.id || 'sim',
      codigoLoteHistorico: codigoLoteHistorico || 'SIM',
      especie,
      tipoOrigenHistorico,
      sexoParvadaPiara,
      lineaGeneticaRaza,
      fechaInicioLote,
      fechaBeneficioCierre,
      cantidadAnimalesInicial: Number(cantidadAnimalesInicial) || 0,
      diasNacidosInicio: Number(diasNacidosInicio) || 0,
      pesoGlobalInicialKg: Number(pesoGlobalInicialKg) || 0,
      montoPagadoCompraUsd: Number(montoPagadoCompraUsd) || 0,
      costoAlimentosUsd: Number(costoAlimentosUsd) || 0,
      cantidadSacosOKilosAlimento: Number(cantidadSacosOKilosAlimento) || 0,
      costoVacunasUsd: Number(costoVacunasUsd) || 0,
      costoOtrosInsumosUsd: Number(costoOtrosInsumosUsd) || 0,
      costoManoObraCuidadoresUsd: Number(costoManoObraCuidadoresUsd) || 0,
      costoVeterinarioCertificacionesUsd: Number(costoVeterinarioCertificacionesUsd) || 0,
      mortalidadTotalAnimales: Number(mortalidadTotalAnimales) || 0,
      edadBeneficioDias: Number(edadBeneficioDias) || 0,
      pesoGlobalBrutoCierreKg: Number(pesoGlobalBrutoCierreKg) || 0,
      mermaTotalBeneficioKg: computedMermaKg,
      pesoGlobalNetoVendibleKg: computedPesoNetoKg,
      precioVentaPorKgUsd: Number(precioVentaPorKgUsd) || 0,
      montoTotalVentaUsd: Number(montoTotalVentaUsd) || 0,
      createdTimestamp: 0,
      updatedTimestamp: 0,
      createdBy: userId,
    };
    return calculateHistoricalBatchBalance(mockRecord);
  }, [
    batchToEdit,
    codigoLoteHistorico,
    especie,
    tipoOrigenHistorico,
    sexoParvadaPiara,
    lineaGeneticaRaza,
    fechaInicioLote,
    fechaBeneficioCierre,
    cantidadAnimalesInicial,
    diasNacidosInicio,
    pesoGlobalInicialKg,
    montoPagadoCompraUsd,
    costoAlimentosUsd,
    cantidadSacosOKilosAlimento,
    costoVacunasUsd,
    costoOtrosInsumosUsd,
    costoManoObraCuidadoresUsd,
    costoVeterinarioCertificacionesUsd,
    mortalidadTotalAnimales,
    edadBeneficioDias,
    pesoGlobalBrutoCierreKg,
    computedMermaKg,
    computedPesoNetoKg,
    precioVentaPorKgUsd,
    montoTotalVentaUsd,
    userId,
  ]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!codigoLoteHistorico.trim()) {
      setErrorMsg('Debe especificar un código de lote histórico.');
      return;
    }
    if (Number(cantidadAnimalesInicial) <= 0) {
      setErrorMsg('La cantidad de animales iniciales debe ser mayor a 0.');
      return;
    }
    if (Number(mortalidadTotalAnimales) > Number(cantidadAnimalesInicial)) {
      setErrorMsg('La mortalidad no puede superar la cantidad de animales iniciales.');
      return;
    }
    if (Number(mortalidadTotalAnimales) < Number(cantidadAnimalesInicial) && Number(pesoGlobalBrutoCierreKg) <= 0) {
      setErrorMsg('El peso bruto al cierre debe ser mayor a 0 kg cuando hay animales beneficiados.');
      return;
    }
    if (
      especie === 'PORCINO' &&
      Number(mortalidadTotalAnimales) < Number(cantidadAnimalesInicial) &&
      computedMermaKg >= Number(pesoGlobalBrutoCierreKg)
    ) {
      setErrorMsg('La merma post-mortem calculada no puede ser igual o mayor al peso bruto de cierre.');
      return;
    }

    setIsSaving(true);
    try {
      const record: HistoricalBatchRecord = {
        id: batchToEdit?.id || `HIST-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        codigoLoteHistorico: codigoLoteHistorico.trim(),
        especie,
        tipoOrigenHistorico,
        sexoParvadaPiara,
        lineaGeneticaRaza: lineaGeneticaRaza.trim() || undefined,
        fechaInicioLote,
        fechaBeneficioCierre,
        cantidadAnimalesInicial: Number(cantidadAnimalesInicial),
        diasNacidosInicio: Number(diasNacidosInicio),
        pesoGlobalInicialKg: centsRound(Number(pesoGlobalInicialKg)),
        montoPagadoCompraUsd: centsRound(Number(montoPagadoCompraUsd)),
        costoAlimentosUsd: centsRound(Number(costoAlimentosUsd)),
        cantidadSacosOKilosAlimento: cantidadSacosOKilosAlimento ? Number(cantidadSacosOKilosAlimento) : undefined,
        costoVacunasUsd: centsRound(Number(costoVacunasUsd)),
        costoOtrosInsumosUsd: centsRound(Number(costoOtrosInsumosUsd)),
        costoManoObraCuidadoresUsd: centsRound(Number(costoManoObraCuidadoresUsd)),
        costoVeterinarioCertificacionesUsd: centsRound(Number(costoVeterinarioCertificacionesUsd)),
        mortalidadTotalAnimales: Number(mortalidadTotalAnimales),
        edadBeneficioDias: Number(edadBeneficioDias),
        pesoGlobalBrutoCierreKg: centsRound(Number(pesoGlobalBrutoCierreKg)),
        mermaTotalBeneficioKg: computedMermaKg,
        pesoGlobalNetoVendibleKg: computedPesoNetoKg,
        precioVentaPorKgUsd: centsRound(Number(precioVentaPorKgUsd)),
        montoTotalVentaUsd: centsRound(Number(montoTotalVentaUsd)),
        notas: notas.trim() || undefined,
        createdTimestamp: batchToEdit?.createdTimestamp || Date.now(),
        updatedTimestamp: Date.now(),
        createdBy: userId,
      };

      const result = await InventoryService.saveHistoricalBatch(record);
      if (result.success) {
        onSaved();
        onClose();
      } else {
        setErrorMsg(result.error || 'Ocurrió un error al guardar el lote histórico.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error inesperado al persistir el registro.');
    } finally {
      setIsSaving(false);
    }
  };

  const isAvian = especie === 'AVICOLA';

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
              <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                Línea Histórica • Cero Afectación de Stock
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-0.5">
                {batchToEdit ? 'Editar Lote Histórico' : 'Registrar Camada / Parida Pasada'}
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Auditoría zootécnica y sustentación de la rentabilidad real del negocio hasta ahora.
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

        {errorMsg && (
          <div className="p-3 rounded-2xl bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs flex items-center gap-2 font-mono">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto pr-1 space-y-6">
          {/* 1. SELECTORES CONMUTADORES SUPERIORES */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-950/50 border border-slate-800">
            {/* Especie Selector */}
            <div>
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">
                1. Especie del Registro Histórico
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleEspecieChange('AVICOLA')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold text-xs transition border ${
                    isAvian
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-base">🐔</span> Camada Pollos
                </button>
                <button
                  type="button"
                  onClick={() => handleEspecieChange('PORCINO')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold text-xs transition border ${
                    !isAvian
                      ? 'bg-rose-500/20 border-rose-400 text-rose-300 shadow-md'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-base">🐖</span> Parida Cerdos
                </button>
              </div>
            </div>

            {/* Modalidad de Inicio */}
            <div>
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">
                2. Modalidad de Inicio
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleOrigenChange('COMPRA_ADQUISICION')}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-xs transition border ${
                    tipoOrigenHistorico === 'COMPRA_ADQUISICION'
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-md'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span>🛒</span> Compra Inicial
                </button>
                <button
                  type="button"
                  onClick={() => handleOrigenChange('PARIDA_NACIMIENTO_GRANJA')}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-xs transition border ${
                    tipoOrigenHistorico === 'PARIDA_NACIMIENTO_GRANJA'
                      ? 'bg-indigo-500/20 border-indigo-400 text-indigo-300 shadow-md'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span>🏡</span> Nacida en Granja
                </button>
              </div>
            </div>
          </div>

          {/* 2. IDENTIFICACIÓN Y TRAZABILIDAD */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              Identificación y Ciclo Biológico
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Código de Lote Único
                </label>
                <input
                  type="text"
                  value={codigoLoteHistorico}
                  onChange={(e) => setCodigoLoteHistorico(e.target.value)}
                  placeholder={isAvian ? 'CAM-POLLOS-2025-01' : 'PAR-CERDOS-2025-01'}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Línea Genética / Raza
                </label>
                <input
                  type="text"
                  value={lineaGeneticaRaza}
                  onChange={(e) => setLineaGeneticaRaza(e.target.value)}
                  placeholder={isAvian ? 'Cobb 500 / Ross 308' : 'Landrace / Duroc'}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Sexo Parvada / Piara
                </label>
                <select
                  value={sexoParvadaPiara}
                  onChange={(e) => setSexoParvadaPiara(e.target.value as LivestockSex)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="MIXTO">Mixto</option>
                  <option value="MACHO">Macho</option>
                  <option value="HEMBRA">Hembra</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Fecha Inicio / Recepción
                </label>
                <input
                  type="date"
                  value={fechaInicioLote}
                  onChange={(e) => setFechaInicioLote(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
            </div>
          </div>

          {/* 3. RECEPCIÓN / NACIMIENTO / COMPRA */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-400" />
              {isAvian ? 'Recepción Inicial de Pollitos' : 'Recepción o Parida Inicial de Lechones'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  {isAvian ? 'Cantidad Pollos Iniciales' : 'Cantidad Lechones Iniciales'}
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={cantidadAnimalesInicial}
                  onChange={(e) => setCantidadAnimalesInicial(Math.max(1, parseInt(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Días Nacidos al Ingreso
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={diasNacidosInicio}
                  onChange={(e) => setDiasNacidosInicio(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[9px] text-slate-500 font-mono">0 si nació en granja</span>
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Peso Global Inicial (Kg)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pesoGlobalInicialKg}
                  onChange={(e) => setPesoGlobalInicialKg(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[9px] text-slate-500 font-mono">
                  Promedio: {cantidadAnimalesInicial > 0 ? (pesoGlobalInicialKg / cantidadAnimalesInicial).toFixed(3) : 0} kg/animal
                </span>
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Monto Compra Inicial ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={montoPagadoCompraUsd}
                  onChange={(e) => setMontoPagadoCompraUsd(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[9px] text-slate-500 font-mono">Permite 0.00 si nació en granja</span>
              </div>
            </div>
          </div>

          {/* 4. COSTOS OPERATIVOS Y MANTENIMIENTO */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              Costos Consolidados de Mantenimiento (USD)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Inversión en Alimentos ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costoAlimentosUsd}
                  onChange={(e) => setCostoAlimentosUsd(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Sacos o Kg Alimento (Auditoría)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={cantidadSacosOKilosAlimento}
                  onChange={(e) => setCantidadSacosOKilosAlimento(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="Sacos o Kg totales"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Plan de Vacunación ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costoVacunasUsd}
                  onChange={(e) => setCostoVacunasUsd(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Otros Insumos / Vitaminas / Cal ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costoOtrosInsumosUsd}
                  onChange={(e) => setCostoOtrosInsumosUsd(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Mano de Obra Cuidadores ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costoManoObraCuidadoresUsd}
                  onChange={(e) => setCostoManoObraCuidadoresUsd(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[9px] text-slate-500 font-mono">Asiento histórico cerrado</span>
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Veterinario y Certificaciones ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costoVeterinarioCertificacionesUsd}
                  onChange={(e) => setCostoVeterinarioCertificacionesUsd(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* 5. PRODUCCIÓN, MORTALIDAD, MERMA Y BENEFICIO */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Métricas de Producción, Mortalidad, Merma y Beneficio
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Mortalidad Total (Animales)
                </label>
                <input
                  type="number"
                  min="0"
                  max={cantidadAnimalesInicial}
                  step="1"
                  value={mortalidadTotalAnimales}
                  onChange={(e) => setMortalidadTotalAnimales(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  required
                />
                <span className="text-[9px] text-amber-400 font-mono">
                  Supervivencia: {simulation.porcentajeSupervivencia}% ({simulation.animalesBeneficiados} vivos)
                </span>
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Edad de Beneficio (Días)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={edadBeneficioDias}
                  onChange={(e) => setEdadBeneficioDias(Math.max(1, parseInt(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  required
                />
                <span className="text-[9px] text-slate-500 font-mono">
                  Días en granja: {simulation.diasEfectivosEnGranja}
                </span>
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Fecha de Beneficio / Cierre
                </label>
                <input
                  type="date"
                  value={fechaBeneficioCierre}
                  onChange={(e) => setFechaBeneficioCierre(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Peso Global Bruto al Cierre (Kg)
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={pesoGlobalBrutoCierreKg}
                  onChange={(e) => setPesoGlobalBrutoCierreKg(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
            </div>

            {/* SECCIÓN ESPECÍFICA DE MERMA PARA PORCINOS */}
            {!isAvian && (
              <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-800/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                    <span>🐖</span> Deducción de Merma Post-Mortem (Cerdos)
                  </span>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setMermaModo('POR_ANIMAL')}
                      className={`px-2.5 py-1 rounded-lg font-mono text-[11px] transition ${
                        mermaModo === 'POR_ANIMAL'
                          ? 'bg-rose-500 text-white font-bold'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      Por Animal (ej. 15-20 kg)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMermaModo('TOTAL')}
                      className={`px-2.5 py-1 rounded-lg font-mono text-[11px] transition ${
                        mermaModo === 'TOTAL'
                          ? 'bg-rose-500 text-white font-bold'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      Kilos Totales
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  {mermaModo === 'POR_ANIMAL' ? (
                    <div>
                      <label className="text-[11px] font-mono text-slate-400 block mb-1">
                        Merma por Cerdo (Kg)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={mermaPorAnimalKg}
                        onChange={(e) => setMermaPorAnimalKg(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-full bg-slate-950 border border-rose-700/60 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="text-[11px] font-mono text-slate-400 block mb-1">
                        Merma Total de la Parida (Kg)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={mermaTotalBeneficioKg}
                        onChange={(e) => setMermaTotalBeneficioKg(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-full bg-slate-950 border border-rose-700/60 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] font-mono text-slate-400 block mb-1">
                      Merma Total Calculada (Kg)
                    </label>
                    <div className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-rose-300 font-bold">
                      {computedMermaKg.toLocaleString()} kg
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-mono text-slate-400 block mb-1">
                      Peso Global Neto Vendible (Kg)
                    </label>
                    <div className="w-full bg-emerald-950/40 border border-emerald-700/50 rounded-xl px-3 py-2 text-xs font-mono text-emerald-300 font-bold">
                      {computedPesoNetoKg.toLocaleString()} kg
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 6. RETORNO COMERCIAL Y VENTA */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              Retorno Comercial y Liquidación de Venta
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  {isAvian ? 'Precio Venta por Kg Vivo ($)' : 'Precio Venta por Kg Neto ($)'}
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={precioVentaPorKgUsd}
                  onChange={(e) => {
                    setIsManualVentaEdit(false);
                    setPrecioVentaPorKgUsd(Math.max(0, parseFloat(e.target.value) || 0));
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-mono text-slate-400">
                    Monto Total de Venta ($)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsManualVentaEdit(false);
                      setMontoTotalVentaUsd(centsRound(computedPesoNetoKg * precioVentaPorKgUsd));
                    }}
                    className="text-[9px] text-emerald-400 underline font-mono"
                  >
                    Recalcular
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={montoTotalVentaUsd}
                  onChange={(e) => {
                    setIsManualVentaEdit(true);
                    setMontoTotalVentaUsd(Math.max(0, parseFloat(e.target.value) || 0));
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-emerald-300 font-bold focus:outline-none focus:border-emerald-500"
                  required
                />
                <span className="text-[9px] text-slate-500 font-mono">
                  {isManualVentaEdit ? '⚠️ Ajuste manual ingresado' : '⚡ Calculado automáticamente'}
                </span>
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Notas u Observaciones
                </label>
                <input
                  type="text"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Detalles de cliente, negociación o lote..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* 7. TARJETA DE SIMULACIÓN DE BALANCE EN TIEMPO REAL (useMemo) */}
          <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border-2 border-emerald-500/40 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-emerald-400 flex items-center gap-1.5 font-mono">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Simulación de Rentabilidad Real en Tiempo Real (ROI & Margen)
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                Aritmética Exacta
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-center">
              {/* Inversión Total */}
              <div className="p-3 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <span className="text-[10px] font-mono uppercase text-slate-400 block">
                  Inversión Total
                </span>
                <span className="text-base sm:text-lg font-black font-mono text-slate-200 tabular-nums">
                  ${simulation.inversionTotalCamadaUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[9px] text-slate-500 font-mono block">
                  Compra + Mantenimiento
                </span>
              </div>

              {/* Venta Total */}
              <div className="p-3 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <span className="text-[10px] font-mono uppercase text-slate-400 block">
                  Ingreso por Venta
                </span>
                <span className="text-base sm:text-lg font-black font-mono text-emerald-400 tabular-nums">
                  ${(Number(montoTotalVentaUsd) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[9px] text-slate-500 font-mono block">
                  {computedPesoNetoKg.toLocaleString()} kg neto
                </span>
              </div>

              {/* Utilidad Neta Real */}
              <div
                className={`p-3 rounded-2xl border ${
                  simulation.utilidadNetaRealUsd >= 0
                    ? 'bg-emerald-950/40 border-emerald-500/50'
                    : 'bg-rose-950/40 border-rose-500/50'
                }`}
              >
                <span className="text-[10px] font-mono uppercase text-slate-300 block">
                  Utilidad Neta Real
                </span>
                <span
                  className={`text-base sm:text-lg font-black font-mono tabular-nums ${
                    simulation.utilidadNetaRealUsd >= 0 ? 'text-emerald-300' : 'text-rose-400'
                  }`}
                >
                  ${simulation.utilidadNetaRealUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[9px] text-slate-400 font-mono block">
                  {simulation.utilidadNetaRealUsd >= 0 ? 'Ganancia Neta' : 'Pérdida Neta'}
                </span>
              </div>

              {/* ROI % Real */}
              <div
                className={`p-3 rounded-2xl border ${
                  simulation.porcentajeGananciaRealROI >= 0
                    ? 'bg-emerald-500/10 border-emerald-400/60'
                    : 'bg-rose-500/10 border-rose-400/60'
                }`}
              >
                <span className="text-[10px] font-mono uppercase text-slate-300 block">
                  ROI % Ganancia Real
                </span>
                <span
                  className={`text-base sm:text-xl font-black font-mono tabular-nums ${
                    simulation.porcentajeGananciaRealROI >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {simulation.porcentajeGananciaRealROI.toFixed(2)}%
                </span>
                <span className="text-[9px] text-slate-400 font-mono block">
                  Sobre Capital Invertido
                </span>
              </div>

              {/* Margen de Ventas */}
              <div className="p-3 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <span className="text-[10px] font-mono uppercase text-slate-400 block">
                  Margen Ventas %
                </span>
                <span className="text-base sm:text-lg font-black font-mono text-amber-300 tabular-nums">
                  {simulation.margenRentabilidadVentasPorcentaje.toFixed(2)}%
                </span>
                <span className="text-[9px] text-slate-500 font-mono block">
                  Sobre Facturación
                </span>
              </div>
            </div>

            {/* Sub-indicadores secundarios */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center font-mono text-[11px] text-slate-400">
              <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800">
                <span>Costo / Kg Vendible: </span>
                <strong className="text-white">${simulation.costoProduccionPorKgVendibleUsd.toFixed(2)}/kg</strong>
              </div>
              <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800">
                <span>Costo / Animal: </span>
                <strong className="text-white">${simulation.costoProduccionPorAnimalBeneficiadoUsd.toFixed(2)}</strong>
              </div>
              <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800">
                <span>Supervivencia: </span>
                <strong className="text-emerald-400">{simulation.porcentajeSupervivencia.toFixed(1)}%</strong>
              </div>
              <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800">
                <span>Ganancia Peso: </span>
                <strong className="text-white">{simulation.gananciaPesoBrutoKg.toLocaleString()} kg</strong>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl text-xs font-mono text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-900/40 transition disabled:opacity-50"
            >
              {isSaving ? (
                <>Guardando Registro...</>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {batchToEdit ? 'Actualizar Lote Histórico' : 'Guardar Lote en Historial'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
