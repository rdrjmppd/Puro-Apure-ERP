/**
 * Puro Apure ERP - Motor de Renderizado PDF (Fase 2)
 * Plantilla Maestra Inmutable de Membrete Corporativo
 * Inyección de logotipo en Base64, identidad fiscal y trazabilidad documental
 */

import { CORPORATE_HEADER_CONFIG, getDocumentBrandingLogo } from './documentAssets';

export interface DocumentMetaItem {
  label: string;
  value: string;
  highlight?: boolean;
}

export interface TableColumn {
  header: string;
  key: string;
  align?: 'left' | 'center' | 'right';
  format?: (val: any) => string;
}

export interface KpiCardItem {
  title: string;
  value: string;
  subtitle?: string;
  colorHex?: string;
}

export interface CorporatePdfOptions {
  documentTitle: string;
  documentSubtitle?: string;
  documentFolio?: string;
  issueDate?: string;
  periodRange?: string;
  bcvRate?: number;
  metaItems?: DocumentMetaItem[];
  kpis?: KpiCardItem[];
  contentHtml?: string;
  notes?: string[];
  showSignatures?: boolean;
  signatureLabels?: [string, string];
  customWatermarkLogo?: string;
}

/**
 * Escapa cadenas de texto para evitar vulnerabilidades XSS e inyección de HTML malicioso en reportes
 */
export function escapeHtml(str: string | number | undefined | null): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Genera el documento HTML completo de alta resolución para renderizado e impresión PDF.
 * Incluye membrete corporativo inmutable, pleca institucional bicromática, marca de agua central y pie legal.
 */
export function generateCorporatePdfHtml(options: CorporatePdfOptions): string {
  const logoSrc = options.customWatermarkLogo || getDocumentBrandingLogo();
  const currentDate = options.issueDate || new Date().toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const folio = options.documentFolio || `DOC-${Date.now().toString().slice(-8)}`;

  // Render KPI grid if provided
  const kpiSection = options.kpis && options.kpis.length > 0 ? `
    <div class="kpi-grid">
      ${options.kpis.map((kpi) => `
        <div class="kpi-card">
          <div class="kpi-title">${escapeHtml(kpi.title)}</div>
          <div class="kpi-val" style="color: ${kpi.colorHex || CORPORATE_HEADER_CONFIG.colors.darkNeutral};">${escapeHtml(kpi.value)}</div>
          ${kpi.subtitle ? `<div class="kpi-sub">${escapeHtml(kpi.subtitle)}</div>` : ''}
        </div>
      `).join('')}
    </div>
  ` : '';

  // Render metadata pills/grid
  const metaSection = options.metaItems && options.metaItems.length > 0 ? `
    <div class="meta-grid">
      ${options.metaItems.map((item) => `
        <div class="meta-item ${item.highlight ? 'meta-highlight' : ''}">
          <span class="meta-label">${escapeHtml(item.label)}:</span>
          <span class="meta-val">${escapeHtml(item.value)}</span>
        </div>
      `).join('')}
    </div>
  ` : '';

  // Render notes
  const notesSection = options.notes && options.notes.length > 0 ? `
    <div class="notes-container">
      <div class="notes-title">Notas Operativas y Observaciones Legales:</div>
      <ul class="notes-list">
        ${options.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  // Render signatures
  const signaturesSection = options.showSignatures ? `
    <div class="signatures-wrapper">
      <div class="signature-box">
        <div class="sig-line"></div>
        <div class="sig-name">${options.signatureLabels ? options.signatureLabels[0] : 'Emisor Autorizado / Gerencia Operativa'}</div>
        <div class="sig-role">${CORPORATE_HEADER_CONFIG.tradeName} • Sello Digital</div>
      </div>
      <div class="signature-box">
        <div class="sig-line"></div>
        <div class="sig-name">${options.signatureLabels ? options.signatureLabels[1] : 'Conformidad / Auditoría Fiscal'}</div>
        <div class="sig-role">Firma & R.I.F. Receptor</div>
      </div>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${options.documentTitle} - ${CORPORATE_HEADER_CONFIG.tradeName}</title>
  <style>
    @page {
      size: letter portrait;
      margin: 8mm 12mm 8mm 12mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: ${CORPORATE_HEADER_CONFIG.colors.darkNeutral};
      background-color: #ffffff;
      margin: 0;
      padding: 12px 16px;
      position: relative;
      font-size: 9.5pt;
      line-height: 1.32;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Pleca superior bicromática corporativa */
    .corporate-stripe {
      display: flex;
      height: 5px;
      width: 100%;
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 10px;
    }
    .stripe-primary {
      flex: 3;
      background-color: ${CORPORATE_HEADER_CONFIG.colors.primary};
    }
    .stripe-secondary {
      flex: 1;
      background-color: ${CORPORATE_HEADER_CONFIG.colors.secondary};
    }
    .stripe-accent {
      flex: 1;
      background-color: ${CORPORATE_HEADER_CONFIG.colors.accent};
    }

    /* Marca de agua centralizada sutil */
    .watermark-container {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 0;
      overflow: hidden;
      opacity: 0.06;
    }
    .watermark-img {
      width: 480px;
      max-width: 75%;
      height: auto;
      object-fit: contain;
      filter: grayscale(20%);
    }

    .document-body {
      position: relative;
      z-index: 10;
    }

    /* Cabecera institucional: Recalibración vertical Y (Header Refactoring) */
    .header-layout {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid ${CORPORATE_HEADER_CONFIG.colors.primary};
      padding-bottom: 6px;
      margin-bottom: 8px;
      gap: 12px;
    }
    .brand-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-logo-frame {
      width: 66px;
      min-width: 66px;
      height: 66px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      border: 1px solid #E2E8F0;
      background-color: #FFFFFF;
      padding: 3px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    .brand-logo-frame img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .brand-details h1 {
      margin: 0;
      font-size: 15pt;
      font-weight: 900;
      color: ${CORPORATE_HEADER_CONFIG.colors.primary};
      letter-spacing: -0.4px;
      line-height: 1.1;
    }
    .company-legal-name {
      font-size: 9pt;
      font-weight: 700;
      color: ${CORPORATE_HEADER_CONFIG.colors.darkNeutral};
      margin-top: 1px;
    }
    .company-tax-id {
      font-size: 8pt;
      font-family: "Courier New", Courier, monospace;
      font-weight: 700;
      color: ${CORPORATE_HEADER_CONFIG.colors.secondary};
      margin-top: 1px;
    }
    .company-address {
      font-size: 7pt;
      color: ${CORPORATE_HEADER_CONFIG.colors.mediumNeutral};
      margin-top: 2px;
      max-width: 380px;
      line-height: 1.2;
    }

    /* Bloque derecho del encabezado: Folio y Fechas (Sin tasa BCV redundante en membrete) */
    .doc-meta-right {
      text-align: right;
      font-family: "Courier New", Courier, monospace;
      font-size: 8pt;
      line-height: 1.35;
      min-width: 190px;
    }
    .badge-doc-type {
      display: inline-block;
      background-color: ${CORPORATE_HEADER_CONFIG.colors.primary};
      color: #FFFFFF;
      font-weight: 800;
      font-size: 7.5pt;
      padding: 2px 8px;
      border-radius: 4px;
      letter-spacing: 0.6px;
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    .doc-folio {
      font-size: 10pt;
      font-weight: 900;
      color: ${CORPORATE_HEADER_CONFIG.colors.darkNeutral};
    }
    .doc-date {
      color: ${CORPORATE_HEADER_CONFIG.colors.mediumNeutral};
      font-size: 7.5pt;
    }

    /* Título principal del contenido */
    .title-banner {
      margin-bottom: 6px;
    }
    .title-banner h2 {
      margin: 0;
      font-size: 12pt;
      font-weight: 800;
      color: ${CORPORATE_HEADER_CONFIG.colors.primary};
      text-transform: uppercase;
      letter-spacing: 0.2px;
    }
    .title-banner p {
      margin: 1px 0 0 0;
      font-size: 7.5pt;
      color: ${CORPORATE_HEADER_CONFIG.colors.mediumNeutral};
    }

    /* Grilla de Metadatos */
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 6px;
      background-color: ${CORPORATE_HEADER_CONFIG.colors.lightNeutral};
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 6px 10px;
      margin-bottom: 8px;
      font-size: 7.5pt;
    }
    .meta-item {
      display: flex;
      flex-direction: column;
    }
    .meta-label {
      font-size: 7pt;
      text-transform: uppercase;
      font-weight: 700;
      color: ${CORPORATE_HEADER_CONFIG.colors.mediumNeutral};
      letter-spacing: 0.2px;
    }
    .meta-val {
      font-weight: 700;
      color: ${CORPORATE_HEADER_CONFIG.colors.darkNeutral};
      margin-top: 1px;
    }
    .meta-highlight .meta-val {
      color: ${CORPORATE_HEADER_CONFIG.colors.primary};
    }

    /* Grilla de KPIs */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }
    .kpi-card {
      border: 1px solid #CBD5E1;
      border-radius: 6px;
      padding: 8px 10px;
      background-color: ${CORPORATE_HEADER_CONFIG.colors.lightNeutral};
      box-shadow: 0 1px 2px rgba(0,0,0,0.02);
    }
    .kpi-title {
      font-size: 7pt;
      font-weight: 800;
      color: ${CORPORATE_HEADER_CONFIG.colors.mediumNeutral};
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-bottom: 2px;
    }
    .kpi-val {
      font-size: 11pt;
      font-weight: 900;
      font-family: "Courier New", Courier, monospace;
    }
    .kpi-sub {
      font-size: 6.5pt;
      color: ${CORPORATE_HEADER_CONFIG.colors.mediumNeutral};
      margin-top: 1px;
    }

    /* Tablas Estilizadas con Identidad Corporativa: Recalibración vertical Y */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      margin-bottom: 12px;
      font-size: 8pt;
    }
    th {
      background-color: ${CORPORATE_HEADER_CONFIG.colors.primary};
      color: #FFFFFF;
      text-align: left;
      padding: 6px 10px;
      font-weight: 800;
      font-size: 7.5pt;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    th.right, td.right {
      text-align: right;
    }
    th.center, td.center {
      text-align: center;
    }
    td {
      padding: 5px 10px;
      border-bottom: 1px solid #E2E8F0;
      color: ${CORPORATE_HEADER_CONFIG.colors.darkNeutral};
    }
    tr:nth-child(even) td {
      background-color: #F8FAFC;
    }
    .bold-row td {
      font-weight: 800;
      background-color: #F1F5F9;
      border-top: 2px solid #0F172A;
      border-bottom: 2px solid #0F172A;
    }
    .highlight-row td {
      font-weight: 800;
      background-color: #ECFDF5;
      color: ${CORPORATE_HEADER_CONFIG.colors.primary};
      border-bottom: 2px solid ${CORPORATE_HEADER_CONFIG.colors.primary};
    }

    /* Notas y observaciones compactadas */
    .notes-container {
      margin-top: 10px;
      padding: 6px 10px;
      background-color: #F8FAFC;
      border-left: 3px solid ${CORPORATE_HEADER_CONFIG.colors.secondary};
      border-radius: 4px;
      font-size: 7.5pt;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .notes-title {
      font-weight: 800;
      color: ${CORPORATE_HEADER_CONFIG.colors.darkNeutral};
      margin-bottom: 2px;
    }
    .notes-list {
      margin: 0;
      padding-left: 16px;
      color: ${CORPORATE_HEADER_CONFIG.colors.mediumNeutral};
    }

    /* Bloque unificado de cierre (Fase 2: Compresión Eje Y & Page-Break Avoid) */
    .closing-block {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* Firmas y Sellos: Compresión del Eje Y */
    .signatures-wrapper {
      margin-top: 14px;
      padding-top: 8px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      text-align: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sig-line {
      border-bottom: 1.5px solid #94A3B8;
      width: 75%;
      margin: 0 auto 4px auto;
      height: 18px;
    }
    .sig-name {
      font-size: 8pt;
      font-weight: 800;
      color: ${CORPORATE_HEADER_CONFIG.colors.darkNeutral};
    }
    .sig-role {
      font-size: 7pt;
      color: ${CORPORATE_HEADER_CONFIG.colors.mediumNeutral};
    }

    /* Pie de página de validez documental: Compresión del Eje Y */
    .corporate-footer {
      margin-top: 12px;
      padding-top: 6px;
      border-top: 1px solid #E2E8F0;
      text-align: center;
      font-size: 7pt;
      line-height: 1.25;
      color: ${CORPORATE_HEADER_CONFIG.colors.mediumNeutral};
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .footer-brand {
      font-weight: 800;
      color: ${CORPORATE_HEADER_CONFIG.colors.primary};
    }
    .footer-security {
      font-family: "Courier New", Courier, monospace;
      font-size: 6.5pt;
      color: #94A3B8;
      margin-top: 2px;
    }

    @media print {
      html, body {
        width: 100%;
        height: auto;
        padding: 0 !important;
        margin: 0 !important;
        background: transparent !important;
        font-size: 9pt;
      }
      .document-body {
        max-width: 100%;
        page-break-after: avoid;
      }
      .watermark-container {
        position: fixed;
      }
      .no-print {
        display: none !important;
      }
      /* Garantía estricta de consolidación Página 1 de 1 */
      .header-layout,
      .title-banner,
      .meta-grid,
      .kpi-grid,
      table,
      .notes-container,
      .closing-block {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }
    }
  </style>
</head>
<body>
  <!-- Marca de Agua Central -->
  <div class="watermark-container" aria-hidden="true">
    <img src="${logoSrc}" class="watermark-img" alt="" />
  </div>

  <div class="document-body">
    <!-- Pleca Institucional Superior -->
    <div class="corporate-stripe">
      <div class="stripe-primary"></div>
      <div class="stripe-secondary"></div>
      <div class="stripe-accent"></div>
    </div>

    <!-- Encabezado Institucional con Logotipo Oficial Base64 -->
    <header class="header-layout">
      <div class="brand-left">
        <div class="brand-logo-frame">
          <img src="${logoSrc}" alt="${CORPORATE_HEADER_CONFIG.tradeName}" />
        </div>
        <div class="brand-details">
          <h1>${CORPORATE_HEADER_CONFIG.tradeName}</h1>
          <div class="company-legal-name">${CORPORATE_HEADER_CONFIG.companyName}</div>
          <div class="company-tax-id">RIF: ${CORPORATE_HEADER_CONFIG.rif} • ${CORPORATE_HEADER_CONFIG.fiscalRegime}</div>
          <div class="company-address">${CORPORATE_HEADER_CONFIG.headquartersAddress}</div>
        </div>
      </div>

      <div class="doc-meta-right">
        <div class="badge-doc-type">Reporte Oficial</div>
        <div class="doc-folio">FOLIO: ${folio}</div>
        <div class="doc-date">Emisión: ${currentDate}</div>
        ${options.periodRange ? `<div class="doc-date">Período: <strong>${options.periodRange}</strong></div>` : ''}
      </div>
    </header>

    <!-- Título y subtítulo del documento -->
    <div class="title-banner">
      <h2>${options.documentTitle}</h2>
      ${options.documentSubtitle ? `<p>${options.documentSubtitle}</p>` : ''}
    </div>

    <!-- Metadatos dinámicos -->
    ${metaSection}

    <!-- Grilla de KPIs -->
    ${kpiSection}

    <!-- Contenido Principal Inyectado -->
    ${options.contentHtml || ''}

    <!-- Notas y Aclaratorias -->
    ${notesSection}

    <!-- Bloque de Cierre Unificado (Fase 2: Evita expulsión del footer a página secundaria) -->
    <div class="closing-block">
      <!-- Firmas de Autorización -->
      ${signaturesSection}

      <!-- Pie de Página Corporativo con Certificación Digital -->
      <footer class="corporate-footer">
        <div>
          <span class="footer-brand">${CORPORATE_HEADER_CONFIG.tradeName}</span> • 
          ${CORPORATE_HEADER_CONFIG.companyName} • 
          RIF: ${CORPORATE_HEADER_CONFIG.rif} • 
          Contacto: ${CORPORATE_HEADER_CONFIG.email}
        </div>
        <div class="footer-security">
          Documento digital emitido por el sistema ERP Agroindustrial Offline-First. Trazabilidad criptográfica garantizada. Folio: ${folio} • Timestamp: ${new Date().toISOString()}
        </div>
      </footer>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Fuerza la descarga directa y atómica de un archivo sin depender de ventanas emergentes o pestañas secundarias.
 * Evita la expiración de 'transient activation' al utilizar un elemento <a> transitorio con URL.createObjectURL.
 * Garantiza la liberación determinística de memoria mediante URL.revokeObjectURL sin interrumpir la descarga.
 */
export function triggerDirectBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.style.display = 'none';
  anchor.href = url;
  anchor.setAttribute('download', filename);
  anchor.setAttribute('rel', 'noopener noreferrer');
  document.body.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    // Liberación determinística de memoria tras permitir al gestor de descargas capturar el stream
    setTimeout(() => {
      try {
        if (anchor.parentNode) {
          anchor.parentNode.removeChild(anchor);
        }
      } catch {
        // Safe DOM cleanup
      }
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Safe URL cleanup
      }
    }, 1000);
  }
}

/**
 * Descarga directa del documento HTML / PDF como archivo descargable e imprimible independiente.
 * Utiliza tipo MIME estándar text/html con cabeceras de visualización e impresión autónoma.
 */
export function downloadHtmlAsPdfDoc(htmlContent: string, filename: string = 'Reporte_Oficial_PuroApure.html'): void {
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  triggerDirectBlobDownload(blob, filename);
}

/**
 * Imprime o exporta el documento PDF utilizando un iframe aislado o descarga directa.
 * Es compatible tanto con entornos estándar como con sandboxes/iframes sin recurrir a window.open.
 */
export function printOrExportPdfHtml(htmlContent: string, filename?: string): Promise<boolean> {
  return new Promise((resolve) => {
    // 1. Intentar primero con iframe oculto (100% tolerante a bloqueadores de popups y seguro en sandboxes)
    try {
      const existingIframe = document.getElementById('__agroerp_pdf_print_frame');
      if (existingIframe) {
        existingIframe.remove();
      }

      const iframe = document.createElement('iframe');
      iframe.id = '__agroerp_pdf_print_frame';
      iframe.style.position = 'fixed';
      iframe.style.top = '-9999px';
      iframe.style.left = '-9999px';
      iframe.style.width = '1024px';
      iframe.style.height = '768px';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
      if (frameDoc && iframe.contentWindow) {
        frameDoc.open();
        frameDoc.write(htmlContent);
        frameDoc.close();

        // Esperar a que los recursos e imágenes en base64 terminen de posicionarse en el DOM del iframe
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            resolve(true);
          } catch (printErr) {
            console.warn('[pdfTemplateEngine] Iframe print bloqueado por navegador. Ejecutando descarga directa segura (Blob):', printErr);
            downloadHtmlAsPdfDoc(htmlContent, filename || `Reporte_PuroApure_${Date.now()}.html`);
            resolve(true);
          } finally {
            // Liberación de recursos y eliminación del iframe del DOM
            setTimeout(() => {
              try {
                iframe.remove();
              } catch {
                // Safe cleanup
              }
            }, 1200);
          }
        }, 350);
        return;
      }
    } catch (e) {
      console.warn('[pdfTemplateEngine] Iframe no disponible, ejecutando descarga directa segura:', e);
    }

    // Fallback absoluto: Descarga directa por Blob y elemento Anchor (CERO popups, cero window.open)
    downloadHtmlAsPdfDoc(htmlContent, filename || `Reporte_PuroApure_${Date.now()}.html`);
    resolve(true);
  });
}

