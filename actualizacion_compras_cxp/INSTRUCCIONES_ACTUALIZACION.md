# Guía Maestra de Despliegue: Módulo de Compras, Cuentas por Pagar (CxP) y Niveles Críticos de Insumos

**Puro Apure ERP • Módulo Financiero / Compras & CxP**  
**Arquitectura:** Zero-Breaking-Change • Multi-Rol (RBAC/ABAC) • Dual BCV (USD/VES)

---

## 1. Resumen de Archivos del Paquete

Esta carpeta `actualizacion_compras_cxp/` contiene de manera exclusiva e independiente todos los archivos necesarios para implementar la actualización completa en su proyecto de Google AI Studio o entorno local.

### Archivos Nuevos (15 archivos)
1. `src/types/purchasing.ts` — Contratos de datos completos (Términos comerciales, Facturación CxP, Alarmas de Insumos, Mora).
2. `src/services/supplyAlertService.ts` — Motor matemático puro de evaluación de alarmas, cálculo de mora y diferencias de fecha inmunes a DST.
3. `src/services/purchasingService.ts` — Servicio transaccional y offline-first para facturas de compra, pagos, términos y calibración de alarmas.
4. `src/components/ModuleErrorBoundary.tsx` — Boundary de aislamiento de errores en tiempo de ejecución para prevenir caídas de UI.
5. `src/components/finance/purchasing/AlertLevelBadge.tsx` — Badge visual reactivo con micro-animaciones para niveles Rojo/Amarillo/Verde y vencimiento de facturas.
6. `src/components/finance/purchasing/SupplierQuickCreateModal.tsx` — Modal modal flotante para crear proveedores con RIF y condiciones comerciales al vuelo.
7. `src/components/finance/purchasing/SupplierPaymentModal.tsx` — Modal de registro de amortizaciones o cancelación total de facturas con impacto bimonetario.
8. `src/components/finance/purchasing/PurchaseInvoicesView.tsx` — Tabla maestra de cuentas por pagar con filtros por estado, búsqueda y proyección de mora.
9. `src/components/finance/purchasing/PurchaseInvoiceForm.tsx` — Formulario de registro de compras con cálculo bimonetario e ingreso automático a inventario.
10. `src/components/finance/purchasing/SupplierTermsPanel.tsx` — Panel de configuración de días calle, días de gracia, régimen de mora y notas de riesgo contractuales.
11. `src/components/finance/purchasing/SupplyCriticalLevelsPanel.tsx` — Panel de administración y calibración manual de puntos críticos (Rojo) y márgenes porcentuales (Amarillo).
12. `src/components/finance/purchasing/PurchasesPayablesTab.tsx` — Pestaña unificada maestra para la navegación fluida entre sub-vistas.
13. `src/hooks/useStartupAlerts.ts` — Hook React para detección y notificación automática al inicio de sesión con soporte de snooze de 24h.
14. `src/components/StartupAlertsModal.tsx` — Modal emergente de recordatorio matutino/inicio de sesión con filtrado estricto por rol.
15. `tests/test-purchasing-alerts.ts` — Suite de pruebas automatizadas unitarias para certificar la matemática y fechas.

### Archivos Modificados (7 archivos)
1. `firestore.rules` — Reglas de seguridad para `exchange_rates_history`, `supplier_terms`, `purchase_invoices` y `supply_alert_configs`.
2. `firestore.indexes.json` — Índices compuestos requeridos por Firestore para consultas filtradas y ordenadas por vencimiento.
3. `src/services/financeService.ts` — Blindaje transaccional en `saveDualEntity` con preservación de saldos calculados y `{ merge: true }`.
4. `src/services/inventoryService.ts` — Implementación de `receivePurchaseStock` con cálculo atómico de Costo Promedio Ponderado.
5. `src/services/notificationService.ts` — Ampliación de categorías (`CXP_VENCIMIENTO`, `INSUMO_AMARILLO`) y método local `showLocalReminder`.
6. `src/pages/FinancialLedger.tsx` — Inclusión de sub-pestaña `Compras & CxP` con carga perezosa (`React.lazy`) y aislamiento de errores.
7. `src/pages/Dashboard.tsx` — Montaje de `useStartupAlerts`, indicador visual con contador de alertas en barra superior y `StartupAlertsModal`.

### Archivos Borrados
- **0 archivos eliminados.** No se destruyó ningún componente preexistente.

---

## 2. Orden Exacto de Inclusión / Reemplazo en AI Studio

Para garantizar que el compilador TypeScript no arroje errores de referencias cruzadas o módulos faltantes, siga este orden estricto de 5 pasos:

### PASO 1: Contratos de Tipos (Base)
Copie primero el archivo de definición de tipos:
- `src/types/purchasing.ts`

### PASO 2: Servicios Backend y Funciones de Lógica Pura
Copie los servicios en el siguiente orden:
1. `src/services/supplyAlertService.ts`
2. `src/services/purchasingService.ts`
3. `src/services/inventoryService.ts` *(Reemplazar)*
4. `src/services/financeService.ts` *(Reemplazar)*
5. `src/services/notificationService.ts` *(Reemplazar)*

### PASO 3: Componentes de UI de Compras y Hooks
Copie los componentes en su carpeta correspondiente:
1. `src/components/ModuleErrorBoundary.tsx`
2. `src/components/finance/purchasing/AlertLevelBadge.tsx`
3. `src/components/finance/purchasing/SupplierQuickCreateModal.tsx`
4. `src/components/finance/purchasing/SupplierPaymentModal.tsx`
5. `src/components/finance/purchasing/PurchaseInvoicesView.tsx`
6. `src/components/finance/purchasing/PurchaseInvoiceForm.tsx`
7. `src/components/finance/purchasing/SupplierTermsPanel.tsx`
8. `src/components/finance/purchasing/SupplyCriticalLevelsPanel.tsx`
9. `src/components/finance/purchasing/PurchasesPayablesTab.tsx`
10. `src/hooks/useStartupAlerts.ts`
11. `src/components/StartupAlertsModal.tsx`

### PASO 4: Vistas Principales (Integración)
Reemplace las páginas maestras que conectan la navegación:
1. `src/pages/FinancialLedger.tsx` *(Reemplazar)*
2. `src/pages/Dashboard.tsx` *(Reemplazar)*

### PASO 5: Seguridad y Base de Datos (Firebase)
Actualice las reglas de seguridad e índices:
1. `firestore.rules` *(Reemplazar y desplegar con `firebase deploy --only firestore:rules`)*
2. `firestore.indexes.json` *(Reemplazar y desplegar con `firebase deploy --only firestore:indexes`)*

---

## 3. Comprobación y Verificación

- Inicie la aplicación en modo desarrollo (`npm run dev` o en AI Studio).
- Verifique que en la barra superior del Dashboard aparezca el icono de alertas con el número de ítems en nivel Rojo/Amarillo o facturas pendientes.
- Acceda a **Finanzas BCV** y haga clic en la nueva pestaña **Compras & CxP**.
- Podrá interactuar con las 4 sub-secciones:
  - **Facturas & CxP**: Registro y amortización de deudas a proveedores.
  - **Registrar Compra**: Creación de facturas con adición automática al stock y costo promedio.
  - **Días Calle & Proveedores**: Calibración de días de crédito y régimen de mora.
  - **Niveles Críticos de Insumos**: Calibración de puntos de reorden (Rojo) y proximidad (Amarillo).
