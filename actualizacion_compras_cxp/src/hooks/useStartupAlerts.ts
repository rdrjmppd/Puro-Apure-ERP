import { useState, useEffect, useMemo, useCallback } from 'react';
import { InventoryItem } from '../types/inventory';
import {
  SupplyAlertConfig,
  PurchaseInvoice,
  StartupAlertDigest,
} from '../types/purchasing';
import { InventoryService } from '../services/inventoryService';
import { PurchasingService } from '../services/purchasingService';
import {
  buildStartupAlertDigest,
  getTodayLocalDateString,
} from '../services/supplyAlertService';

const SNOOZE_STORAGE_KEY = 'puro_apure_startup_alerts_snoozed_until';
const SESSION_SEEN_KEY_PREFIX = 'puro_apure_startup_alerts_seen_';

interface UseStartupAlertsOptions {
  userRole?: string;
  autoOpenOnStartup?: boolean;
}

export function useStartupAlerts({
  userRole = 'ADMIN',
  autoOpenOnStartup = true,
}: UseStartupAlertsOptions = {}) {
  const isObrero = userRole === 'OBRERO';

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [configsMap, setConfigsMap] = useState<Map<string, SupplyAlertConfig>>(new Map());
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [hasEvaluatedInitial, setHasEvaluatedInitial] = useState<boolean>(false);

  // 1. Subscribe to inventory
  useEffect(() => {
    const unsubInv = InventoryService.subscribeInventory((invList) => {
      setItems(invList);
    });

    const unsubConfigs = PurchasingService.subscribeSupplyAlertConfigs((cfgList) => {
      const map = new Map<string, SupplyAlertConfig>();
      cfgList.forEach((c) => map.set(c.inventoryItemId, c));
      setConfigsMap(map);
    });

    // If user is OBRERO, do NOT subscribe to invoices (privacy & security H4 / Rule D1)
    let unsubInvoices = () => {};
    if (!isObrero) {
      unsubInvoices = PurchasingService.subscribePurchaseInvoices((invList) => {
        setInvoices(invList);
      });
    }

    return () => {
      unsubInv();
      unsubConfigs();
      unsubInvoices();
    };
  }, [isObrero]);

  // 2. Build live digest
  const digest: StartupAlertDigest = useMemo(() => {
    const todayStr = getTodayLocalDateString();
    // Rule D1: For OBRERO, facturasAbiertas is always empty
    const openInvoices = isObrero ? [] : invoices;
    return buildStartupAlertDigest(items, configsMap, openInvoices, todayStr);
  }, [items, configsMap, invoices, isObrero]);

  // Total alert count according to role permissions
  const totalAlertCount = useMemo(() => {
    const insumoCount = digest.insumosCriticosRojos.length + digest.insumosAlertaAmarillos.length;
    if (isObrero) return insumoCount;
    return (
      insumoCount +
      digest.facturasVencidasRojas.length +
      digest.facturasPorVencerAmarillas.length
    );
  }, [digest, isObrero]);

  const hasCriticalAlert = useMemo(() => {
    if (digest.insumosCriticosRojos.length > 0) return true;
    if (!isObrero && digest.facturasVencidasRojas.length > 0) return true;
    return false;
  }, [digest, isObrero]);

  // 3. Auto-open logic on app launch (once per session, respecting 24h snooze)
  useEffect(() => {
    if (!autoOpenOnStartup || hasEvaluatedInitial) return;
    if (items.length === 0) return; // Wait for initial inventory sync

    const todayStr = getTodayLocalDateString();
    const sessionKey = `${SESSION_SEEN_KEY_PREFIX}${todayStr}`;

    // Check if snoozed in localStorage (24h)
    try {
      const snoozedUntilStr = localStorage.getItem(SNOOZE_STORAGE_KEY);
      if (snoozedUntilStr) {
        const snoozedUntil = Number(snoozedUntilStr);
        if (!isNaN(snoozedUntil) && Date.now() < snoozedUntil) {
          setHasEvaluatedInitial(true);
          return;
        }
      }
    } catch (e) {
      console.warn('Could not read snooze localStorage:', e);
    }

    // Check if already seen in current browser session
    try {
      const alreadySeen = sessionStorage.getItem(sessionKey);
      if (alreadySeen) {
        setHasEvaluatedInitial(true);
        return;
      }
    } catch (e) {
      console.warn('Could not read sessionStorage:', e);
    }

    // If there are any alerts (critical or moderate), trigger popup
    if (totalAlertCount > 0) {
      setIsModalOpen(true);
      try {
        sessionStorage.setItem(sessionKey, 'true');
      } catch (e) {
        // ignore
      }
    }

    setHasEvaluatedInitial(true);
  }, [autoOpenOnStartup, hasEvaluatedInitial, items.length, totalAlertCount]);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const openModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const snooze24h = useCallback(() => {
    try {
      const tomorrowTimestamp = Date.now() + 24 * 60 * 60 * 1000;
      localStorage.setItem(SNOOZE_STORAGE_KEY, String(tomorrowTimestamp));
    } catch (e) {
      console.warn('Could not write snooze to localStorage:', e);
    }
    setIsModalOpen(false);
  }, []);

  return {
    digest,
    isModalOpen,
    openModal,
    closeModal,
    snooze24h,
    totalAlertCount,
    hasCriticalAlert,
    isObrero,
  };
}
