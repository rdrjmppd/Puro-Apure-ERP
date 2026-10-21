/**
 * ============================================================================
 * PURO APURE ERP — MOTOR DE EXPORTACIÓN EJECUTIVA: expensesExportEngine
 * ============================================================================
 * Generador de Reportes PDF y Excel (.xlsx XML) para Gastos Operativos,
 * Comprobantes de Egreso y Estado de Resultados Histórico Consolidado.
 * Inyección estricta de branding institucional y copyright AR Group 2026.
 * ============================================================================
 */

import {
  generateCorporatePdfHtml,
  printOrExportPdfHtml,
  escapeHtml,
  triggerDirectBlobDownload,
} from './pdfTemplateEngine';
import {
  generateCorporateExcelXml,
  CorporateExcelWorkbookOptions,
  ExcelWorksheetDef,
  ExcelRowDef,
} from './excelTemplateEngine';
import {
  OperatingExpense,
  HistoricalConsolidatedPnl,
} from '../types/purchasing';
import { centsRound } from '../services/financialAnalyticsService';

/**
 * Genera el documento HTML corporativo imprimible para el listado de Gastos
 */
export function generateExpensesReportPdfHtml(
  expenses: OperatingExpense[],
  bcvRate: number = 0,
  title: string = 'Reporte Ejecutivo de Gastos Operativos e Históricos'
): string {
  let totalUSD = 0;
  let totalVES = 0;
  let totalOpex = 0;
  let totalCapex = 0;

  expenses.forEach((e) => {
    totalUSD = centsRound(totalUSD + Number(e.montoUSD || 0));
    totalVES = centsRound(totalVES + Number(e.montoVES || (e.montoUSD * (bcvRate || 1))));
    if (e.naturaleza === 'CAPEX') {
      totalCapex = centsRound(totalCapex + Number(e.montoUSD || 0));
    } else {
      totalOpex = centsRound(totalOpex + Number(e.montoUSD || 0));
    }
  });

  const rowsHtml = expenses
    .map(
      (e, idx) => `
    <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
      <td style="padding: 8px 6px; text-align: center; color: #64748b;">${idx + 1}</td>
      <td style="padding: 8px 6px; font-family: monospace; white-space: nowrap;">${escapeHtml(e.fecha)}</td>
      <td style="padding: 8px 6px;">
        <span style="font-weight: bold; color: ${e.tipoRegistro === 'HISTORICO_RETROACTIVO' ? '#7e22ce' : '#047857'};">
          ${e.tipoRegistro === 'HISTORICO_RETROACTIVO' ? 'HISTÓRICO' : 'DEL DÍA'}
        </span>
      </td>
      <td style="padding: 8px 6px; font-weight: 600; color: #0f172a;">${escapeHtml(e.concepto)}</td>
      <td style="padding: 8px 6px; color: #475569;">${escapeHtml(e.categoria.replace(/_/g, ' '))}</td>
      <td style="padding: 8px 6px; color: #334155;">${escapeHtml(e.proveedorComercio)}</td>
      <td style="padding: 8px 6px; font-family: monospace; color: #64748b;">${escapeHtml(e.numeroComprobante || 'S/F')}</td>
      <td style="padding: 8px 6px; text-align: right; font-weight: bold; font-family: monospace; color: #047857;">
        $${Number(e.montoUSD).toFixed(2)}
      </td>
      <td style="padding: 8px 6px; text-align: right; font-family: monospace; color: #475569;">
        ${e.montoVES ? `Bs. ${Number(e.montoVES).toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : 'N/A'}
      </td>
    </tr>
  `
    )
    .join('');

  const bodyContent = `
    <div style="margin-bottom: 20px;">
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="font-size: 12px; color: #64748b; padding: 4px;">Total Gastos Consolidados:</td>
            <td style="font-size: 14px; font-weight: bold; font-family: monospace; color: #047857; text-align: right; padding: 4px;">
              $${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
              ${bcvRate > 0 ? `<span style="font-size: 11px; color: #64748b; font-weight: normal;">(≈ Bs. ${totalVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })})</span>` : ''}
            </td>
          </tr>
          <tr>
            <td style="font-size: 12px; color: #64748b; padding: 4px;">Subtotal OPEX (Gastos Operativos):</td>
            <td style="font-size: 12px; font-weight: bold; font-family: monospace; color: #334155; text-align: right; padding: 4px;">
              $${totalOpex.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
            </td>
          </tr>
          <tr>
            <td style="font-size: 12px; color: #64748b; padding: 4px;">Subtotal CAPEX (Inversión en Equipos / Tecnología):</td>
            <td style="font-size: 12px; font-weight: bold; font-family: monospace; color: #d97706; text-align: right; padding: 4px;">
              $${totalCapex.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
            </td>
          </tr>
          <tr>
            <td style="font-size: 12px; color: #64748b; padding: 4px;">Tasa Oficial BCV de Referencia:</td>
            <td style="font-size: 12px; font-family: monospace; color: #475569; text-align: right; padding: 4px;">
              ${bcvRate > 0 ? `Bs. ${bcvRate.toFixed(2)} / USD` : 'N/A'}
            </td>
          </tr>
        </table>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
        <thead>
          <tr style="background-color: #065f46; color: #ffffff; font-size: 11px; text-transform: uppercase;">
            <th style="padding: 8px 6px; text-align: center;">#</th>
            <th style="padding: 8px 6px; text-align: left;">Fecha</th>
            <th style="padding: 8px 6px; text-align: left;">Tipo</th>
            <th style="padding: 8px 6px; text-align: left;">Concepto</th>
            <th style="padding: 8px 6px; text-align: left;">Categoría</th>
            <th style="padding: 8px 6px; text-align: left;">Comercio / Beneficiario</th>
            <th style="padding: 8px 6px; text-align: left;">N° Factura</th>
            <th style="padding: 8px 6px; text-align: right;">Monto USD</th>
            <th style="padding: 8px 6px; text-align: right;">Monto VES</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="9" style="text-align: center; padding: 20px; color: #94a3b8;">No hay registros de gastos.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  return generateCorporatePdfHtml({
    documentTitle: title,
    documentSubtitle: 'Auditoría Administrativa de Egresos Operativos y Compras Menores',
    periodRange: `Generado el ${new Date().toLocaleDateString('es-VE')}`,
    bcvRate,
    contentHtml: bodyContent,
  });
}

/**
 * Genera el documento HTML corporativo imprimible para el Balance Histórico Consolidado
 * (Cruce entre Ganancias de Camadas Pasadas vs Gastos Históricos)
 */
export function generateConsolidatedHistoricalPnlPdfHtml(
  pnl: HistoricalConsolidatedPnl,
  bcvRate: number = 0
): string {
  const isSuperavit = pnl.utilidadNetaConsolidadaUSD >= 0;

  const categoryRows = Object.entries(pnl.desgloseGastosPorCategoria)
    .map(([cat, amount]) => {
      const pct = pnl.totalGastosHistoricosUSD > 0
        ? centsRound((amount / pnl.totalGastosHistoricosUSD) * 100)
        : 0;
      return `
      <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
        <td style="padding: 8px 10px; font-weight: 600; color: #334155;">${escapeHtml(cat.replace(/_/g, ' '))}</td>
        <td style="padding: 8px 10px; text-align: right; font-family: monospace; font-weight: bold; color: #7e22ce;">
          $${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
        </td>
        <td style="padding: 8px 10px; text-align: right; font-family: monospace; color: #64748b;">
          ${pct.toFixed(1)}%
        </td>
      </tr>
    `;
    })
    .join('');

  const bodyContent = `
    <div style="margin-bottom: 24px;">
      <!-- Hero KPI Summary -->
      <div style="display: table; width: 100%; margin-bottom: 20px;">
        <div style="display: table-cell; width: 33.3%; padding-right: 8px;">
          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; text-align: center;">
            <div style="font-size: 10px; font-weight: bold; color: #166534; text-transform: uppercase;">
              (+) Ganancias Camadas Pasadas
            </div>
            <div style="font-size: 20px; font-weight: bold; font-family: monospace; color: #15803d; margin-top: 6px;">
              $${pnl.totalGananciasCamadasUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div style="font-size: 10px; color: #4ade80; margin-top: 4px;">
              ${pnl.conteoCamadas} Lotes (Aves + Cerdos)
            </div>
          </div>
        </div>

        <div style="display: table-cell; width: 33.3%; padding: 0 4px;">
          <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 14px; text-align: center;">
            <div style="font-size: 10px; font-weight: bold; color: #991b1b; text-transform: uppercase;">
              (-) Gastos Históricos Generales
            </div>
            <div style="font-size: 20px; font-weight: bold; font-family: monospace; color: #b91c1c; margin-top: 6px;">
              $${pnl.totalGastosHistoricosUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div style="font-size: 10px; color: #f87171; margin-top: 4px;">
              ${pnl.conteoGastos} Egresos Registrados
            </div>
          </div>
        </div>

        <div style="display: table-cell; width: 33.3%; padding-left: 8px;">
          <div style="background-color: ${isSuperavit ? '#ecfeff' : '#fff1f2'}; border: 1px solid ${isSuperavit ? '#a5f3fc' : '#fecdd3'}; border-radius: 8px; padding: 14px; text-align: center;">
            <div style="font-size: 10px; font-weight: bold; color: ${isSuperavit ? '#0e7490' : '#be123c'}; text-transform: uppercase;">
              (=) Rentabilidad Neta Real
            </div>
            <div style="font-size: 20px; font-weight: bold; font-family: monospace; color: ${isSuperavit ? '#0891b2' : '#e11d48'}; margin-top: 6px;">
              $${pnl.utilidadNetaConsolidadaUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div style="font-size: 10px; color: ${isSuperavit ? '#06b6d4' : '#f43f5e'}; margin-top: 4px;">
              Margen Real: ${pnl.margenRentabilidadReal.toFixed(2)}%
            </div>
          </div>
        </div>
      </div>

      <!-- Resumen General -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px 12px; font-size: 11px; color: #64748b;">Ingresos Totales por Venta de Camadas:</td>
          <td style="padding: 8px 12px; font-size: 12px; font-family: monospace; font-weight: bold; color: #166534; text-align: right;">
            $${pnl.totalIngresosCamadasUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
          </td>
        </tr>
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px 12px; font-size: 11px; color: #64748b;">Costos Directos de Inversión en Camadas:</td>
          <td style="padding: 8px 12px; font-size: 12px; font-family: monospace; font-weight: bold; color: #991b1b; text-align: right;">
            $${pnl.totalCostosCamadasUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
          </td>
        </tr>
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px 12px; font-size: 11px; color: #64748b;">Subtotal Gastos Operativos (OPEX Histórico):</td>
          <td style="padding: 8px 12px; font-size: 12px; font-family: monospace; color: #334155; text-align: right;">
            $${pnl.totalGastosOpexUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; font-size: 11px; color: #64748b;">Subtotal Inversión en Tecnología y Equipos (CAPEX Histórico):</td>
          <td style="padding: 8px 12px; font-size: 12px; font-family: monospace; color: #d97706; text-align: right;">
            $${pnl.totalGastosCapexUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
          </td>
        </tr>
      </table>

      <!-- Desglose de Gastos por Categoría -->
      <h3 style="font-size: 13px; font-weight: bold; color: #0f172a; margin-bottom: 8px; border-bottom: 2px solid #065f46; padding-bottom: 4px;">
        Desglose Estructural de Gastos Históricos
      </h3>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #065f46; color: #ffffff; font-size: 11px; text-transform: uppercase;">
            <th style="padding: 8px 10px; text-align: left;">Categoría de Gasto</th>
            <th style="padding: 8px 10px; text-align: right;">Monto Total USD</th>
            <th style="padding: 8px 10px; text-align: right;">% del Total</th>
          </tr>
        </thead>
        <tbody>
          ${categoryRows}
        </tbody>
      </table>
    </div>
  `;

  return generateCorporatePdfHtml({
    documentTitle: 'Estado de Resultados Integral Histórico Consolidado',
    documentSubtitle: 'Cruce de Rentabilidad Real Acumulada: Ganancias de Camadas vs. Gastos Estructurales',
    periodRange: `Consolidación acumulada al ${new Date().toLocaleDateString('es-VE')}`,
    bcvRate,
    contentHtml: bodyContent,
  });
}

/**
 * Exporta el reporte de gastos a archivo Excel (.xlsx compatible XML)
 */
export function exportExpensesToExcel(
  expenses: OperatingExpense[],
  bcvRate: number = 0,
  filename: string = 'Reporte_Gastos_Puro_Apure.xls'
): void {
  const headerRow: ExcelRowDef = {
    cells: [
      { value: 'Fecha', styleId: 'header', type: 'String' },
      { value: 'Tipo de Registro', styleId: 'header', type: 'String' },
      { value: 'Concepto', styleId: 'header', type: 'String' },
      { value: 'Categoría', styleId: 'header', type: 'String' },
      { value: 'Naturaleza', styleId: 'header', type: 'String' },
      { value: 'Comercio / Beneficiario', styleId: 'header', type: 'String' },
      { value: 'N° Factura', styleId: 'header', type: 'String' },
      { value: 'Monto USD', styleId: 'header', type: 'String' },
      { value: 'Monto VES', styleId: 'header', type: 'String' },
      { value: 'Método de Pago', styleId: 'header', type: 'String' },
      { value: 'Cuenta Origen', styleId: 'header', type: 'String' },
      { value: 'Descripción Detallada', styleId: 'header', type: 'String' },
    ],
  };

  const dataRows: ExcelRowDef[] = expenses.map((e) => ({
    cells: [
      { value: e.fecha, type: 'String' },
      { value: e.tipoRegistro === 'HISTORICO_RETROACTIVO' ? 'HISTÓRICO' : 'DEL DÍA', type: 'String' },
      { value: e.concepto, type: 'String' },
      { value: e.categoria.replace(/_/g, ' '), type: 'String' },
      { value: e.naturaleza, type: 'String' },
      { value: e.proveedorComercio, type: 'String' },
      { value: e.numeroComprobante || 'S/F', type: 'String' },
      { value: Number(e.montoUSD), type: 'Number' },
      { value: Number(e.montoVES || (e.montoUSD * (bcvRate || 1))), type: 'Number' },
      { value: e.metodoPago, type: 'String' },
      { value: e.cuentaOrigen || '', type: 'String' },
      { value: e.descripcionDetallada, type: 'String' },
    ],
  }));

  const worksheet: ExcelWorksheetDef = {
    name: 'Gastos Operativos',
    columns: [
      { width: 90 },
      { width: 100 },
      { width: 220 },
      { width: 180 },
      { width: 70 },
      { width: 160 },
      { width: 100 },
      { width: 100 },
      { width: 120 },
      { width: 110 },
      { width: 140 },
      { width: 250 },
    ],
    rows: [headerRow, ...dataRows],
  };

  const xml = generateCorporateExcelXml({
    documentTitle: 'Reporte Ejecutivo de Gastos Operativos e Históricos',
    documentSubtitle: 'Agropecuaria Puro Apure C.A. - Egresos Consolidados',
    bcvRate,
    worksheets: [worksheet],
  });

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  triggerDirectBlobDownload(blob, filename);
}

/**
 * Disparador directo de exportación PDF en el navegador
 */
export function exportExpensesPdf(
  expenses: OperatingExpense[],
  bcvRate: number = 0,
  title?: string
): void {
  const html = generateExpensesReportPdfHtml(expenses, bcvRate, title);
  printOrExportPdfHtml(html);
}

/**
 * Disparador directo de exportación PDF del Balance Consolidado Histórico
 */
export function exportConsolidatedHistoricalPnlPdf(
  pnl: HistoricalConsolidatedPnl,
  bcvRate: number = 0
): void {
  const html = generateConsolidatedHistoricalPnlPdfHtml(pnl, bcvRate);
  printOrExportPdfHtml(html);
}
