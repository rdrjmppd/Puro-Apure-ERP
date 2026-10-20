import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  InventoryItem,
  BiologicalBatch,
  FarmBiologicalControl,
  LivestockSpecies,
  InsumoSubtype,
  ConcurrencyConflict,
  BatchIncomeType,
  LivestockSex,
  HistoricalBatchRecord,
} from '../types/inventory';
import {
  InventoryService,
  calculateAvianBatch,
  calculatePorcineBatch,
} from '../services/inventoryService';
import {
  calculateCumulativeBusinessProfitability,
  calculateHistoricalBatchBalance,
} from '../services/financialAnalyticsService';
import { ConcurrencyConflictModal } from '../components/ConcurrencyConflictModal';
import { WeightGrowthChart } from '../components/WeightGrowthChart';
import { DynamicFormRenderer } from '../components/DynamicFormRenderer';
import { HistoricalBatchModal } from '../components/HistoricalBatchModal';
import { HistoricalBatchPnLModal } from '../components/HistoricalBatchPnLModal';
import {
  Package,
  Bird,
  ShieldCheck,
  AlertCircle,
  Plus,
  Scale,
  Syringe,
  Wheat,
  Calendar,
  DollarSign,
  History,
  CheckCircle,
  Layers,
  ArrowUpDown,
  Filter,
  TrendingUp,
  AlertTriangle,
  Pencil,
  FileText,
  FileSpreadsheet,
  Printer,
  Trash2,
  Search,
  Award,
  Sparkles,
} from 'lucide-react';
import { BatchExportService } from '../services/batchExportService';
import { BcvFeederService } from '../services/bcvFeederService';

interface InventoryManagementProps {
  onNavigateToFinance?: () => void;
}

export const InventoryManagement: React.FC<InventoryManagementProps> = ({ onNavigateToFinance }) => {
  const { userProfile, isAdmin, isSuperAdmin } = useAuth();

  // Active Tabs: Bifurcated biological lines + Historial de Rentabilidad Pasada
  const [activeTab, setActiveTab] = useState<
    'INSUMOS' | 'AVICOLA' | 'PORCINO' | 'CONTROLES' | 'HISTORIAL_RENTABILIDAD'
  >('AVICOLA');

  // Trigger de Integración Financiera para Adquisición Externa (Fase 4)
  const [financialPromptBatch, setFinancialPromptBatch] = useState<BiologicalBatch | null>(null);

  // Real-time Collections Data
  const [inventoryList, setInventoryList] = useState<InventoryItem[]>([]);
  const [batchesList, setBatchesList] = useState<BiologicalBatch[]>([]);
  const [controlsList, setControlsList] = useState<FarmBiologicalControl[]>([]);

  // Historical Batches State (Fase 2 & 3 Spec-Driven)
  const [historicalBatches, setHistoricalBatches] = useState<HistoricalBatchRecord[]>([]);
  const [showHistoricalModal, setShowHistoricalModal] = useState(false);
  const [editingHistoricalBatch, setEditingHistoricalBatch] = useState<HistoricalBatchRecord | null>(null);
  const [historicalSpeciesFilter, setHistoricalSpeciesFilter] = useState<'TODOS' | 'AVICOLA' | 'PORCINO'>('TODOS');
  const [historicalSearch, setHistoricalSearch] = useState('');
  const [historicalStartDate, setHistoricalStartDate] = useState('');
  const [historicalEndDate, setHistoricalEndDate] = useState('');
  const [selectedBatchForPnL, setSelectedBatchForPnL] = useState<HistoricalBatchRecord | null>(null);
  const [showPnLModal, setShowPnLModal] = useState(false);
  const [isExportingHistorical, setIsExportingHistorical] = useState(false);
  const [historicalBatchToDelete, setHistoricalBatchToDelete] = useState<{ id: string; code: string } | null>(null);

  // Selected batch for Weight Growth Chart in CONTROLES tab
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');

  // Concurrency Modal State
  const [conflict, setConflict] = useState<ConcurrencyConflict | null>(null);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);

  // Form Modals / Expanders
  const [showInsumoForm, setShowInsumoForm] = useState(false);
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [showControlForm, setShowControlForm] = useState(false);

  // Insumo Form State
  const [insumoName, setInsumoName] = useState('');
  const [insumoSubtype, setInsumoSubtype] = useState<InsumoSubtype>('ALIMENTO');
  const [insumoQuantity, setInsumoQuantity] = useState<number>(0);
  const [insumoUnit, setInsumoUnit] = useState<InventoryItem['unit']>('sacos');
  const [insumoUnitCost, setInsumoUnitCost] = useState<number>(0);
  const [editingInsumoId, setEditingInsumoId] = useState<string | null>(null);
  const [insumoKnownTimestamp, setInsumoKnownTimestamp] = useState<number>(0);
  const [insumoCustomFields, setInsumoCustomFields] = useState<Record<string, any>>({});

  // Batch Form State (Avícola / Porcino - Fase 2 Variables Dinámicas)
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [batchCode, setBatchCode] = useState('');
  const [batchSpecies, setBatchSpecies] = useState<LivestockSpecies>('AVICOLA');
  const [batchTipoIngreso, setBatchTipoIngreso] = useState<BatchIncomeType>('NACIMIENTO_INTERNO');
  const [batchEdadInicialDias, setBatchEdadInicialDias] = useState<number>(0);
  const [batchPesoInicialKg, setBatchPesoInicialKg] = useState<number>(0);
  const [batchSexo, setBatchSexo] = useState<LivestockSex>('MIXTO');
  const [batchRazaLineaGenetica, setBatchRazaLineaGenetica] = useState<string>('Cobb 500');
  const [batchInitialCount, setBatchInitialCount] = useState<number>(1000);
  const [batchCurrentCount, setBatchCurrentCount] = useState<number>(1000);
  const [batchDaysInCycle, setBatchDaysInCycle] = useState<number>(38); // Default 35-40 para avícola
  const [batchGrossWeightKg, setBatchGrossWeightKg] = useState<number>(2200);
  // Variables Dinámicas de Mercado (Erradicación de Constantes Rígidas)
  const [batchPrecioFacturableUsdPorKg, setBatchPrecioFacturableUsdPorKg] = useState<number>(4.0);
  const [batchPrecioFacturableNetoUsdPorKg, setBatchPrecioFacturableNetoUsdPorKg] = useState<number>(3.2);
  const [batchPrecioSacoAlimentoUsd, setBatchPrecioSacoAlimentoUsd] = useState<number>(40.0);
  const [batchDeduccionMermaKg, setBatchDeduccionMermaKg] = useState<number>(17.5);
  const [batchShrinkageKg, setBatchShrinkageKg] = useState<number>(17.5); // Sincronizado
  const [batchFeedSacks, setBatchFeedSacks] = useState<number>(4);
  const [batchValidationError, setBatchValidationError] = useState<string | null>(null);
  const [batchCustomFields, setBatchCustomFields] = useState<Record<string, any>>({});

  // Farm Biological Control Form State
  const [controlBatchId, setControlBatchId] = useState('');
  const [controlType, setControlType] = useState<FarmBiologicalControl['type']>('PESAJE');
  const [controlDate, setControlDate] = useState(new Date().toISOString().split('T')[0]);
  const [controlMetricValue, setControlMetricValue] = useState<number>(0);
  const [controlMetricUnit, setControlMetricUnit] = useState('kg/ave');
  const [controlProduct, setControlProduct] = useState('');
  const [controlWorker, setControlWorker] = useState(userProfile?.displayName || 'Operador Granja');
  const [controlObservations, setControlObservations] = useState('');

  // Status Alerts
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Motor de Exportación Documental (Fase 3)
  const [bcvRate, setBcvRate] = useState<number>(0);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  // Sincronización Cambiaria Oficial (BCV)
  useEffect(() => {
    let isMounted = true;
    BcvFeederService.syncLatestRate()
      .then((res) => {
        if (isMounted && res.rate > 0) setBcvRate(res.rate);
      })
      .catch(() => {
        BcvFeederService.getOfflineCachedRate().then((rate) => {
          if (isMounted && rate > 0) setBcvRate(rate);
        });
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Subscribe to Firestore collections
  useEffect(() => {
    const unsubInv = InventoryService.subscribeInventory((items) => {
      setInventoryList(items.filter((i) => i.category === 'INSUMO'));
    });
    const unsubBatches = InventoryService.subscribeBatches((batches) => {
      setBatchesList(batches);
      // Auto-selección resiliente del primer lote sin reactivar el efecto ni fugar memoria
      setSelectedBatchId((prevId) => {
        if (!prevId && batches.length > 0) {
          return batches[0].id;
        }
        return prevId;
      });
    });
    const unsubControls = InventoryService.subscribeFarmControls((controls) => {
      setControlsList(controls);
    });
    const unsubHistorical = InventoryService.subscribeHistoricalBatches((hBatches) => {
      setHistoricalBatches(hBatches);
    });

    return () => {
      unsubInv();
      unsubBatches();
      unsubControls();
      unsubHistorical();
    };
  }, []);

  // Métricas acumuladas y filtradas para Lotes Históricos (Fase 2)
  const cumulativeHistoricalProfitability = useMemo(() => {
    return calculateCumulativeBusinessProfitability(historicalBatches);
  }, [historicalBatches]);

  const filteredHistoricalBatches = useMemo(() => {
    return historicalBatches.filter((b) => {
      if (historicalSpeciesFilter !== 'TODOS' && b.especie !== historicalSpeciesFilter) {
        return false;
      }
      if (historicalStartDate && b.fechaBeneficioCierre < historicalStartDate) {
        return false;
      }
      if (historicalEndDate && b.fechaBeneficioCierre > historicalEndDate) {
        return false;
      }
      if (historicalSearch.trim()) {
        const q = historicalSearch.toLowerCase();
        const code = (b.codigoLoteHistorico || '').toLowerCase();
        const race = (b.lineaGeneticaRaza || '').toLowerCase();
        const notes = (b.notas || '').toLowerCase();
        return code.includes(q) || race.includes(q) || notes.includes(q);
      }
      return true;
    });
  }, [historicalBatches, historicalSpeciesFilter, historicalSearch, historicalStartDate, historicalEndDate]);

  const cumulativeFilteredProfitability = useMemo(() => {
    return calculateCumulativeBusinessProfitability(filteredHistoricalBatches);
  }, [filteredHistoricalBatches]);

  const avianHistoricalCount = useMemo(() => {
    return historicalBatches.filter((b) => b.especie === 'AVICOLA').length;
  }, [historicalBatches]);

  const porcineHistoricalCount = useMemo(() => {
    return historicalBatches.filter((b) => b.especie === 'PORCINO').length;
  }, [historicalBatches]);

  const promptDeleteHistoricalBatch = (batchId: string, code: string) => {
    setHistoricalBatchToDelete({ id: batchId, code });
  };

  const confirmDeleteHistoricalBatch = async () => {
    if (!historicalBatchToDelete) return;
    const { id, code } = historicalBatchToDelete;
    setHistoricalBatchToDelete(null);
    const res = await InventoryService.deleteHistoricalBatch(id);
    if (res.success) {
      notify(`Lote histórico "${code}" eliminado correctamente.`, 'success');
    } else {
      notify(`Error eliminando lote: ${res.error}`, 'error');
    }
  };

  const handleDeleteHistoricalBatch = (batchId: string, code: string) => {
    promptDeleteHistoricalBatch(batchId, code);
  };

  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMessage({ text, type });
    setTimeout(() => setFeedbackMessage(null), 5000);
  };

  // Filtered batches by species
  const avianBatches = batchesList.filter((b) => b.species === 'AVICOLA');
  const porcineBatches = batchesList.filter((b) => b.species === 'PORCINO');
  const selectedBatch = batchesList.find((b) => b.id === selectedBatchId) || batchesList[0] || null;

  // Jump from batch table directly to Growth Chart
  const handleViewGrowthChart = (batchId: string) => {
    setSelectedBatchId(batchId);
    setActiveTab('CONTROLES');
  };

  // ==========================================
  // Handlers para Motor de Exportación Documental (Fase 3)
  // ==========================================

  const handleExportSingleBatch = async (batch: BiologicalBatch) => {
    setIsExportingPdf(true);
    try {
      notify(`Generando certificado oficial PDF para lote ${batch.code}...`, 'success');
      await BatchExportService.exportSingleBatchToPdf(batch, controlsList, bcvRate);
    } catch (err) {
      console.error('Error generando certificado PDF:', err);
      notify('Error al generar el certificado PDF del lote.', 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportConsolidated = async (species: LivestockSpecies) => {
    const list = species === 'AVICOLA' ? avianBatches : porcineBatches;
    if (list.length === 0) {
      notify(`No hay lotes ${species === 'AVICOLA' ? 'avícolas' : 'porcinos'} registrados para exportar.`, 'error');
      return;
    }
    setIsExportingPdf(true);
    try {
      notify(`Generando inventario consolidado de biomasa viva (${species})...`, 'success');
      await BatchExportService.exportConsolidatedBatchesToPdf(species, list, bcvRate);
    } catch (err) {
      console.error('Error generando inventario consolidado PDF:', err);
      notify('Error al generar el reporte consolidado PDF.', 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // ==========================================
  // Handlers para Insumos
  // ==========================================

  const handleSaveInsumo = async (forceOverwrite = false) => {
    if (!insumoName.trim() || insumoQuantity < 0 || insumoUnitCost < 0) {
      notify('Por favor complete los campos obligatorios del insumo.', 'error');
      return;
    }

    const item: InventoryItem = {
      id: editingInsumoId || `ins_${insumoName.trim().toLowerCase().replace(/\s+/g, '_')}`,
      category: 'INSUMO',
      name: insumoName.trim(),
      subtype: insumoSubtype,
      quantity: Number(insumoQuantity),
      unit: insumoUnit,
      unitCostUSD: Number(insumoUnitCost),
      totalValueUSD: Number((insumoQuantity * insumoUnitCost).toFixed(2)),
      lastUpdatedTimestamp: Date.now(),
      updatedBy: userProfile?.uid || 'user',
      customFields: Object.keys(insumoCustomFields).length > 0 ? insumoCustomFields : undefined,
    };

    const res = await InventoryService.saveInventoryItem(
      item,
      insumoKnownTimestamp,
      userProfile?.uid || 'user',
      forceOverwrite
    );

    if (!res.success && res.conflictData) {
      const cloud = res.conflictData;
      setConflict({
        entityType: 'INVENTORY',
        entityId: item.id,
        entityName: item.name,
        fieldDifferences: [
          { field: 'quantity', label: 'Cantidad', cloudValue: cloud.quantity, localValue: item.quantity },
          { field: 'unitCostUSD', label: 'Costo Unitario ($)', cloudValue: cloud.unitCostUSD, localValue: item.unitCostUSD },
        ],
        cloudTimestamp: cloud.lastUpdatedTimestamp,
        cloudUpdatedBy: cloud.updatedBy,
        localTimestamp: Date.now(),
        onConfirmOverwrite: async () => {
          setIsConflictModalOpen(false);
          await handleSaveInsumo(true);
        },
        onCancel: () => setIsConflictModalOpen(false),
      });
      setIsConflictModalOpen(true);
      return;
    }

    setShowInsumoForm(false);
    resetInsumoFields();
    notify(editingInsumoId ? 'Insumo actualizado exitosamente.' : 'Insumo registrado en el almacén central.');
  };

  const resetInsumoFields = () => {
    setInsumoName('');
    setInsumoQuantity(0);
    setInsumoUnitCost(0);
    setEditingInsumoId(null);
    setInsumoKnownTimestamp(0);
    setInsumoCustomFields({});
  };

  // ==========================================
  // Handlers para Biomasa Viva (Avícola / Porcino)
  // ==========================================

  const handleOpenBatchForm = (species: LivestockSpecies, batchToEdit?: BiologicalBatch) => {
    setBatchSpecies(species);
    setBatchValidationError(null);

    if (batchToEdit) {
      setEditingBatchId(batchToEdit.id);
      setBatchCode(batchToEdit.code);
      setBatchTipoIngreso(batchToEdit.tipoIngreso || 'NACIMIENTO_INTERNO');
      setBatchEdadInicialDias(batchToEdit.edadInicialDias || (species === 'AVICOLA' ? 1 : 30));
      setBatchPesoInicialKg(batchToEdit.pesoInicialKg || (species === 'AVICOLA' ? 0.042 : 25.0));
      setBatchSexo((batchToEdit.sexoParvadaPiara || batchToEdit.sexo || 'MIXTO') as LivestockSex);
      setBatchRazaLineaGenetica(batchToEdit.lineaGeneticaRaza || batchToEdit.razaLineaGenetica || (species === 'AVICOLA' ? 'Cobb 500' : 'Landrace'));
      setBatchInitialCount(batchToEdit.initialCount);
      setBatchCurrentCount(batchToEdit.currentCount);
      setBatchDaysInCycle(batchToEdit.daysInCycle);
      setBatchGrossWeightKg(batchToEdit.grossWeightKg);
      setBatchShrinkageKg(batchToEdit.deduccionMermaKg ?? batchToEdit.shrinkageDeductionKg ?? 17.5);
      setBatchDeduccionMermaKg(batchToEdit.deduccionMermaKg ?? batchToEdit.shrinkageDeductionKg ?? 17.5);
      setBatchFeedSacks(batchToEdit.feedSacksConsumed ?? 4);
      setBatchPrecioFacturableUsdPorKg(batchToEdit.precioFacturableUsdPorKg ?? batchToEdit.unitPriceUSDPerKg ?? 4.0);
      setBatchPrecioFacturableNetoUsdPorKg(batchToEdit.precioFacturableNetoUsdPorKg ?? batchToEdit.unitPriceUSDPerKg ?? 3.2);
      setBatchPrecioSacoAlimentoUsd(batchToEdit.precioSacoAlimentoUsd ?? 40.0);
      setBatchCustomFields(batchToEdit.customFields || {});
    } else {
      setEditingBatchId(null);
      setBatchCode('');
      setBatchTipoIngreso('NACIMIENTO_INTERNO');
      setBatchEdadInicialDias(species === 'AVICOLA' ? 1 : 30);
      setBatchPesoInicialKg(species === 'AVICOLA' ? 0.042 : 25.0);
      setBatchSexo('MIXTO');
      setBatchRazaLineaGenetica(species === 'AVICOLA' ? 'Cobb 500' : 'Landrace');
      setBatchInitialCount(species === 'AVICOLA' ? 1000 : 150);
      setBatchCurrentCount(species === 'AVICOLA' ? 1000 : 150);
      setBatchDaysInCycle(species === 'AVICOLA' ? 38 : 90);
      setBatchGrossWeightKg(species === 'AVICOLA' ? 2200 : 12000);
      setBatchShrinkageKg(species === 'AVICOLA' ? 0 : 17.5);
      setBatchDeduccionMermaKg(species === 'AVICOLA' ? 0 : 17.5);
      setBatchFeedSacks(4);
      setBatchPrecioFacturableUsdPorKg(4.0);
      setBatchPrecioFacturableNetoUsdPorKg(3.2);
      setBatchPrecioSacoAlimentoUsd(40.0);
      setBatchCustomFields({});
    }
    setShowBatchForm(true);
  };

  // Recálculo zootécnico y financiero en caliente para Avícola (Spec-Driven Fase 2)
  const liveAvianCalc = useMemo(() => {
    return calculateAvianBatch({
      daysInCycle: Number(batchDaysInCycle),
      grossWeightKg: Number(batchGrossWeightKg),
      tipoIngreso: batchTipoIngreso,
      edadInicialDias: batchTipoIngreso === 'ADQUISICION_EXTERNA' ? Number(batchEdadInicialDias) : undefined,
      pesoInicialKg: batchTipoIngreso === 'ADQUISICION_EXTERNA' ? Number(batchPesoInicialKg) : undefined,
      precioFacturableUsdPorKg: Number(batchPrecioFacturableUsdPorKg),
      sexoParvadaPiara: batchSexo,
      lineaGeneticaRaza: batchRazaLineaGenetica,
    });
  }, [batchDaysInCycle, batchGrossWeightKg, batchTipoIngreso, batchEdadInicialDias, batchPesoInicialKg, batchPrecioFacturableUsdPorKg, batchSexo, batchRazaLineaGenetica]);

  // Recálculo zootécnico y financiero en caliente para Porcino (Spec-Driven Fase 2)
  const livePorcineCalc = useMemo(() => {
    return calculatePorcineBatch({
      daysInCycle: Number(batchDaysInCycle),
      grossWeightKg: Number(batchGrossWeightKg),
      shrinkageDeductionKg: Number(batchDeduccionMermaKg),
      deduccionMermaKg: Number(batchDeduccionMermaKg),
      feedSacksConsumed: Number(batchFeedSacks),
      precioSacoAlimentoUsd: Number(batchPrecioSacoAlimentoUsd),
      precioFacturableNetoUsdPorKg: Number(batchPrecioFacturableNetoUsdPorKg),
      tipoIngreso: batchTipoIngreso,
      edadInicialDias: batchTipoIngreso === 'ADQUISICION_EXTERNA' ? Number(batchEdadInicialDias) : undefined,
      pesoInicialKg: batchTipoIngreso === 'ADQUISICION_EXTERNA' ? Number(batchPesoInicialKg) : undefined,
      sexoParvadaPiara: batchSexo,
      lineaGeneticaRaza: batchRazaLineaGenetica,
    });
  }, [batchDaysInCycle, batchGrossWeightKg, batchDeduccionMermaKg, batchFeedSacks, batchPrecioSacoAlimentoUsd, batchPrecioFacturableNetoUsdPorKg, batchTipoIngreso, batchEdadInicialDias, batchPesoInicialKg, batchSexo, batchRazaLineaGenetica]);

  const handleSaveBatch = async (forceOverwrite = false) => {
    setBatchValidationError(null);

    if (!batchCode.trim()) {
      setBatchValidationError('Debe indicar un código de lote único.');
      return;
    }

    if (batchGrossWeightKg <= 0) {
      setBatchValidationError('El peso vivo actual total debe ser mayor a 0 kg.');
      return;
    }

    // Validaciones de precios dinámicos
    if (batchSpecies === 'AVICOLA' && (isNaN(batchPrecioFacturableUsdPorKg) || batchPrecioFacturableUsdPorKg <= 0)) {
      setBatchValidationError('El precio facturable avícola debe ser un valor positivo mayor a 0 USD/kg.');
      return;
    }

    if (batchSpecies === 'PORCINO') {
      if (isNaN(batchPrecioFacturableNetoUsdPorKg) || batchPrecioFacturableNetoUsdPorKg <= 0) {
        setBatchValidationError('El precio facturable neto porcino debe ser un valor positivo mayor a 0 USD/kg.');
        return;
      }
      if (isNaN(batchPrecioSacoAlimentoUsd) || batchPrecioSacoAlimentoUsd <= 0) {
        setBatchValidationError('El precio por saco de alimento balanceado debe ser mayor a 0 USD.');
        return;
      }
      if (isNaN(batchDeduccionMermaKg) || batchDeduccionMermaKg < 0) {
        setBatchValidationError('La deducción de merma debe ser un valor numérico igual o mayor a 0 kg.');
        return;
      }
      if (batchGrossWeightKg <= batchDeduccionMermaKg) {
        setBatchValidationError(`El peso bruto (${batchGrossWeightKg} kg) debe superar la deducción de merma (${batchDeduccionMermaKg} kg).`);
        return;
      }
    }

    // Validaciones estrictas de Adquisición Externa
    if (batchTipoIngreso === 'ADQUISICION_EXTERNA') {
      const edadNum = Number(batchEdadInicialDias);
      const pesoNum = Number(batchPesoInicialKg);

      if (isNaN(edadNum) || edadNum <= 0) {
        setBatchValidationError('La edad inicial del lote debe ser un número mayor a 0 días.');
        return;
      }
      if (batchSpecies === 'AVICOLA' && edadNum >= 40) {
        setBatchValidationError(`La edad inicial avícola (${edadNum} días) no puede ser igual o mayor al ciclo total máximo de 40 días.`);
        return;
      }
      if (batchSpecies === 'PORCINO' && edadNum >= 150) {
        setBatchValidationError(`La edad inicial porcina (${edadNum} días) no puede ser igual o mayor al ciclo total máximo de 150 días (5 meses).`);
        return;
      }
      if (isNaN(pesoNum) || pesoNum <= 0) {
        setBatchValidationError('Debe registrar un peso vivo inicial válido mayor a 0 kg para el lote adquirido.');
        return;
      }
    }

    // Validaciones estrictas por especie con bifurcación condicional
    if (batchSpecies === 'AVICOLA') {
      if (!liveAvianCalc.isValid) {
        setBatchValidationError(liveAvianCalc.validationError || 'Parámetros avícolas no válidos.');
        return;
      }
    } else if (batchSpecies === 'PORCINO') {
      if (!livePorcineCalc.isValid) {
        setBatchValidationError(livePorcineCalc.validationError || 'Parámetros porcinos no válidos.');
        return;
      }
    }

    const batchId = editingBatchId || `lote_${batchCode.trim().toLowerCase().replace(/\s+/g, '_')}`;
    const existingBatch = batchesList.find((b) => b.id === batchId);

    const newBatch: BiologicalBatch = {
      id: batchId,
      code: batchCode.trim().toUpperCase(),
      species: batchSpecies,
      tipoIngreso: batchTipoIngreso,
      edadInicialDias: batchTipoIngreso === 'ADQUISICION_EXTERNA' ? Number(batchEdadInicialDias) : undefined,
      pesoInicialKg: batchTipoIngreso === 'ADQUISICION_EXTERNA' ? Number(batchPesoInicialKg) : undefined,
      // Variables Fenotípicas para ambas especies y cualquier origen
      sexoParvadaPiara: batchSexo,
      lineaGeneticaRaza: batchRazaLineaGenetica.trim() || (batchSpecies === 'AVICOLA' ? 'Cobb 500' : 'Landrace'),
      sexo: batchSexo,
      razaLineaGenetica: batchRazaLineaGenetica.trim() || (batchSpecies === 'AVICOLA' ? 'Cobb 500' : 'Landrace'),
      status: existingBatch?.status || 'ACTIVO',
      initialCount: Number(batchInitialCount),
      currentCount: Number(batchCurrentCount),
      startDate: existingBatch?.startDate || new Date().toISOString().split('T')[0],
      daysInCycle: Number(batchDaysInCycle),
      grossWeightKg: Number(batchGrossWeightKg),
      // Variables Dinámicas de Mercado y Merma
      precioFacturableUsdPorKg: batchSpecies === 'AVICOLA' ? Number(batchPrecioFacturableUsdPorKg) : undefined,
      precioFacturableNetoUsdPorKg: batchSpecies === 'PORCINO' ? Number(batchPrecioFacturableNetoUsdPorKg) : undefined,
      precioSacoAlimentoUsd: batchSpecies === 'PORCINO' ? Number(batchPrecioSacoAlimentoUsd) : undefined,
      deduccionMermaKg: batchSpecies === 'PORCINO' ? Number(batchDeduccionMermaKg) : 0,
      shrinkageDeductionKg: batchSpecies === 'PORCINO' ? Number(batchDeduccionMermaKg) : 0,
      netWeightKg: batchSpecies === 'AVICOLA' ? Number(batchGrossWeightKg) : Math.max(0, Number(batchGrossWeightKg) - Number(batchDeduccionMermaKg)),
      feedSacksConsumed: batchSpecies === 'PORCINO' ? Number(batchFeedSacks) : 0,
      feedCostUSD: batchSpecies === 'PORCINO' ? Number((Number(batchFeedSacks) * Number(batchPrecioSacoAlimentoUsd)).toFixed(2)) : 0,
      unitPriceUSDPerKg: batchSpecies === 'AVICOLA' ? Number(batchPrecioFacturableUsdPorKg) : Number(batchPrecioFacturableNetoUsdPorKg),
      billableAmountUSD: batchSpecies === 'AVICOLA' ? liveAvianCalc.billableAmountUSD : livePorcineCalc.billableAmountUSD,
      lastUpdatedTimestamp: Date.now(),
      updatedBy: userProfile?.uid || 'user',
      customFields: Object.keys(batchCustomFields).length > 0 ? batchCustomFields : undefined,
    };

    const res = await InventoryService.saveBiologicalBatch(
      newBatch,
      existingBatch?.lastUpdatedTimestamp || 0,
      userProfile?.uid || 'user',
      forceOverwrite
    );

    if (!res.success) {
      if (res.error) {
        setBatchValidationError(res.error);
      }
      return;
    }

    setShowBatchForm(false);
    setSelectedBatchId(batchId);
    notify(editingBatchId ? `Lote ${newBatch.code} (${batchSpecies}) actualizado exitosamente.` : `Lote ${newBatch.code} (${batchSpecies}) registrado exitosamente.`);

    // Trigger de Integración Financiera Básica
    if (!editingBatchId && newBatch.tipoIngreso === 'ADQUISICION_EXTERNA') {
      InventoryService.notifyExternalAcquisitionToFinance(newBatch);
      setFinancialPromptBatch(newBatch);
    }
  };

  // ==========================================
  // Handlers para Controles Biológicos y Pesajes
  // ==========================================

  const handleSaveControl = async () => {
    if (!controlBatchId) {
      notify('Debe seleccionar un lote destino para el control.', 'error');
      return;
    }
    const targetBatch = batchesList.find((b) => b.id === controlBatchId);
    if (!targetBatch) return;

    if (controlMetricValue <= 0) {
      notify('El valor métrico debe ser mayor a 0.', 'error');
      return;
    }

    const control: FarmBiologicalControl = {
      id: `ctrl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      batchId: targetBatch.id,
      batchCode: targetBatch.code,
      species: targetBatch.species,
      type: controlType,
      date: controlDate,
      metricValue: Number(controlMetricValue),
      metricUnit: controlMetricUnit,
      productOrVaccineName: controlProduct.trim() || undefined,
      responsibleWorker: controlWorker.trim() || userProfile?.displayName || 'Operador Granja',
      observations: controlObservations.trim(),
      timestamp: Date.now(),
    };

    await InventoryService.addFarmControl(control);
    notify(`Control biológico (${controlType}) asentado para lote ${targetBatch.code}`);
    setShowControlForm(false);
    setControlMetricValue(0);
    setControlProduct('');
    setControlObservations('');
  };

  const handleAddWeightFromChart = async (data: {
    batchId: string;
    batchCode: string;
    species: BiologicalBatch['species'];
    date: string;
    weightKg: number;
    observations: string;
  }) => {
    const control: FarmBiologicalControl = {
      id: `ctrl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      batchId: data.batchId,
      batchCode: data.batchCode,
      species: data.species,
      type: 'PESAJE',
      date: data.date,
      metricValue: data.weightKg,
      metricUnit: data.species === 'AVICOLA' ? 'kg/ave' : 'kg/cerdo',
      responsibleWorker: userProfile?.displayName || 'Operador Granja',
      observations: data.observations,
      timestamp: Date.now(),
    };
    await InventoryService.addFarmControl(control);
    notify(`Pesaje diario de ${data.weightKg} kg registrado para lote ${data.batchCode}`);
  };

  return (
    <div className="space-y-6">
      {/* Concurrency Modal */}
      <ConcurrencyConflictModal
        isOpen={isConflictModalOpen}
        conflict={conflict}
      />

      {/* Modal de Alerta de Integración Financiera Básica (Spec-Driven Fase 4) */}
      {financialPromptBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-emerald-500/50 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                  Integración Financiera Requerida
                </span>
                <h3 className="text-base font-bold text-white tracking-tight mt-0.5">
                  Trazabilidad de Egresos: Adquisición Externa Detectada
                </h3>
              </div>
            </div>

            <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Lote Biológico:</span>
                <span className="font-bold text-white font-mono">{financialPromptBatch.code} ({financialPromptBatch.species})</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Población & Edad de Ingreso:</span>
                <span className="font-mono text-cyan-300 font-semibold">
                  {financialPromptBatch.initialCount} animales • {financialPromptBatch.edadInicialDias || 0} días iniciales
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Peso Vivo Registrado:</span>
                <span className="font-mono text-white">{financialPromptBatch.pesoInicialKg || 0} kg</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Línea Genética & Sexo:</span>
                <span className="text-slate-200">
                  {financialPromptBatch.razaLineaGenetica || 'Genética General'} • {financialPromptBatch.sexo || 'MIXTO'}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              El sistema ha registrado exitosamente la entrada biológica por <strong>Adquisición Externa</strong>. Para asegurar el cálculo fidedigno del margen bruto y la reconciliación con el flujo de caja, se sugiere asentar de inmediato el costo de compra en el módulo <strong>Finanzas BCV</strong>.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setFinancialPromptBatch(null)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Asentar Más Tarde
              </button>
              <button
                type="button"
                onClick={() => {
                  setFinancialPromptBatch(null);
                  if (onNavigateToFinance) {
                    onNavigateToFinance();
                  } else if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('agroerp:navigate', { detail: 'FINANZAS' }));
                  }
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/50"
              >
                <DollarSign className="w-4 h-4" />
                <span>Ir a Finanzas BCV (Registrar Egreso)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Toast */}
      {feedbackMessage && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between text-xs font-medium border shadow-xl animate-fadeIn ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
              : 'bg-red-950/80 border-red-500/50 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header and Spec 3 Information */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Trazabilidad Biomásica y Control Diario de Lotes
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-emerald-950 text-emerald-400 border border-emerald-800">
              Fase 3 Activa
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Bifurcación de especies: Avícola vs. Porcino • Curvas de crecimiento Cobb 500 / Ceba • Alerta de retraso ponderal.
          </p>
        </div>

        {/* Tab Navigation Controls (Bifurcated Species) */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-2xl flex-wrap">
          <button
            onClick={() => setActiveTab('AVICOLA')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
              activeTab === 'AVICOLA'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-950/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bird className="w-3.5 h-3.5" />
            <span>Lotes Avícolas</span>
            <span className="text-[10px] bg-slate-950 px-1.5 py-0.2 rounded text-amber-300 font-mono">
              {avianBatches.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('PORCINO')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
              activeTab === 'PORCINO'
                ? 'bg-pink-600 text-white shadow-md shadow-pink-950/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Lotes Porcinos</span>
            <span className="text-[10px] bg-slate-950 px-1.5 py-0.2 rounded text-pink-300 font-mono">
              {porcineBatches.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('CONTROLES')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
              activeTab === 'CONTROLES'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Curva &amp; Controles</span>
            <span className="text-[10px] bg-slate-950 px-1.5 py-0.2 rounded text-emerald-300 font-mono">
              {controlsList.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('INSUMOS')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
              activeTab === 'INSUMOS'
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Insumos</span>
            <span className="text-[10px] bg-slate-950 px-1.5 py-0.2 rounded text-cyan-300 font-mono">
              {inventoryList.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('HISTORIAL_RENTABILIDAD')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
              activeTab === 'HISTORIAL_RENTABILIDAD'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-950/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Historial &amp; Rentabilidad</span>
            <span className="text-[10px] bg-slate-950 px-1.5 py-0.2 rounded text-purple-300 font-mono">
              {historicalBatches.length}
            </span>
          </button>
        </div>
      </div>

      {/* ==================================================== */}
      {/* TAB: LOTES AVÍCOLAS (POLLOS DE ENGORDE) */}
      {/* ==================================================== */}
      {activeTab === 'AVICOLA' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-400">
              Línea Avícola: Ciclo estricto de 35 a 40 días • Peso vivo completo • Tarifas dinámicas de mercado ajustables.
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExportConsolidated('AVICOLA')}
                disabled={isExportingPdf || avianBatches.length === 0}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition flex items-center gap-1.5 shadow-md disabled:opacity-50"
                title="Exportar Reporte Oficial Consolidado de Inventario Avícola en PDF"
              >
                <FileText className="w-4 h-4 text-amber-400" />
                <span>Exportar Inventario PDF</span>
              </button>
              <button
                onClick={() => handleOpenBatchForm('AVICOLA')}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-lg shadow-amber-950/40"
              >
                <Plus className="w-4 h-4" />
                <span>+ Nuevo Lote Avícola</span>
              </button>
            </div>
          </div>

          {/* Formulario Modal Lote Avícola */}
          {showBatchForm && batchSpecies === 'AVICOLA' && (
            <div className="p-5 bg-slate-900 border border-slate-700 rounded-3xl space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Bird className="w-4 h-4 text-amber-400" />
                  <span>{editingBatchId ? 'Edición de Lote Avícola' : 'Alta de Lote Avícola (Parvada de Engorde)'}</span>
                </h3>
                {editingBatchId && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-700">
                    ID: {editingBatchId}
                  </span>
                )}
              </div>

              {batchValidationError && (
                <div className="p-3 bg-red-950/80 border border-red-500 text-red-200 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{batchValidationError}</span>
                </div>
              )}

              {/* Selector de Origen (Toggle Conmutador Spec Fase 3) */}
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-semibold text-xs flex items-center gap-1.5">
                    <span>Origen de la Parvada Avícola</span>
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">
                    {batchTipoIngreso === 'ADQUISICION_EXTERNA' ? 'Compra Externa de Pollitos/Aves' : 'Incubación / Nacimiento Interno'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setBatchTipoIngreso('NACIMIENTO_INTERNO');
                      setBatchDaysInCycle(38);
                    }}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                      batchTipoIngreso === 'NACIMIENTO_INTERNO'
                        ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200 shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full border border-emerald-400 flex items-center justify-center">
                      {batchTipoIngreso === 'NACIMIENTO_INTERNO' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                    </span>
                    <span>Nacimiento en Granja</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setBatchTipoIngreso('ADQUISICION_EXTERNA');
                      setBatchEdadInicialDias(10);
                      setBatchPesoInicialKg(0.35);
                      setBatchDaysInCycle(25);
                      setBatchRazaLineaGenetica('Cobb 500');
                    }}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                      batchTipoIngreso === 'ADQUISICION_EXTERNA'
                        ? 'bg-blue-950/80 border-blue-500 text-blue-200 shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full border border-blue-400 flex items-center justify-center">
                      {batchTipoIngreso === 'ADQUISICION_EXTERNA' && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                    </span>
                    <span>Adquisición Externa</span>
                  </button>
                </div>
              </div>

              {/* Conditional Rendering: Variables cronológicas si es Adquisición Externa */}
              {batchTipoIngreso === 'ADQUISICION_EXTERNA' && (
                <div className="p-3.5 bg-blue-950/30 border border-blue-800/60 rounded-2xl space-y-3 animate-fadeIn">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-blue-300">
                      Parámetros de Recepción Externa (Ciclo Total: 40 Días)
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-900/60 text-blue-200 border border-blue-700">
                      Ciclo Restante: {Math.max(0, 40 - Number(batchEdadInicialDias))} días
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Edad Inicial al Ingreso (Días, 1 - 39)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="39"
                        value={batchEdadInicialDias}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setBatchEdadInicialDias(val);
                          const maxRemaining = Math.max(1, 40 - val);
                          if (batchDaysInCycle > maxRemaining) {
                            setBatchDaysInCycle(maxRemaining);
                          }
                        }}
                        className="w-full bg-slate-950 border border-blue-700/80 rounded-xl p-2 text-slate-100 outline-none font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Peso Vivo Inicial al Ingreso (kg)
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        min="0.01"
                        value={batchPesoInicialKg}
                        onChange={(e) => setBatchPesoInicialKg(Number(e.target.value))}
                        placeholder="Ej. 0.350"
                        className="w-full bg-slate-950 border border-blue-700/80 rounded-xl p-2 text-slate-100 outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Variables Biológicas Fenotípicas y Mercado Dinámico (Fase 2 Spec-Driven) */}
              <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Variables Fenotípicas y Parámetros Financieros Dinámicos</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Sexo de la Parvada (`sexoParvadaPiara`)
                    </label>
                    <select
                      value={batchSexo}
                      onChange={(e) => setBatchSexo(e.target.value as LivestockSex)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none focus:border-amber-500 font-semibold"
                    >
                      <option value="MIXTO">Mixto (Machos / Hembras)</option>
                      <option value="MACHO">Macho (Engorde Rápido)</option>
                      <option value="HEMBRA">Hembra</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Línea Genética / Raza (`lineaGeneticaRaza`)
                    </label>
                    <input
                      type="text"
                      value={batchRazaLineaGenetica}
                      onChange={(e) => setBatchRazaLineaGenetica(e.target.value)}
                      placeholder="Ej. Cobb 500 / Ross 308 / Hubbard"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none focus:border-amber-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Precio Facturable ($ USD / kg vivo)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.05"
                        min="0.1"
                        value={batchPrecioFacturableUsdPorKg}
                        onChange={(e) => setBatchPrecioFacturableUsdPorKg(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-amber-600/70 rounded-xl p-2.5 pl-7 text-amber-300 font-mono font-bold outline-none focus:border-amber-400"
                      />
                      <span className="absolute left-2.5 top-2.5 text-amber-500 font-bold">$</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-1">
                      Tarifa dinámica de mercado (reemplaza constante de $4.00)
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Código del Lote</label>
                  <input
                    type="text"
                    value={batchCode}
                    onChange={(e) => setBatchCode(e.target.value)}
                    placeholder="Ej. LOTE-AVI-2026-01"
                    disabled={!!editingBatchId}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none uppercase font-mono disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Población de Aves</label>
                  <input
                    type="number"
                    min="1"
                    value={batchInitialCount}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setBatchInitialCount(val);
                      setBatchCurrentCount(val);
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    {batchTipoIngreso === 'ADQUISICION_EXTERNA'
                      ? `Días en Granja (Máx. ${Math.max(1, 40 - Number(batchEdadInicialDias))})`
                      : 'Días en Ciclo (35 - 40 días)'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={batchTipoIngreso === 'ADQUISICION_EXTERNA' ? Math.max(1, 40 - Number(batchEdadInicialDias)) : 40}
                    value={batchDaysInCycle}
                    onChange={(e) => setBatchDaysInCycle(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none font-mono"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-slate-300 font-semibold text-xs sm:text-sm">Peso Vivo Actual Total (kg)</label>
                    {batchCurrentCount > 0 && batchGrossWeightKg > 0 && (
                      <span className="text-[11px] text-emerald-400 font-mono font-bold bg-emerald-950/70 border border-emerald-800/60 px-2 py-0.5 rounded-lg">
                        {(batchGrossWeightKg / batchCurrentCount).toFixed(3)} kg/ave
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={batchGrossWeightKg}
                    onChange={(e) => setBatchGrossWeightKg(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none font-mono"
                    placeholder="Ej. 2200 kg (suma total de todas las aves)"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Biomasa acumulada de <strong className="text-amber-400">toda la parvada</strong> (no individual).
                  </p>
                </div>
              </div>

              {/* Dynamic Schema Engine - Inyección de Campos Dinámicos */}
              <DynamicFormRenderer
                module="TRAZABILIDAD"
                values={batchCustomFields}
                onChange={(f, v) => setBatchCustomFields((prev) => ({ ...prev, [f]: v }))}
              />

              {/* Card de Liquidación Zootécnica y Financiera en Caliente (Spec Fase 2) */}
              <div className="p-4 bg-slate-950 rounded-2xl border border-amber-900/40 space-y-3">
                <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-amber-400" />
                    <span className="font-bold text-white uppercase tracking-wider">
                      Liquidación Zootécnica en Caliente
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    liveAvianCalc.isValid ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-red-950 text-red-300 border border-red-800'
                  }`}>
                    {liveAvianCalc.isValid ? 'Parámetros Zootécnicos Válidos' : 'Validación Pendiente'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans">Biomasa Viva Total</span>
                    <span className="text-sm font-bold text-white">{batchGrossWeightKg.toLocaleString()} kg</span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans">Peso Promedio Individual</span>
                    <span className="text-sm font-bold text-emerald-300">
                      {batchCurrentCount > 0 ? (batchGrossWeightKg / batchCurrentCount).toFixed(3) : '0.000'} kg/ave
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans">Tarifa de Mercado</span>
                    <span className="text-sm font-bold text-amber-300">
                      ${Number(batchPrecioFacturableUsdPorKg).toFixed(2)} USD/kg
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900 border border-emerald-900/60">
                    <span className="text-[10px] text-slate-400 block font-sans">Facturación Proyectada</span>
                    <span className="text-sm font-bold text-emerald-400">
                      ${liveAvianCalc.billableAmountUSD.toFixed(2)} USD
                    </span>
                  </div>
                </div>

                {/* Alerta Zootécnica en Caliente */}
                {batchCurrentCount > 0 && batchGrossWeightKg > 0 && (
                  (() => {
                    const avg = batchGrossWeightKg / batchCurrentCount;
                    if (avg < 1.6 || avg > 3.6) {
                      return (
                        <div className="text-[11px] text-amber-300 bg-amber-950/40 border border-amber-800/60 p-2 rounded-xl flex items-center gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>Alerta Zootécnica: El peso promedio ({avg.toFixed(3)} kg/ave) difiere del rango estándar esperado a los {batchDaysInCycle} días (1.80 a 3.20 kg).</span>
                        </div>
                      );
                    }
                    return null;
                  })()
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800">
                  <div className="text-[11px] text-slate-400 font-mono">
                    Fórmula Dinámica: {batchGrossWeightKg} kg × ${Number(batchPrecioFacturableUsdPorKg).toFixed(2)} USD/kg = <strong className="text-emerald-400">${liveAvianCalc.billableAmountUSD.toFixed(2)} USD</strong>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowBatchForm(false)}
                      className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveBatch(false)}
                      className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs shadow-md transition"
                    >
                      {editingBatchId ? 'Guardar Cambios de Lote' : 'Registrar Lote Avícola'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tabla de Lotes Avícolas */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 uppercase tracking-wider text-[11px] text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">Código</th>
                    <th className="py-3.5 px-4 font-semibold">Población</th>
                    <th className="py-3.5 px-4 font-semibold">Ciclo (Días)</th>
                    <th className="py-3.5 px-4 font-semibold">Peso Vivo Total</th>
                    <th className="py-3.5 px-4 font-semibold">Tarifa ($/kg)</th>
                    <th className="py-3.5 px-4 font-semibold">Liquidación USD</th>
                    <th className="py-3.5 px-4 font-semibold text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {avianBatches.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 font-sans italic">
                        No hay lotes avícolas registrados. Presione "+ Nuevo Lote Avícola" para iniciar una parvada.
                      </td>
                    </tr>
                  ) : (
                    avianBatches.map((batch) => (
                      <tr key={batch.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-sans font-bold text-white flex items-center gap-1.5 flex-wrap">
                            <Bird className="w-3.5 h-3.5 text-amber-400" />
                            <span>{batch.code}</span>
                            {batch.tipoIngreso === 'ADQUISICION_EXTERNA' ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-950 text-blue-300 border border-blue-700 font-sans tracking-wide">
                                Externa {batch.edadInicialDias ? `• D${batch.edadInicialDias}` : ''}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 font-sans tracking-wide">
                                Granja
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <span>Inicio: {batch.startDate}</span>
                            <span>• {batch.lineaGeneticaRaza || batch.razaLineaGenetica || 'Cobb 500'}</span>
                            <span>• {batch.sexoParvadaPiara || batch.sexo || 'MIXTO'}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-200">
                          {batch.currentCount} / {batch.initialCount} aves
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] ${
                              batch.daysInCycle < 35 || batch.daysInCycle > 40
                                ? 'bg-red-950 text-red-300 border border-red-800'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {batch.daysInCycle} días
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-white font-bold">
                          {batch.grossWeightKg.toLocaleString()} kg
                        </td>
                        <td className="py-3.5 px-4 text-amber-300 font-bold">
                          ${(batch.precioFacturableUsdPorKg ?? batch.unitPriceUSDPerKg ?? 4.0).toFixed(2)} / kg
                        </td>
                        <td className="py-3.5 px-4 text-emerald-400 font-bold text-sm">
                          ${batch.billableAmountUSD?.toFixed(2)} USD
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleExportSingleBatch(batch)}
                              disabled={isExportingPdf}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-sans text-xs transition flex items-center gap-1 border border-slate-700 hover:border-amber-500/50 disabled:opacity-50"
                              title="Descargar/Imprimir Certificado Zootécnico Oficial PDF"
                            >
                              <FileText className="w-3 h-3 text-amber-400" />
                              <span>Ficha PDF</span>
                            </button>
                            <button
                              onClick={() => handleOpenBatchForm('AVICOLA', batch)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-sans text-xs transition flex items-center gap-1 border border-slate-700"
                              title="Editar variables y parámetros del lote"
                            >
                              <Pencil className="w-3 h-3 text-amber-400" />
                              <span>Editar</span>
                            </button>
                            <button
                              onClick={() => handleViewGrowthChart(batch.id)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white font-sans text-xs transition"
                            >
                              Ver Curva &amp; Pesajes
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB: LOTES PORCINOS (PIARAS DE CEBA) */}
      {/* ==================================================== */}
      {activeTab === 'PORCINO' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-400">
              Línea Porcina: Ciclo hasta 150 días • Deducción merma dinámica de canal • Alimentación balanceada y precios facturables ajustables según volatilidad del mercado.
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExportConsolidated('PORCINO')}
                disabled={isExportingPdf || porcineBatches.length === 0}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition flex items-center gap-1.5 shadow-md disabled:opacity-50"
                title="Exportar Reporte Oficial Consolidado de Inventario Porcino en PDF"
              >
                <FileText className="w-4 h-4 text-pink-400" />
                <span>Exportar Inventario PDF</span>
              </button>
              <button
                onClick={() => handleOpenBatchForm('PORCINO')}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-lg shadow-pink-950/40"
              >
                <Plus className="w-4 h-4" />
                <span>+ Nuevo Lote Porcino</span>
              </button>
            </div>
          </div>

          {/* Formulario Modal Lote Porcino */}
          {showBatchForm && batchSpecies === 'PORCINO' && (
            <div className="p-5 bg-slate-900 border border-slate-700 rounded-3xl space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Scale className="w-4 h-4 text-pink-400" />
                  <span>{editingBatchId ? 'Edición de Lote Porcino' : 'Alta de Lote Porcino (Piara de Ceba)'}</span>
                </h3>
                {editingBatchId && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-pink-950 text-pink-300 border border-pink-700">
                    ID: {editingBatchId}
                  </span>
                )}
              </div>

              {batchValidationError && (
                <div className="p-3 bg-red-950/80 border border-red-500 text-red-200 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{batchValidationError}</span>
                </div>
              )}

              {/* Selector de Origen (Toggle Conmutador Spec Fase 3) */}
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-semibold text-xs flex items-center gap-1.5">
                    <span>Origen de la Piara Porcina</span>
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">
                    {batchTipoIngreso === 'ADQUISICION_EXTERNA' ? 'Compra de Lechones / Ceba Externa' : 'Cría Propia en Maternidad de Granja'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setBatchTipoIngreso('NACIMIENTO_INTERNO');
                      setBatchDaysInCycle(90);
                    }}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                      batchTipoIngreso === 'NACIMIENTO_INTERNO'
                        ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200 shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full border border-emerald-400 flex items-center justify-center">
                      {batchTipoIngreso === 'NACIMIENTO_INTERNO' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                    </span>
                    <span>Nacimiento en Granja</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setBatchTipoIngreso('ADQUISICION_EXTERNA');
                      setBatchEdadInicialDias(30);
                      setBatchPesoInicialKg(25.0);
                      setBatchDaysInCycle(60);
                      setBatchRazaLineaGenetica('Landrace');
                    }}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                      batchTipoIngreso === 'ADQUISICION_EXTERNA'
                        ? 'bg-blue-950/80 border-blue-500 text-blue-200 shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full border border-blue-400 flex items-center justify-center">
                      {batchTipoIngreso === 'ADQUISICION_EXTERNA' && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                    </span>
                    <span>Adquisición Externa</span>
                  </button>
                </div>
              </div>

              {/* Conditional Rendering: Variables cronológicas de Adquisición Externa */}
              {batchTipoIngreso === 'ADQUISICION_EXTERNA' && (
                <div className="p-3.5 bg-blue-950/30 border border-blue-800/60 rounded-2xl space-y-3 animate-fadeIn">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-blue-300">
                      Parámetros de Recepción Externa (Ciclo Total: 150 Días / 5 Meses)
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-900/60 text-blue-200 border border-blue-700">
                      Ciclo Restante: {Math.max(0, 150 - Number(batchEdadInicialDias))} días ({((Math.max(0, 150 - Number(batchEdadInicialDias))) / 30).toFixed(1)} meses)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Edad Inicial al Ingreso (Días, 1 - 149)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="149"
                        value={batchEdadInicialDias}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setBatchEdadInicialDias(val);
                          const maxRemaining = Math.max(1, 150 - val);
                          if (batchDaysInCycle > maxRemaining) {
                            setBatchDaysInCycle(maxRemaining);
                          }
                        }}
                        className="w-full bg-slate-950 border border-blue-700/80 rounded-xl p-2 text-slate-100 outline-none font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Peso Vivo Inicial al Ingreso (kg)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="1"
                        value={batchPesoInicialKg}
                        onChange={(e) => setBatchPesoInicialKg(Number(e.target.value))}
                        placeholder="Ej. 25.0"
                        className="w-full bg-slate-950 border border-blue-700/80 rounded-xl p-2 text-slate-100 outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Variables Biológicas Fenotípicas y Parámetros de Mercado Dinámicos (Fase 2 Spec-Driven) */}
              <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-pink-400 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Variables Fenotípicas y Parámetros Financieros Dinámicos</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Sexo de la Piara (`sexoParvadaPiara`)
                    </label>
                    <select
                      value={batchSexo}
                      onChange={(e) => setBatchSexo(e.target.value as LivestockSex)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none focus:border-pink-500 font-semibold"
                    >
                      <option value="MIXTO">Mixto (Machos / Hembras)</option>
                      <option value="MACHO">Macho (Capón / Entero)</option>
                      <option value="HEMBRA">Hembra (Cerdas)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Línea Genética / Raza (`lineaGeneticaRaza`)
                    </label>
                    <input
                      type="text"
                      value={batchRazaLineaGenetica}
                      onChange={(e) => setBatchRazaLineaGenetica(e.target.value)}
                      placeholder="Ej. Landrace / Duroc / Pietrain"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none focus:border-pink-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Precio Facturable Neto ($/kg)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.05"
                        min="0.1"
                        value={batchPrecioFacturableNetoUsdPorKg}
                        onChange={(e) => setBatchPrecioFacturableNetoUsdPorKg(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-pink-700/70 rounded-xl p-2.5 pl-7 text-pink-300 font-mono font-bold outline-none focus:border-pink-400"
                      />
                      <span className="absolute left-2.5 top-2.5 text-pink-500 font-bold">$</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-1">
                      Tarifa de mercado neta
                    </span>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Precio Saco Alimento ($ USD)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.5"
                        min="1"
                        value={batchPrecioSacoAlimentoUsd}
                        onChange={(e) => setBatchPrecioSacoAlimentoUsd(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-pink-700/70 rounded-xl p-2.5 pl-7 text-amber-300 font-mono font-bold outline-none focus:border-pink-400"
                      />
                      <span className="absolute left-2.5 top-2.5 text-amber-500 font-bold">$</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-1">
                      Saco de 40 kg balanceado
                    </span>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Deducción Merma Canal (kg)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="35"
                      value={batchDeduccionMermaKg}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setBatchDeduccionMermaKg(val);
                        setBatchShrinkageKg(val);
                      }}
                      className="w-full bg-slate-900 border border-pink-700/70 rounded-xl p-2.5 text-pink-200 font-mono font-bold outline-none focus:border-pink-400"
                    />
                    <span className="text-[10px] text-slate-400 block mt-1">
                      Merma configurable faena
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Código del Lote</label>
                  <input
                    type="text"
                    value={batchCode}
                    onChange={(e) => setBatchCode(e.target.value)}
                    placeholder="Ej. LOTE-PORC-2026-01"
                    disabled={!!editingBatchId}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none uppercase font-mono disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Población de Cerdos</label>
                  <input
                    type="number"
                    min="1"
                    value={batchInitialCount}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setBatchInitialCount(val);
                      setBatchCurrentCount(val);
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    {batchTipoIngreso === 'ADQUISICION_EXTERNA'
                      ? `Días en Granja (Máx. ${Math.max(1, 150 - Number(batchEdadInicialDias))})`
                      : 'Días en Ciclo (Máx. 150 d)'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={batchTipoIngreso === 'ADQUISICION_EXTERNA' ? Math.max(1, 150 - Number(batchEdadInicialDias)) : 150}
                    value={batchDaysInCycle}
                    onChange={(e) => setBatchDaysInCycle(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Sacos Alimento Consumidos
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={batchFeedSacks}
                    onChange={(e) => setBatchFeedSacks(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1 text-xs">
                  <label className="block text-slate-300 font-semibold">Peso Bruto Total en Báscula (kg)</label>
                  {batchCurrentCount > 0 && batchGrossWeightKg > 0 && (
                    <span className="text-[11px] text-emerald-400 font-mono font-bold bg-emerald-950/70 border border-emerald-800/60 px-2 py-0.5 rounded-lg">
                      Promedio: {(batchGrossWeightKg / batchCurrentCount).toFixed(1)} kg/cerdo
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={batchGrossWeightKg}
                  onChange={(e) => setBatchGrossWeightKg(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none font-mono text-xs"
                  placeholder="Ej. 12000 kg (suma total de la piara)"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Biomasa total sumada de <strong className="text-pink-400">todos los cerdos de la piara</strong>.
                </p>
              </div>

              {/* Dynamic Schema Engine - Inyección de Campos Dinámicos */}
              <DynamicFormRenderer
                module="TRAZABILIDAD"
                values={batchCustomFields}
                onChange={(f, v) => setBatchCustomFields((prev) => ({ ...prev, [f]: v }))}
              />

              {/* Card de Liquidación Zootécnica y Financiera en Caliente (Spec Fase 2) */}
              <div className="p-4 bg-slate-950 rounded-2xl border border-pink-900/40 space-y-3">
                <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-pink-400" />
                    <span className="font-bold text-white uppercase tracking-wider">
                      Liquidación Zootécnica en Caliente
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    livePorcineCalc.isValid ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-red-950 text-red-300 border border-red-800'
                  }`}>
                    {livePorcineCalc.isValid ? 'Parámetros Porcinos Válidos' : 'Validación Pendiente'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-xs font-mono">
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans">Peso Bruto</span>
                    <span className="text-sm font-bold text-white">{batchGrossWeightKg.toLocaleString()} kg</span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans">Deducción Merma</span>
                    <span className="text-sm font-bold text-amber-300">-{livePorcineCalc.deduccionMermaKg} kg</span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans">Peso Neto Liquidable</span>
                    <span className="text-sm font-bold text-cyan-300">{livePorcineCalc.netWeightKg.toLocaleString()} kg</span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans">Costo de Alimento</span>
                    <span className="text-sm font-bold text-rose-300">
                      ${livePorcineCalc.feedCostUSD.toFixed(2)} USD
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans">Tarifa Neta</span>
                    <span className="text-sm font-bold text-pink-300">
                      ${Number(batchPrecioFacturableNetoUsdPorKg).toFixed(2)} USD/kg
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900 border border-emerald-900/60">
                    <span className="text-[10px] text-slate-400 block font-sans">Facturación Neta</span>
                    <span className="text-sm font-bold text-emerald-400">
                      ${livePorcineCalc.billableAmountUSD.toFixed(2)} USD
                    </span>
                  </div>
                </div>

                {/* Margen Operativo Estimado */}
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400 font-sans">Margen Estimado de Ceba (Facturación - Alimento):</span>
                  <span className={`font-bold ${livePorcineCalc.billableAmountUSD - livePorcineCalc.feedCostUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    ${(livePorcineCalc.billableAmountUSD - livePorcineCalc.feedCostUSD).toFixed(2)} USD
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800">
                  <div className="text-[11px] text-slate-400 font-mono">
                    Fórmula Dinámica: ({batchGrossWeightKg} kg - {livePorcineCalc.deduccionMermaKg} kg) × ${Number(batchPrecioFacturableNetoUsdPorKg).toFixed(2)} USD/kg = <strong className="text-emerald-400">${livePorcineCalc.billableAmountUSD.toFixed(2)} USD</strong>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowBatchForm(false)}
                      className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveBatch(false)}
                      className="px-5 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-semibold text-xs shadow-md transition"
                    >
                      {editingBatchId ? 'Guardar Cambios de Lote' : 'Registrar Lote Porcino'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tabla de Lotes Porcinos */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 uppercase tracking-wider text-[11px] text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">Código</th>
                    <th className="py-3.5 px-4 font-semibold">Población</th>
                    <th className="py-3.5 px-4 font-semibold">Ciclo (Días)</th>
                    <th className="py-3.5 px-4 font-semibold">Peso Bruto</th>
                    <th className="py-3.5 px-4 font-semibold">Merma</th>
                    <th className="py-3.5 px-4 font-semibold">Peso Neto</th>
                    <th className="py-3.5 px-4 font-semibold">Tarifa ($/kg)</th>
                    <th className="py-3.5 px-4 font-semibold">Liquidación USD</th>
                    <th className="py-3.5 px-4 font-semibold text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {porcineBatches.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500 font-sans italic">
                        No hay lotes porcinos registrados. Presione "+ Nuevo Lote Porcino" para iniciar una piara.
                      </td>
                    </tr>
                  ) : (
                    porcineBatches.map((batch) => (
                      <tr key={batch.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-sans font-bold text-white flex items-center gap-1.5 flex-wrap">
                            <Scale className="w-3.5 h-3.5 text-pink-400" />
                            <span>{batch.code}</span>
                            {batch.tipoIngreso === 'ADQUISICION_EXTERNA' ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-950 text-blue-300 border border-blue-700 font-sans tracking-wide">
                                Externa {batch.edadInicialDias ? `• D${batch.edadInicialDias}` : ''}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 font-sans tracking-wide">
                                Granja
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <span>Inicio: {batch.startDate}</span>
                            <span>• {batch.lineaGeneticaRaza || batch.razaLineaGenetica || 'Landrace'}</span>
                            <span>• {batch.sexoParvadaPiara || batch.sexo || 'MIXTO'}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-200">
                          {batch.currentCount} / {batch.initialCount} cerdos
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px]">
                            {batch.daysInCycle} días
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">
                          {batch.grossWeightKg.toLocaleString()} kg
                        </td>
                        <td className="py-3.5 px-4 text-amber-400">
                          -{batch.deduccionMermaKg ?? batch.shrinkageDeductionKg ?? 17.5} kg
                        </td>
                        <td className="py-3.5 px-4 text-white font-bold">
                          {batch.netWeightKg.toLocaleString()} kg
                        </td>
                        <td className="py-3.5 px-4 text-pink-300 font-bold">
                          ${(batch.precioFacturableNetoUsdPorKg ?? batch.unitPriceUSDPerKg ?? 6.0).toFixed(2)} / kg
                        </td>
                        <td className="py-3.5 px-4 text-emerald-400 font-bold text-sm">
                          ${batch.billableAmountUSD?.toFixed(2)} USD
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleExportSingleBatch(batch)}
                              disabled={isExportingPdf}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-sans text-xs transition flex items-center gap-1 border border-slate-700 hover:border-pink-500/50 disabled:opacity-50"
                              title="Descargar/Imprimir Certificado Zootécnico Oficial PDF"
                            >
                              <FileText className="w-3 h-3 text-pink-400" />
                              <span>Ficha PDF</span>
                            </button>
                            <button
                              onClick={() => handleOpenBatchForm('PORCINO', batch)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-sans text-xs transition flex items-center gap-1 border border-slate-700"
                              title="Editar variables y parámetros del lote"
                            >
                              <Pencil className="w-3 h-3 text-pink-400" />
                              <span>Editar</span>
                            </button>
                            <button
                              onClick={() => handleViewGrowthChart(batch.id)}
                              className="px-3 py-1.5 rounded-lg bg-pink-600/30 hover:bg-pink-600 text-pink-300 hover:text-white font-sans text-xs transition"
                            >
                              Ver Curva &amp; Pesajes
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB: CONTROLES BIOLÓGICOS Y MONITOREO LONGITUDINAL */}
      {/* ==================================================== */}
      {activeTab === 'CONTROLES' && (
        <div className="space-y-6">
          {/* DIAGNÓSTICO Y ACTIVACIÓN: Renderizado condicionado a la existencia previa de un lote */}
          {batchesList.length === 0 ? (
            <div className="p-8 bg-slate-900 border border-slate-800 rounded-3xl text-center space-y-4 animate-fadeIn">
              <div className="w-16 h-16 rounded-2xl bg-amber-950/60 border border-amber-500/50 flex items-center justify-center text-amber-400 mx-auto">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto space-y-2">
                <h3 className="text-base font-bold text-white">
                  Se Requiere Lote Biológico Activo
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Para activar el registro de controles de campo (pesajes, vacunación, raciones) y generar la curva de crecimiento longitudinal Cobb 500 o Ceba Porcina, primero debe dar de alta al menos un lote biológico.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
                <button
                  onClick={() => {
                    setActiveTab('AVICOLA');
                    handleOpenBatchForm('AVICOLA');
                  }}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition active:scale-95"
                >
                  <Bird className="w-4 h-4" />
                  <span>+ Dar de Alta Lote Avícola</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('PORCINO');
                    handleOpenBatchForm('PORCINO');
                  }}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition active:scale-95"
                >
                  <Scale className="w-4 h-4" />
                  <span>+ Dar de Alta Lote Porcino</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Selector de Lote para la Curva de Crecimiento */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <Scale className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">
                      Lote Activo para Monitoreo Longitudinal
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Seleccione el lote para contrastar sus pesajes contra la curva estándar parametrizada
                    </span>
                  </div>
                </div>

                <div className="w-full sm:w-auto flex items-center gap-2">
                  <select
                    value={selectedBatch?.id || ''}
                    onChange={(e) => setSelectedBatchId(e.target.value)}
                    className="w-full sm:w-64 bg-slate-950 border border-slate-700 text-slate-100 rounded-xl p-2.5 text-xs font-semibold outline-none focus:border-emerald-500"
                  >
                    {batchesList.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code} ({b.species} - {b.currentCount} animales - Día {b.daysInCycle})
                      </option>
                    ))}
                  </select>
                  {selectedBatch && (
                    <button
                      onClick={() => handleExportSingleBatch(selectedBatch)}
                      disabled={isExportingPdf}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition shrink-0 disabled:opacity-50"
                      title="Descargar Ficha Técnica Oficial PDF con historial de pesajes"
                    >
                      <FileText className="w-4 h-4 text-emerald-400" />
                      <span className="hidden sm:inline">Ficha PDF</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Componente Visual Gráfico de Curva de Crecimiento Longitudinal */}
              {selectedBatch && (
                <WeightGrowthChart
                  batch={selectedBatch}
                  controls={controlsList}
                  onAddControl={handleAddWeightFromChart}
                />
              )}

              {/* Registro General de Controles de Granja (Vacunación / Alimentación / Pesaje) */}
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-400">
                    Asientos generales de campo: vacunación, sanidad y registro de consumo de raciones.
                  </div>
                  <button
                    onClick={() => setShowControlForm(!showControlForm)}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-lg shadow-emerald-950/40"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Registrar Plan Sanitario / Insumo</span>
                  </button>
                </div>

                {/* Formulario Control Granja */}
                {showControlForm && (
                  <div className="p-5 bg-slate-900 border border-slate-700 rounded-3xl space-y-4 animate-fadeIn">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Syringe className="w-4 h-4 text-cyan-400" />
                        <span>Nuevo Asiento Sanitario o Alimentario</span>
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      <div>
                        <label className="block text-slate-300 font-semibold mb-1">
                          Lote Destino
                        </label>
                        <select
                          value={controlBatchId || selectedBatch?.id || ''}
                          onChange={(e) => setControlBatchId(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none focus:border-emerald-500"
                        >
                          <option value="">Seleccione un lote...</option>
                          {batchesList.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.code} ({b.species} - {b.currentCount} animales)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-300 font-semibold mb-1">
                          Tipo de Control
                        </label>
                        <select
                          value={controlType}
                          onChange={(e) => {
                            const t = e.target.value as FarmBiologicalControl['type'];
                            setControlType(t);
                            if (t === 'PESAJE') setControlMetricUnit('kg/animal');
                            else if (t === 'VACUNACION') setControlMetricUnit('dosis');
                            else if (t === 'ALIMENTACION') setControlMetricUnit('sacos');
                          }}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none focus:border-emerald-500"
                        >
                          <option value="VACUNACION">Vacunación / Plan Sanitario</option>
                          <option value="ALIMENTACION">Suministro de Alimentación</option>
                          <option value="PESAJE">Pesaje / Muestreo de Peso</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-300 font-semibold mb-1">
                          Fecha de Operación
                        </label>
                        <input
                          type="date"
                          value={controlDate}
                          onChange={(e) => setControlDate(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-300 font-semibold mb-1">
                          Valor Métrico ({controlMetricUnit})
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={controlMetricValue}
                          onChange={(e) => setControlMetricValue(Number(e.target.value))}
                          placeholder="Ej. 1000"
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-300 font-semibold mb-1">
                          Producto / Vacuna / Alimento
                        </label>
                        <input
                          type="text"
                          value={controlProduct}
                          onChange={(e) => setControlProduct(e.target.value)}
                          placeholder="Ej. Newcastle Gumball / Alimento Engorde"
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-300 font-semibold mb-1">
                          Responsable / Veterinario
                        </label>
                        <input
                          type="text"
                          value={controlWorker}
                          onChange={(e) => setControlWorker(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1 text-xs">
                        Observaciones Técnicas de Granja
                      </label>
                      <input
                        type="text"
                        value={controlObservations}
                        onChange={(e) => setControlObservations(e.target.value)}
                        placeholder="Detalles de bioseguridad, respuesta inmunológica, temperatura del galpón..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 text-xs outline-none"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setShowControlForm(false)}
                        className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveControl}
                        className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md"
                      >
                        Asentar en Registro
                      </button>
                    </div>
                  </div>
                )}

                {/* Historial General de Controles */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-950/80 uppercase tracking-wider text-[11px] text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="py-3.5 px-4 font-semibold">Fecha</th>
                          <th className="py-3.5 px-4 font-semibold">Lote</th>
                          <th className="py-3.5 px-4 font-semibold">Tipo Control</th>
                          <th className="py-3.5 px-4 font-semibold">Métrica Registrada</th>
                          <th className="py-3.5 px-4 font-semibold">Insumo Aplicado</th>
                          <th className="py-3.5 px-4 font-semibold">Responsable</th>
                          <th className="py-3.5 px-4 font-semibold">Observaciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {controlsList.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-slate-500 font-sans italic">
                              No hay controles biológicos asentados. Utilice el formulario de pesaje o registro sanitario.
                            </td>
                          </tr>
                        ) : (
                          controlsList.map((ctrl) => (
                            <tr key={ctrl.id} className="hover:bg-slate-800/40 transition">
                              <td className="py-3.5 px-4 text-slate-400 font-sans">
                                {ctrl.date}
                              </td>
                              <td className="py-3.5 px-4 font-bold text-white font-sans">
                                {ctrl.batchCode}
                              </td>
                              <td className="py-3.5 px-4">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                    ctrl.type === 'PESAJE'
                                      ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                                      : ctrl.type === 'VACUNACION'
                                      ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                      : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  }`}
                                >
                                  {ctrl.type}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-emerald-300 font-bold">
                                {ctrl.metricValue} {ctrl.metricUnit}
                              </td>
                              <td className="py-3.5 px-4 text-slate-300 font-sans">
                                {ctrl.productOrVaccineName || '-'}
                              </td>
                              <td className="py-3.5 px-4 text-slate-400 font-sans">
                                {ctrl.responsibleWorker}
                              </td>
                              <td className="py-3.5 px-4 text-slate-400 font-sans truncate max-w-xs">
                                {ctrl.observations || '-'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB: INSUMOS DE PRODUCCIÓN */}
      {/* ==================================================== */}
      {activeTab === 'INSUMOS' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-400">
              Almacén de insumos críticos: alimento balanceado, pollitos BB, complejos vitamínicos y cal desinfectante.
            </div>
            <button
              onClick={() => {
                resetInsumoFields();
                setShowInsumoForm(!showInsumoForm);
              }}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-lg shadow-cyan-950/40"
            >
              <Plus className="w-4 h-4" />
              <span>+ Nuevo Insumo</span>
            </button>
          </div>

          {/* Formulario Modal Insumos */}
          {showInsumoForm && (
            <div className="p-5 bg-slate-900 border border-slate-700 rounded-3xl space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4 text-cyan-400" />
                  <span>{editingInsumoId ? 'Actualizar Insumo' : 'Entrada de Almacén'}</span>
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 text-xs">
                <div className="md:col-span-2">
                  <label className="block text-slate-300 font-semibold mb-1">Nombre del Insumo</label>
                  <input
                    type="text"
                    value={insumoName}
                    onChange={(e) => setInsumoName(e.target.value)}
                    placeholder="Ej. Alimento Iniciador Broiler 20kg"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Categoría</label>
                  <select
                    value={insumoSubtype}
                    onChange={(e) => setInsumoSubtype(e.target.value as InsumoSubtype)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none"
                  >
                    <option value="ALIMENTO">Alimento Balanceado</option>
                    <option value="POLLITOS">Pollitos BB / Lechones</option>
                    <option value="VITAMINAS">Vitaminas / Vacunas</option>
                    <option value="CAL">Cal / Bioseguridad</option>
                    <option value="OTRO">Otro Insumo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Cantidad Física</label>
                  <input
                    type="number"
                    min="0"
                    value={insumoQuantity}
                    onChange={(e) => setInsumoQuantity(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Costo Unitario ($ USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={insumoUnitCost}
                    onChange={(e) => setInsumoUnitCost(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 outline-none font-mono"
                  />
                </div>
              </div>

              {/* Dynamic Schema Engine - Inyección de Campos Dinámicos */}
              <DynamicFormRenderer
                module="INVENTARIO"
                values={insumoCustomFields}
                onChange={(f, v) => setInsumoCustomFields((prev) => ({ ...prev, [f]: v }))}
              />

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowInsumoForm(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveInsumo(false)}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs shadow-md"
                >
                  {editingInsumoId ? 'Guardar Cambios' : 'Ingresar Insumo'}
                </button>
              </div>
            </div>
          )}

          {/* Tabla de Insumos */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 uppercase tracking-wider text-[11px] text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">Insumo</th>
                    <th className="py-3.5 px-4 font-semibold">Tipo</th>
                    <th className="py-3.5 px-4 font-semibold">Stock</th>
                    <th className="py-3.5 px-4 font-semibold">Costo Unitario</th>
                    <th className="py-3.5 px-4 font-semibold">Valoración Total USD</th>
                    <th className="py-3.5 px-4 font-semibold">Última Actualización</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {inventoryList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 font-sans italic">
                        No hay insumos registrados en el inventario.
                      </td>
                    </tr>
                  ) : (
                    inventoryList.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3.5 px-4 font-sans font-bold text-white">
                          <div>{item.name}</div>
                          {item.customFields && Object.keys(item.customFields).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1 font-mono text-[9px] font-normal">
                              {Object.entries(item.customFields)
                                .filter(([k]) => !['__proto__', 'constructor', 'prototype'].includes(k))
                                .map(([k, v]) => (
                                  <span key={k} className="px-1.5 py-0.5 rounded bg-purple-950/80 border border-purple-800 text-purple-300">
                                    {k}: {String(v)}
                                  </span>
                                ))}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="bg-slate-800 px-2 py-0.5 rounded text-[10px] text-slate-300 font-semibold">
                            {item.subtype || 'INSUMO'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-emerald-400 font-bold">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">
                          ${item.unitCostUSD?.toFixed(2)} USD
                        </td>
                        <td className="py-3.5 px-4 text-emerald-400 font-bold">
                          ${item.totalValueUSD?.toFixed(2)} USD
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 font-sans text-[11px]">
                          {new Date(item.lastUpdatedTimestamp).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB: HISTORIAL Y RENTABILIDAD (CAMADAS / PARIDAS PASADAS) */}
      {/* ==================================================== */}
      {activeTab === 'HISTORIAL_RENTABILIDAD' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Header del Módulo Histórico */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-5 rounded-3xl bg-slate-900 border border-purple-500/30 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/40 flex items-center justify-center text-2xl shadow-inner">
                📜
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-white tracking-tight">
                    Historial de Camadas y Paridas Pasadas
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-purple-950 text-purple-300 border border-purple-800">
                    Sustentación de Rentabilidad Real
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Auditoría completa de lotes cerrados (Pollos &amp; Cerdos) • Aislamiento total de stock • Generación de informes auditables.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              <button
                onClick={async () => {
                  setIsExportingHistorical(true);
                  try {
                    await BatchExportService.exportCumulativeProfitabilityToPdf(filteredHistoricalBatches, bcvRate);
                  } finally {
                    setIsExportingHistorical(false);
                  }
                }}
                disabled={isExportingHistorical || filteredHistoricalBatches.length === 0}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition cursor-pointer min-h-[44px] shadow disabled:opacity-50"
                title="Descargar Informe Ejecutivo Oficial de Rentabilidad Acumulada en PDF"
              >
                <Printer className="w-4 h-4 text-purple-400" />
                <span>Informe PDF</span>
              </button>

              <button
                onClick={() => {
                  BatchExportService.exportCumulativeProfitabilityToExcel(filteredHistoricalBatches, bcvRate);
                }}
                disabled={filteredHistoricalBatches.length === 0}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition cursor-pointer min-h-[44px] shadow disabled:opacity-50"
                title="Descargar Informe Ejecutivo Oficial de Rentabilidad Acumulada en Excel"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Informe Excel</span>
              </button>

              {isAdmin && (
                <button
                  onClick={() => {
                    setEditingHistoricalBatch(null);
                    setShowHistoricalModal(true);
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-950/50 transition cursor-pointer min-h-[44px]"
                >
                  <Plus className="w-4 h-4" />
                  <span>Registrar Lote Pasado</span>
                </button>
              )}
            </div>
          </div>

          {/* PANEL DE SUSTENTACIÓN DE RENTABILIDAD REAL DEL NEGOCIO HASTA AHORA (3 Tarjetas Ejecutivas) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Tarjeta 1: Rentabilidad Real Consolidada del Negocio Hasta Hoy */}
            <div className="p-5 rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border-2 border-emerald-500/60 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400 font-mono flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    Rentabilidad Consolidada Negocio
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                    Hasta Hoy
                  </span>
                </div>

                <div className="my-3 text-center py-2 rounded-2xl bg-emerald-950/30 border border-emerald-800/40">
                  <span className="text-[10px] font-mono uppercase text-slate-400 block font-bold">
                    % Ganancia Real Acumulada (ROI Global)
                  </span>
                  <span className="text-3xl font-black font-mono text-emerald-400 tabular-nums">
                    {cumulativeFilteredProfitability.consolidated.roiPercentage.toFixed(2)}%
                  </span>
                  <span className="text-[10px] text-emerald-300 font-mono block mt-0.5">
                    Margen Neto Global: {cumulativeFilteredProfitability.consolidated.profitMarginPercentage.toFixed(2)}%
                  </span>
                </div>

                <div className="space-y-1.5 text-xs font-mono pt-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Inversión Histórica Total:</span>
                    <strong className="text-white">
                      ${cumulativeFilteredProfitability.consolidated.totalInvestedUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Ventas Históricas Totales:</span>
                    <strong className="text-purple-300">
                      ${cumulativeFilteredProfitability.consolidated.totalSalesUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Biomasa Neta Vendida:</span>
                    <strong className="text-slate-200">
                      {cumulativeFilteredProfitability.consolidated.totalKgVendible.toLocaleString()} kg
                    </strong>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">Ganancia Neta Real:</span>
                <span className="text-lg font-black font-mono text-emerald-400">
                  ${cumulativeFilteredProfitability.consolidated.netProfitUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Tarjeta 2: Desempeño Histórico Camadas de Pollos (Avícola) */}
            <div className="p-5 rounded-3xl bg-slate-900 border border-amber-500/40 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-amber-400 font-mono flex items-center gap-1.5">
                    <span>🐔</span> Línea Avícola (Pollos)
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800">
                    {cumulativeFilteredProfitability.avian.totalBatches} Camadas
                  </span>
                </div>

                <div className="my-3 text-center py-2 rounded-2xl bg-amber-950/20 border border-amber-800/30">
                  <span className="text-[10px] font-mono uppercase text-slate-400 block font-bold">
                    % Ganancia Real Avícola (ROI)
                  </span>
                  <span className="text-3xl font-black font-mono text-amber-400 tabular-nums">
                    {cumulativeFilteredProfitability.avian.roiPercentage.toFixed(2)}%
                  </span>
                  <span className="text-[10px] text-amber-300 font-mono block mt-0.5">
                    Margen Ventas: {cumulativeFilteredProfitability.avian.profitMarginPercentage.toFixed(2)}%
                  </span>
                </div>

                <div className="space-y-1.5 text-xs font-mono pt-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Supervivencia Promedio:</span>
                    <strong className="text-emerald-400">
                      {cumulativeFilteredProfitability.avian.averageSurvivalRate.toFixed(1)}%
                    </strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Costo Promedio / Kg:</span>
                    <strong className="text-white">
                      ${cumulativeFilteredProfitability.avian.averageCostPerKgVendibleUSD.toFixed(2)} / kg
                    </strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Inversión Avícola Total:</span>
                    <strong className="text-slate-200">
                      ${cumulativeFilteredProfitability.avian.totalInvestedUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">Utilidad Neta Avícola:</span>
                <span className="text-lg font-black font-mono text-emerald-400">
                  ${cumulativeFilteredProfitability.avian.netProfitUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Tarjeta 3: Desempeño Histórico Paridas de Cerdos (Porcino) */}
            <div className="p-5 rounded-3xl bg-slate-900 border border-pink-500/40 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-pink-400 font-mono flex items-center gap-1.5">
                    <span>🐖</span> Línea Porcina (Cerdos)
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-pink-950 text-pink-300 border border-pink-800">
                    {cumulativeFilteredProfitability.porcine.totalBatches} Paridas
                  </span>
                </div>

                <div className="my-3 text-center py-2 rounded-2xl bg-pink-950/20 border border-pink-800/30">
                  <span className="text-[10px] font-mono uppercase text-slate-400 block font-bold">
                    % Ganancia Real Porcina (ROI)
                  </span>
                  <span className="text-3xl font-black font-mono text-pink-400 tabular-nums">
                    {cumulativeFilteredProfitability.porcine.roiPercentage.toFixed(2)}%
                  </span>
                  <span className="text-[10px] text-pink-300 font-mono block mt-0.5">
                    Margen Ventas: {cumulativeFilteredProfitability.porcine.profitMarginPercentage.toFixed(2)}%
                  </span>
                </div>

                <div className="space-y-1.5 text-xs font-mono pt-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Supervivencia Promedio:</span>
                    <strong className="text-emerald-400">
                      {cumulativeFilteredProfitability.porcine.averageSurvivalRate.toFixed(1)}%
                    </strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Merma Post-Mortem Acumulada:</span>
                    <strong className="text-rose-400">
                      {(cumulativeFilteredProfitability.porcine.totalShrinkageKg || 0).toLocaleString()} kg
                    </strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Costo Promedio / Kg Neto:</span>
                    <strong className="text-white">
                      ${cumulativeFilteredProfitability.porcine.averageCostPerKgVendibleUSD.toFixed(2)} / kg
                    </strong>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">Utilidad Neta Porcina:</span>
                <span className="text-lg font-black font-mono text-emerald-400">
                  ${cumulativeFilteredProfitability.porcine.netProfitUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Filtros por Especie y Rango de Fechas */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow">
            {/* Conmutador de Especies */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
              <button
                onClick={() => setHistoricalSpeciesFilter('TODOS')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition min-h-[44px] flex items-center gap-1.5 ${
                  historicalSpeciesFilter === 'TODOS'
                    ? 'bg-purple-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>Todas las Especies</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-950 font-mono">
                  {historicalBatches.length}
                </span>
              </button>

              <button
                onClick={() => setHistoricalSpeciesFilter('AVICOLA')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition min-h-[44px] flex items-center gap-1.5 ${
                  historicalSpeciesFilter === 'AVICOLA'
                    ? 'bg-amber-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>🐔 Solo Pollos</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-950 font-mono">
                  {avianHistoricalCount}
                </span>
              </button>

              <button
                onClick={() => setHistoricalSpeciesFilter('PORCINO')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition min-h-[44px] flex items-center gap-1.5 ${
                  historicalSpeciesFilter === 'PORCINO'
                    ? 'bg-pink-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>🐖 Solo Cerdos</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-950 font-mono">
                  {porcineHistoricalCount}
                </span>
              </button>
            </div>

            {/* Rango de Fechas y Búsqueda */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[11px] font-mono text-slate-400">Desde:</span>
                <input
                  type="date"
                  value={historicalStartDate}
                  onChange={(e) => setHistoricalStartDate(e.target.value)}
                  className="bg-transparent text-xs font-mono text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5">
                <span className="text-[11px] font-mono text-slate-400">Hasta:</span>
                <input
                  type="date"
                  value={historicalEndDate}
                  onChange={(e) => setHistoricalEndDate(e.target.value)}
                  className="bg-transparent text-xs font-mono text-white focus:outline-none"
                />
              </div>

              {(historicalStartDate || historicalEndDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setHistoricalStartDate('');
                    setHistoricalEndDate('');
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono"
                  title="Restablecer filtro a Histórico Completo Hasta Hoy"
                >
                  ✕ Histórico Completo
                </button>
              )}

              {/* Búsqueda */}
              <div className="relative min-w-[180px]">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={historicalSearch}
                  onChange={(e) => setHistoricalSearch(e.target.value)}
                  placeholder="Código o raza..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-purple-500 min-h-[36px]"
                />
              </div>
            </div>
          </div>

          {/* Tabla de Registros Históricos */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 uppercase tracking-wider text-[11px] text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">Lote Histórico</th>
                    <th className="py-3.5 px-4 font-semibold">Origen &amp; Ciclo</th>
                    <th className="py-3.5 px-4 font-semibold">Animales &amp; Sup.</th>
                    <th className="py-3.5 px-4 font-semibold">Kilos (Bruto / Neto)</th>
                    <th className="py-3.5 px-4 font-semibold">Inversión ($)</th>
                    <th className="py-3.5 px-4 font-semibold">Venta ($)</th>
                    <th className="py-3.5 px-4 font-semibold">Utilidad Neta ($)</th>
                    <th className="py-3.5 px-4 font-semibold text-center">ROI % Real</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Acciones &amp; Documentos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredHistoricalBatches.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-500 font-sans italic">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <History className="w-8 h-8 text-slate-600 mb-1" />
                          <p className="text-sm font-semibold text-slate-400">
                            No hay lotes históricos cerrados que coincidan con los filtros.
                          </p>
                          <p className="text-xs text-slate-500 max-w-md">
                            Candado Antialucinaciones activo: Todos los indicadores muestran 0.00 y 0.00%. Registre una camada o parida pasada para sustentar la rentabilidad real.
                          </p>
                          {isAdmin && (
                            <button
                              onClick={() => {
                                setEditingHistoricalBatch(null);
                                setShowHistoricalModal(true);
                              }}
                              className="mt-3 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition cursor-pointer min-h-[44px]"
                            >
                              + Registrar Primer Lote Histórico
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredHistoricalBatches.map((batch) => {
                      const balance = calculateHistoricalBatchBalance(batch);
                      const isAv = batch.especie === 'AVICOLA';
                      return (
                        <tr key={batch.id} className="hover:bg-slate-800/40 transition">
                          {/* Lote e Identificación */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm ${
                                  isAv ? 'bg-amber-500/20 text-amber-300' : 'bg-pink-500/20 text-pink-300'
                                }`}
                              >
                                {isAv ? '🐔' : '🐖'}
                              </span>
                              <div>
                                <span className="font-bold text-white block">
                                  {batch.codigoLoteHistorico}
                                </span>
                                <span className="text-[10px] text-slate-400 font-sans block">
                                  {batch.lineaGeneticaRaza || (isAv ? 'Avícola' : 'Porcino')} • {batch.sexoParvadaPiara || 'Mixto'}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Origen y Ciclo */}
                          <td className="py-3.5 px-4 font-sans text-[11px]">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                batch.tipoOrigenHistorico === 'COMPRA_ADQUISICION'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : 'bg-indigo-950 text-indigo-400 border border-indigo-800'
                              }`}
                            >
                              {batch.tipoOrigenHistorico === 'COMPRA_ADQUISICION' ? 'Compra' : 'Granja'}
                            </span>
                            <div className="text-slate-400 text-[10px] font-mono mt-1">
                              Cierre: {batch.fechaBeneficioCierre} ({balance.diasEfectivosEnGranja}d)
                            </div>
                          </td>

                          {/* Animales y Supervivencia */}
                          <td className="py-3.5 px-4">
                            <div className="text-white font-bold">
                              {balance.animalesBeneficiados.toLocaleString()}{' '}
                              <span className="text-slate-500 font-normal">/ {batch.cantidadAnimalesInicial}</span>
                            </div>
                            <div className="text-[10px] text-emerald-400 font-bold">
                              {balance.porcentajeSupervivencia.toFixed(1)}% sup. ({batch.mortalidadTotalAnimales} muertos)
                            </div>
                          </td>

                          {/* Kilos */}
                          <td className="py-3.5 px-4">
                            <div className="text-emerald-400 font-bold">
                              {batch.pesoGlobalNetoVendibleKg.toLocaleString()} kg neto
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              Bruto: {batch.pesoGlobalBrutoCierreKg.toLocaleString()} kg
                              {!isAv && batch.mermaTotalBeneficioKg > 0 && (
                                <span className="text-rose-400"> (-{batch.mermaTotalBeneficioKg}kg merma)</span>
                              )}
                            </div>
                          </td>

                          {/* Inversión */}
                          <td className="py-3.5 px-4 text-slate-300 font-bold">
                            ${balance.inversionTotalCamadaUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            <div className="text-[10px] text-slate-500 font-normal">
                              ${balance.costoProduccionPorKgVendibleUsd.toFixed(2)}/kg
                            </div>
                          </td>

                          {/* Venta */}
                          <td className="py-3.5 px-4 text-purple-300 font-bold">
                            ${batch.montoTotalVentaUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            <div className="text-[10px] text-slate-500 font-normal">
                              ${batch.precioVentaPorKgUsd.toFixed(2)}/kg
                            </div>
                          </td>

                          {/* Utilidad Neta Real */}
                          <td className="py-3.5 px-4">
                            <span
                              className={`font-black text-sm ${
                                balance.utilidadNetaRealUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              ${balance.utilidadNetaRealUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                            <div className="text-[10px] text-slate-400">
                              Margen: {balance.margenRentabilidadVentasPorcentaje.toFixed(1)}%
                            </div>
                          </td>

                          {/* ROI % Real */}
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-xl font-black text-xs ${
                                balance.porcentajeGananciaRealROI >= 0
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              }`}
                            >
                              {balance.porcentajeGananciaRealROI.toFixed(2)}%
                            </span>
                          </td>

                          {/* Acciones */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* Botón Ver Estado de Resultados Individual */}
                              <button
                                onClick={() => {
                                  setSelectedBatchForPnL(batch);
                                  setShowPnLModal(true);
                                }}
                                title="Ver Estado de Resultados (P&L) Individual"
                                className="px-2 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-800 text-emerald-300 border border-emerald-700/50 text-[11px] font-sans font-bold transition min-h-[34px] flex items-center gap-1 cursor-pointer"
                              >
                                <Award className="w-3.5 h-3.5" />
                                <span>P&amp;L</span>
                              </button>

                              {/* Botón Descargar Acta PDF */}
                              <button
                                onClick={() => BatchExportService.exportSingleHistoricalBatchToPdf(batch, bcvRate)}
                                title="Descargar Acta de Balance Oficial en PDF"
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition min-w-[34px] min-h-[34px] flex items-center justify-center cursor-pointer"
                              >
                                <Printer className="w-3.5 h-3.5 text-purple-400" />
                              </button>

                              {/* Botón Descargar Acta Excel */}
                              <button
                                onClick={() => BatchExportService.exportSingleHistoricalBatchToExcel(batch, bcvRate)}
                                title="Descargar Acta de Balance en Excel"
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition min-w-[34px] min-h-[34px] flex items-center justify-center cursor-pointer"
                              >
                                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                              </button>

                              {/* Botón Editar (Solo Admin / SuperAdmin) */}
                              {isAdmin && (
                                <button
                                  onClick={() => {
                                    setEditingHistoricalBatch(batch);
                                    setShowHistoricalModal(true);
                                  }}
                                  title="Editar Lote Histórico"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition min-w-[34px] min-h-[34px] flex items-center justify-center cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Botón Eliminar (Exclusivo SuperAdmin) */}
                              {isSuperAdmin && (
                                <button
                                  onClick={() => handleDeleteHistoricalBatch(batch.id, batch.codigoLoteHistorico)}
                                  title="Eliminar Registro (SuperAdmin)"
                                  className="p-1.5 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-950/50 transition min-w-[34px] min-h-[34px] flex items-center justify-center cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
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
      )}

      {/* Historical Batch Modal (Fase 2) */}
      <HistoricalBatchModal
        isOpen={showHistoricalModal}
        onClose={() => {
          setShowHistoricalModal(false);
          setEditingHistoricalBatch(null);
        }}
        batchToEdit={editingHistoricalBatch}
        onSaved={() => {
          notify('Lote histórico persistido correctamente.', 'success');
        }}
        userId={userProfile?.uid || 'user'}
      />

      {/* Historical Batch P&L Modal (Fase 3) */}
      <HistoricalBatchPnLModal
        isOpen={showPnLModal}
        onClose={() => {
          setShowPnLModal(false);
          setSelectedBatchForPnL(null);
        }}
        batch={selectedBatchForPnL}
        bcvRate={bcvRate}
        onExportPdf={(b) => BatchExportService.exportSingleHistoricalBatchToPdf(b, bcvRate)}
        onExportExcel={(b) => BatchExportService.exportSingleHistoricalBatchToExcel(b, bcvRate)}
      />

      {/* Confirmation Modal for Historical Batch Deletion (Sandbox / AI Studio Iframe Safe) */}
      {historicalBatchToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Confirmar Eliminación</h3>
                <p className="text-xs text-slate-400">Acción auditable irreversible</p>
              </div>
            </div>
            <p className="text-sm text-slate-300">
              ¿Está seguro de eliminar permanentemente el registro del lote histórico <strong className="text-white font-mono">{historicalBatchToDelete.code}</strong>?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setHistoricalBatchToDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 transition text-sm font-semibold min-h-[44px] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteHistoricalBatch}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition text-sm font-semibold shadow-lg shadow-rose-900/40 min-h-[44px] cursor-pointer flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar Registro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
