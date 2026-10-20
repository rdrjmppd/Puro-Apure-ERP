import React from 'react';
import { BillingInvoice } from '../types/finance';
import { useBrand } from '../context/BrandContext';
import { CORPORATE_HEADER_CONFIG } from '../utils/documentAssets';
import { generateCorporatePdfHtml, printOrExportPdfHtml, downloadHtmlAsPdfDoc } from '../utils/pdfTemplateEngine';
import {
  Printer,
  X,
  FileText,
  DollarSign,
  Building,
  Calendar,
  CheckCircle,
  Shield,
  Download,
} from 'lucide-react';

interface PrintableInvoiceModalProps {
  invoice: BillingInvoice | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PrintableInvoiceModal: React.FC<PrintableInvoiceModalProps> = ({
  invoice,
  isOpen,
  onClose,
}) => {
  const { logoUrl } = useBrand();

  if (!isOpen || !invoice) return null;

  const buildInvoiceHtml = () => {
    if (!invoice) return '';
    const itemsTableHtml = `
      <table>
        <thead>
          <tr>
            <th>Concepto / Rubro Agropecuario</th>
            <th class="center">Cant.</th>
            <th class="right">Precio Unit. (USD)</th>
            <th class="right">Total (USD)</th>
            <th class="right">Total (VES BCV)</th>
          </tr>
        </thead>
        <tbody>
          ${invoice.items.map((item) => `
            <tr>
              <td><strong>${item.description}</strong></td>
              <td class="center">${item.netWeightKg} kg</td>
              <td class="right" style="font-family: monospace;">$${item.unitPriceUSD.toFixed(2)}</td>
              <td class="right" style="font-family: monospace; font-weight: 700;">$${item.subtotalUSD.toFixed(2)}</td>
              <td class="right" style="font-family: monospace; font-weight: 700;">Bs. ${item.subtotalVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
          `).join('')}
          <tr class="bold-row">
            <td colspan="3" style="text-align: right; text-transform: uppercase;">Total General Liquidado:</td>
            <td class="right" style="font-family: monospace; font-size: 11pt; color: #065F46;">$${invoice.totalUSD.toFixed(2)} USD</td>
            <td class="right" style="font-family: monospace; font-size: 11pt; color: #065F46;">Bs. ${invoice.totalVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        </tbody>
      </table>
    `;

    return generateCorporatePdfHtml({
      documentTitle: 'Comprobante Fiscal Bimonetario de Facturación',
      documentSubtitle: 'Proforma y Desglose Agropecuario Bimonetario (USD / VES Oficial BCV)',
      documentFolio: invoice.invoiceNumber,
      issueDate: invoice.date,
      bcvRate: invoice.bcvRateApplied,
      metaItems: [
        { label: 'Cliente / Razón Social', value: invoice.customerName, highlight: true },
        { label: 'RIF / Cédula', value: invoice.customerRif },
        { label: 'Teléfono / Contacto', value: invoice.customerPhone || 'No registrado' },
        { label: 'Dirección Fiscal', value: invoice.customerAddress || 'San Fernando de Apure' },
        { label: 'Fecha Vencimiento', value: invoice.dueDate },
        { label: 'Condición de Pago', value: invoice.paymentStatus },
      ],
      contentHtml: itemsTableHtml,
      showSignatures: true,
      signatureLabels: ['Firma Autorizada y Sello de Administración', 'Conformidad del Cliente / Receptor'],
      notes: [
        'Comprobante digital emitido para liquidación de operaciones comerciales y despacho de biomasa ganadera.',
        `Tasa oficial del Banco Central de Venezuela (BCV) aplicada: Bs. ${invoice.bcvRateApplied.toFixed(4)} por USD con vigencia de 24 horas.`,
        'El comprador declara recibir a entera satisfacción los rubros detallados en el presente documento.',
      ],
    });
  };

  const handlePrint = () => {
    const html = buildInvoiceHtml();
    if (html) {
      printOrExportPdfHtml(html, `Factura_${invoice.invoiceNumber}.html`);
    }
  };

  const handleDirectDownload = () => {
    const html = buildInvoiceHtml();
    if (html) {
      downloadHtmlAsPdfDoc(html, `Factura_${invoice.invoiceNumber}.html`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white text-slate-900 rounded-3xl shadow-2xl overflow-hidden print:m-0 print:p-0 print:w-full print:shadow-none print:rounded-none">
        {/* Screen Controls Header (Hidden during actual print) */}
        <div className="flex items-center justify-between p-4 bg-slate-900 text-white print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-400" />
            <span className="font-bold text-sm">
              Vista Previa de Comprobante Fiscal Bimonetario
            </span>
            <span className="text-xs font-mono bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800">
              {invoice.invoiceNumber}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDirectDownload}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold text-xs flex items-center gap-1.5 shadow-md transition active:scale-95 border border-slate-700"
              title="Descargar archivo HTML / PDF directamente sin ventanas emergentes"
            >
              <Download className="w-4 h-4" />
              <span>Descargar</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-md transition active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Exportar PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Document Body con Marca de Agua Central y Logo Full Color */}
        <div className="relative p-8 sm:p-10 space-y-6 print:p-6 overflow-hidden bg-white" id="printable-invoice">
          {/* Marca de Agua Central Oficial (Opacidad Estricta 0.09 y Bloqueo de Puntero) */}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 overflow-hidden"
            aria-hidden="true"
          >
            <img
              src={logoUrl}
              alt=""
              className="w-[420px] max-w-[85%] h-auto object-contain select-none pointer-events-none"
              style={{ opacity: 0.09 }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/puro_apure_logo.png';
              }}
            />
          </div>

          {/* Contenido del Documento en Capa Superior */}
          <div className="relative z-10 space-y-6">
            {/* Header & Logo Full Color */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-1 rounded-xl bg-white border border-slate-200/90 shadow-sm shrink-0">
                    <img
                      src={logoUrl}
                      alt="Puro Apure ERP Logotipo Oficial Full Color"
                      className="w-[110px] min-w-[90px] h-auto object-contain block"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = '/puro_apure_logo.png';
                      }}
                    />
                  </div>
                  <div>
                    <h1 className="text-xl font-black text-slate-900 tracking-tight font-heading">
                      {CORPORATE_HEADER_CONFIG.tradeName}
                    </h1>
                    <p className="text-xs text-slate-600 font-semibold font-body">
                      {CORPORATE_HEADER_CONFIG.companyName}
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 font-mono">
                  RIF: {CORPORATE_HEADER_CONFIG.rif} • {CORPORATE_HEADER_CONFIG.fiscalRegime}
                </p>
                <p className="text-[11px] text-slate-500 font-body">
                  {CORPORATE_HEADER_CONFIG.headquartersAddress}
                </p>
              </div>

              <div className="text-right sm:text-right font-mono">
                <span className="inline-block px-3 py-1 bg-slate-100 text-slate-800 font-bold text-xs rounded-lg uppercase tracking-wider mb-2">
                  PROFORMA FISCAL DIGITAL
                </span>
                <div className="text-lg font-black text-emerald-800">
                  {invoice.invoiceNumber}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Fecha de Emisión: <strong>{invoice.date}</strong>
                </div>
                <div className="text-xs text-slate-500">
                  Vencimiento: <strong>{invoice.dueDate}</strong>
                </div>
                <div className="text-xs text-emerald-700 font-bold mt-1 bg-emerald-50 px-2 py-0.5 rounded inline-block">
                  Tasa Oficial BCV: Bs. {invoice.bcvRateApplied.toFixed(4)} / USD
                </div>
              </div>
            </div>

          {/* Customer / Entity Box */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
            <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] block mb-2">
              Datos del Cliente / Receptor
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-slate-500">Razón Social:</span>{' '}
                <strong className="text-slate-900">{invoice.customerName}</strong>
              </div>
              <div>
                <span className="text-slate-500">RIF / Cédula:</span>{' '}
                <strong className="text-slate-900 font-mono">{invoice.customerRif}</strong>
              </div>
              <div>
                <span className="text-slate-500">Dirección:</span>{' '}
                <span className="text-slate-800">{invoice.customerAddress || 'Barquisimeto, Estado Lara'}</span>
              </div>
              <div>
                <span className="text-slate-500">Teléfono:</span>{' '}
                <span className="text-slate-800 font-mono">{invoice.customerPhone || '+58 414-0000000'}</span>
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 uppercase tracking-wider text-[10px] font-bold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Descripción / Lote</th>
                  <th className="py-2.5 px-3">Especie</th>
                  <th className="py-2.5 px-3 text-right">Peso Bruto</th>
                  <th className="py-2.5 px-3 text-right">Merma</th>
                  <th className="py-2.5 px-3 text-right">Peso Neto</th>
                  <th className="py-2.5 px-3 text-right">Precio USD</th>
                  <th className="py-2.5 px-3 text-right">Total USD</th>
                  <th className="py-2.5 px-3 text-right">Total Bs.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                {invoice.items.map((item, index) => (
                  <tr key={index} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-sans font-semibold text-slate-900">
                      {item.description}
                      {item.batchCode && (
                        <span className="block text-[10px] text-slate-500 font-mono">
                          Lote: {item.batchCode}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 text-slate-700">
                        {item.species || 'GENERAL'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-600">
                      {item.grossWeightKg ? `${item.grossWeightKg.toLocaleString()} kg` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right text-amber-700">
                      {item.shrinkageKg ? `-${item.shrinkageKg} kg` : '0 kg'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                      {item.netWeightKg.toLocaleString()} kg
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-700">
                      ${item.unitPriceUSD.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-800">
                      ${item.subtotalUSD.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                      Bs. {item.subtotalVES.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Dual Currency Totals Box */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5 bg-emerald-50 rounded-2xl border border-emerald-200">
            <div className="text-xs text-slate-600 max-w-sm">
              <span className="font-bold text-slate-800 block mb-1">
                Certificación Bimonetaria Oficial:
              </span>
              Los importes expresados en Bolívares (VES) han sido calculados de conformidad con la tasa oficial emitida por el Banco Central de Venezuela (BCV) para la fecha de emisión del presente comprobante.
            </div>

            <div className="w-full sm:w-auto text-right space-y-1 font-mono">
              <div className="flex items-center justify-between sm:justify-end gap-6 text-sm">
                <span className="text-slate-600 font-sans">TOTAL USD:</span>
                <span className="text-xl font-black text-emerald-800">
                  ${invoice.totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </span>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-6 text-sm">
                <span className="text-slate-600 font-sans">TOTAL BS (BCV):</span>
                <span className="text-xl font-black text-slate-900">
                  Bs. {invoice.totalVES.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Signatures & Corporate Legal Footer */}
          <div className="pt-6 border-t border-slate-200">
            <div className="grid grid-cols-2 gap-8 text-center text-xs text-slate-500 mb-6">
              <div className="border-t border-slate-300 pt-2 mx-8">
                Firma Autorizada y Sello
              </div>
              <div className="border-t border-slate-300 pt-2 mx-8">
                Conforme Receptor / Cliente
              </div>
            </div>

            <div className="text-center space-y-1">
              <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
                Comprobante Digital Válido para Conciliación Fiscal Agropecuaria • Vigencia cambiaria 24 horas
              </p>
              <p className="text-[11px] font-bold text-slate-700 font-mono">
                Derechos de desarrollo reservados a AR Group 2026
              </p>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};
