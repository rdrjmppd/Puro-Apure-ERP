/**
 * Puro Apure ERP - Motor de Exportación Corporativa de Inteligencia Financiera (Fase 3)
 * Genera documentos PDF y hojas de cálculo Excel estructuradas con el membrete oficial
 * inmutable de Agropecuaria Puro Apure, C.A., utilizando el patrón de Descarga Directa (Blob & Anchor).
 */

import { IncomeStatementBreakdown, BalanceSheetBreakdown } from '../services/financialAnalyticsService';
import {
  generateCorporatePdfHtml,
  triggerDirectBlobDownload,
  escapeHtml,
} from './pdfTemplateEngine';
import {
  generateCorporateExcelXml,
  ExcelWorksheetDef,
  ExcelRowDef,
} from './excelTemplateEngine';
import { CORPORATE_HEADER_CONFIG, getDocumentBrandingLogo } from './documentAssets';

export interface FinancialExportPayload {
  reportTitle?: string;
  periodText: string;
  startDate: string;
  endDate: string;
  bcvRate: number;
  incomeStatement: IncomeStatementBreakdown;
  balanceSheet: BalanceSheetBreakdown;
}

/**
 * Genera el documento PDF oficial imprimible del Estado de Resultados y Balance General
 */
export function generateCorporateFinancialPDF(payload: FinancialExportPayload): {
  filename: string;
  blob: Blob;
  htmlContent: string;
} {
  const { periodText, startDate, endDate, bcvRate, incomeStatement, balanceSheet } = payload;
  const folio = `FIN-${startDate.replace(/-/g, '')}-${endDate.replace(/-/g, '')}`;
  const filename = `PuroApure_Inteligencia_Financiera_${startDate}_al_${endDate}.html`;

  // 1. Tabla HTML del Estado de Resultados (P&L)
  const zeroPlNotice = incomeStatement.transactionCount === 0 ? `
    <div style="background-color: #FFFBEB; border: 1px solid #FCD34D; color: #92400E; padding: 6px 12px; border-radius: 4px; font-size: 8.5pt; margin-bottom: 10px; font-family: sans-serif;">
      <strong>Sin actividad operativa registrada en el período:</strong> No se identificaron transacciones contables en el rango seleccionado. Todas las partidas operativas se emiten en $0.00 / Bs. 0,00 de manera determinista.
    </div>
  ` : '';

  const plTableHtml = `
    <div style="margin-top: 15px; margin-bottom: 25px;">
      <h3 style="font-size: 13pt; color: ${CORPORATE_HEADER_CONFIG.colors.primary}; margin-bottom: 8px; border-bottom: 2px solid ${CORPORATE_HEADER_CONFIG.colors.primary}; padding-bottom: 4px;">
        1. ESTADO DE RESULTADOS OPERATIVO (P&L) • PERÍODO: ${escapeHtml(periodText)}
      </h3>
      ${zeroPlNotice}
      <table style="width: 100%; border-collapse: collapse; font-size: 9.5pt; font-family: sans-serif;">
        <thead>
          <tr style="background-color: #0F172A; color: #FFFFFF; font-family: monospace; font-size: 8.5pt;">
            <th style="padding: 8px 10px; text-align: left;">CONCEPTO / PARTIDA CONTABLE</th>
            <th style="padding: 8px 10px; text-align: right;">MONTO (USD)</th>
            <th style="padding: 8px 10px; text-align: right;">EQUIVALENTE OFICIAL (VES)</th>
            <th style="padding: 8px 10px; text-align: right;">% INGRESOS</th>
          </tr>
        </thead>
        <tbody>
          <!-- Ingresos -->
          <tr style="background-color: #ECFDF5; font-weight: bold; border-bottom: 1px solid #CBD5E1;">
            <td style="padding: 7px 10px; color: #065F46;">INGRESOS BRUTOS OPERATIVOS</td>
            <td style="padding: 7px 10px; text-align: right; font-family: monospace; color: #065F46;">$${incomeStatement.revenue.totalGrossRevenueUSD.toFixed(2)}</td>
            <td style="padding: 7px 10px; text-align: right; font-family: monospace;">Bs. ${incomeStatement.revenue.totalGrossRevenueVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="padding: 7px 10px; text-align: right;">100.00%</td>
          </tr>
          <tr style="border-bottom: 1px solid #E2E8F0;">
            <td style="padding: 5px 10px 5px 25px; color: #475569;">↳ Ventas de Biomasa Ganadera (Pollo / Cerdos)</td>
            <td style="padding: 5px 10px; text-align: right; font-family: monospace;">$${incomeStatement.revenue.biomassSalesUSD.toFixed(2)}</td>
            <td style="padding: 5px 10px; text-align: right; font-family: monospace;">Bs. ${incomeStatement.revenue.biomassSalesVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="padding: 5px 10px; text-align: right; color: #64748B;">${incomeStatement.revenue.totalGrossRevenueUSD > 0 ? ((incomeStatement.revenue.biomassSalesUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2) : '0.00'}%</td>
          </tr>
          <tr style="border-bottom: 1px solid #E2E8F0;">
            <td style="padding: 5px 10px 5px 25px; color: #475569;">↳ Otros Ingresos Operativos</td>
            <td style="padding: 5px 10px; text-align: right; font-family: monospace;">$${incomeStatement.revenue.generalSalesUSD.toFixed(2)}</td>
            <td style="padding: 5px 10px; text-align: right; font-family: monospace;">Bs. ${incomeStatement.revenue.generalSalesVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="padding: 5px 10px; text-align: right; color: #64748B;">${incomeStatement.revenue.totalGrossRevenueUSD > 0 ? ((incomeStatement.revenue.generalSalesUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2) : '0.00'}%</td>
          </tr>

          <!-- Costos -->
          <tr style="background-color: #FFF1F2; font-weight: bold; border-bottom: 1px solid #CBD5E1;">
            <td style="padding: 7px 10px; color: #9F1239;">(-) COSTOS OPERATIVOS DIRECTOS (COGS)</td>
            <td style="padding: 7px 10px; text-align: right; font-family: monospace; color: #9F1239;">$${incomeStatement.cogs.totalCogsUSD.toFixed(2)}</td>
            <td style="padding: 7px 10px; text-align: right; font-family: monospace;">Bs. ${incomeStatement.cogs.totalCogsVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="padding: 7px 10px; text-align: right;">${incomeStatement.revenue.totalGrossRevenueUSD > 0 ? ((incomeStatement.cogs.totalCogsUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2) : '0.00'}%</td>
          </tr>

          <!-- Margen Bruto -->
          <tr style="background-color: #F8FAFC; font-weight: bold; border-top: 1px solid #94A3B8; border-bottom: 1px solid #94A3B8;">
            <td style="padding: 7px 10px; color: #0F172A;">MARGEN BRUTO AGROINDUSTRIAL</td>
            <td style="padding: 7px 10px; text-align: right; font-family: monospace; color: #0F172A;">$${incomeStatement.grossProfit.profitUSD.toFixed(2)}</td>
            <td style="padding: 7px 10px; text-align: right; font-family: monospace;">Bs. ${incomeStatement.grossProfit.profitVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="padding: 7px 10px; text-align: right; color: #065F46;">${incomeStatement.grossProfit.marginPercent}%</td>
          </tr>

          <!-- OPEX -->
          <tr style="background-color: #FEF3C7; font-weight: bold; border-bottom: 1px solid #CBD5E1;">
            <td style="padding: 7px 10px; color: #92400E;">(-) GASTOS OPERATIVOS (OPEX)</td>
            <td style="padding: 7px 10px; text-align: right; font-family: monospace; color: #92400E;">$${incomeStatement.opex.totalOpexUSD.toFixed(2)}</td>
            <td style="padding: 7px 10px; text-align: right; font-family: monospace;">Bs. ${incomeStatement.opex.totalOpexVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="padding: 7px 10px; text-align: right;">${incomeStatement.revenue.totalGrossRevenueUSD > 0 ? ((incomeStatement.opex.totalOpexUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2) : '0.00'}%</td>
          </tr>
          <tr style="border-bottom: 1px solid #E2E8F0;">
            <td style="padding: 5px 10px 5px 25px; color: #475569;">↳ Nómina Fija de Galponeros y Obreros</td>
            <td style="padding: 5px 10px; text-align: right; font-family: monospace;">$${incomeStatement.opex.payrollUSD.toFixed(2)}</td>
            <td style="padding: 5px 10px; text-align: right; font-family: monospace;">Bs. ${incomeStatement.opex.payrollVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="padding: 5px 10px; text-align: right; color: #64748B;">${incomeStatement.revenue.totalGrossRevenueUSD > 0 ? ((incomeStatement.opex.payrollUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2) : '0.00'}%</td>
          </tr>
          <tr style="border-bottom: 1px solid #E2E8F0;">
            <td style="padding: 5px 10px 5px 25px; color: #475569;">↳ Honorarios Profesionales y Veterinarios</td>
            <td style="padding: 5px 10px; text-align: right; font-family: monospace;">$${incomeStatement.opex.professionalFeesUSD.toFixed(2)}</td>
            <td style="padding: 5px 10px; text-align: right; font-family: monospace;">Bs. ${incomeStatement.opex.professionalFeesVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="padding: 5px 10px; text-align: right; color: #64748B;">${incomeStatement.revenue.totalGrossRevenueUSD > 0 ? ((incomeStatement.opex.professionalFeesUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2) : '0.00'}%</td>
          </tr>
          <tr style="border-bottom: 1px solid #E2E8F0;">
            <td style="padding: 5px 10px 5px 25px; color: #475569;">↳ Fletes, Servicios Operativos y Mantenimiento</td>
            <td style="padding: 5px 10px; text-align: right; font-family: monospace;">$${incomeStatement.opex.servicesAndLogisticsUSD.toFixed(2)}</td>
            <td style="padding: 5px 10px; text-align: right; font-family: monospace;">Bs. ${incomeStatement.opex.servicesAndLogisticsVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="padding: 5px 10px; text-align: right; color: #64748B;">${incomeStatement.revenue.totalGrossRevenueUSD > 0 ? ((incomeStatement.opex.servicesAndLogisticsUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2) : '0.00'}%</td>
          </tr>

          <!-- EBITDA -->
          <tr style="background-color: #E0F2FE; font-weight: bold; border-top: 1px solid #0284C7; border-bottom: 1px solid #0284C7;">
            <td style="padding: 7px 10px; color: #0369A1;">EBITDA (Flujo de Caja Operativo Bruto)</td>
            <td style="padding: 7px 10px; text-align: right; font-family: monospace; color: #0369A1;">$${incomeStatement.ebitda.amountUSD.toFixed(2)}</td>
            <td style="padding: 7px 10px; text-align: right; font-family: monospace;">Bs. ${incomeStatement.ebitda.amountVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="padding: 7px 10px; text-align: right; color: #0369A1;">${incomeStatement.ebitda.marginPercent}%</td>
          </tr>

          <!-- Impuestos -->
          <tr style="border-bottom: 1px solid #E2E8F0;">
            <td style="padding: 5px 10px 5px 25px; color: #64748B;">(-) Cargas Tributarias / Impuestos SENIAT</td>
            <td style="padding: 5px 10px; text-align: right; font-family: monospace; color: #9F1239;">$${incomeStatement.taxes.totalTaxesUSD.toFixed(2)}</td>
            <td style="padding: 5px 10px; text-align: right; font-family: monospace;">Bs. ${incomeStatement.taxes.totalTaxesVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="padding: 5px 10px; text-align: right; color: #64748B;">${incomeStatement.revenue.totalGrossRevenueUSD > 0 ? ((incomeStatement.taxes.totalTaxesUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2) : '0.00'}%</td>
          </tr>

          <!-- Utilidad Neta -->
          <tr style="background-color: #065F46; color: #FFFFFF; font-weight: bold; font-size: 10pt; border-top: 2px solid #047857;">
            <td style="padding: 9px 10px;">UTILIDAD NETA DEL EJERCICIO</td>
            <td style="padding: 9px 10px; text-align: right; font-family: monospace;">$${incomeStatement.netIncome.profitUSD.toFixed(2)} USD</td>
            <td style="padding: 9px 10px; text-align: right; font-family: monospace;">Bs. ${incomeStatement.netIncome.profitVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="padding: 9px 10px; text-align: right;">${incomeStatement.netIncome.marginPercent}%</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  // 2. Tabla HTML del Balance General
  const zeroBalanceNotice = (balanceSheet.assets.totalAssetsUSD === 0 && balanceSheet.liabilities.totalLiabilitiesUSD === 0) ? `
    <div style="background-color: #F0F9FF; border: 1px solid #BAE6FD; color: #0369A1; padding: 6px 12px; border-radius: 4px; font-size: 8.5pt; margin-bottom: 10px; font-family: sans-serif;">
      <strong>Sin balances patrimoniales acumulados:</strong> No se registran activos ni pasivos al corte seleccionado. La estructura de balance se presenta en estado base ($0.00 / Bs. 0,00).
    </div>
  ` : '';

  const balanceTableHtml = `
    <div style="margin-top: 20px; margin-bottom: 25px;">
      <h3 style="font-size: 13pt; color: ${CORPORATE_HEADER_CONFIG.colors.primary}; margin-bottom: 8px; border-bottom: 2px solid ${CORPORATE_HEADER_CONFIG.colors.primary}; padding-bottom: 4px;">
        2. BALANCE GENERAL (FOTOGRAFÍA PATRIMONIAL) • CORTE AL ${escapeHtml(endDate)}
      </h3>
      ${zeroBalanceNotice}
      <table style="width: 100%; border-collapse: collapse; font-size: 9.5pt; font-family: sans-serif;">
        <thead>
          <tr style="background-color: #0F172A; color: #FFFFFF; font-family: monospace; font-size: 8.5pt;">
            <th style="padding: 8px 10px; text-align: left; width: 50%;">RECURSOS (ACTIVO TOTAL)</th>
            <th style="padding: 8px 10px; text-align: left; width: 50%;">OBLIGACIONES (PASIVO Y PATRIMONIO)</th>
          </tr>
        </thead>
        <tbody>
          <tr style="vertical-align: top;">
            <!-- Columna Izquierda: Activos -->
            <td style="padding: 10px; border-right: 1px solid #CBD5E1; background-color: #F8FAFC;">
              <div style="font-weight: bold; color: #065F46; margin-bottom: 6px; border-bottom: 1px solid #CBD5E1; padding-bottom: 3px;">
                ACTIVO CORRIENTE (CIRCULANTE)
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-family: monospace; font-size: 9pt;">
                <span>↳ Efectivo en Caja y Bancos:</span>
                <b>$${balanceSheet.assets.current.cashAndBanksUSD.toFixed(2)}</b>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-family: monospace; font-size: 9pt;">
                <span>↳ Cuentas por Cobrar Clientes (CRM):</span>
                <b>$${balanceSheet.assets.current.accountsReceivableUSD.toFixed(2)}</b>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-family: monospace; font-size: 9pt;">
                <span>↳ Biomasa Ganadera Viva (PEPS):</span>
                <b>$${balanceSheet.assets.current.liveBiologicalInventoryUSD.toFixed(2)}</b>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-family: monospace; font-size: 9pt;">
                <span>↳ Inventario de Alimento e Insumos:</span>
                <b>$${balanceSheet.assets.current.processedAndSuppliesInventoryUSD.toFixed(2)}</b>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 4px 6px; background-color: #E2E8F0; font-weight: bold; font-family: monospace; font-size: 9pt; border-radius: 4px;">
                <span>Subtotal Activo Corriente:</span>
                <span>$${balanceSheet.assets.current.totalCurrentAssetsUSD.toFixed(2)} USD</span>
              </div>

              <div style="font-weight: bold; color: #065F46; margin-top: 12px; margin-bottom: 6px; border-bottom: 1px solid #CBD5E1; padding-bottom: 3px;">
                ACTIVO NO CORRIENTE (FIJO)
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-family: monospace; font-size: 9pt;">
                <span>↳ Infraestructura y Equipamiento de Campo:</span>
                <b>$${balanceSheet.assets.nonCurrent.farmInfrastructureUSD.toFixed(2)}</b>
              </div>

              <div style="display: flex; justify-content: space-between; padding: 6px 8px; background-color: #065F46; color: #FFFFFF; font-weight: bold; font-family: monospace; font-size: 10pt; border-radius: 4px; margin-top: 15px;">
                <span>TOTAL ACTIVO:</span>
                <span>$${balanceSheet.assets.totalAssetsUSD.toFixed(2)} USD</span>
              </div>
            </td>

            <!-- Columna Derecha: Pasivos y Patrimonio -->
            <td style="padding: 10px; background-color: #F8FAFC;">
              <div style="font-weight: bold; color: #9F1239; margin-bottom: 6px; border-bottom: 1px solid #CBD5E1; padding-bottom: 3px;">
                PASIVO CORRIENTE (A CORTO PLAZO)
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-family: monospace; font-size: 9pt;">
                <span>↳ Cuentas por Pagar Proveedores:</span>
                <b>$${balanceSheet.liabilities.current.accountsPayableUSD.toFixed(2)}</b>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-family: monospace; font-size: 9pt;">
                <span>↳ Pasivos Laborales Devengados:</span>
                <b>$${balanceSheet.liabilities.current.laborLiabilitiesUSD.toFixed(2)}</b>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-family: monospace; font-size: 9pt;">
                <span>↳ Pasivo Técnico MTM (Diferencial VES):</span>
                <b>$${balanceSheet.liabilities.current.markToMarketTechnicalLiabilityUSD.toFixed(2)}</b>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 4px 6px; background-color: #FEE2E2; color: #9F1239; font-weight: bold; font-family: monospace; font-size: 9pt; border-radius: 4px;">
                <span>Subtotal Pasivo Corriente:</span>
                <span>$${balanceSheet.liabilities.totalLiabilitiesUSD.toFixed(2)} USD</span>
              </div>

              <div style="font-weight: bold; color: #0284C7; margin-top: 12px; margin-bottom: 6px; border-bottom: 1px solid #CBD5E1; padding-bottom: 3px;">
                PATRIMONIO NETO (CAPITAL Y RESERVAS)
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-family: monospace; font-size: 9pt;">
                <span>↳ Resultados y Reservas Acumuladas:</span>
                <b>$${balanceSheet.equity.retainedEarningsUSD.toFixed(2)}</b>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 4px 6px; background-color: #E0F2FE; color: #0369A1; font-weight: bold; font-family: monospace; font-size: 9pt; border-radius: 4px;">
                <span>Subtotal Patrimonio Neto:</span>
                <span>$${balanceSheet.equity.totalEquityUSD.toFixed(2)} USD</span>
              </div>

              <div style="display: flex; justify-content: space-between; padding: 6px 8px; background-color: #0F172A; color: #FFFFFF; font-weight: bold; font-family: monospace; font-size: 10pt; border-radius: 4px; margin-top: 15px;">
                <span>TOTAL PASIVO + PATRIMONIO:</span>
                <span>$${(balanceSheet.liabilities.totalLiabilitiesUSD + balanceSheet.equity.totalEquityUSD).toFixed(2)} USD</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  // Construcción del documento corporativo
  const htmlContent = generateCorporatePdfHtml({
    documentTitle: 'Reporte Consolidado de Inteligencia Financiera',
    documentSubtitle: `Estado de Resultados y Balance General • ${periodText}`,
    documentFolio: folio,
    periodRange: periodText,
    bcvRate,
    kpis: [
      {
        title: 'Ingresos Brutos',
        value: `$${incomeStatement.revenue.totalGrossRevenueUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        subtitle: `Bs. ${incomeStatement.revenue.totalGrossRevenueVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
        colorHex: '#065F46',
      },
      {
        title: 'EBITDA Operativo',
        value: `$${incomeStatement.ebitda.amountUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        subtitle: `Margen: ${incomeStatement.ebitda.marginPercent}%`,
        colorHex: '#0284C7',
      },
      {
        title: 'Utilidad Neta',
        value: `$${incomeStatement.netIncome.profitUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        subtitle: `Rentabilidad: ${incomeStatement.netIncome.marginPercent}%`,
        colorHex: '#065F46',
      },
      {
        title: 'Activo Total',
        value: `$${balanceSheet.assets.totalAssetsUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        subtitle: `Razón Corriente: ${balanceSheet.ratios.currentRatio}x`,
        colorHex: '#0F172A',
      },
    ],
    contentHtml: plTableHtml + balanceTableHtml,
    showSignatures: true,
    signatureLabels: [
      'Dirección de Administración y Finanzas',
      'Auditoría Contable / Representante Legal',
    ],
    notes: [
      bcvRate > 0
        ? `Cálculo elaborado bajo la tasa canónica oficial del Banco Central de Venezuela de Bs. ${bcvRate.toFixed(4)} por USD.`
        : 'Cálculo emitido en Estado Cero (sin tasa cambiaria canónica activa registrada).',
      'Todos los saldos en divisas y bolívares fueron procesados mediante aritmética de centavos para eliminar discrepancias de redondeo.',
      'El inventario biológico vivo en granja fue tasado bajo el método PEPS y costo de raciones acumuladas.',
      `Verificación de Cuadre Contable: Activo = Pasivo + Patrimonio (${balanceSheet.accountingCheck.isBalanced ? 'CONFORME Y CUADRADO' : 'CON DIFERENCIA'}).`,
    ],
  });

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  return { filename, blob, htmlContent };
}

/**
 * Genera el archivo Excel (Spreadsheet XML) del Estado de Resultados y Balance General
 */
export function generateCorporateFinancialExcel(payload: FinancialExportPayload): {
  filename: string;
  blob: Blob;
  xmlContent: string;
} {
  const { periodText, startDate, endDate, bcvRate, incomeStatement, balanceSheet } = payload;
  const folio = `FIN-${startDate.replace(/-/g, '')}-${endDate.replace(/-/g, '')}`;
  const filename = `PuroApure_Inteligencia_Financiera_${startDate}_al_${endDate}.xls`;

  // ----------------------------------------------------
  // HOJA 1: ESTADO DE RESULTADOS (P&L)
  // ----------------------------------------------------
  const sheet1Rows: ExcelRowDef[] = [
    {
      height: 24,
      cells: [
        { value: CORPORATE_HEADER_CONFIG.companyName, styleId: 'HeaderGreen', mergeAcross: 4 },
      ],
    },
    {
      height: 20,
      cells: [
        { value: `ESTADO DE RESULTADOS (P&L) • ${periodText}`, styleId: 'Subheader', mergeAcross: 4 },
      ],
    },
    {
      height: 18,
      cells: [
        { value: `Folio: ${folio} | Tasa Oficial BCV: ${bcvRate > 0 ? `Bs. ${bcvRate.toFixed(4)}/USD` : 'Bs. 0,0000/USD (Estado Cero)'} | Fecha: ${new Date().toLocaleDateString('es-VE')}`, styleId: 'CenterCell', mergeAcross: 4 },
      ],
    },
    { height: 10, cells: [] },
    // Encabezados de Columna
    {
      height: 20,
      cells: [
        { value: 'CÓDIGO', styleId: 'HeaderGreen' },
        { value: 'PARTIDA CONTABLE', styleId: 'HeaderGreen' },
        { value: 'MONTO (USD)', styleId: 'HeaderGreen' },
        { value: 'MONTO (VES)', styleId: 'HeaderGreen' },
        { value: '% INGRESOS', styleId: 'HeaderGreen' },
      ],
    },
    // Filas
    {
      cells: [
        { value: '4.1', styleId: 'CenterCell' },
        { value: 'INGRESOS BRUTOS OPERATIVOS', styleId: 'BoldLabel' },
        { value: incomeStatement.revenue.totalGrossRevenueUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: incomeStatement.revenue.totalGrossRevenueVES, type: 'Number', styleId: 'MoneyVES' },
        { value: '100.00%', styleId: 'CenterCell' },
      ],
    },
    {
      cells: [
        { value: '4.1.1', styleId: 'CenterCell' },
        { value: '  ↳ Ventas de Biomasa Ganadera (Aves / Cerdos)', styleId: 'DefaultCell' },
        { value: incomeStatement.revenue.biomassSalesUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: incomeStatement.revenue.biomassSalesVES, type: 'Number', styleId: 'MoneyVES' },
        { value: `${incomeStatement.revenue.totalGrossRevenueUSD > 0 ? ((incomeStatement.revenue.biomassSalesUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2) : '0.00'}%`, styleId: 'CenterCell' },
      ],
    },
    {
      cells: [
        { value: '4.1.2', styleId: 'CenterCell' },
        { value: '  ↳ Otros Ingresos Operativos y Facturación', styleId: 'DefaultCell' },
        { value: incomeStatement.revenue.generalSalesUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: incomeStatement.revenue.generalSalesVES, type: 'Number', styleId: 'MoneyVES' },
        { value: `${incomeStatement.revenue.totalGrossRevenueUSD > 0 ? ((incomeStatement.revenue.generalSalesUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2) : '0.00'}%`, styleId: 'CenterCell' },
      ],
    },
    {
      cells: [
        { value: '5.1', styleId: 'CenterCell' },
        { value: '(-) COSTOS OPERATIVOS DIRECTOS (COGS)', styleId: 'BoldLabel' },
        { value: incomeStatement.cogs.totalCogsUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: incomeStatement.cogs.totalCogsVES, type: 'Number', styleId: 'MoneyVES' },
        { value: `${incomeStatement.revenue.totalGrossRevenueUSD > 0 ? ((incomeStatement.cogs.totalCogsUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2) : '0.00'}%`, styleId: 'CenterCell' },
      ],
    },
    {
      cells: [
        { value: 'MB', styleId: 'CenterCell' },
        { value: 'MARGEN BRUTO AGROINDUSTRIAL', styleId: 'HeaderAmber' },
        { value: incomeStatement.grossProfit.profitUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: incomeStatement.grossProfit.profitVES, type: 'Number', styleId: 'MoneyVES' },
        { value: `${incomeStatement.grossProfit.marginPercent}%`, styleId: 'CenterCell' },
      ],
    },
    {
      cells: [
        { value: '5.2', styleId: 'CenterCell' },
        { value: '(-) GASTOS OPERATIVOS (OPEX)', styleId: 'BoldLabel' },
        { value: incomeStatement.opex.totalOpexUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: incomeStatement.opex.totalOpexVES, type: 'Number', styleId: 'MoneyVES' },
        { value: `${incomeStatement.revenue.totalGrossRevenueUSD > 0 ? ((incomeStatement.opex.totalOpexUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2) : '0.00'}%`, styleId: 'CenterCell' },
      ],
    },
    {
      cells: [
        { value: '5.2.1', styleId: 'CenterCell' },
        { value: '  ↳ Nómina Fija de Campo y Galponeros', styleId: 'DefaultCell' },
        { value: incomeStatement.opex.payrollUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: incomeStatement.opex.payrollVES, type: 'Number', styleId: 'MoneyVES' },
        { value: `${incomeStatement.revenue.totalGrossRevenueUSD > 0 ? ((incomeStatement.opex.payrollUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2) : '0.00'}%`, styleId: 'CenterCell' },
      ],
    },
    {
      cells: [
        { value: '5.2.2', styleId: 'CenterCell' },
        { value: '  ↳ Honorarios Veterinarios y Profesionales', styleId: 'DefaultCell' },
        { value: incomeStatement.opex.professionalFeesUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: incomeStatement.opex.professionalFeesVES, type: 'Number', styleId: 'MoneyVES' },
        { value: `${incomeStatement.revenue.totalGrossRevenueUSD > 0 ? ((incomeStatement.opex.professionalFeesUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2) : '0.00'}%`, styleId: 'CenterCell' },
      ],
    },
    {
      cells: [
        { value: '5.2.3', styleId: 'CenterCell' },
        { value: '  ↳ Fletes, Servicios Operativos y Logística', styleId: 'DefaultCell' },
        { value: incomeStatement.opex.servicesAndLogisticsUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: incomeStatement.opex.servicesAndLogisticsVES, type: 'Number', styleId: 'MoneyVES' },
        { value: `${incomeStatement.revenue.totalGrossRevenueUSD > 0 ? ((incomeStatement.opex.servicesAndLogisticsUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2) : '0.00'}%`, styleId: 'CenterCell' },
      ],
    },
    {
      cells: [
        { value: 'EBITDA', styleId: 'CenterCell' },
        { value: 'EBITDA OPERATIVO (Flujo de Caja Bruto)', styleId: 'HeaderGreen' },
        { value: incomeStatement.ebitda.amountUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: incomeStatement.ebitda.amountVES, type: 'Number', styleId: 'MoneyVES' },
        { value: `${incomeStatement.ebitda.marginPercent}%`, styleId: 'CenterCell' },
      ],
    },
    {
      cells: [
        { value: '5.3', styleId: 'CenterCell' },
        { value: '(-) Cargas Tributarias / Impuestos SENIAT', styleId: 'DefaultCell' },
        { value: incomeStatement.taxes.totalTaxesUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: incomeStatement.taxes.totalTaxesVES, type: 'Number', styleId: 'MoneyVES' },
        { value: `${incomeStatement.revenue.totalGrossRevenueUSD > 0 ? ((incomeStatement.taxes.totalTaxesUSD / incomeStatement.revenue.totalGrossRevenueUSD) * 100).toFixed(2) : '0.00'}%`, styleId: 'CenterCell' },
      ],
    },
    {
      height: 22,
      cells: [
        { value: 'NET', styleId: 'CenterCell' },
        { value: 'UTILIDAD NETA DEL EJERCICIO', styleId: 'HeaderGreen' },
        { value: incomeStatement.netIncome.profitUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: incomeStatement.netIncome.profitVES, type: 'Number', styleId: 'MoneyVES' },
        { value: `${incomeStatement.netIncome.marginPercent}%`, styleId: 'CenterCell' },
      ],
    },
  ];

  // ----------------------------------------------------
  // HOJA 2: BALANCE GENERAL
  // ----------------------------------------------------
  const sheet2Rows: ExcelRowDef[] = [
    {
      height: 24,
      cells: [
        { value: CORPORATE_HEADER_CONFIG.companyName, styleId: 'HeaderGreen', mergeAcross: 4 },
      ],
    },
    {
      height: 20,
      cells: [
        { value: `BALANCE GENERAL (FOTOGRAFÍA PATRIMONIAL) • AL ${endDate}`, styleId: 'Subheader', mergeAcross: 4 },
      ],
    },
    { height: 10, cells: [] },
    // ACTIVOS
    {
      cells: [
        { value: '1.0', styleId: 'CenterCell' },
        { value: 'ACTIVOS (RECURSOS)', styleId: 'HeaderGreen' },
        { value: 'MONTO (USD)', styleId: 'HeaderGreen' },
        { value: 'MONTO (VES)', styleId: 'HeaderGreen' },
        { value: '% DEL ACTIVO', styleId: 'HeaderGreen' },
      ],
    },
    {
      cells: [
        { value: '1.1', styleId: 'CenterCell' },
        { value: 'Efectivo en Caja y Bancos', styleId: 'DefaultCell' },
        { value: balanceSheet.assets.current.cashAndBanksUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: balanceSheet.assets.current.cashAndBanksVES, type: 'Number', styleId: 'MoneyVES' },
        { value: `${balanceSheet.assets.totalAssetsUSD > 0 ? ((balanceSheet.assets.current.cashAndBanksUSD / balanceSheet.assets.totalAssetsUSD) * 100).toFixed(2) : '0.00'}%`, styleId: 'CenterCell' },
      ],
    },
    {
      cells: [
        { value: '1.2', styleId: 'CenterCell' },
        { value: 'Cuentas por Cobrar Clientes (CRM)', styleId: 'DefaultCell' },
        { value: balanceSheet.assets.current.accountsReceivableUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: balanceSheet.assets.current.accountsReceivableVES, type: 'Number', styleId: 'MoneyVES' },
        { value: `${balanceSheet.assets.totalAssetsUSD > 0 ? ((balanceSheet.assets.current.accountsReceivableUSD / balanceSheet.assets.totalAssetsUSD) * 100).toFixed(2) : '0.00'}%`, styleId: 'CenterCell' },
      ],
    },
    {
      cells: [
        { value: '1.3', styleId: 'CenterCell' },
        { value: 'Inventario Biológico Vivo en Galpones (PEPS)', styleId: 'DefaultCell' },
        { value: balanceSheet.assets.current.liveBiologicalInventoryUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: balanceSheet.assets.current.liveBiologicalInventoryVES, type: 'Number', styleId: 'MoneyVES' },
        { value: `${balanceSheet.assets.totalAssetsUSD > 0 ? ((balanceSheet.assets.current.liveBiologicalInventoryUSD / balanceSheet.assets.totalAssetsUSD) * 100).toFixed(2) : '0.00'}%`, styleId: 'CenterCell' },
      ],
    },
    {
      cells: [
        { value: '1.4', styleId: 'CenterCell' },
        { value: 'Inventario de Insumos y Materias Primas', styleId: 'DefaultCell' },
        { value: balanceSheet.assets.current.processedAndSuppliesInventoryUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: balanceSheet.assets.current.processedAndSuppliesInventoryVES, type: 'Number', styleId: 'MoneyVES' },
        { value: `${balanceSheet.assets.totalAssetsUSD > 0 ? ((balanceSheet.assets.current.processedAndSuppliesInventoryUSD / balanceSheet.assets.totalAssetsUSD) * 100).toFixed(2) : '0.00'}%`, styleId: 'CenterCell' },
      ],
    },
    {
      cells: [
        { value: '1.5', styleId: 'CenterCell' },
        { value: 'Activo No Corriente (Instalaciones y Equipos)', styleId: 'DefaultCell' },
        { value: balanceSheet.assets.nonCurrent.farmInfrastructureUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: balanceSheet.assets.nonCurrent.farmInfrastructureVES, type: 'Number', styleId: 'MoneyVES' },
        { value: `${balanceSheet.assets.totalAssetsUSD > 0 ? ((balanceSheet.assets.nonCurrent.farmInfrastructureUSD / balanceSheet.assets.totalAssetsUSD) * 100).toFixed(2) : '0.00'}%`, styleId: 'CenterCell' },
      ],
    },
    {
      cells: [
        { value: 'TOTAL', styleId: 'CenterCell' },
        { value: 'TOTAL ACTIVOS', styleId: 'HeaderGreen' },
        { value: balanceSheet.assets.totalAssetsUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: balanceSheet.assets.totalAssetsVES, type: 'Number', styleId: 'MoneyVES' },
        { value: '100.00%', styleId: 'CenterCell' },
      ],
    },
    { height: 10, cells: [] },
    // PASIVOS Y PATRIMONIO
    {
      cells: [
        { value: '2.0', styleId: 'CenterCell' },
        { value: 'PASIVOS Y PATRIMONIO NETO', styleId: 'HeaderAmber' },
        { value: 'MONTO (USD)', styleId: 'HeaderAmber' },
        { value: 'MONTO (VES)', styleId: 'HeaderAmber' },
        { value: '% DEL TOTAL', styleId: 'HeaderAmber' },
      ],
    },
    {
      cells: [
        { value: '2.1', styleId: 'CenterCell' },
        { value: 'Cuentas por Pagar Proveedores (CRM)', styleId: 'DefaultCell' },
        { value: balanceSheet.liabilities.current.accountsPayableUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: balanceSheet.liabilities.current.accountsPayableVES, type: 'Number', styleId: 'MoneyVES' },
        { value: `${balanceSheet.assets.totalAssetsUSD > 0 ? ((balanceSheet.liabilities.current.accountsPayableUSD / balanceSheet.assets.totalAssetsUSD) * 100).toFixed(2) : '0.00'}%`, styleId: 'CenterCell' },
      ],
    },
    {
      cells: [
        { value: '2.2', styleId: 'CenterCell' },
        { value: 'Pasivos Laborales Devengados', styleId: 'DefaultCell' },
        { value: balanceSheet.liabilities.current.laborLiabilitiesUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: balanceSheet.liabilities.current.laborLiabilitiesVES, type: 'Number', styleId: 'MoneyVES' },
        { value: `${balanceSheet.assets.totalAssetsUSD > 0 ? ((balanceSheet.liabilities.current.laborLiabilitiesUSD / balanceSheet.assets.totalAssetsUSD) * 100).toFixed(2) : '0.00'}%`, styleId: 'CenterCell' },
      ],
    },
    {
      cells: [
        { value: '2.3', styleId: 'CenterCell' },
        { value: 'Pasivo Técnico Mark-to-Market (Diferencial VES)', styleId: 'DefaultCell' },
        { value: balanceSheet.liabilities.current.markToMarketTechnicalLiabilityUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: balanceSheet.liabilities.current.markToMarketTechnicalLiabilityVES, type: 'Number', styleId: 'MoneyVES' },
        { value: `${balanceSheet.assets.totalAssetsUSD > 0 ? ((balanceSheet.liabilities.current.markToMarketTechnicalLiabilityUSD / balanceSheet.assets.totalAssetsUSD) * 100).toFixed(2) : '0.00'}%`, styleId: 'CenterCell' },
      ],
    },
    {
      cells: [
        { value: '2.T', styleId: 'CenterCell' },
        { value: 'Subtotal Pasivos Totales', styleId: 'BoldLabel' },
        { value: balanceSheet.liabilities.totalLiabilitiesUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: balanceSheet.liabilities.totalLiabilitiesVES, type: 'Number', styleId: 'MoneyVES' },
        { value: `${balanceSheet.assets.totalAssetsUSD > 0 ? ((balanceSheet.liabilities.totalLiabilitiesUSD / balanceSheet.assets.totalAssetsUSD) * 100).toFixed(2) : '0.00'}%`, styleId: 'CenterCell' },
      ],
    },
    {
      cells: [
        { value: '3.0', styleId: 'CenterCell' },
        { value: 'PATRIMONIO NETO (CAPITAL Y RESERVAS)', styleId: 'HeaderGreen' },
        { value: balanceSheet.equity.totalEquityUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: balanceSheet.equity.totalEquityVES, type: 'Number', styleId: 'MoneyVES' },
        { value: `${balanceSheet.assets.totalAssetsUSD > 0 ? ((balanceSheet.equity.totalEquityUSD / balanceSheet.assets.totalAssetsUSD) * 100).toFixed(2) : '0.00'}%`, styleId: 'CenterCell' },
      ],
    },
    {
      height: 22,
      cells: [
        { value: 'SUM', styleId: 'CenterCell' },
        { value: 'TOTAL PASIVO + PATRIMONIO', styleId: 'HeaderGreen' },
        { value: balanceSheet.liabilities.totalLiabilitiesUSD + balanceSheet.equity.totalEquityUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: balanceSheet.liabilities.totalLiabilitiesVES + balanceSheet.equity.totalEquityVES, type: 'Number', styleId: 'MoneyVES' },
        { value: '100.00%', styleId: 'CenterCell' },
      ],
    },
  ];

  // ----------------------------------------------------
  // HOJA 3: RATIOS Y MÉTRICAS FINANCIERAS
  // ----------------------------------------------------
  const sheet3Rows: ExcelRowDef[] = [
    {
      height: 24,
      cells: [
        { value: CORPORATE_HEADER_CONFIG.companyName, styleId: 'HeaderGreen', mergeAcross: 3 },
      ],
    },
    {
      height: 20,
      cells: [
        { value: `INDICADORES Y RATIOS DE SALUD FINANCIERA • ${periodText}`, styleId: 'Subheader', mergeAcross: 3 },
      ],
    },
    { height: 10, cells: [] },
    {
      cells: [
        { value: 'INDICADOR FINANCIERO', styleId: 'HeaderGreen' },
        { value: 'VALOR CALCULADO', styleId: 'HeaderGreen' },
        { value: 'INTERPRETACIÓN Y ESTÁNDAR', styleId: 'HeaderGreen' },
      ],
    },
    {
      cells: [
        { value: 'Razón Corriente (Liquidez)', styleId: 'BoldLabel' },
        { value: `${balanceSheet.ratios.currentRatio}x`, styleId: 'CenterCell' },
        { value: balanceSheet.ratios.currentRatio >= 1.5 ? 'Excelente liquidez a corto plazo' : 'Liquidez ajustada', styleId: 'DefaultCell' },
      ],
    },
    {
      cells: [
        { value: 'Capital de Trabajo Neto (USD)', styleId: 'BoldLabel' },
        { value: balanceSheet.ratios.netWorkingCapitalUSD, type: 'Number', styleId: 'MoneyUSD' },
        { value: 'Fondos operativos disponibles tras cubrir pasivos corrientes', styleId: 'DefaultCell' },
      ],
    },
    {
      cells: [
        { value: 'Nivel de Endeudamiento sobre Activos', styleId: 'BoldLabel' },
        { value: `${balanceSheet.ratios.debtToAssetsRatioPercent}%`, styleId: 'CenterCell' },
        { value: balanceSheet.ratios.debtToAssetsRatioPercent <= 40 ? 'Estructura patrimonial sólida y bajo apalancamiento' : 'Apalancamiento moderado', styleId: 'DefaultCell' },
      ],
    },
    {
      cells: [
        { value: 'Margen EBITDA Operativo', styleId: 'BoldLabel' },
        { value: `${incomeStatement.ebitda.marginPercent}%`, styleId: 'CenterCell' },
        { value: 'Generación de caja pura por cada dólar ingresado', styleId: 'DefaultCell' },
      ],
    },
    {
      cells: [
        { value: 'Margen de Rentabilidad Neta', styleId: 'BoldLabel' },
        { value: `${incomeStatement.netIncome.marginPercent}%`, styleId: 'CenterCell' },
        { value: 'Rendimiento neto final después de todas las cargas operativas y fiscales', styleId: 'DefaultCell' },
      ],
    },
  ];

  const worksheets: ExcelWorksheetDef[] = [
    {
      name: 'Estado de Resultados',
      columns: [{ width: 80 }, { width: 320 }, { width: 140 }, { width: 160 }, { width: 110 }],
      rows: sheet1Rows,
    },
    {
      name: 'Balance General',
      columns: [{ width: 80 }, { width: 320 }, { width: 140 }, { width: 160 }, { width: 110 }],
      rows: sheet2Rows,
    },
    {
      name: 'Ratios Financieros',
      columns: [{ width: 220 }, { width: 140 }, { width: 360 }],
      rows: sheet3Rows,
    },
  ];

  const xmlContent = generateCorporateExcelXml({
    documentTitle: 'REPORTE CONSOLIDADO DE INTELIGENCIA FINANCIERA',
    documentSubtitle: `Estado de Resultados y Balance General • ${periodText}`,
    documentFolio: folio,
    periodRange: periodText,
    bcvRate,
    worksheets,
  });

  const blob = new Blob([xmlContent], { type: 'application/vnd.ms-excel;charset=utf-8' });
  return { filename, blob, xmlContent };
}

// Aliases requeridos por la especificación de Inteligencia Financiera
export const generateCorporatePDF = generateCorporateFinancialPDF;
export const generateCorporateExcel = generateCorporateFinancialExcel;

