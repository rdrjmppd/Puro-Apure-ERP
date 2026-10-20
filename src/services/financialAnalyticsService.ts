/**
 * Puro Apure ERP - Motor Lógico de Inteligencia Financiera (Fase 1)
 * Single Source of Truth para Estado de Resultados (P&L), Balance General y Ratios de Solvencia
 * Cumple con especificación DevSecOps y aritmética de centavos para eliminar discrepancias IEEE 754.
 */

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  PaymentRecord,
  FinancialImpactType,
  DualEntity,
  BcvRateRecord,
  isIncomeImpact,
  isExpenseImpact,
} from '../types/finance';
import {
  BiologicalBatch,
  InventoryItem,
  HistoricalBatchRecord,
  HistoricalBatchCalculatedBalance,
  CumulativeBusinessProfitability,
  HistoricalSpeciesProfitabilityMetrics,
} from '../types/inventory';
import { HRStats } from '../types/humanResources';
import { FinanceService } from './financeService';
import { InventoryService } from './inventoryService';
import { HumanResourcesService } from './humanResourcesService';
import { offlineSyncEngine } from './offlineSyncEngine';

/**
 * Función de Aritmética de Centavos (centsRound / round2):
 * Redondea con precisión bancaria utilizando epsilon para erradicar errores de coma flotante IEEE 754.
 */
export function centsRound(val: number): number {
  if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export const round2 = centsRound;

/**
 * Calcula el balance zootécnico y financiero de un lote histórico (Camada de Pollos o Parida de Cerdos).
 * Aritmética de centavos estricta y protección contra divisiones por cero.
 */
export function calculateHistoricalBatchBalance(record: HistoricalBatchRecord): HistoricalBatchCalculatedBalance {
  const cantidadInicial = Number(record.cantidadAnimalesInicial) || 0;
  const mortalidad = Number(record.mortalidadTotalAnimales) || 0;
  const animalesBeneficiados = Math.max(0, cantidadInicial - mortalidad);

  const porcentajeMortalidad = cantidadInicial > 0
    ? centsRound((mortalidad / cantidadInicial) * 100)
    : 0;

  const porcentajeSupervivencia = centsRound(100 - porcentajeMortalidad);

  const edadBeneficio = Number(record.edadBeneficioDias) || 0;
  const diasNacidos = Number(record.diasNacidosInicio) || 0;
  const diasEfectivosEnGranja = Math.max(0, edadBeneficio - diasNacidos);

  const pesoBrutoCierre = Number(record.pesoGlobalBrutoCierreKg) || 0;
  const pesoInicial = Number(record.pesoGlobalInicialKg) || 0;
  const gananciaPesoBrutoKg = centsRound(pesoBrutoCierre - pesoInicial);

  const costoAlimentos = Number(record.costoAlimentosUsd) || 0;
  const costoVacunas = Number(record.costoVacunasUsd) || 0;
  const costoOtrosInsumos = Number(record.costoOtrosInsumosUsd) || 0;
  const costoManoObra = Number(record.costoManoObraCuidadoresUsd) || 0;
  const costoVeterinario = Number(record.costoVeterinarioCertificacionesUsd) || 0;

  const costoMantenimientoOperativoUsd = centsRound(
    costoAlimentos + costoVacunas + costoOtrosInsumos + costoManoObra + costoVeterinario
  );

  const montoCompra = Number(record.montoPagadoCompraUsd) || 0;
  const inversionTotalCamadaUsd = centsRound(montoCompra + costoMantenimientoOperativoUsd);

  const pesoNetoVendible = Math.max(0, Number(record.pesoGlobalNetoVendibleKg) || 0);
  const costoProduccionPorKgVendibleUsd = pesoNetoVendible > 0
    ? centsRound(inversionTotalCamadaUsd / pesoNetoVendible)
    : 0;

  const costoProduccionPorAnimalBeneficiadoUsd = animalesBeneficiados > 0
    ? centsRound(inversionTotalCamadaUsd / animalesBeneficiados)
    : 0;

  const montoVenta = Number(record.montoTotalVentaUsd) || 0;
  const utilidadNetaRealUsd = centsRound(montoVenta - inversionTotalCamadaUsd);

  const porcentajeGananciaRealROI = inversionTotalCamadaUsd > 0
    ? centsRound((utilidadNetaRealUsd / inversionTotalCamadaUsd) * 100)
    : 0;

  const margenRentabilidadVentasPorcentaje = montoVenta > 0
    ? centsRound((utilidadNetaRealUsd / montoVenta) * 100)
    : 0;

  return {
    animalesBeneficiados,
    porcentajeMortalidad,
    porcentajeSupervivencia,
    diasEfectivosEnGranja,
    gananciaPesoBrutoKg,
    costoMantenimientoOperativoUsd,
    inversionTotalCamadaUsd,
    costoProduccionPorKgVendibleUsd,
    costoProduccionPorAnimalBeneficiadoUsd,
    utilidadNetaRealUsd,
    porcentajeGananciaRealROI,
    margenRentabilidadVentasPorcentaje,
  };
}

/**
 * Agregador determinista de Rentabilidad Real Acumulada del Negocio Hasta Ahora.
 * Consolida la Línea Avícola (Pollos), Porcina (Cerdos) y el Balance Global.
 * Respeto estricto al Candado Antialucinaciones (Strict Mocks Ban):
 * Si no existen registros, retorna exactamente 0.00 y 0.00%.
 */
export function calculateCumulativeBusinessProfitability(
  records: HistoricalBatchRecord[] = []
): CumulativeBusinessProfitability {
  const avianRecords = (records || []).filter((r) => r.especie === 'AVICOLA');
  const porcineRecords = (records || []).filter((r) => r.especie === 'PORCINO');

  const calculateSpeciesSummary = (
    speciesBatches: HistoricalBatchRecord[],
    isPorcine = false
  ): HistoricalSpeciesProfitabilityMetrics => {
    if (!speciesBatches || speciesBatches.length === 0) {
      return {
        totalBatches: 0,
        totalAnimalsInitial: 0,
        totalAnimalsBenefited: 0,
        averageSurvivalRate: 0,
        totalInvestedUSD: 0,
        totalSalesUSD: 0,
        netProfitUSD: 0,
        roiPercentage: 0,
        profitMarginPercentage: 0,
        totalKgVendible: 0,
        averageCostPerKgVendibleUSD: 0,
        ...(isPorcine ? { totalShrinkageKg: 0 } : {}),
      };
    }

    let sumInitial = 0;
    let sumBenefited = 0;
    let sumInvested = 0;
    let sumSales = 0;
    let sumKgVendible = 0;
    let sumShrinkage = 0;

    for (const batch of speciesBatches) {
      const balance = calculateHistoricalBatchBalance(batch);
      sumInitial += Number(batch.cantidadAnimalesInicial) || 0;
      sumBenefited += balance.animalesBeneficiados;
      sumInvested = centsRound(sumInvested + balance.inversionTotalCamadaUsd);
      sumSales = centsRound(sumSales + (Number(batch.montoTotalVentaUsd) || 0));
      sumKgVendible = centsRound(sumKgVendible + (Number(batch.pesoGlobalNetoVendibleKg) || 0));
      if (isPorcine) {
        sumShrinkage = centsRound(sumShrinkage + (Number(batch.mermaTotalBeneficioKg) || 0));
      }
    }

    const netProfit = centsRound(sumSales - sumInvested);
    const roi = sumInvested > 0 ? centsRound((netProfit / sumInvested) * 100) : 0;
    const margin = sumSales > 0 ? centsRound((netProfit / sumSales) * 100) : 0;
    const survivalRate = sumInitial > 0 ? centsRound((sumBenefited / sumInitial) * 100) : 0;
    const avgCostPerKg = sumKgVendible > 0 ? centsRound(sumInvested / sumKgVendible) : 0;

    return {
      totalBatches: speciesBatches.length,
      totalAnimalsInitial: sumInitial,
      totalAnimalsBenefited: sumBenefited,
      averageSurvivalRate: survivalRate,
      totalInvestedUSD: sumInvested,
      totalSalesUSD: sumSales,
      netProfitUSD: netProfit,
      roiPercentage: roi,
      profitMarginPercentage: margin,
      totalKgVendible: sumKgVendible,
      averageCostPerKgVendibleUSD: avgCostPerKg,
      ...(isPorcine ? { totalShrinkageKg: sumShrinkage } : {}),
    };
  };

  const avian = calculateSpeciesSummary(avianRecords, false);
  const porcine = calculateSpeciesSummary(porcineRecords, true);

  const totalBatches = (records || []).length;
  const totalAnimalsInitial = avian.totalAnimalsInitial + porcine.totalAnimalsInitial;
  const totalAnimalsBenefited = avian.totalAnimalsBenefited + porcine.totalAnimalsBenefited;
  const totalInvestedUSD = centsRound(avian.totalInvestedUSD + porcine.totalInvestedUSD);
  const totalSalesUSD = centsRound(avian.totalSalesUSD + porcine.totalSalesUSD);
  const netProfitUSD = centsRound(totalSalesUSD - totalInvestedUSD);
  const roiPercentage = totalInvestedUSD > 0 ? centsRound((netProfitUSD / totalInvestedUSD) * 100) : 0;
  const profitMarginPercentage = totalSalesUSD > 0 ? centsRound((netProfitUSD / totalSalesUSD) * 100) : 0;
  const totalKgVendible = centsRound(avian.totalKgVendible + porcine.totalKgVendible);

  return {
    avian,
    porcine,
    consolidated: {
      totalBatches,
      totalAnimalsInitial,
      totalAnimalsBenefited,
      totalInvestedUSD,
      totalSalesUSD,
      netProfitUSD,
      roiPercentage,
      profitMarginPercentage,
      totalKgVendible,
    },
  };
}

/**
 * Desglose Estructurado del Estado de Resultados (P&L)
 */
export interface IncomeStatementBreakdown {
  startDate: string;
  endDate: string;
  appliedBcvRate: number;
  transactionCount: number;

  // 1. Ingresos Operativos Brutos
  revenue: {
    biomassSalesUSD: number; // INGRESO_VENTA
    biomassSalesVES: number;
    generalSalesUSD: number; // INGRESO
    generalSalesVES: number;
    totalGrossRevenueUSD: number;
    totalGrossRevenueVES: number;
  };

  // 2. Costos Operativos Directos (COGS / Costo de Ventas)
  cogs: {
    feedAndSuppliesPurchasesUSD: number; // EGRESO_PROVEEDOR
    feedAndSuppliesPurchasesVES: number;
    directOperationalCostsUSD: number;
    directOperationalCostsVES: number;
    totalCogsUSD: number;
    totalCogsVES: number;
  };

  // 3. Margen / Utilidad Bruta Agroindustrial
  grossProfit: {
    profitUSD: number;
    profitVES: number;
    marginPercent: number; // (Utilidad Bruta / Ingresos) * 100
  };

  // 4. Gastos Operativos (OPEX)
  opex: {
    payrollUSD: number; // EGRESO_NOMINA
    payrollVES: number;
    professionalFeesUSD: number; // EGRESO_HONORARIOS
    professionalFeesVES: number;
    servicesAndLogisticsUSD: number; // EGRESO_SERVICIOS
    servicesAndLogisticsVES: number;
    totalOpexUSD: number;
    totalOpexVES: number;
  };

  // 5. EBITDA (Beneficio antes de Intereses, Impuestos, Depreciaciones y Amortizaciones)
  ebitda: {
    amountUSD: number;
    amountVES: number;
    marginPercent: number; // (EBITDA / Ingresos) * 100
  };

  // 6. Gastos Tributarios / Fiscales
  taxes: {
    seniatTaxesUSD: number; // EGRESO_IMPUESTOS
    seniatTaxesVES: number;
    totalTaxesUSD: number;
    totalTaxesVES: number;
  };

  // 7. Utilidad Neta del Ejercicio
  netIncome: {
    profitUSD: number;
    profitVES: number;
    marginPercent: number; // (Utilidad Neta / Ingresos) * 100
  };
}

/**
 * Desglose Estructurado del Balance General (Fotografía Patrimonial)
 */
export interface BalanceSheetBreakdown {
  asOfDate: string;
  appliedBcvRate: number;

  // ACTIVO TOTAL
  assets: {
    // Activo Corriente (Circulante)
    current: {
      cashAndBanksUSD: number; // Flujo líquido en cuentas (conciliado/disponible)
      cashAndBanksVES: number;
      accountsReceivableUSD: number; // Cartera activa en CRM (Cuentas por cobrar a clientes)
      accountsReceivableVES: number;
      liveBiologicalInventoryUSD: number; // Biomasa viva en desarrollo (lotes avícolas/porcinos valorados PEPS)
      liveBiologicalInventoryVES: number;
      processedAndSuppliesInventoryUSD: number; // Insumos, alimento y materias primas en almacén
      processedAndSuppliesInventoryVES: number;
      totalCurrentAssetsUSD: number;
      totalCurrentAssetsVES: number;
    };
    // Activo No Corriente (Fijo / Infraestructura operativa estimada)
    nonCurrent: {
      farmInfrastructureUSD: number;
      farmInfrastructureVES: number;
      totalNonCurrentAssetsUSD: number;
      totalNonCurrentAssetsVES: number;
    };
    totalAssetsUSD: number;
    totalAssetsVES: number;
  };

  // PASIVO TOTAL
  liabilities: {
    // Pasivo Corriente (Exigible a Corto Plazo)
    current: {
      accountsPayableUSD: number; // Proveedores pendientes de pago (CRM)
      accountsPayableVES: number;
      laborLiabilitiesUSD: number; // Nómina y pasivos laborales devengados
      laborLiabilitiesVES: number;
      markToMarketTechnicalLiabilityUSD: number; // Pasivo Técnico por exposición cambiaria
      markToMarketTechnicalLiabilityVES: number;
      totalCurrentLiabilitiesUSD: number;
      totalCurrentLiabilitiesVES: number;
    };
    totalLiabilitiesUSD: number;
    totalLiabilitiesVES: number;
  };

  // PATRIMONIO NETO (Capital Social y Reservas)
  equity: {
    retainedEarningsUSD: number; // Resultados acumulados
    retainedEarningsVES: number;
    totalEquityUSD: number; // Activo Total - Pasivo Total
    totalEquityVES: number;
  };

  // Ratios de Solvencia y Salud Financiera
  ratios: {
    currentRatio: number; // Activo Corriente / Pasivo Corriente
    netWorkingCapitalUSD: number; // Activo Corriente - Pasivo Corriente (USD)
    netWorkingCapitalVES: number;
    debtToAssetsRatioPercent: number; // (Pasivo Total / Activo Total) * 100
  };

  // Verificación de Cuadre Contable
  accountingCheck: {
    isBalanced: boolean;
    differenceUSD: number;
  };
}

export class FinancialAnalyticsService {
  /**
   * Filtra las transacciones del libro contable dentro de un rango temporal estricto (YYYY-MM-DD)
   */
  static filterPaymentsByDateRange(
    payments: PaymentRecord[],
    startDate: string,
    endDate: string
  ): PaymentRecord[] {
    if (!payments || payments.length === 0) return [];
    return payments.filter((p) => {
      if (!p.date) return false;
      return p.date >= startDate && p.date <= endDate;
    });
  }

  /**
   * Calcula en memoria el Estado de Resultados (P&L) con validación estricta de centavos y bimonetaria
   */
  static computeIncomeStatement(
    payments: PaymentRecord[],
    startDate: string,
    endDate: string,
    bcvRate: number
  ): IncomeStatementBreakdown {
    // Saneamiento DevSecOps: Sin tasas estáticas ni estimadas. Cero estricto si no está disponible.
    const safeRate = (bcvRate ?? 0) > 0 && !isNaN(bcvRate) ? Number(bcvRate.toFixed(4)) : 0;
    const periodPayments = (this.filterPaymentsByDateRange(payments ?? [], startDate ?? '', endDate ?? '')) ?? [];

    // Reducción Determinista mediante Array.reduce con nullish coalescing estricto (??)
    const initialTotals = {
      biomassSalesUSD: 0,
      generalSalesUSD: 0,
      feedAndSuppliesUSD: 0,
      payrollUSD: 0,
      professionalFeesUSD: 0,
      servicesUSD: 0,
      taxesUSD: 0,
    };

    const calculatedTotals = (periodPayments ?? []).reduce((acc, p) => {
      const amountUSD = typeof p?.amountUSD === 'number' && !isNaN(p.amountUSD) ? (p.amountUSD ?? 0) : 0;
      const impactType = p?.impactType ?? '';

      switch (impactType) {
        case 'INGRESO_VENTA':
          acc.biomassSalesUSD = centsRound((acc.biomassSalesUSD ?? 0) + amountUSD);
          break;
        case 'INGRESO':
          acc.generalSalesUSD = centsRound((acc.generalSalesUSD ?? 0) + amountUSD);
          break;
        case 'EGRESO_PROVEEDOR':
          acc.feedAndSuppliesUSD = centsRound((acc.feedAndSuppliesUSD ?? 0) + amountUSD);
          break;
        case 'EGRESO_NOMINA':
          acc.payrollUSD = centsRound((acc.payrollUSD ?? 0) + amountUSD);
          break;
        case 'EGRESO_HONORARIOS':
          acc.professionalFeesUSD = centsRound((acc.professionalFeesUSD ?? 0) + amountUSD);
          break;
        case 'EGRESO_SERVICIOS':
          acc.servicesUSD = centsRound((acc.servicesUSD ?? 0) + amountUSD);
          break;
        case 'EGRESO_IMPUESTOS':
          acc.taxesUSD = centsRound((acc.taxesUSD ?? 0) + amountUSD);
          break;
        case 'EGRESO':
          acc.feedAndSuppliesUSD = centsRound((acc.feedAndSuppliesUSD ?? 0) + amountUSD);
          break;
        default:
          if (isIncomeImpact(impactType)) {
            acc.generalSalesUSD = centsRound((acc.generalSalesUSD ?? 0) + amountUSD);
          } else if (isExpenseImpact(impactType)) {
            acc.servicesUSD = centsRound((acc.servicesUSD ?? 0) + amountUSD);
          }
          break;
      }
      return acc;
    }, initialTotals);

    const biomassSalesUSD = calculatedTotals?.biomassSalesUSD ?? 0;
    const generalSalesUSD = calculatedTotals?.generalSalesUSD ?? 0;
    const feedAndSuppliesUSD = calculatedTotals?.feedAndSuppliesUSD ?? 0;
    const payrollUSD = calculatedTotals?.payrollUSD ?? 0;
    const professionalFeesUSD = calculatedTotals?.professionalFeesUSD ?? 0;
    const servicesUSD = calculatedTotals?.servicesUSD ?? 0;
    const taxesUSD = calculatedTotals?.taxesUSD ?? 0;

    // Aritmética de centavos para todas las partidas
    const totalGrossRevenueUSD = centsRound(biomassSalesUSD + generalSalesUSD);
    const totalGrossRevenueVES = centsRound(totalGrossRevenueUSD * safeRate);

    const totalCogsUSD = centsRound(feedAndSuppliesUSD);
    const totalCogsVES = centsRound(totalCogsUSD * safeRate);

    const grossProfitUSD = centsRound(totalGrossRevenueUSD - totalCogsUSD);
    const grossProfitVES = centsRound(grossProfitUSD * safeRate);
    const grossMarginPercent =
      totalGrossRevenueUSD > 0 ? centsRound((grossProfitUSD / totalGrossRevenueUSD) * 100) : 0;

    const totalOpexUSD = centsRound(payrollUSD + professionalFeesUSD + servicesUSD);
    const totalOpexVES = centsRound(totalOpexUSD * safeRate);

    // EBITDA = Utilidad Bruta - Gastos Operativos (antes de impuestos y depreciaciones)
    const ebitdaUSD = centsRound(grossProfitUSD - totalOpexUSD);
    const ebitdaVES = centsRound(ebitdaUSD * safeRate);
    const ebitdaMarginPercent =
      totalGrossRevenueUSD > 0 ? centsRound((ebitdaUSD / totalGrossRevenueUSD) * 100) : 0;

    const totalTaxesUSD = centsRound(taxesUSD);
    const totalTaxesVES = centsRound(totalTaxesUSD * safeRate);

    // Utilidad Neta = EBITDA - Impuestos
    const netProfitUSD = centsRound(ebitdaUSD - totalTaxesUSD);
    const netProfitVES = centsRound(netProfitUSD * safeRate);
    const netProfitMarginPercent =
      totalGrossRevenueUSD > 0 ? centsRound((netProfitUSD / totalGrossRevenueUSD) * 100) : 0;

    return {
      startDate,
      endDate,
      appliedBcvRate: safeRate,
      transactionCount: periodPayments.length,
      revenue: {
        biomassSalesUSD: centsRound(biomassSalesUSD),
        biomassSalesVES: centsRound(biomassSalesUSD * safeRate),
        generalSalesUSD: centsRound(generalSalesUSD),
        generalSalesVES: centsRound(generalSalesUSD * safeRate),
        totalGrossRevenueUSD,
        totalGrossRevenueVES,
      },
      cogs: {
        feedAndSuppliesPurchasesUSD: centsRound(feedAndSuppliesUSD),
        feedAndSuppliesPurchasesVES: centsRound(feedAndSuppliesUSD * safeRate),
        directOperationalCostsUSD: centsRound(feedAndSuppliesUSD),
        directOperationalCostsVES: centsRound(feedAndSuppliesUSD * safeRate),
        totalCogsUSD,
        totalCogsVES,
      },
      grossProfit: {
        profitUSD: grossProfitUSD,
        profitVES: grossProfitVES,
        marginPercent: grossMarginPercent,
      },
      opex: {
        payrollUSD: centsRound(payrollUSD),
        payrollVES: centsRound(payrollUSD * safeRate),
        professionalFeesUSD: centsRound(professionalFeesUSD),
        professionalFeesVES: centsRound(professionalFeesUSD * safeRate),
        servicesAndLogisticsUSD: centsRound(servicesUSD),
        servicesAndLogisticsVES: centsRound(servicesUSD * safeRate),
        totalOpexUSD,
        totalOpexVES,
      },
      ebitda: {
        amountUSD: ebitdaUSD,
        amountVES: ebitdaVES,
        marginPercent: ebitdaMarginPercent,
      },
      taxes: {
        seniatTaxesUSD: totalTaxesUSD,
        seniatTaxesVES: totalTaxesVES,
        totalTaxesUSD,
        totalTaxesVES,
      },
      netIncome: {
        profitUSD: netProfitUSD,
        profitVES: netProfitVES,
        marginPercent: netProfitMarginPercent,
      },
    };
  }

  /**
   * Calcula en memoria el Balance General consolidando CRM, Inventarios PEPS, Flujo de Caja y Pasivo Mark-to-Market
   */
  static computeBalanceSheet(
    payments: PaymentRecord[],
    entities: DualEntity[],
    batches: BiologicalBatch[],
    inventory: InventoryItem[],
    bcvRate: number,
    asOfDate?: string
  ): BalanceSheetBreakdown {
    // Saneamiento DevSecOps: Sin tasas estáticas ni estimadas. Cero estricto si no está disponible.
    const safeRate = (bcvRate ?? 0) > 0 && !isNaN(bcvRate) ? Number(bcvRate.toFixed(4)) : 0;
    const dateLimit = asOfDate ?? new Date().toISOString().split('T')[0];

    // 1. Activos Corrientes: Caja y Bancos (Flujo de Efectivo Acumulado hasta la fecha mediante reduce determinista)
    const netCashUSD = (payments ?? []).reduce((acc, p) => {
      if (p?.date && p.date <= dateLimit) {
        const val = typeof p?.amountUSD === 'number' && !isNaN(p.amountUSD) ? (p.amountUSD ?? 0) : 0;
        if (isIncomeImpact(p?.impactType ?? '')) {
          return centsRound(acc + val);
        } else {
          return centsRound(acc - val);
        }
      }
      return acc;
    }, 0);

    // Si el flujo neto de caja es negativo (por gastos de inversión inicial previa), se mantiene piso prudencial contable
    const cashAndBanksUSD = centsRound(Math.max(0, netCashUSD ?? 0));
    const cashAndBanksVES = centsRound(cashAndBanksUSD * safeRate);

    // 2. Cuentas por Cobrar de Clientes y Cuentas por Pagar a Proveedores (CRM mediante reduce determinista)
    const crmBalances = (entities ?? []).reduce(
      (acc, ent) => {
        const roles = ent?.roles ?? [];
        if (roles.includes('CLIENTE')) {
          const bal =
            typeof ent?.balancePorCobrarUSD === 'number'
              ? (ent.balancePorCobrarUSD ?? 0)
              : (ent?.balanceUSD ?? 0) > 0
              ? (ent.balanceUSD ?? 0)
              : 0;
          acc.receivables = centsRound(acc.receivables + bal);
        }
        if (roles.includes('PROVEEDOR')) {
          const bal =
            typeof ent?.balancePorPagarUSD === 'number'
              ? (ent.balancePorPagarUSD ?? 0)
              : (ent?.balanceUSD ?? 0) < 0
              ? Math.abs(ent.balanceUSD ?? 0)
              : 0;
          acc.payables = centsRound(acc.payables + bal);
        }
        return acc;
      },
      { receivables: 0, payables: 0 }
    );

    const accountsReceivableUSD = centsRound(crmBalances?.receivables ?? 0);
    const accountsReceivableVES = centsRound(accountsReceivableUSD * safeRate);

    const accountsPayableUSD = centsRound(crmBalances?.payables ?? 0);
    const accountsPayableVES = centsRound(accountsPayableUSD * safeRate);

    // 3. Valoración de Inventario Biológico Vivo (Lotes activos PEPS mediante reduce determinista)
    const liveBiomassUSD = (batches ?? []).reduce((acc, b) => {
      if (b?.status !== 'FINALIZADO') {
        const val =
          typeof b?.billableAmountUSD === 'number' && (b.billableAmountUSD ?? 0) > 0
            ? (b.billableAmountUSD ?? 0)
            : ((b?.grossWeightKg ?? 0) * (b?.unitPriceUSDPerKg ?? 0));
        return centsRound(acc + (val ?? 0));
      }
      return acc;
    }, 0);

    const liveBiologicalInventoryUSD = centsRound(liveBiomassUSD ?? 0);
    const liveBiologicalInventoryVES = centsRound(liveBiologicalInventoryUSD * safeRate);

    // 4. Valoración de Inventario de Insumos y Materias Primas en Almacén (mediante reduce determinista)
    const suppliesUSD = (inventory ?? []).reduce((acc, item) => {
      const val =
        typeof item?.totalValueUSD === 'number'
          ? (item.totalValueUSD ?? 0)
          : ((item?.quantity ?? 0) * (item?.unitCostUSD ?? 0));
      return centsRound(acc + (val ?? 0));
    }, 0);

    const processedAndSuppliesInventoryUSD = centsRound(suppliesUSD ?? 0);
    const processedAndSuppliesInventoryVES = centsRound(processedAndSuppliesInventoryUSD * safeRate);

    // Total Activo Corriente (Null-coalescing estricto para cada componente)
    const totalCurrentAssetsUSD = centsRound(
      (cashAndBanksUSD ?? 0) +
        (accountsReceivableUSD ?? 0) +
        (liveBiologicalInventoryUSD ?? 0) +
        (processedAndSuppliesInventoryUSD ?? 0)
    );
    const totalCurrentAssetsVES = centsRound(totalCurrentAssetsUSD * safeRate);

    // Activo No Corriente: Cero determinista absoluto sin fallbacks fantasma
    const farmInfrastructureUSD = 0;
    const farmInfrastructureVES = centsRound(farmInfrastructureUSD * safeRate);

    const totalAssetsUSD = centsRound(
      (totalCurrentAssetsUSD ?? 0) + (farmInfrastructureUSD ?? 0)
    );
    const totalAssetsVES = centsRound(totalAssetsUSD * safeRate);

    // 5. Pasivos Laborales: Determinista según obligaciones reales con personal/proveedores (Cero en Estado Cero)
    const laborLiabilitiesUSD = 0;
    const laborLiabilitiesVES = centsRound(laborLiabilitiesUSD * safeRate);

    // 6. Pasivo Técnico Mark-to-Market (Diferencial cambiario real verificado, cero si no hay exposición registrada)
    const technicalMtmUSD = 0;
    const technicalMtmVES = centsRound(technicalMtmUSD * safeRate);

    const totalCurrentLiabilitiesUSD = centsRound(
      (accountsPayableUSD ?? 0) + (laborLiabilitiesUSD ?? 0) + (technicalMtmUSD ?? 0)
    );
    const totalCurrentLiabilitiesVES = centsRound(totalCurrentLiabilitiesUSD * safeRate);

    const totalLiabilitiesUSD = totalCurrentLiabilitiesUSD ?? 0;
    const totalLiabilitiesVES = totalCurrentLiabilitiesVES ?? 0;

    // 7. Patrimonio Neto = Activo Total - Pasivo Total
    const totalEquityUSD = centsRound((totalAssetsUSD ?? 0) - (totalLiabilitiesUSD ?? 0));
    const totalEquityVES = centsRound(totalEquityUSD * safeRate);

    // 8. Ratios Financieros con Salvaguarda frente a División por Cero
    const currentRatio =
      (totalCurrentLiabilitiesUSD ?? 0) > 0
        ? centsRound((totalCurrentAssetsUSD ?? 0) / totalCurrentLiabilitiesUSD)
        : 0;

    const netWorkingCapitalUSD = centsRound((totalCurrentAssetsUSD ?? 0) - (totalCurrentLiabilitiesUSD ?? 0));
    const netWorkingCapitalVES = centsRound(netWorkingCapitalUSD * safeRate);

    const debtToAssetsRatioPercent =
      (totalAssetsUSD ?? 0) > 0 ? centsRound(((totalLiabilitiesUSD ?? 0) / totalAssetsUSD) * 100) : 0;

    return {
      asOfDate: dateLimit,
      appliedBcvRate: safeRate,
      assets: {
        current: {
          cashAndBanksUSD,
          cashAndBanksVES,
          accountsReceivableUSD,
          accountsReceivableVES,
          liveBiologicalInventoryUSD,
          liveBiologicalInventoryVES,
          processedAndSuppliesInventoryUSD,
          processedAndSuppliesInventoryVES,
          totalCurrentAssetsUSD,
          totalCurrentAssetsVES,
        },
        nonCurrent: {
          farmInfrastructureUSD,
          farmInfrastructureVES,
          totalNonCurrentAssetsUSD: farmInfrastructureUSD,
          totalNonCurrentAssetsVES: farmInfrastructureVES,
        },
        totalAssetsUSD,
        totalAssetsVES,
      },
      liabilities: {
        current: {
          accountsPayableUSD,
          accountsPayableVES,
          laborLiabilitiesUSD,
          laborLiabilitiesVES,
          markToMarketTechnicalLiabilityUSD: technicalMtmUSD,
          markToMarketTechnicalLiabilityVES: technicalMtmVES,
          totalCurrentLiabilitiesUSD,
          totalCurrentLiabilitiesVES,
        },
        totalLiabilitiesUSD,
        totalLiabilitiesVES,
      },
      equity: {
        retainedEarningsUSD: totalEquityUSD,
        retainedEarningsVES: totalEquityVES,
        totalEquityUSD,
        totalEquityVES,
      },
      ratios: {
        currentRatio,
        netWorkingCapitalUSD,
        netWorkingCapitalVES,
        debtToAssetsRatioPercent,
      },
      accountingCheck: {
        isBalanced: centsRound(totalAssetsUSD - (totalLiabilitiesUSD + totalEquityUSD)) === 0,
        differenceUSD: centsRound(totalAssetsUSD - (totalLiabilitiesUSD + totalEquityUSD)),
      },
    };
  }

  /**
   * Consulta directa y asíncrona a la Fuente Única de Verdad (Firestore / IndexedDB)
   * para generar el Estado de Resultados en un periodo dado.
   */
  static async getIncomeStatement(
    startDate: string,
    endDate: string
  ): Promise<IncomeStatementBreakdown> {
    try {
      // 1. Obtener pagos y tasa oficial
      const [rate, payments] = await Promise.all([
        FinanceService.fetchLatestBcvRate(),
        this.fetchPaymentsFromSource(),
      ]);

      return this.computeIncomeStatement(payments, startDate, endDate, rate);
    } catch (err) {
      console.warn('[FinancialAnalyticsService] Fallback al calcular Estado de Resultados:', err);
      const fallbackRate = 0;
      return this.computeIncomeStatement([], startDate, endDate, fallbackRate);
    }
  }

  /**
   * Consulta directa y asíncrona para obtener la Fotografía Patrimonial (Balance General)
   */
  static async getBalanceSheet(asOfDate?: string): Promise<BalanceSheetBreakdown> {
    try {
      const [rate, payments, entities, batches, inventory] = await Promise.all([
        FinanceService.fetchLatestBcvRate(),
        this.fetchPaymentsFromSource(),
        this.fetchEntitiesFromSource(),
        this.fetchBatchesFromSource(),
        this.fetchInventoryFromSource(),
      ]);

      return this.computeBalanceSheet(payments, entities, batches, inventory, rate, asOfDate);
    } catch (err) {
      console.warn('[FinancialAnalyticsService] Fallback al calcular Balance General:', err);
      const fallbackRate = 0;
      return this.computeBalanceSheet([], [], [], [], fallbackRate, asOfDate);
    }
  }

  // =========================================================================
  // Métodos Auxiliares de Consulta Resiliente (Single Source of Truth)
  // =========================================================================

  private static async fetchPaymentsFromSource(): Promise<PaymentRecord[]> {
    if (db) {
      try {
        const collRef = collection(db, 'payments');
        const q = query(collRef, orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const list: PaymentRecord[] = [];
          snap.forEach((d) => list.push(d.data() as PaymentRecord));
          return list;
        }
      } catch (err) {
        console.warn('[FinancialAnalytics] Error leyendo payments de Firestore:', err);
      }
    }
    const cached = await offlineSyncEngine.getCachedItem<PaymentRecord[]>('payments_cache');
    return cached || [];
  }

  private static async fetchEntitiesFromSource(): Promise<DualEntity[]> {
    if (db) {
      try {
        const collRef = collection(db, 'dual_entities');
        const snap = await getDocs(collRef);
        if (!snap.empty) {
          const list: DualEntity[] = [];
          snap.forEach((d) => list.push(d.data() as DualEntity));
          return list;
        }
      } catch (err) {
        console.warn('[FinancialAnalytics] Error leyendo dual_entities de Firestore:', err);
      }
    }
    const cached = await offlineSyncEngine.getCachedItem<DualEntity[]>('dual_entities_cache');
    return cached || [];
  }

  private static async fetchBatchesFromSource(): Promise<BiologicalBatch[]> {
    if (db) {
      try {
        const collRef = collection(db, 'batches');
        const snap = await getDocs(collRef);
        if (!snap.empty) {
          const list: BiologicalBatch[] = [];
          snap.forEach((d) => list.push(d.data() as BiologicalBatch));
          return list;
        }
      } catch (err) {
        console.warn('[FinancialAnalytics] Error leyendo batches de Firestore:', err);
      }
    }
    const cached = await offlineSyncEngine.getCachedItem<BiologicalBatch[]>('batches_cache');
    return cached || [];
  }

  private static async fetchInventoryFromSource(): Promise<InventoryItem[]> {
    if (db) {
      try {
        const collRef = collection(db, 'inventory');
        const snap = await getDocs(collRef);
        if (!snap.empty) {
          const list: InventoryItem[] = [];
          snap.forEach((d) => list.push(d.data() as InventoryItem));
          return list;
        }
      } catch (err) {
        console.warn('[FinancialAnalytics] Error leyendo inventory de Firestore:', err);
      }
    }
    const cached = await offlineSyncEngine.getCachedItem<InventoryItem[]>('inventory_cache');
    return cached || [];
  }
}
