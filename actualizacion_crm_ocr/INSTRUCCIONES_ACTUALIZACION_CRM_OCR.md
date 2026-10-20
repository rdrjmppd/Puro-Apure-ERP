# Guía Maestra de Despliegue: Clon WhatsApp Web (CRM/BRM) & Motor OCR Forense Anti-Fraude en Conciliación

**Puro Apure ERP • Módulo CRM & Finanzas**  
**Arquitectura:** Zero-Breaking-Change • Multi-Rol (RBAC/ABAC) • Dual BCV (USD/VES) • 4 Candados Anti-Fraude

---

## 1. Resumen de Archivos del Paquete `actualizacion_crm_ocr/`

Esta carpeta contiene de manera exclusiva e independiente todos los archivos necesarios para implementar la actualización completa en su proyecto de Google AI Studio o entorno local.

### Archivos Nuevos (9 archivos)
1. `src/types/crmWhatsapp.ts` — Contratos de datos completos para líneas, mensajes en vivo, plantillas inteligentes y contactos enriquecidos.
2. `src/types/ocrForensic.ts` — Contratos de datos para comprobantes reportados, peritaje forense y semáforo de los 4 Candados.
3. `server/whatsappQrBridge.ts` — Middleware de servidor para emulación de estados de línea, generación de código QR en SVG data URI y pairing.
4. `src/services/whatsappCloneService.ts` — Servicio transaccional y offline-first para chat en tiempo real, normalización E.164 y plantillas dinámicas.
5. `src/services/ocrForensicService.ts` — Motor criptográfico forense (SHA-256, pHash de 64 bits, distancia Hamming, inspección binaria EXIF contra IA y edición, Gemini Vision y cierre transaccional atómico).
6. `src/components/finanzas/BandejaPreConciliacionOCR.tsx` — Bandeja de pre-conciliación con métricas KPI, filtros de veracidad, búsqueda y tabla responsiva.
7. `src/components/finanzas/LectorComprobanteOCRModal.tsx` — Modal Split-View con visor de captura (zoom, contraste), semáforo visual de los 4 Candados y formulario de cruce de facturas.
8. `src/components/crm/WhatsAppWebCloneView.tsx` — Vista React nativa de 3 paneles para WhatsApp Web con selector de líneas, disparador OCR directo y ficha 360°.
9. `tests/test-crm-ocr-forensic.ts` — Suite de 27 pruebas automatizadas para certificar matemáticas, normalización, criptografía y algoritmos forenses.

### Archivos Modificados (5 archivos)
1. `firestore.rules` — Reglas de seguridad para `whatsapp_lineas`, `whatsapp_mensajes`, `whatsapp_plantillas` y `pagos_reportados_ocr`.
2. `vite.config.ts` — Montaje de endpoints proxy `/api/whatsapp/*` y ampliación de Workbox PWA a 5 MiB.
3. `src/components/finance/ReconciliationTab.tsx` — Sub-pestañas para alternar entre Bandeja OCR y Conciliaciones Contables, con modal flotante y botón de análisis.
4. `src/pages/FinancialLedger.tsx` — Inyección de dependencias `entities`, `invoices` y `bcvRate` a `ReconciliationTab`.
5. `src/pages/Dashboard.tsx` — Registro de módulo `'CRM'` en navegación y drawer móvil, guardias ABAC y modal OCR bajo demanda.

---

## 2. Orden de Inclusión en AI Studio

Para garantizar compilación limpia sin errores de dependencias cruzadas:

1. **Paso 1:** Tipos (`src/types/crmWhatsapp.ts` y `src/types/ocrForensic.ts`).
2. **Paso 2:** Servidor y Servicios (`server/whatsappQrBridge.ts`, `src/services/whatsappCloneService.ts`, `src/services/ocrForensicService.ts`).
3. **Paso 3:** Componentes de Finanzas y CRM (`BandejaPreConciliacionOCR.tsx`, `LectorComprobanteOCRModal.tsx`, `WhatsAppWebCloneView.tsx`, `ReconciliationTab.tsx`).
4. **Paso 4:** Vistas Principales (`src/pages/FinancialLedger.tsx`, `src/pages/Dashboard.tsx`).
5. **Paso 5:** Configuración y Reglas (`vite.config.ts`, `firestore.rules`, `.gitignore`, `.env.example`, `agents.md`).
