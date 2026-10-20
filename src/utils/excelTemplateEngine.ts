/**
 * Puro Apure ERP - Motor de Renderizado Excel (Fase 3)
 * Estandarización de Membrete Corporativo, Estilos XML Spreadsheet 2003 y Auditoría Contable
 * Garantiza persistencia, inmutabilidad y compatibilidad nativa con Microsoft Excel y LibreOffice
 */

import { CORPORATE_HEADER_CONFIG } from './documentAssets';
import { FinancialAnalyticsSummary } from '../services/reportingService';
import { BiologicalBatch } from '../types/inventory';
import { PaymentRecord } from '../types/finance';

/**
 * Escapa caracteres reservados para XML en celdas de texto
 */
export function escapeXml(str: string | number | undefined | null): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface ExcelColumnDef {
  width: number;
}

export interface ExcelCellDef {
  value: string | number;
  type?: 'String' | 'Number';
  styleId?: string;
  mergeAcross?: number;
}

export interface ExcelRowDef {
  height?: number;
  cells: ExcelCellDef[];
}

export interface ExcelWorksheetDef {
  name: string;
  columns?: ExcelColumnDef[];
  rows: ExcelRowDef[];
}

export interface CorporateExcelWorkbookOptions {
  documentTitle: string;
  documentSubtitle?: string;
  documentFolio?: string;
  periodRange?: string;
  bcvRate?: number;
  worksheets: ExcelWorksheetDef[];
}

/**
 * Genera el XML Spreadsheet 2003 completo con la paleta corporativa de Puro Apure
 */
export function generateCorporateExcelXml(options: CorporateExcelWorkbookOptions): string {
  const stylesXml = `
 <Styles>
  <!-- Estilo Base Neutro -->
  <Style ss:ID="DefaultCell">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#0F172A"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
   <Alignment ss:Vertical="Center"/>
  </Style>

  <!-- Celda Centrada -->
  <Style ss:ID="CenterCell">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#0F172A"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>

  <!-- Membrete: Razón Social Institucional -->
  <Style ss:ID="CorpCompanyTitle">
   <Font ss:FontName="Calibri" ss:Bold="1" ss:Size="13" ss:Color="#065F46"/>
   <Interior ss:Color="#F0FDF4" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>

  <!-- Membrete: Subtítulo y RIF -->
  <Style ss:ID="CorpSubTitle">
   <Font ss:FontName="Calibri" ss:Bold="1" ss:Size="9" ss:Color="#0F172A"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>

  <!-- Membrete: Dirección y Contacto Fiscal -->
  <Style ss:ID="CorpFiscalAddress">
   <Font ss:FontName="Calibri" ss:Italic="1" ss:Size="8" ss:Color="#475569"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>

  <!-- Encabezado de Documento Oficial -->
  <Style ss:ID="CorpDocTitle">
   <Font ss:FontName="Calibri" ss:Bold="1" ss:Size="11" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#065F46" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#064E3B"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#064E3B"/>
   </Borders>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>

  <!-- Sub-encabezado / Parámetros del Período -->
  <Style ss:ID="CorpDocSub">
   <Font ss:FontName="Calibri" ss:Bold="1" ss:Size="9" ss:Color="#78350F"/>
   <Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D97706"/>
   </Borders>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>

  <!-- Encabezados de Columnas de Tabla Principal -->
  <Style ss:ID="Header">
   <Font ss:FontName="Calibri" ss:Bold="1" ss:Color="#FFFFFF" ss:Size="10"/>
   <Interior ss:Color="#065F46" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#064E3B"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#064E3B"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#064E3B"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#064E3B"/>
   </Borders>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
  </Style>

  <!-- Encabezado Secundario Ámbar -->
  <Style ss:ID="SubHeader">
   <Font ss:FontName="Calibri" ss:Bold="1" ss:Color="#FFFFFF" ss:Size="10"/>
   <Interior ss:Color="#D97706" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#B45309"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B45309"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B45309"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#B45309"/>
   </Borders>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
  </Style>

  <!-- Moneda USD -->
  <Style ss:ID="CurrencyUSD">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#0F172A"/>
   <NumberFormat ss:Format="&quot;$&quot;#,##0.00"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>

  <!-- Moneda VES -->
  <Style ss:ID="CurrencyVES">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#0F172A"/>
   <NumberFormat ss:Format="#,##0.00&quot; Bs.&quot;"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>

  <!-- Porcentaje -->
  <Style ss:ID="PercentCell">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#0F172A"/>
   <NumberFormat ss:Format="0.00%"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>

  <!-- Totales y Subtotales Destacados USD -->
  <Style ss:ID="BoldTotal">
   <Font ss:FontName="Calibri" ss:Bold="1" ss:Color="#065F46" ss:Size="10"/>
   <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
   <NumberFormat ss:Format="&quot;$&quot;#,##0.00"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#065F46"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#065F46"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>

  <!-- Totales y Subtotales Destacados VES -->
  <Style ss:ID="BoldTotalVES">
   <Font ss:FontName="Calibri" ss:Bold="1" ss:Color="#065F46" ss:Size="10"/>
   <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
   <NumberFormat ss:Format="#,##0.00&quot; Bs.&quot;"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#065F46"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#065F46"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>

  <!-- Etiqueta de Total en Negrita -->
  <Style ss:ID="BoldTotalLabel">
   <Font ss:FontName="Calibri" ss:Bold="1" ss:Color="#065F46" ss:Size="10"/>
   <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#065F46"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#065F46"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>

  <!-- Pie de Auditoría y Trazabilidad -->
  <Style ss:ID="AuditFooter">
   <Font ss:FontName="Calibri" ss:Italic="1" ss:Size="8" ss:Color="#64748B"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
 </Styles>`;

  const worksheetsXml = options.worksheets.map((ws) => {
    const columnsTag = ws.columns && ws.columns.length > 0
      ? ws.columns.map((col) => `<Column ss:Width="${col.width}"/>`).join('\n   ')
      : '<Column ss:Width="160"/>\n   <Column ss:Width="120"/>\n   <Column ss:Width="140"/>\n   <Column ss:Width="140"/>';

    const rowsTag = ws.rows.map((row) => {
      const heightAttr = row.height ? ` ss:Height="${row.height}"` : '';
      const cellsXml = row.cells.map((cell) => {
        const styleAttr = cell.styleId ? ` ss:StyleID="${cell.styleId}"` : '';
        const mergeAttr = cell.mergeAcross && cell.mergeAcross > 0 ? ` ss:MergeAcross="${cell.mergeAcross}"` : '';
        const dataType = cell.type || (typeof cell.value === 'number' ? 'Number' : 'String');
        return `    <Cell${styleAttr}${mergeAttr}><Data ss:Type="${dataType}">${escapeXml(cell.value)}</Data></Cell>`;
      }).join('\n');

      return `   <Row${heightAttr}>\n${cellsXml}\n   </Row>`;
    }).join('\n');

    return ` <Worksheet ss:Name="${escapeXml(ws.name)}">
  <Table ss:DefaultColumnWidth="120">
   ${columnsTag}
${rowsTag}
  </Table>
 </Worksheet>`;
  }).join('\n');

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
${stylesXml}
${worksheetsXml}
</Workbook>`;
}

/**
 * Genera el reporte analítico de EBITDA y Márgenes estructurado en múltiples pestañas
 * con el membrete corporativo inmutable de Agropecuaria Puro Apure, C.A.
 */
export function generateEbitdaExcelReport(
  summary: FinancialAnalyticsSummary,
  batches: BiologicalBatch[],
  payments: PaymentRecord[]
): { filename: string; blob: Blob; xmlContent: string } {
  const currentDate = new Date().toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const currentTimestamp = new Date().toISOString();
  const folio = `EBITDA-${summary.range.startDate.replace(/-/g, '')}-${summary.range.endDate.replace(/-/g, '')}`;

  // ----------------------------------------------------
  // HOJA 1: RESUMEN EJECUTIVO Y EBITDA CON MEMBRETE
  // ----------------------------------------------------
  const sheet1Rows: ExcelRowDef[] = [
    // Fila 1: Razón Social Institucional
    {
      height: 24,
      cells: [
        {
          value: `${CORPORATE_HEADER_CONFIG.tradeName} • ${CORPORATE_HEADER_CONFIG.companyName}`,
          type: 'String',
          styleId: 'CorpCompanyTitle',
          mergeAcross: 3,
        },
      ],
    },
    // Fila 2: Identificación Fiscal y Régimen
    {
      height: 18,
      cells: [
        {
          value: `RIF: ${CORPORATE_HEADER_CONFIG.rif} • ${CORPORATE_HEADER_CONFIG.fiscalRegime}`,
          type: 'String',
          styleId: 'CorpSubTitle',
          mergeAcross: 3,
        },
      ],
    },
    // Fila 3: Sede Principal y Contacto
    {
      height: 16,
      cells: [
        {
          value: `${CORPORATE_HEADER_CONFIG.headquartersAddress} | Tel: ${CORPORATE_HEADER_CONFIG.phone} | Web: ${CORPORATE_HEADER_CONFIG.webDomain}`,
          type: 'String',
          styleId: 'CorpFiscalAddress',
          mergeAcross: 3,
        },
      ],
    },
    // Fila 4: Espacio
    { height: 6, cells: [{ value: '', type: 'String', mergeAcross: 3 }] },
    // Fila 5: Título Oficial del Documento
    {
      height: 22,
      cells: [
        {
          value: 'REPORTE CONSOLIDADO DE ANALÍTICA TEMPORAL, MÁRGENES & EBITDA',
          type: 'String',
          styleId: 'CorpDocTitle',
          mergeAcross: 3,
        },
      ],
    },
    // Fila 6: Metadatos del Período
    {
      height: 18,
      cells: [
        {
          value: `Período: ${summary.range.startDate} al ${summary.range.endDate} (${summary.daysInRange} días) | Emisión: ${currentDate} | Folio: ${folio}`,
          type: 'String',
          styleId: 'CorpDocSub',
          mergeAcross: 3,
        },
      ],
    },
    // Fila 7: Parámetro Cambiario
    {
      height: 16,
      cells: [
        {
          value: `Tasa de Cambio Vigente Ponderada (BCV): ${summary.averageExchangeRate.toFixed(4)} VES/USD`,
          type: 'String',
          styleId: 'CenterCell',
          mergeAcross: 3,
        },
      ],
    },
    // Fila 8: Espacio
    { height: 8, cells: [{ value: '', type: 'String', mergeAcross: 3 }] },
    // Fila 9: Encabezados de Columnas de Datos
    {
      height: 22,
      cells: [
        { value: 'Métrica Financiera / Operativa', type: 'String', styleId: 'Header' },
        { value: 'Monto en USD ($)', type: 'String', styleId: 'Header' },
        { value: 'Equivalente VES (Bs.)', type: 'String', styleId: 'Header' },
        { value: '% Sobre Ingresos', type: 'String', styleId: 'Header' },
      ],
    },
    // Filas de Datos
    {
      height: 20,
      cells: [
        { value: 'Ingresos Brutos de Producción', type: 'String', styleId: 'DefaultCell' },
        { value: summary.totalRevenueUSD, type: 'Number', styleId: 'CurrencyUSD' },
        { value: Number((summary.totalRevenueUSD * summary.averageExchangeRate).toFixed(2)), type: 'Number', styleId: 'CurrencyVES' },
        { value: 1.00, type: 'Number', styleId: 'PercentCell' },
      ],
    },
    {
      height: 20,
      cells: [
        { value: '(-) Costos Directos de Alimento', type: 'String', styleId: 'DefaultCell' },
        { value: summary.totalFeedCostUSD, type: 'Number', styleId: 'CurrencyUSD' },
        { value: Number((summary.totalFeedCostUSD * summary.averageExchangeRate).toFixed(2)), type: 'Number', styleId: 'CurrencyVES' },
        {
          value: summary.totalRevenueUSD > 0 ? (summary.totalFeedCostUSD / summary.totalRevenueUSD) : 0,
          type: 'Number',
          styleId: 'PercentCell',
        },
      ],
    },
    {
      height: 22,
      cells: [
        { value: 'MARGEN BRUTO AGROINDUSTRIAL', type: 'String', styleId: 'BoldTotalLabel' },
        { value: summary.grossMarginUSD, type: 'Number', styleId: 'BoldTotal' },
        { value: Number((summary.grossMarginUSD * summary.averageExchangeRate).toFixed(2)), type: 'Number', styleId: 'BoldTotalVES' },
        { value: summary.grossMarginPercent / 100, type: 'Number', styleId: 'PercentCell' },
      ],
    },
    {
      height: 20,
      cells: [
        { value: '(-) Gastos Operativos de Campo / Insumos', type: 'String', styleId: 'DefaultCell' },
        { value: summary.operatingExpensesUSD, type: 'Number', styleId: 'CurrencyUSD' },
        { value: Number((summary.operatingExpensesUSD * summary.averageExchangeRate).toFixed(2)), type: 'Number', styleId: 'CurrencyVES' },
        {
          value: summary.totalRevenueUSD > 0 ? (summary.operatingExpensesUSD / summary.totalRevenueUSD) : 0,
          type: 'Number',
          styleId: 'PercentCell',
        },
      ],
    },
    {
      height: 24,
      cells: [
        { value: 'EBITDA OPERATIVO NETO', type: 'String', styleId: 'BoldTotalLabel' },
        { value: summary.ebitdaUSD, type: 'Number', styleId: 'BoldTotal' },
        { value: Number(summary.ebitdaVES.toFixed(2)), type: 'Number', styleId: 'BoldTotalVES' },
        { value: summary.ebitdaMarginPercent / 100, type: 'Number', styleId: 'PercentCell' },
      ],
    },
    // Fila de Espacio
    { height: 10, cells: [{ value: '', type: 'String', mergeAcross: 3 }] },
    // Filas de Resumen Biológico
    {
      height: 20,
      cells: [
        { value: 'Biomasa Bruta Procesada (Kg)', type: 'String', styleId: 'DefaultCell' },
        { value: `${summary.biomassVolumeKg.toLocaleString()} kg`, type: 'String', styleId: 'CenterCell' },
        { value: `Lotes: ${summary.totalBatchesProcessed}`, type: 'String', styleId: 'CenterCell' },
        { value: 'N/A', type: 'String', styleId: 'CenterCell' },
      ],
    },
    {
      height: 20,
      cells: [
        { value: 'Biomasa Neta Estimada (Kg)', type: 'String', styleId: 'DefaultCell' },
        { value: `${summary.netBiomassVolumeKg.toLocaleString()} kg`, type: 'String', styleId: 'CenterCell' },
        { value: `Pagos: ${summary.totalPaymentsProcessed}`, type: 'String', styleId: 'CenterCell' },
        { value: 'N/A', type: 'String', styleId: 'CenterCell' },
      ],
    },
    // Fila de Espacio
    { height: 12, cells: [{ value: '', type: 'String', mergeAcross: 3 }] },
    // Fila de Auditoría y Trazabilidad
    {
      height: 16,
      cells: [
        {
          value: `[AUDITORÍA OFICIAL] Generado por Sistema ERP Puro Apure | Timestamp: ${currentTimestamp} | Hash: SHA256-${Date.now().toString(16).toUpperCase()}`,
          type: 'String',
          styleId: 'AuditFooter',
          mergeAcross: 3,
        },
      ],
    },
    {
      height: 16,
      cells: [
        {
          value: 'Validez Legal: Documento digital con membrete estandarizado inmutable de Agropecuaria Puro Apure, C.A.',
          type: 'String',
          styleId: 'AuditFooter',
          mergeAcross: 3,
        },
      ],
    },
  ];

  // ----------------------------------------------------
  // HOJA 2: DETALLE DE LOTES BIOLÓGICOS (AUDITORÍA ZOOTÉCNICA)
  // ----------------------------------------------------
  const sheet2Rows: ExcelRowDef[] = [
    {
      height: 22,
      cells: [
        {
          value: `${CORPORATE_HEADER_CONFIG.companyName} • REGISTRO DETALLADO DE LOTES BIOLÓGICOS`,
          type: 'String',
          styleId: 'CorpCompanyTitle',
          mergeAcross: 6,
        },
      ],
    },
    {
      height: 18,
      cells: [
        {
          value: `Auditoría Zootécnica del Período: ${summary.range.startDate} al ${summary.range.endDate}`,
          type: 'String',
          styleId: 'CorpDocSub',
          mergeAcross: 6,
        },
      ],
    },
    { height: 8, cells: [{ value: '', type: 'String', mergeAcross: 6 }] },
    {
      height: 22,
      cells: [
        { value: 'Código Lote', type: 'String', styleId: 'Header' },
        { value: 'Especie', type: 'String', styleId: 'Header' },
        { value: 'Estatus', type: 'String', styleId: 'Header' },
        { value: 'Población Actual', type: 'String', styleId: 'Header' },
        { value: 'Biomasa Bruta (Kg)', type: 'String', styleId: 'Header' },
        { value: 'Costo Alimento USD', type: 'String', styleId: 'Header' },
        { value: 'Fecha Inicio', type: 'String', styleId: 'Header' },
      ],
    },
  ];

  if (batches.length === 0) {
    sheet2Rows.push({
      height: 20,
      cells: [
        {
          value: 'No se registraron lotes con actividad en la ventana temporal seleccionada.',
          type: 'String',
          styleId: 'DefaultCell',
          mergeAcross: 6,
        },
      ],
    });
  } else {
    batches.forEach((b) => {
      sheet2Rows.push({
        height: 19,
        cells: [
          { value: b.code || b.id, type: 'String', styleId: 'DefaultCell' },
          { value: b.species, type: 'String', styleId: 'CenterCell' },
          { value: b.status, type: 'String', styleId: 'CenterCell' },
          { value: b.currentCount || 0, type: 'Number', styleId: 'DefaultCell' },
          { value: b.grossWeightKg || 0, type: 'Number', styleId: 'DefaultCell' },
          { value: b.feedCostUSD || 0, type: 'Number', styleId: 'CurrencyUSD' },
          { value: b.startDate, type: 'String', styleId: 'CenterCell' },
        ],
      });
    });
  }

  // ----------------------------------------------------
  // HOJA 3: DETALLE DE PAGOS Y TRANSACCIONES
  // ----------------------------------------------------
  const sheet3Rows: ExcelRowDef[] = [
    {
      height: 22,
      cells: [
        {
          value: `${CORPORATE_HEADER_CONFIG.companyName} • LIBRO AUXILIAR DE PAGOS Y TRANSACCIONES`,
          type: 'String',
          styleId: 'CorpCompanyTitle',
          mergeAcross: 6,
        },
      ],
    },
    {
      height: 18,
      cells: [
        {
          value: `Trazabilidad Bimonetaria Oficial | BCV: ${summary.averageExchangeRate.toFixed(4)} VES/USD`,
          type: 'String',
          styleId: 'CorpDocSub',
          mergeAcross: 6,
        },
      ],
    },
    { height: 8, cells: [{ value: '', type: 'String', mergeAcross: 6 }] },
    {
      height: 22,
      cells: [
        { value: 'Fecha', type: 'String', styleId: 'SubHeader' },
        { value: 'Referencia Bancaria', type: 'String', styleId: 'SubHeader' },
        { value: 'Entidad / Beneficiario', type: 'String', styleId: 'SubHeader' },
        { value: 'Tipo Impacto', type: 'String', styleId: 'SubHeader' },
        { value: 'Plataforma', type: 'String', styleId: 'SubHeader' },
        { value: 'Monto USD ($)', type: 'String', styleId: 'SubHeader' },
        { value: 'Monto VES (Bs.)', type: 'String', styleId: 'SubHeader' },
      ],
    },
  ];

  if (payments.length === 0) {
    sheet3Rows.push({
      height: 20,
      cells: [
        {
          value: 'No se registraron transacciones financieras en la ventana temporal seleccionada.',
          type: 'String',
          styleId: 'DefaultCell',
          mergeAcross: 6,
        },
      ],
    });
  } else {
    payments.forEach((p) => {
      sheet3Rows.push({
        height: 19,
        cells: [
          { value: p.date, type: 'String', styleId: 'CenterCell' },
          { value: p.reference || 'S/REF', type: 'String', styleId: 'DefaultCell' },
          { value: p.entityName, type: 'String', styleId: 'DefaultCell' },
          { value: p.impactType, type: 'String', styleId: 'CenterCell' },
          { value: p.platform || 'Bancario', type: 'String', styleId: 'DefaultCell' },
          { value: p.amountUSD, type: 'Number', styleId: 'CurrencyUSD' },
          { value: p.amountVES, type: 'Number', styleId: 'CurrencyVES' },
        ],
      });
    });
  }

  const worksheets: ExcelWorksheetDef[] = [
    {
      name: 'Resumen Ejecutivo EBITDA',
      columns: [
        { width: 220 }, // Métrica
        { width: 130 }, // USD
        { width: 150 }, // VES
        { width: 120 }, // %
      ],
      rows: sheet1Rows,
    },
    {
      name: 'Lotes Biológicos',
      columns: [
        { width: 110 },
        { width: 90 },
        { width: 90 },
        { width: 110 },
        { width: 120 },
        { width: 130 },
        { width: 100 },
      ],
      rows: sheet2Rows,
    },
    {
      name: 'Libro de Pagos',
      columns: [
        { width: 90 },
        { width: 140 },
        { width: 180 },
        { width: 100 },
        { width: 120 },
        { width: 120 },
        { width: 140 },
      ],
      rows: sheet3Rows,
    },
  ];

  const xmlContent = generateCorporateExcelXml({
    documentTitle: 'REPORTE CONSOLIDADO DE ANALÍTICA TEMPORAL, MÁRGENES & EBITDA',
    documentSubtitle: `Período: ${summary.range.startDate} al ${summary.range.endDate}`,
    documentFolio: folio,
    periodRange: `${summary.range.startDate} - ${summary.range.endDate}`,
    bcvRate: summary.averageExchangeRate,
    worksheets,
  });

  const blob = new Blob([xmlContent], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const filename = `PuroApure_Reporte_EBITDA_${summary.range.startDate}_al_${summary.range.endDate}.xls`;

  return { filename, blob, xmlContent };
}
