import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Plus,
  Building2,
  Boxes,
  Receipt,
  AlertCircle,
  Clock,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import { DualEntity } from '../../../types/finance';
import { InventoryItem } from '../../../types/inventory';
import {
  PurchaseInvoice,
  SupplyAlertConfig,
} from '../../../types/purchasing';
import { FinanceService } from '../../../services/financeService';
import { InventoryService } from '../../../services/inventoryService';
import { PurchasingService } from '../../../services/purchasingService';
import { centsRound } from '../../../services/financialAnalyticsService';
import { PurchaseInvoicesView } from './PurchaseInvoicesView';
import { PurchaseInvoiceForm } from './PurchaseInvoiceForm';
import { SupplierTermsPanel } from './SupplierTermsPanel';
import { SupplyCriticalLevelsPanel } from './SupplyCriticalLevelsPanel';
import { SupplierPaymentModal } from './SupplierPaymentModal';

interface PurchasesPayablesTabProps {
  userId: string;
  userRole?: string;
  initialSubTab?: 'FACTURAS' | 'NUEVA_COMPRA' | 'TERMINOS_PROVEEDOR' | 'NIVELES_CRITICOS';
}

type SubTab = 'FACTURAS' | 'NUEVA_COMPRA' | 'TERMINOS_PROVEEDOR' | 'NIVELES_CRITICOS';

export const PurchasesPayablesTab: React.FC<PurchasesPayablesTabProps> = ({
  userId,
  userRole = 'ADMIN',
  initialSubTab = 'FACTURAS',
}) => {
  const [subTab, setSubTab] = useState<SubTab>(initialSubTab);
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<DualEntity[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [bcvRate, setBcvRate] = useState<number>(36.5);
  const [loading, setLoading] = useState<boolean>(true);

  // Payment modal state
  const [invoiceToPay, setInvoiceToPay] = useState<PurchaseInvoice | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);

  // Subscriptions
  useEffect(() => {
    const unsubInvoices = PurchasingService.subscribePurchaseInvoices((list) => {
      setInvoices(list);
      setLoading(false);
    });

    const unsubEntities = FinanceService.subscribeDualEntities((ents) => {
      setSuppliers(ents.filter((e) => e.roles?.includes('PROVEEDOR')));
    });

    const unsubInv = InventoryService.subscribeInventory((items) => {
      setInventoryItems(items);
    });

    const unsubRate = FinanceService.subscribeLatestRate((rate) => {
      if (rate && rate > 0) setBcvRate(rate);
    });

    return () => {
      unsubInvoices();
      unsubEntities();
      unsubInv();
      unsubRate();
    };
  }, []);

  // Compute summary numbers
  const metrics = useMemo(() => {
    let totalPendienteUSD = 0;
    let totalFacturasPendientes = 0;
    let facturasVencidas = 0;

    const todayStr = new Date().toISOString().split('T')[0];

    invoices.forEach((inv) => {
      if (inv.estadoPago === 'PENDIENTE' || inv.estadoPago === 'PARCIAL') {
        totalPendienteUSD += inv.saldoPendienteUSD;
        totalFacturasPendientes++;
        if (inv.fechaVencimiento && inv.fechaVencimiento < todayStr) {
          facturasVencidas++;
        }
      }
    });

    return {
      totalPendienteUSD: centsRound(totalPendienteUSD),
      totalPendienteVES: centsRound(totalPendienteUSD * bcvRate),
      totalFacturasPendientes,
      facturasVencidas,
    };
  }, [invoices, bcvRate]);

  const handleOpenPayment = (invoice: PurchaseInvoice) => {
    setInvoiceToPay(invoice);
    setIsPaymentModalOpen(true);
  };

  const handlePaymentSuccess = () => {
    setIsPaymentModalOpen(false);
    setInvoiceToPay(null);
  };

  const handleReorderItem = (item: InventoryItem, _cfg?: SupplyAlertConfig) => {
    setSubTab('NUEVA_COMPRA');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Metric 1: Total Deuda CxP */}
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Total CxP Pendiente</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-100">
            ${metrics.totalPendienteUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-400 font-mono mt-0.5">
            ≈ Bs. {metrics.totalPendienteVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
          </div>
        </div>

        {/* Metric 2: Facturas Abiertas */}
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Facturas por Pagar</span>
            <Receipt className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-100">
            {metrics.totalFacturasPendientes}
          </div>
          <div className="text-xs text-cyan-400/80 mt-0.5">
            Compromisos comerciales activos
          </div>
        </div>

        {/* Metric 3: Facturas Vencidas */}
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Facturas Vencidas</span>
            <AlertCircle className="w-4 h-4 text-red-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-red-400">
            {metrics.facturasVencidas}
          </div>
          <div className="text-xs text-red-400/80 mt-0.5">
            {metrics.facturasVencidas > 0 ? 'Requieren liquidación urgente' : 'Al día con proveedores'}
          </div>
        </div>

        {/* Metric 4: Tasa BCV Oficial */}
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Tasa BCV del Día</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-amber-300">
            Bs. {bcvRate.toFixed(2)}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            Referencia de conversión dual
          </div>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setSubTab('FACTURAS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
            subTab === 'FACTURAS'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
              : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          Facturas & CxP
          {metrics.totalFacturasPendientes > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-950 text-emerald-300 font-mono">
              {metrics.totalFacturasPendientes}
            </span>
          )}
        </button>

        <button
          onClick={() => setSubTab('NUEVA_COMPRA')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
            subTab === 'NUEVA_COMPRA'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
              : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Plus className="w-4 h-4" />
          Registrar Compra
        </button>

        <button
          onClick={() => setSubTab('TERMINOS_PROVEEDOR')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
            subTab === 'TERMINOS_PROVEEDOR'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
              : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Días Calle & Proveedores
        </button>

        <button
          onClick={() => setSubTab('NIVELES_CRITICOS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
            subTab === 'NIVELES_CRITICOS'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
              : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Boxes className="w-4 h-4" />
          Niveles Críticos de Insumos
        </button>
      </div>

      {/* Sub-tab Content */}
      <div className="transition-all duration-200">
        {subTab === 'FACTURAS' && (
          <PurchaseInvoicesView
            invoices={invoices}
            bcvRate={bcvRate}
            onNewPurchase={() => setSubTab('NUEVA_COMPRA')}
            onOpenPayment={handleOpenPayment}
            userId={userId}
          />
        )}

        {subTab === 'NUEVA_COMPRA' && (
          <PurchaseInvoiceForm
            suppliers={suppliers}
            inventoryItems={inventoryItems}
            bcvRate={bcvRate}
            onInvoiceCreated={() => setSubTab('FACTURAS')}
            onCancel={() => setSubTab('FACTURAS')}
            userId={userId}
          />
        )}

        {subTab === 'TERMINOS_PROVEEDOR' && (
          <SupplierTermsPanel userId={userId} />
        )}

        {subTab === 'NIVELES_CRITICOS' && (
          <SupplyCriticalLevelsPanel
            userId={userId}
            onReorderItem={handleReorderItem}
          />
        )}
      </div>

      {/* Supplier Payment Modal */}
      <SupplierPaymentModal
        isOpen={isPaymentModalOpen}
        invoice={invoiceToPay}
        bcvRate={bcvRate}
        userId={userId}
        onClose={() => setIsPaymentModalOpen(false)}
        onPaymentSuccess={handlePaymentSuccess}
      />
    </div>
  );
};
