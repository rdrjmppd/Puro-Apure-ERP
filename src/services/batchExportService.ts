/**
 * Puro Apure ERP - Motor de Exportación Documental (Fase 3)
 * Módulo de Biomasa y Lotes Biológicos (Avícola y Porcino)
 * Generación de Fichas Técnicas Oficiales, Certificados de Lote e Informes Consolidados
 * Respeto estricto al Candado Antialucinaciones (Single Source of Truth) y Entorno Sandbox
 */

import {
  BiologicalBatch,
  FarmBiologicalControl,
  LivestockSpecies,
  HistoricalBatchRecord,
} from '../types/inventory';
import {
  generateCorporatePdfHtml,
  printOrExportPdfHtml,
  escapeHtml,
  triggerDirectBlobDownload,
} from '../utils/pdfTemplateEngine';
import {
  generateCorporateExcelXml,
  CorporateExcelWorkbookOptions,
  ExcelWorksheetDef,
  ExcelRowDef,
  ExcelCellDef,
} from '../utils/excelTemplateEngine';
import {
  calculateHistoricalBatchBalance,
  calculateCumulativeBusinessProfitability,
  centsRound,
} from './financialAnalyticsService';
import { CORPORATE_HEADER_CONFIG } from '../utils/documentAssets';

export class BatchExportService {
  /**
   * Genera el documento HTML corporativo para la Ficha Técnica / Certificado de un Lote Individual
   */
  static generateSingleBatchPdfHtml(
    batch: BiologicalBatch,
    controls: FarmBiologicalControl[] = [],
    bcvRate: number = 0
  ): string {
    const isAvian = batch.species === 'AVICOLA';
    const rateUsdPerKg = isAvian
      ? (batch.precioFacturableUsdPorKg ?? batch.unitPriceUSDPerKg ?? 4.0)
      : (batch.precioFacturableNetoUsdPorKg ?? batch.unitPriceUSDPerKg ?? 6.0);
    const shrinkageKg = isAvian ? 0 : (batch.deduccionMermaKg ?? batch.shrinkageDeductionKg ?? 17.5);
    const netWeightKg = batch.netWeightKg ?? Math.max(0, batch.grossWeightKg - shrinkageKg);
    const billableAmountUSD = batch.billableAmountUSD ?? (netWeightKg * rateUsdPerKg);
    const billableAmountVES = bcvRate > 0 ? billableAmountUSD * bcvRate : 0;
    const avgWeightKg = batch.currentCount > 0 ? (batch.grossWeightKg / batch.currentCount) : 0;
    const viabilityPercent = batch.initialCount > 0
      ? ((batch.currentCount / batch.initialCount) * 100).toFixed(1)
      : '100.0';

    const feedSacks = batch.feedSacksConsumed ?? 0;
    const feedCostUSD = batch.feedCostUSD ?? (
      !isAvian ? feedSacks * (batch.precioSacoAlimentoUsd ?? 40.0) : 0
    );
    const grossMarginUSD = !isAvian ? (billableAmountUSD - feedCostUSD) : billableAmountUSD;

    // Filtrar controles pertenecientes a este lote
    const batchControls = controls.filter((c) => c.batchId === batch.id);

    // Tabla 1: Conciliación Financiera y Métricas de Liquidación
    const financialTableHtml = `
      <div style="margin-top: 10px; margin-bottom: 14px;">
        <div style="font-size: 11pt; font-weight: 800; color: ${CORPORATE_HEADER_CONFIG.colors.primary}; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
          <span>1. Liquidación Económica y Parámetros de Mercado</span>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Concepto Biométrico / Financiero</th>
              <th class="center">Unidad</th>
              <th class="right">Magnitud Registrada</th>
              <th class="right">Tarifa Unitaria</th>
              <th class="right">Total Proyectado (USD)</th>
              ${bcvRate > 0 ? '<th class="right">Equivalente Oficial (VES)</th>' : ''}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Biomasa Bruta en Pie (Peso Vivo)</strong></td>
              <td class="center">Kilogramos</td>
              <td class="right" style="font-family: monospace;">${batch.grossWeightKg.toLocaleString()} kg</td>
              <td class="right" style="font-family: monospace;">-</td>
              <td class="right" style="font-family: monospace;">-</td>
              ${bcvRate > 0 ? '<td class="right" style="font-family: monospace;">-</td>' : ''}
            </tr>
            ${!isAvian ? `
            <tr>
              <td>Deducción Estándar por Merma de Faena</td>
              <td class="center">Kilogramos</td>
              <td class="right" style="font-family: monospace; color: #D97706;">-${shrinkageKg.toLocaleString()} kg</td>
              <td class="right" style="font-family: monospace;">-</td>
              <td class="right" style="font-family: monospace;">-</td>
              ${bcvRate > 0 ? '<td class="right" style="font-family: monospace;">-</td>' : ''}
            </tr>
            ` : ''}
            <tr>
              <td><strong>Biomasa Neta Facturable (${isAvian ? 'Peso Vivo Directo' : 'Canal Fría'})</strong></td>
              <td class="center">Kilogramos</td>
              <td class="right" style="font-family: monospace; font-weight: bold; color: ${CORPORATE_HEADER_CONFIG.colors.primary};">
                ${netWeightKg.toLocaleString()} kg
              </td>
              <td class="right" style="font-family: monospace; font-weight: bold; color: #0284C7;">
                $${rateUsdPerKg.toFixed(2)} USD/kg
              </td>
              <td class="right" style="font-family: monospace; font-weight: bold; color: #059669;">
                $${billableAmountUSD.toFixed(2)} USD
              </td>
              ${bcvRate > 0 ? `
              <td class="right" style="font-family: monospace; font-weight: bold; color: #059669;">
                ${billableAmountVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.
              </td>` : ''}
            </tr>
            ${!isAvian && feedCostUSD > 0 ? `
            <tr>
              <td>Alimentación Balanceada Acumulada (${feedSacks} sacos)</td>
              <td class="center">Sacos / USD</td>
              <td class="right" style="font-family: monospace;">${feedSacks} sacos</td>
              <td class="right" style="font-family: monospace;">$${(batch.precioSacoAlimentoUsd ?? 40.0).toFixed(2)} / saco</td>
              <td class="right" style="font-family: monospace; color: #DC2626;">-$${feedCostUSD.toFixed(2)} USD</td>
              ${bcvRate > 0 ? `
              <td class="right" style="font-family: monospace; color: #DC2626;">
                -${(feedCostUSD * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.
              </td>` : ''}
            </tr>
            <tr class="highlight-row">
              <td><strong>MARGEN BRUTO ESTIMADO DE CEBA</strong></td>
              <td class="center">Rendimiento</td>
              <td class="right" style="font-family: monospace;">-</td>
              <td class="right" style="font-family: monospace;">-</td>
              <td class="right" style="font-family: monospace; font-weight: bold; color: ${grossMarginUSD >= 0 ? '#059669' : '#DC2626'};">
                $${grossMarginUSD.toFixed(2)} USD
              </td>
              ${bcvRate > 0 ? `
              <td class="right" style="font-family: monospace; font-weight: bold; color: ${grossMarginUSD >= 0 ? '#059669' : '#DC2626'};">
                ${(grossMarginUSD * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.
              </td>` : ''}
            </tr>
            ` : ''}
          </tbody>
        </table>
      </div>
    `;

    // Tabla 2: Cuaderno de Pesajes y Controles en Balanza (Single Source of Truth)
    const controlsTableHtml = `
      <div style="margin-top: 14px; margin-bottom: 10px;">
        <div style="font-size: 11pt; font-weight: 800; color: ${CORPORATE_HEADER_CONFIG.colors.primary}; margin-bottom: 6px;">
          <span>2. Trazabilidad de Pesajes en Balanza y Controles de Granja</span>
        </div>
        ${batchControls.length === 0 ? `
          <div style="padding: 12px; border: 1px dashed #CBD5E1; border-radius: 6px; background-color: #F8FAFC; text-align: center; color: #64748B; font-size: 9pt;">
            No se registran pesajes biométricos intermedios en la base de datos para este lote. La biomasa reportada corresponde al arqueo oficial de ingreso / cierre.
          </div>
        ` : `
          <table class="data-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo de Control</th>
                <th class="right">Valor Métrico</th>
                <th>Unidad</th>
                <th>Insumo / Tratamiento</th>
                <th>Operador de Campo</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              ${batchControls.map((ctrl) => `
                <tr>
                  <td style="font-family: monospace;">${escapeHtml(ctrl.date)}</td>
                  <td><span class="badge ${ctrl.type === 'PESAJE' ? 'badge-primary' : 'badge-neutral'}">${escapeHtml(ctrl.type)}</span></td>
                  <td class="right" style="font-family: monospace; font-weight: bold;">${ctrl.metricValue.toLocaleString()}</td>
                  <td>${escapeHtml(ctrl.metricUnit)}</td>
                  <td>${escapeHtml(ctrl.productOrVaccineName || '-')}</td>
                  <td>${escapeHtml(ctrl.responsibleWorker || 'Operador de Granja')}</td>
                  <td style="font-size: 8pt; color: #64748B;">${escapeHtml(ctrl.observations || '-')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>
    `;

    const locationName = (batch.customFields?.galpon as string) || (batch.customFields?.corral as string) || 'Instalación Central';

    return generateCorporatePdfHtml({
      documentTitle: `Certificado Oficial de Lote Biológico (${batch.code})`,
      documentSubtitle: `Ficha Técnica Zootécnica, Rendimiento Biológico y Liquidación Comercial`,
      documentFolio: `BIO-${batch.code}-${batch.id.slice(-6).toUpperCase()}`,
      periodRange: `Inicio: ${batch.startDate} • Ciclo: ${batch.daysInCycle} días`,
      bcvRate: bcvRate > 0 ? bcvRate : undefined,
      kpis: [
        {
          title: 'Biomasa Bruta',
          value: `${batch.grossWeightKg.toLocaleString()} kg`,
          subtitle: `En pie (${batch.currentCount} animales)`,
          colorHex: '#0F172A',
        },
        {
          title: 'Peso Promedio',
          value: `${avgWeightKg.toFixed(2)} kg`,
          subtitle: isAvian ? 'Promedio por ave' : 'Promedio por cerdo',
          colorHex: '#D97706',
        },
        {
          title: 'Biomasa Neta',
          value: `${netWeightKg.toLocaleString()} kg`,
          subtitle: isAvian ? 'Facturable vivo' : `Canal (-${shrinkageKg} kg)`,
          colorHex: '#0284C7',
        },
        {
          title: 'Liquidación Proyectada',
          value: `$${billableAmountUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`,
          subtitle: bcvRate > 0 ? `${billableAmountVES.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Bs.` : `Tarifa: $${rateUsdPerKg.toFixed(2)}/kg`,
          colorHex: '#059669',
        },
      ],
      metaItems: [
        { label: 'Código de Lote', value: batch.code, highlight: true },
        { label: 'Especie', value: isAvian ? 'Avícola (Pollo Broiler Engorde)' : 'Porcino (Cerdos de Ceba)' },
        { label: 'Origen / Modalidad', value: batch.tipoIngreso === 'ADQUISICION_EXTERNA' ? 'Adquisición Externa' : 'Nacimiento en Granja' },
        { label: 'Sexo Parvada / Piara', value: batch.sexoParvadaPiara || batch.sexo || 'MIXTO', highlight: true },
        { label: 'Línea Genética / Raza', value: batch.lineaGeneticaRaza || batch.razaLineaGenetica || (isAvian ? 'Cobb 500' : 'Landrace') },
        { label: 'Población Actual', value: `${batch.currentCount} / ${batch.initialCount} animales (${viabilityPercent}% viabilidad)` },
        { label: 'Días de Ceba', value: `${batch.daysInCycle} días acumulados` },
        { label: 'Ubicación / Instalación', value: locationName },
        { label: 'Precio Unitario Mercado', value: `$${rateUsdPerKg.toFixed(2)} USD/kg ${isAvian ? 'vivo' : 'neto'}` },
        { label: 'Tasa BCV Aplicada', value: bcvRate > 0 ? `Bs. ${bcvRate.toFixed(4)} / USD` : 'Tasa del Día' },
      ],
      contentHtml: financialTableHtml + controlsTableHtml,
      notes: [
        `Certificación emitida de conformidad con los parámetros de la especie ${isAvian ? 'Avícola (ciclo 35-40 días)' : 'Porcina (ciclo hasta 150 días)'}.`,
        'Los datos biométricos y financieros provienen exclusivamente de los registros auditados en Cloud Firestore e IndexedDB (Cero Mock Data).',
        bcvRate > 0
          ? `La conversión a moneda nacional se calcula con base en la cotización oficial de Bs. ${bcvRate.toFixed(4)}/USD emitida por el Banco Central de Venezuela.`
          : 'Conversión a moneda nacional sujeta a la tasa oficial BCV a la fecha efectiva de corte o liquidación.',
        'Documento con validez de trazabilidad zootécnica interna para movilización, faena y auditoría fiscal agropecuaria.',
      ],
      showSignatures: true,
      signatureLabels: [
        'Médico Veterinario / Zootecnista de Granja',
        'Gerencia de Administración & Finanzas',
      ],
    });
  }

  /**
   * Genera el documento HTML corporativo para el Inventario Consolidado de Biomasa Viva (Avícola o Porcino)
   */
  static generateConsolidatedBatchesPdfHtml(
    species: LivestockSpecies,
    batches: BiologicalBatch[],
    bcvRate: number = 0
  ): string {
    const isAvian = species === 'AVICOLA';
    const totalAnimals = batches.reduce((sum, b) => sum + (b.currentCount || 0), 0);
    const initialAnimals = batches.reduce((sum, b) => sum + (b.initialCount || 0), 0);
    const totalGrossWeightKg = batches.reduce((sum, b) => sum + (b.grossWeightKg || 0), 0);
    const totalNetWeightKg = batches.reduce((sum, b) => {
      const shrinkage = isAvian ? 0 : (b.deduccionMermaKg ?? b.shrinkageDeductionKg ?? 17.5);
      const net = b.netWeightKg ?? Math.max(0, b.grossWeightKg - shrinkage);
      return sum + net;
    }, 0);
    const totalBillableUSD = batches.reduce((sum, b) => {
      const rate = isAvian
        ? (b.precioFacturableUsdPorKg ?? b.unitPriceUSDPerKg ?? 4.0)
        : (b.precioFacturableNetoUsdPorKg ?? b.unitPriceUSDPerKg ?? 6.0);
      const shrinkage = isAvian ? 0 : (b.deduccionMermaKg ?? b.shrinkageDeductionKg ?? 17.5);
      const net = b.netWeightKg ?? Math.max(0, b.grossWeightKg - shrinkage);
      return sum + (b.billableAmountUSD ?? (net * rate));
    }, 0);
    const totalBillableVES = bcvRate > 0 ? totalBillableUSD * bcvRate : 0;
    const totalFeedCostUSD = batches.reduce((sum, b) => {
      return sum + (b.feedCostUSD ?? (!isAvian ? (b.feedSacksConsumed ?? 0) * (b.precioSacoAlimentoUsd ?? 40.0) : 0));
    }, 0);

    const consolidatedTableHtml = `
      <div style="margin-top: 10px; margin-bottom: 12px;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Origen</th>
              <th class="center">Sexo</th>
              <th>Genética / Raza</th>
              <th class="center">Ciclo</th>
              <th class="right">Población</th>
              <th class="right">Peso Vivo</th>
              ${!isAvian ? '<th class="right">Merma</th>' : ''}
              <th class="right">Peso Neto</th>
              <th class="right">Tarifa</th>
              <th class="right">Liquidación USD</th>
              ${bcvRate > 0 ? '<th class="right">Liquidación VES</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${batches.length === 0 ? `
              <tr>
                <td colspan="${bcvRate > 0 ? (isAvian ? 10 : 11) : (isAvian ? 9 : 10)}" class="center" style="padding: 24px; color: #64748B; font-style: italic;">
                  No existen lotes ${isAvian ? 'avícolas' : 'porcinos'} registrados en la base de datos para este ejercicio.
                </td>
              </tr>
            ` : batches.map((batch) => {
              const rate = isAvian
                ? (batch.precioFacturableUsdPorKg ?? batch.unitPriceUSDPerKg ?? 4.0)
                : (batch.precioFacturableNetoUsdPorKg ?? batch.unitPriceUSDPerKg ?? 6.0);
              const shrinkage = isAvian ? 0 : (batch.deduccionMermaKg ?? batch.shrinkageDeductionKg ?? 17.5);
              const net = batch.netWeightKg ?? Math.max(0, batch.grossWeightKg - shrinkage);
              const billableUSD = batch.billableAmountUSD ?? (net * rate);
              const billableVES = bcvRate > 0 ? billableUSD * bcvRate : 0;

              return `
                <tr>
                  <td style="font-family: monospace; font-weight: bold; color: ${CORPORATE_HEADER_CONFIG.colors.primary};">
                    ${escapeHtml(batch.code)}
                  </td>
                  <td>
                    <span class="badge ${batch.tipoIngreso === 'ADQUISICION_EXTERNA' ? 'badge-primary' : 'badge-success'}">
                      ${batch.tipoIngreso === 'ADQUISICION_EXTERNA' ? 'Externa' : 'Granja'}
                    </span>
                  </td>
                  <td class="center" style="font-family: monospace; font-size: 8pt;">
                    ${escapeHtml(batch.sexoParvadaPiara || batch.sexo || 'MIXTO')}
                  </td>
                  <td style="font-size: 8.5pt;">
                    ${escapeHtml(batch.lineaGeneticaRaza || batch.razaLineaGenetica || (isAvian ? 'Cobb 500' : 'Landrace'))}
                  </td>
                  <td class="center" style="font-family: monospace;">
                    ${batch.daysInCycle}d
                  </td>
                  <td class="right" style="font-family: monospace;">
                    ${batch.currentCount} / ${batch.initialCount}
                  </td>
                  <td class="right" style="font-family: monospace;">
                    ${batch.grossWeightKg.toLocaleString()} kg
                  </td>
                  ${!isAvian ? `
                  <td class="right" style="font-family: monospace; color: #D97706;">
                    -${shrinkage} kg
                  </td>
                  ` : ''}
                  <td class="right" style="font-family: monospace; font-weight: bold;">
                    ${net.toLocaleString()} kg
                  </td>
                  <td class="right" style="font-family: monospace; color: #0284C7;">
                    $${rate.toFixed(2)}
                  </td>
                  <td class="right" style="font-family: monospace; font-weight: bold; color: #059669;">
                    $${billableUSD.toFixed(2)}
                  </td>
                  ${bcvRate > 0 ? `
                  <td class="right" style="font-family: monospace; font-weight: bold; color: #059669;">
                    ${billableVES.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Bs.
                  </td>
                  ` : ''}
                </tr>
              `;
            }).join('')}
            ${batches.length > 0 ? `
              <tr class="highlight-row" style="font-weight: bold;">
                <td colspan="5"><strong>TOTAL CONSOLIDADO (${batches.length} LOTES ACTIVOS)</strong></td>
                <td class="right" style="font-family: monospace;">${totalAnimals.toLocaleString()} / ${initialAnimals.toLocaleString()}</td>
                <td class="right" style="font-family: monospace;">${totalGrossWeightKg.toLocaleString()} kg</td>
                ${!isAvian ? `
                <td class="right" style="font-family: monospace; color: #D97706;">
                  -${(totalGrossWeightKg - totalNetWeightKg).toLocaleString()} kg
                </td>
                ` : ''}
                <td class="right" style="font-family: monospace; color: ${CORPORATE_HEADER_CONFIG.colors.primary};">
                  ${totalNetWeightKg.toLocaleString()} kg
                </td>
                <td class="right" style="font-family: monospace;">-</td>
                <td class="right" style="font-family: monospace; color: #059669;">
                  $${totalBillableUSD.toFixed(2)} USD
                </td>
                ${bcvRate > 0 ? `
                <td class="right" style="font-family: monospace; color: #059669;">
                  ${totalBillableVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.
                </td>
                ` : ''}
              </tr>
            ` : ''}
          </tbody>
        </table>
      </div>
    `;

    return generateCorporatePdfHtml({
      documentTitle: `Inventario Consolidado de Biomasa Viva - ${isAvian ? 'Lotes Avícolas' : 'Lotes Porcinos'}`,
      documentSubtitle: `Auditoría General de Población, Genética, Capacidad de Faena y Proyección Financiera`,
      documentFolio: `INV-${species}-${Date.now().toString().slice(-8)}`,
      periodRange: `Emisión Oficial: ${new Date().toLocaleDateString('es-VE')} • ${batches.length} Lotes Activos`,
      bcvRate: bcvRate > 0 ? bcvRate : undefined,
      kpis: [
        {
          title: 'Biomasa Total en Pie',
          value: `${totalGrossWeightKg.toLocaleString()} kg`,
          subtitle: `${totalAnimals.toLocaleString()} animales en ceba`,
          colorHex: '#0F172A',
        },
        {
          title: 'Biomasa Neta Facturable',
          value: `${totalNetWeightKg.toLocaleString()} kg`,
          subtitle: isAvian ? 'Peso vivo' : 'Rendimiento en canal',
          colorHex: '#0284C7',
        },
        {
          title: 'Facturación Estimada USD',
          value: `$${totalBillableUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`,
          subtitle: `Tarifas dinámicas de mercado`,
          colorHex: '#059669',
        },
        {
          title: 'Valor en Moneda Oficial',
          value: bcvRate > 0
            ? `${totalBillableVES.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Bs.`
            : 'Sujeto a Tasa BCV',
          subtitle: bcvRate > 0 ? `Tasa: Bs. ${bcvRate.toFixed(4)}/USD` : 'Arqueo cambiario',
          colorHex: '#10B981',
        },
      ],
      metaItems: [
        { label: 'Especie Evaluada', value: isAvian ? 'Avícola (Pollo Broiler)' : 'Porcina (Cerdos de Ceba)', highlight: true },
        { label: 'Total Lotes Evaluados', value: `${batches.length} lotes productivos` },
        { label: 'Población Total Activa', value: `${totalAnimals.toLocaleString()} animales (${((totalAnimals / Math.max(1, initialAnimals)) * 100).toFixed(1)}% viabilidad)` },
        { label: 'Biomasa Promedio', value: `${totalAnimals > 0 ? (totalGrossWeightKg / totalAnimals).toFixed(2) : '0.00'} kg/animal` },
        { label: 'Costo Alimento Consolidado', value: `$${totalFeedCostUSD.toFixed(2)} USD` },
        { label: 'Tasa BCV Oficial', value: bcvRate > 0 ? `Bs. ${bcvRate.toFixed(4)} / USD` : 'Tasa del Día' },
      ],
      contentHtml: consolidatedTableHtml,
      notes: [
        `Inventario consolidado estructurado para control zootécnico y conciliación de biomasa viva en granja.`,
        `Las variables de precio ($/kg), deducciones de merma y costos de insumos han sido configuradas dinámicamente según la volatilidad del mercado agropecuario.`,
        'Todos los lotes son monitoreados bajo estricto control de ciclos biológicos y pesos corporales registrados en balanza.',
        'Documento formal con validez para presentación gerencial, fiscal y crediticia.',
      ],
      showSignatures: true,
      signatureLabels: [
        'Dirección Técnica de Producción Agropecuaria',
        'Gerencia General & Finanzas Corporativas',
      ],
    });
  }

  /**
   * Dispara la impresión/exportación PDF en el navegador para un lote individual
   */
  static async exportSingleBatchToPdf(
    batch: BiologicalBatch,
    controls: FarmBiologicalControl[] = [],
    bcvRate: number = 0
  ): Promise<boolean> {
    const html = this.generateSingleBatchPdfHtml(batch, controls, bcvRate);
    const filename = `PuroApure_Certificado_Lote_${batch.code}_${batch.species}.html`;
    return printOrExportPdfHtml(html, filename);
  }

  /**
   * Dispara la impresión/exportación PDF en el navegador para el inventario consolidado
   */
  static async exportConsolidatedBatchesToPdf(
    species: LivestockSpecies,
    batches: BiologicalBatch[],
    bcvRate: number = 0
  ): Promise<boolean> {
    const html = this.generateConsolidatedBatchesPdfHtml(species, batches, bcvRate);
    const filename = `PuroApure_Inventario_Consolidado_${species}_${new Date().toISOString().split('T')[0]}.html`;
    return printOrExportPdfHtml(html, filename);
  }

  // =========================================================================
  // MÓDULO DE EXPORTACIÓN: HISTORIAL DE CAMADAS Y PARIDAS PASADAS (Fase 3)
  // Sustentación de Rentabilidad Real Acumulada del Negocio Hasta Ahora
  // =========================================================================

  /**
   * Genera el HTML corporativo para el Acta de Balance Individual de Camada o Parida Histórica
   */
  static generateSingleHistoricalBatchPdfHtml(
    batch: HistoricalBatchRecord,
    bcvRate: number = 0
  ): string {
    const isAvian = batch.especie === 'AVICOLA';
    const balance = calculateHistoricalBatchBalance(batch);
    const totalInvUSD = balance.inversionTotalCamadaUsd;
    const totalInvVES = bcvRate > 0 ? centsRound(totalInvUSD * bcvRate) : 0;
    const totalVentaUSD = batch.montoTotalVentaUsd;
    const totalVentaVES = bcvRate > 0 ? centsRound(totalVentaUSD * bcvRate) : 0;
    const utilidadUSD = balance.utilidadNetaRealUsd;
    const utilidadVES = bcvRate > 0 ? centsRound(utilidadUSD * bcvRate) : 0;

    // Estructura Porcentual de Costos
    const pctCompra = totalInvUSD > 0 ? centsRound((batch.montoPagadoCompraUsd / totalInvUSD) * 100) : 0;
    const pctAlimento = totalInvUSD > 0 ? centsRound((batch.costoAlimentosUsd / totalInvUSD) * 100) : 0;
    const pctVacunas = totalInvUSD > 0 ? centsRound((batch.costoVacunasUsd / totalInvUSD) * 100) : 0;
    const pctOtros = totalInvUSD > 0 ? centsRound((batch.costoOtrosInsumosUsd / totalInvUSD) * 100) : 0;
    const pctManoObra = totalInvUSD > 0 ? centsRound((batch.costoManoObraCuidadoresUsd / totalInvUSD) * 100) : 0;
    const pctVet = totalInvUSD > 0 ? centsRound((batch.costoVeterinarioCertificacionesUsd / totalInvUSD) * 100) : 0;

    const contentHtml = `
      <!-- 1. Parámetros Biométricos y Rendimiento Zootécnico -->
      <div style="margin-top: 10px; margin-bottom: 14px;">
        <div style="font-size: 11pt; font-weight: 800; color: ${CORPORATE_HEADER_CONFIG.colors.primary}; margin-bottom: 6px;">
          1. Parámetros Biométricos, Supervivencia y Biomasa Obtenida
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Parámetro Zootécnico</th>
              <th class="center">Modalidad / Raza</th>
              <th class="right">Recepción Inicial</th>
              <th class="right">Cierre / Beneficio</th>
              <th class="right">Rendimiento Final</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Población de Animales</strong></td>
              <td class="center">${escapeHtml(batch.lineaGeneticaRaza || (isAvian ? 'Cobb 500' : 'Landrace'))}</td>
              <td class="right">${batch.cantidadAnimalesInicial.toLocaleString()} animales</td>
              <td class="right">${balance.animalesBeneficiados.toLocaleString()} animales</td>
              <td class="right" style="color: ${balance.porcentajeSupervivencia >= 90 ? '#059669' : '#D97706'}; font-weight: bold;">
                ${balance.porcentajeSupervivencia.toFixed(1)}% Sup. (${batch.mortalidadTotalAnimales} bajas)
              </td>
            </tr>
            <tr>
              <td><strong>Ciclo y Tiempo en Granja</strong></td>
              <td class="center">${batch.tipoOrigenHistorico === 'COMPRA_ADQUISICION' ? 'Compra' : 'Nacimiento Granja'}</td>
              <td class="right">${batch.diasNacidosInicio} días al ingreso</td>
              <td class="right">${batch.edadBeneficioDias} días de edad</td>
              <td class="right font-mono font-bold">${balance.diasEfectivosEnGranja} días efectivos</td>
            </tr>
            <tr>
              <td><strong>Biomasa Viva y Merma</strong></td>
              <td class="center">${isAvian ? 'Pollo Vivo' : 'Canal Cerdos'}</td>
              <td class="right">${batch.pesoGlobalInicialKg.toLocaleString()} kg iniciales</td>
              <td class="right">${batch.pesoGlobalBrutoCierreKg.toLocaleString()} kg brutos</td>
              <td class="right" style="color: #059669; font-weight: bold;">
                ${batch.pesoGlobalNetoVendibleKg.toLocaleString()} kg netos ${!isAvian && batch.mermaTotalBeneficioKg > 0 ? `(-${batch.mermaTotalBeneficioKg} kg merma)` : ''}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 2. Desglose Estructurado de Inversión y Costos -->
      <div style="margin-top: 14px; margin-bottom: 14px;">
        <div style="font-size: 11pt; font-weight: 800; color: ${CORPORATE_HEADER_CONFIG.colors.primary}; margin-bottom: 6px;">
          2. Desglose Estructurado de Inversión y Costos Operativos
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Rubro / Asignación de Costo</th>
              <th class="center">Ponderación %</th>
              <th class="right">Monto Invertido (USD)</th>
              ${bcvRate > 0 ? '<th class="right">Equivalente Oficial (VES)</th>' : ''}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Adquisición Inicial de Animales</td>
              <td class="center">${pctCompra}%</td>
              <td class="right font-mono">$${batch.montoPagadoCompraUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              ${bcvRate > 0 ? `<td class="right font-mono">Bs. ${centsRound(batch.montoPagadoCompraUsd * bcvRate).toLocaleString()}</td>` : ''}
            </tr>
            <tr>
              <td>Alimentos Balanceados ${batch.cantidadSacosOKilosAlimento ? `(${batch.cantidadSacosOKilosAlimento} sacos/kg)` : ''}</td>
              <td class="center">${pctAlimento}%</td>
              <td class="right font-mono">$${batch.costoAlimentosUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              ${bcvRate > 0 ? `<td class="right font-mono">Bs. ${centsRound(batch.costoAlimentosUsd * bcvRate).toLocaleString()}</td>` : ''}
            </tr>
            <tr>
              <td>Plan de Vacunación y Bioseguridad</td>
              <td class="center">${pctVacunas}%</td>
              <td class="right font-mono">$${batch.costoVacunasUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              ${bcvRate > 0 ? `<td class="right font-mono">Bs. ${centsRound(batch.costoVacunasUsd * bcvRate).toLocaleString()}</td>` : ''}
            </tr>
            <tr>
              <td>Otros Insumos (Cama, Cal, Vitaminas, Desinfección)</td>
              <td class="center">${pctOtros}%</td>
              <td class="right font-mono">$${batch.costoOtrosInsumosUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              ${bcvRate > 0 ? `<td class="right font-mono">Bs. ${centsRound(batch.costoOtrosInsumosUsd * bcvRate).toLocaleString()}</td>` : ''}
            </tr>
            <tr>
              <td>Mano de Obra y Cuidadores Asignados</td>
              <td class="center">${pctManoObra}%</td>
              <td class="right font-mono">$${batch.costoManoObraCuidadoresUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              ${bcvRate > 0 ? `<td class="right font-mono">Bs. ${centsRound(batch.costoManoObraCuidadoresUsd * bcvRate).toLocaleString()}</td>` : ''}
            </tr>
            <tr>
              <td>Honorarios Veterinarios y Asistencia Técnica</td>
              <td class="center">${pctVet}%</td>
              <td class="right font-mono">$${batch.costoVeterinarioCertificacionesUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              ${bcvRate > 0 ? `<td class="right font-mono">Bs. ${centsRound(batch.costoVeterinarioCertificacionesUsd * bcvRate).toLocaleString()}</td>` : ''}
            </tr>
            <tr style="background-color: #F8FAFC; font-weight: 800;">
              <td>TOTAL INVERSIÓN Y MANTENIMIENTO DEL LOTE</td>
              <td class="center">100.0%</td>
              <td class="right font-mono" style="color: #0F172A;">$${totalInvUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD</td>
              ${bcvRate > 0 ? `<td class="right font-mono">Bs. ${totalInvVES.toLocaleString()}</td>` : ''}
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 3. Liquidación Económica y Estado de Resultados del Lote -->
      <div style="margin-top: 14px; margin-bottom: 14px;">
        <div style="font-size: 11pt; font-weight: 800; color: ${CORPORATE_HEADER_CONFIG.colors.primary}; margin-bottom: 6px;">
          3. Liquidación Económica y Estado de Resultados Individual (P&L)
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Concepto de Liquidación</th>
              <th class="center">Base de Cálculo</th>
              <th class="right">Total en Dólares (USD)</th>
              ${bcvRate > 0 ? '<th class="right">Total Oficial (VES)</th>' : ''}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ingreso Bruto por Ventas de Biomasa</td>
              <td class="center">${batch.pesoGlobalNetoVendibleKg.toLocaleString()} kg @ $${batch.precioVentaPorKgUsd.toFixed(2)}/kg</td>
              <td class="right font-mono" style="color: #0284C7; font-weight: bold;">$${totalVentaUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              ${bcvRate > 0 ? `<td class="right font-mono">Bs. ${totalVentaVES.toLocaleString()}</td>` : ''}
            </tr>
            <tr>
              <td>(-) Inversión y Costos Totales de Producción</td>
              <td class="center">Costo Unitario: $${balance.costoProduccionPorKgVendibleUsd.toFixed(2)}/kg</td>
              <td class="right font-mono" style="color: #DC2626;">-$${totalInvUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              ${bcvRate > 0 ? `<td class="right font-mono">-Bs. ${totalInvVES.toLocaleString()}</td>` : ''}
            </tr>
            <tr style="background-color: #ECFDF5; font-size: 10pt; font-weight: 900;">
              <td style="color: #065F46;">UTILIDAD NETA REAL DEL LOTE</td>
              <td class="center" style="color: #065F46;">Margen Neto: ${balance.margenRentabilidadVentasPorcentaje.toFixed(2)}%</td>
              <td class="right font-mono" style="color: #059669; font-size: 11pt;">$${utilidadUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD</td>
              ${bcvRate > 0 ? `<td class="right font-mono" style="color: #059669;">Bs. ${utilidadVES.toLocaleString()}</td>` : ''}
            </tr>
            <tr style="background-color: #F0FDF4; font-weight: 800;">
              <td style="color: #166534;">% DE GANANCIA REAL (ROI SOBRE CAPITAL INVERTIDO)</td>
              <td class="center" colspan="${bcvRate > 0 ? 2 : 1}" style="color: #166534; font-size: 11pt;">
                ROI: ${balance.porcentajeGananciaRealROI.toFixed(2)}%
              </td>
              <td class="right" style="color: #166534;">Retorno Efectivo</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    return generateCorporatePdfHtml({
      documentTitle: 'ACTA OFICIAL DE BALANCE INDIVIDUAL DE LOTE CERRADO',
      documentSubtitle: `Sustentación de Inversión, Rendimiento Zootécnico y Rentabilidad Neta Real • ${batch.codigoLoteHistorico}`,
      documentFolio: `ACTA-${batch.codigoLoteHistorico}`,
      issueDate: new Date().toLocaleDateString('es-VE'),
      kpis: [
        {
          title: 'Inversión Total Lote',
          value: `$${totalInvUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
          subtitle: `Compra + Mantenimiento`,
          colorHex: '#0F172A',
        },
        {
          title: 'Ingreso por Ventas',
          value: `$${totalVentaUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
          subtitle: `${batch.pesoGlobalNetoVendibleKg.toLocaleString()} kg netos`,
          colorHex: '#0284C7',
        },
        {
          title: 'Utilidad Neta Real',
          value: `$${utilidadUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
          subtitle: `Margen: ${balance.margenRentabilidadVentasPorcentaje.toFixed(2)}%`,
          colorHex: utilidadUSD >= 0 ? '#059669' : '#DC2626',
        },
        {
          title: 'ROI % Ganancia Real',
          value: `${balance.porcentajeGananciaRealROI.toFixed(2)}%`,
          subtitle: `Sobre Capital Invertido`,
          colorHex: balance.porcentajeGananciaRealROI >= 0 ? '#059669' : '#DC2626',
        },
      ],
      metaItems: [
        { label: 'Código de Lote', value: batch.codigoLoteHistorico, highlight: true },
        { label: 'Especie', value: isAvian ? 'Avícola (Camada de Pollos)' : 'Porcina (Parida de Cerdos)' },
        { label: 'Raza / Fenotipo', value: batch.lineaGeneticaRaza || 'Estándar' },
        { label: 'Fecha Inicio / Cierre', value: `${batch.fechaInicioLote} al ${batch.fechaBeneficioCierre} (${balance.diasEfectivosEnGranja} días)` },
        { label: 'Supervivencia', value: `${balance.porcentajeSupervivencia.toFixed(1)}% (${balance.animalesBeneficiados}/${batch.cantidadAnimalesInicial})` },
        { label: 'Tasa BCV Referencial', value: bcvRate > 0 ? `Bs. ${bcvRate.toFixed(4)} / USD` : 'Tasa del Cierre' },
      ],
      contentHtml,
      notes: [
        'Registro histórico inmutable auditado bajo especificación restrictiva del sistema Puro Apure ERP.',
        'Los insumos, mano de obra y biomasa corresponden a ciclos biológicos ya cerrados y no alteran los inventarios activos.',
        'La utilidad y el ROI reflejan estrictamente el balance real entre el capital invertido y el retorno efectivo de la venta.',
      ],
      showSignatures: true,
      signatureLabels: [
        'Responsable Zootécnico / Cuidadores',
        'Dirección de Finanzas y Control de Gestión',
      ],
    });
  }

  /**
   * Genera el HTML corporativo para el Informe Ejecutivo de Rentabilidad Real Acumulada del Negocio Hasta Ahora
   */
  static generateCumulativeProfitabilityPdfHtml(
    batches: HistoricalBatchRecord[],
    bcvRate: number = 0
  ): string {
    const cumulative = calculateCumulativeBusinessProfitability(batches);
    const avian = cumulative.avian;
    const porcine = cumulative.porcine;
    const cons = cumulative.consolidated;

    const contentHtml = `
      <!-- 1. Resumen Ejecutivo Consolidado -->
      <div style="margin-top: 10px; margin-bottom: 16px;">
        <div style="font-size: 11pt; font-weight: 800; color: ${CORPORATE_HEADER_CONFIG.colors.primary}; margin-bottom: 6px;">
          1. Consolidación de Rentabilidad Real por Especie y Total Negocio
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Línea Agroindustrial</th>
              <th class="center">Lotes Cerrados</th>
              <th class="right">Animales Beneficiados</th>
              <th class="right">Kg Vendibles</th>
              <th class="right">Inversión Total ($)</th>
              <th class="right">Ventas Totales ($)</th>
              <th class="right">Utilidad Neta ($)</th>
              <th class="center">ROI % Real</th>
              <th class="center">Margen %</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>🐔 Línea Avícola (Pollos)</strong></td>
              <td class="center font-bold">${avian.totalBatches}</td>
              <td class="right">${avian.totalAnimalsBenefited.toLocaleString()} (${avian.averageSurvivalRate.toFixed(1)}% sup.)</td>
              <td class="right">${avian.totalKgVendible.toLocaleString()} kg</td>
              <td class="right font-mono">$${avian.totalInvestedUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td class="right font-mono">$${avian.totalSalesUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td class="right font-mono font-bold" style="color: ${avian.netProfitUSD >= 0 ? '#059669' : '#DC2626'};">
                $${avian.netProfitUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
              <td class="center font-bold" style="color: #059669;">${avian.roiPercentage.toFixed(2)}%</td>
              <td class="center font-bold">${avian.profitMarginPercentage.toFixed(2)}%</td>
            </tr>
            <tr>
              <td><strong>🐖 Línea Porcina (Cerdos)</strong></td>
              <td class="center font-bold">${porcine.totalBatches}</td>
              <td class="right">${porcine.totalAnimalsBenefited.toLocaleString()} (${porcine.averageSurvivalRate.toFixed(1)}% sup.)</td>
              <td class="right">${porcine.totalKgVendible.toLocaleString()} kg</td>
              <td class="right font-mono">$${porcine.totalInvestedUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td class="right font-mono">$${porcine.totalSalesUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td class="right font-mono font-bold" style="color: ${porcine.netProfitUSD >= 0 ? '#059669' : '#DC2626'};">
                $${porcine.netProfitUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
              <td class="center font-bold" style="color: #059669;">${porcine.roiPercentage.toFixed(2)}%</td>
              <td class="center font-bold">${porcine.profitMarginPercentage.toFixed(2)}%</td>
            </tr>
            <tr style="background-color: #ECFDF5; font-size: 10pt; font-weight: 900;">
              <td style="color: #065F46;">TOTAL CONSOLIDADO DEL NEGOCIO</td>
              <td class="center" style="color: #065F46;">${cons.totalBatches} Lotes</td>
              <td class="right" style="color: #065F46;">${cons.totalAnimalsBenefited.toLocaleString()} de ${cons.totalAnimalsInitial.toLocaleString()}</td>
              <td class="right" style="color: #065F46;">${cons.totalKgVendible.toLocaleString()} kg</td>
              <td class="right font-mono" style="color: #065F46;">$${cons.totalInvestedUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td class="right font-mono" style="color: #065F46;">$${cons.totalSalesUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td class="right font-mono" style="color: #059669; font-size: 11pt;">$${cons.netProfitUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td class="center" style="color: #059669; font-size: 11pt;">${cons.roiPercentage.toFixed(2)}%</td>
              <td class="center" style="color: #059669;">${cons.profitMarginPercentage.toFixed(2)}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 2. Detalle Cronológico de Lotes Auditados -->
      <div style="margin-top: 16px; margin-bottom: 14px;">
        <div style="font-size: 11pt; font-weight: 800; color: ${CORPORATE_HEADER_CONFIG.colors.primary}; margin-bottom: 6px;">
          2. Desglose Individual de Camadas y Paridas Pasadas Registradas
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Código Lote</th>
              <th class="center">Especie</th>
              <th class="center">Fecha Cierre</th>
              <th class="right">Animales</th>
              <th class="right">Kg Netos</th>
              <th class="right">Inversión ($)</th>
              <th class="right">Venta ($)</th>
              <th class="right">Utilidad Neta ($)</th>
              <th class="center">ROI %</th>
            </tr>
          </thead>
          <tbody>
            ${
              batches.length === 0
                ? '<tr><td colspan="9" class="center">No hay lotes históricos cerrados registrados en base de datos.</td></tr>'
                : batches
                    .map((b) => {
                      const bal = calculateHistoricalBatchBalance(b);
                      return `
                        <tr>
                          <td><strong>${escapeHtml(b.codigoLoteHistorico)}</strong></td>
                          <td class="center">${b.especie === 'AVICOLA' ? '🐔 Pollo' : '🐖 Cerdo'}</td>
                          <td class="center font-mono">${escapeHtml(b.fechaBeneficioCierre)}</td>
                          <td class="right">${bal.animalesBeneficiados}/${b.cantidadAnimalesInicial}</td>
                          <td class="right">${b.pesoGlobalNetoVendibleKg.toLocaleString()} kg</td>
                          <td class="right font-mono">$${bal.inversionTotalCamadaUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td class="right font-mono">$${b.montoTotalVentaUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td class="right font-mono" style="color: ${bal.utilidadNetaRealUsd >= 0 ? '#059669' : '#DC2626'}; font-weight: bold;">
                            $${bal.utilidadNetaRealUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td class="center font-bold" style="color: ${bal.porcentajeGananciaRealROI >= 0 ? '#059669' : '#DC2626'};">
                            ${bal.porcentajeGananciaRealROI.toFixed(1)}%
                          </td>
                        </tr>
                      `;
                    })
                    .join('')
            }
          </tbody>
        </table>
      </div>
    `;

    return generateCorporatePdfHtml({
      documentTitle: 'INFORME EJECUTIVO DE RENTABILIDAD REAL DEL NEGOCIO HASTA LA FECHA',
      documentSubtitle: 'Sustento Probatorio y Auditoría Consolidada de Camadas de Pollos y Paridas de Cerdos',
      documentFolio: `AUDIT-PROFIT-${new Date().getFullYear()}`,
      issueDate: new Date().toLocaleDateString('es-VE'),
      kpis: [
        {
          title: 'ROI Real Global Acumulado',
          value: `${cons.roiPercentage.toFixed(2)}%`,
          subtitle: 'Sobre Capital Total Invertido',
          colorHex: '#059669',
        },
        {
          title: 'Utilidad Neta Acumulada',
          value: `$${cons.netProfitUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD`,
          subtitle: `Margen Global: ${cons.profitMarginPercentage.toFixed(2)}%`,
          colorHex: '#059669',
        },
        {
          title: 'Inversión Histórica Total',
          value: `$${cons.totalInvestedUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD`,
          subtitle: `${cons.totalBatches} Lotes Procesados`,
          colorHex: '#0F172A',
        },
        {
          title: 'Ventas Históricas Totales',
          value: `$${cons.totalSalesUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD`,
          subtitle: `${cons.totalKgVendible.toLocaleString()} kg netos vendidos`,
          colorHex: '#0284C7',
        },
      ],
      metaItems: [
        { label: 'Cobertura Histórica', value: 'Desde Inicio de Operaciones hasta la Fecha', highlight: true },
        { label: 'Total Lotes Evaluados', value: `${cons.totalBatches} Lotes Cerrados` },
        { label: 'Población Procesada', value: `${cons.totalAnimalsBenefited.toLocaleString()} de ${cons.totalAnimalsInitial.toLocaleString()} animales` },
        { label: 'Biomasa Total Vendida', value: `${cons.totalKgVendible.toLocaleString()} Kg Netos` },
        { label: 'Tasa BCV del Día', value: bcvRate > 0 ? `Bs. ${bcvRate.toFixed(4)} / USD` : 'Tasa Oficial' },
      ],
      contentHtml,
      notes: [
        'Documento probatorio oficial de rentabilidad real agroindustrial sustentado en la base de datos inmutable de Puro Apure ERP.',
        'Candado Antialucinaciones certificado: No contiene datos simulados ni inferidos; el cálculo consolida exclusivamente los lotes históricos cerrados.',
        'Válido para presentación ante asambleas de socios, auditorías fiscales y solicitudes de crédito bancario.',
      ],
      showSignatures: true,
      signatureLabels: [
        'Dirección de Producción Agropecuaria',
        'Presidencia & Finanzas Corporativas',
      ],
    });
  }

  /**
   * Exporta a PDF el Acta de Balance de un Lote Histórico Individual
   */
  static async exportSingleHistoricalBatchToPdf(
    batch: HistoricalBatchRecord,
    bcvRate: number = 0
  ): Promise<boolean> {
    const html = this.generateSingleHistoricalBatchPdfHtml(batch, bcvRate);
    const filename = `PuroApure_Acta_Lote_${batch.codigoLoteHistorico}_${batch.especie}.html`;
    return printOrExportPdfHtml(html, filename);
  }

  /**
   * Exporta a PDF el Informe de Rentabilidad Acumulada
   */
  static async exportCumulativeProfitabilityToPdf(
    batches: HistoricalBatchRecord[],
    bcvRate: number = 0
  ): Promise<boolean> {
    const html = this.generateCumulativeProfitabilityPdfHtml(batches, bcvRate);
    const filename = `PuroApure_Informe_Rentabilidad_Real_Acumulada_${new Date().toISOString().split('T')[0]}.html`;
    return printOrExportPdfHtml(html, filename);
  }

  /**
   * Exporta a Excel (.xls) el Acta de Balance de un Lote Histórico Individual
   */
  static exportSingleHistoricalBatchToExcel(
    batch: HistoricalBatchRecord,
    bcvRate: number = 0
  ): void {
    const isAvian = batch.especie === 'AVICOLA';
    const bal = calculateHistoricalBatchBalance(batch);

    const rows: ExcelRowDef[] = [
      {
        cells: [
          { value: 'ACTA OFICIAL DE BALANCE INDIVIDUAL DE LOTE CERRADO', styleId: 'DocHeaderTitle' },
        ],
      },
      {
        cells: [
          { value: `Lote: ${batch.codigoLoteHistorico} • Especie: ${batch.especie}`, styleId: 'DefaultCell' },
        ],
      },
      { cells: [] },
      // 1. Zootecnia
      {
        cells: [
          { value: '1. Parámetros Biométricos y Rendimiento', styleId: 'SectionHeader' },
        ],
      },
      {
        cells: [
          { value: 'Concepto', styleId: 'TableColHeader' },
          { value: 'Valor Registrado', styleId: 'TableColHeader' },
        ],
      },
      {
        cells: [
          { value: 'Animales Iniciales', styleId: 'DefaultCell' },
          { value: batch.cantidadAnimalesInicial, type: 'Number', styleId: 'CenterCell' },
        ],
      },
      {
        cells: [
          { value: 'Animales Beneficiados', styleId: 'DefaultCell' },
          { value: bal.animalesBeneficiados, type: 'Number', styleId: 'CenterCell' },
        ],
      },
      {
        cells: [
          { value: 'Mortalidad Total', styleId: 'DefaultCell' },
          { value: batch.mortalidadTotalAnimales, type: 'Number', styleId: 'CenterCell' },
        ],
      },
      {
        cells: [
          { value: '% Supervivencia', styleId: 'DefaultCell' },
          { value: `${bal.porcentajeSupervivencia.toFixed(1)}%`, styleId: 'CenterCell' },
        ],
      },
      {
        cells: [
          { value: 'Días Efectivos en Granja', styleId: 'DefaultCell' },
          { value: bal.diasEfectivosEnGranja, type: 'Number', styleId: 'CenterCell' },
        ],
      },
      {
        cells: [
          { value: 'Peso Global Bruto (Kg)', styleId: 'DefaultCell' },
          { value: batch.pesoGlobalBrutoCierreKg, type: 'Number', styleId: 'CurrencyUsd' },
        ],
      },
      {
        cells: [
          { value: 'Merma Post-Mortem (Kg)', styleId: 'DefaultCell' },
          { value: batch.mermaTotalBeneficioKg || 0, type: 'Number', styleId: 'CurrencyUsd' },
        ],
      },
      {
        cells: [
          { value: 'Peso Global Neto Vendible (Kg)', styleId: 'DefaultCell' },
          { value: batch.pesoGlobalNetoVendibleKg, type: 'Number', styleId: 'CurrencyUsd' },
        ],
      },
      { cells: [] },
      // 2. Costos
      {
        cells: [
          { value: '2. Desglose de Inversión y Costos (USD)', styleId: 'SectionHeader' },
        ],
      },
      {
        cells: [
          { value: 'Rubro', styleId: 'TableColHeader' },
          { value: 'Monto USD', styleId: 'TableColHeader' },
        ],
      },
      {
        cells: [
          { value: 'Compra Inicial de Animales', styleId: 'DefaultCell' },
          { value: batch.montoPagadoCompraUsd, type: 'Number', styleId: 'CurrencyUsd' },
        ],
      },
      {
        cells: [
          { value: 'Alimentos Balanceados', styleId: 'DefaultCell' },
          { value: batch.costoAlimentosUsd, type: 'Number', styleId: 'CurrencyUsd' },
        ],
      },
      {
        cells: [
          { value: 'Vacunación y Bioseguridad', styleId: 'DefaultCell' },
          { value: batch.costoVacunasUsd, type: 'Number', styleId: 'CurrencyUsd' },
        ],
      },
      {
        cells: [
          { value: 'Otros Insumos', styleId: 'DefaultCell' },
          { value: batch.costoOtrosInsumosUsd, type: 'Number', styleId: 'CurrencyUsd' },
        ],
      },
      {
        cells: [
          { value: 'Mano de Obra Cuidadores', styleId: 'DefaultCell' },
          { value: batch.costoManoObraCuidadoresUsd, type: 'Number', styleId: 'CurrencyUsd' },
        ],
      },
      {
        cells: [
          { value: 'Veterinario y Certificaciones', styleId: 'DefaultCell' },
          { value: batch.costoVeterinarioCertificacionesUsd, type: 'Number', styleId: 'CurrencyUsd' },
        ],
      },
      {
        cells: [
          { value: 'TOTAL INVERSIÓN LOTE (USD)', styleId: 'TotalRow' },
          { value: bal.inversionTotalCamadaUsd, type: 'Number', styleId: 'TotalRow' },
        ],
      },
      { cells: [] },
      // 3. P&L
      {
        cells: [
          { value: '3. Estado de Resultados y Retorno Comercial', styleId: 'SectionHeader' },
        ],
      },
      {
        cells: [
          { value: 'Precio Venta por Kg (USD)', styleId: 'DefaultCell' },
          { value: batch.precioVentaPorKgUsd, type: 'Number', styleId: 'CurrencyUsd' },
        ],
      },
      {
        cells: [
          { value: 'Venta Total Facturada (USD)', styleId: 'DefaultCell' },
          { value: batch.montoTotalVentaUsd, type: 'Number', styleId: 'CurrencyUsd' },
        ],
      },
      {
        cells: [
          { value: 'UTILIDAD NETA REAL (USD)', styleId: 'TotalRow' },
          { value: bal.utilidadNetaRealUsd, type: 'Number', styleId: 'TotalRow' },
        ],
      },
      {
        cells: [
          { value: '% ROI GANANCIA REAL (SOBRE INVERSIÓN)', styleId: 'TotalRow' },
          { value: `${bal.porcentajeGananciaRealROI.toFixed(2)}%`, styleId: 'CenterCell' },
        ],
      },
      {
        cells: [
          { value: '% MARGEN NETO SOBRE VENTAS', styleId: 'TotalRow' },
          { value: `${bal.margenRentabilidadVentasPorcentaje.toFixed(2)}%`, styleId: 'CenterCell' },
        ],
      },
    ];

    const xml = generateCorporateExcelXml({
      documentTitle: `ACTA DE BALANCE - LOTE ${batch.codigoLoteHistorico}`,
      documentFolio: `ACTA-${batch.codigoLoteHistorico}`,
      bcvRate,
      worksheets: [
        {
          name: 'Balance_Lote',
          columns: [{ width: 250 }, { width: 140 }, { width: 140 }],
          rows,
        },
      ],
    });

    const filename = `PuroApure_Acta_${batch.codigoLoteHistorico}_${batch.especie}.xls`;
    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    triggerDirectBlobDownload(blob, filename);
  }

  /**
   * Exporta a Excel (.xls) el Informe Ejecutivo de Rentabilidad Acumulada del Negocio Hasta Ahora
   */
  static exportCumulativeProfitabilityToExcel(
    batches: HistoricalBatchRecord[],
    bcvRate: number = 0
  ): void {
    const cumulative = calculateCumulativeBusinessProfitability(batches);
    const avian = cumulative.avian;
    const porcine = cumulative.porcine;
    const cons = cumulative.consolidated;

    // Hoja 1: Resumen Consolidado
    const summaryRows: ExcelRowDef[] = [
      {
        cells: [
          { value: 'INFORME EJECUTIVO DE RENTABILIDAD REAL DEL NEGOCIO HASTA LA FECHA', styleId: 'DocHeaderTitle' },
        ],
      },
      {
        cells: [
          { value: `Fecha de Emisión: ${new Date().toLocaleDateString('es-VE')} • Tasa BCV: Bs. ${bcvRate.toFixed(4)}/USD`, styleId: 'DefaultCell' },
        ],
      },
      { cells: [] },
      {
        cells: [
          { value: 'Línea Productiva', styleId: 'TableColHeader' },
          { value: 'Lotes Cerrados', styleId: 'TableColHeader' },
          { value: 'Animales Beneficiados', styleId: 'TableColHeader' },
          { value: 'Kg Netos Vendibles', styleId: 'TableColHeader' },
          { value: 'Inversión Total ($)', styleId: 'TableColHeader' },
          { value: 'Ventas Totales ($)', styleId: 'TableColHeader' },
          { value: 'Utilidad Neta ($)', styleId: 'TableColHeader' },
          { value: 'ROI Real (%)', styleId: 'TableColHeader' },
          { value: 'Margen (%)', styleId: 'TableColHeader' },
        ],
      },
      {
        cells: [
          { value: 'Línea Avícola (Pollos)', styleId: 'DefaultCell' },
          { value: avian.totalBatches, type: 'Number', styleId: 'CenterCell' },
          { value: avian.totalAnimalsBenefited, type: 'Number', styleId: 'CenterCell' },
          { value: avian.totalKgVendible, type: 'Number', styleId: 'CurrencyUsd' },
          { value: avian.totalInvestedUSD, type: 'Number', styleId: 'CurrencyUsd' },
          { value: avian.totalSalesUSD, type: 'Number', styleId: 'CurrencyUsd' },
          { value: avian.netProfitUSD, type: 'Number', styleId: 'CurrencyUsd' },
          { value: `${avian.roiPercentage.toFixed(2)}%`, styleId: 'CenterCell' },
          { value: `${avian.profitMarginPercentage.toFixed(2)}%`, styleId: 'CenterCell' },
        ],
      },
      {
        cells: [
          { value: 'Línea Porcina (Cerdos)', styleId: 'DefaultCell' },
          { value: porcine.totalBatches, type: 'Number', styleId: 'CenterCell' },
          { value: porcine.totalAnimalsBenefited, type: 'Number', styleId: 'CenterCell' },
          { value: porcine.totalKgVendible, type: 'Number', styleId: 'CurrencyUsd' },
          { value: porcine.totalInvestedUSD, type: 'Number', styleId: 'CurrencyUsd' },
          { value: porcine.totalSalesUSD, type: 'Number', styleId: 'CurrencyUsd' },
          { value: porcine.netProfitUSD, type: 'Number', styleId: 'CurrencyUsd' },
          { value: `${porcine.roiPercentage.toFixed(2)}%`, styleId: 'CenterCell' },
          { value: `${porcine.profitMarginPercentage.toFixed(2)}%`, styleId: 'CenterCell' },
        ],
      },
      {
        cells: [
          { value: 'TOTAL CONSOLIDADO DEL NEGOCIO', styleId: 'TotalRow' },
          { value: cons.totalBatches, type: 'Number', styleId: 'TotalRow' },
          { value: cons.totalAnimalsBenefited, type: 'Number', styleId: 'TotalRow' },
          { value: cons.totalKgVendible, type: 'Number', styleId: 'TotalRow' },
          { value: cons.totalInvestedUSD, type: 'Number', styleId: 'TotalRow' },
          { value: cons.totalSalesUSD, type: 'Number', styleId: 'TotalRow' },
          { value: cons.netProfitUSD, type: 'Number', styleId: 'TotalRow' },
          { value: `${cons.roiPercentage.toFixed(2)}%`, styleId: 'TotalRow' },
          { value: `${cons.profitMarginPercentage.toFixed(2)}%`, styleId: 'TotalRow' },
        ],
      },
    ];

    // Hoja 2: Listado Detallado de Lotes
    const detailRows: ExcelRowDef[] = [
      {
        cells: [
          { value: 'Código Lote', styleId: 'TableColHeader' },
          { value: 'Especie', styleId: 'TableColHeader' },
          { value: 'Origen', styleId: 'TableColHeader' },
          { value: 'Fecha Cierre', styleId: 'TableColHeader' },
          { value: 'Animales Iniciales', styleId: 'TableColHeader' },
          { value: 'Animales Beneficiados', styleId: 'TableColHeader' },
          { value: '% Supervivencia', styleId: 'TableColHeader' },
          { value: 'Kg Netos', styleId: 'TableColHeader' },
          { value: 'Inversión Total ($)', styleId: 'TableColHeader' },
          { value: 'Venta Total ($)', styleId: 'TableColHeader' },
          { value: 'Utilidad Neta ($)', styleId: 'TableColHeader' },
          { value: 'ROI % Real', styleId: 'TableColHeader' },
        ],
      },
      ...batches.map((b) => {
        const bal = calculateHistoricalBatchBalance(b);
        return {
          cells: [
            { value: b.codigoLoteHistorico, styleId: 'DefaultCell' },
            { value: b.especie, styleId: 'CenterCell' },
            { value: b.tipoOrigenHistorico === 'COMPRA_ADQUISICION' ? 'Compra' : 'Granja', styleId: 'CenterCell' },
            { value: b.fechaBeneficioCierre, styleId: 'CenterCell' },
            { value: b.cantidadAnimalesInicial, type: 'Number' as const, styleId: 'CenterCell' },
            { value: bal.animalesBeneficiados, type: 'Number' as const, styleId: 'CenterCell' },
            { value: `${bal.porcentajeSupervivencia.toFixed(1)}%`, styleId: 'CenterCell' },
            { value: b.pesoGlobalNetoVendibleKg, type: 'Number' as const, styleId: 'CurrencyUsd' },
            { value: bal.inversionTotalCamadaUsd, type: 'Number' as const, styleId: 'CurrencyUsd' },
            { value: b.montoTotalVentaUsd, type: 'Number' as const, styleId: 'CurrencyUsd' },
            { value: bal.utilidadNetaRealUsd, type: 'Number' as const, styleId: 'CurrencyUsd' },
            { value: `${bal.porcentajeGananciaRealROI.toFixed(2)}%`, styleId: 'CenterCell' },
          ],
        };
      }),
    ];

    const xml = generateCorporateExcelXml({
      documentTitle: 'INFORME DE RENTABILIDAD REAL ACUMULADA DEL NEGOCIO',
      documentFolio: `RENTABILIDAD-HISTORICA-${new Date().getFullYear()}`,
      bcvRate,
      worksheets: [
        {
          name: 'Resumen_Consolidado',
          columns: [
            { width: 180 },
            { width: 90 },
            { width: 130 },
            { width: 120 },
            { width: 130 },
            { width: 130 },
            { width: 130 },
            { width: 90 },
            { width: 90 },
          ],
          rows: summaryRows,
        },
        {
          name: 'Lotes_Auditados',
          columns: [
            { width: 150 },
            { width: 80 },
            { width: 80 },
            { width: 90 },
            { width: 100 },
            { width: 110 },
            { width: 90 },
            { width: 100 },
            { width: 120 },
            { width: 120 },
            { width: 120 },
            { width: 90 },
          ],
          rows: detailRows,
        },
      ],
    });

    const filename = `PuroApure_Rentabilidad_Real_Acumulada_${new Date().toISOString().split('T')[0]}.xls`;
    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    triggerDirectBlobDownload(blob, filename);
  }
}
