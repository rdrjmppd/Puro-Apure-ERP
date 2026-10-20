# Contexto Operativo y Reglamento Local — Puro Apure ERP

## 1. Identidad Corporativa y Branding
- **Nombre de la Aplicación:** Puro Apure ERP
- **Empresa / Titular:** Agropecuaria Puro Apure C.A.
- **Copyright Oficial:** `Derechos de desarrollo reservados a AR Group 2026`
- **Paleta de Colores Oficial:**
  - Primario / Éxito: Esmeralda `#10b981` (Tailwind `emerald-500` / `emerald-600`)
  - Secundario / Inteligencia: Púrpura `#8b5cf6` (Tailwind `purple-500` / `purple-600`)
  - Fondo y Superficie: Pizarra Oscura `#020617` / `#0f172a` (Tailwind `slate-950` / `slate-900`)
- **Moneda Base:** Bimonetario VES (Bolívares) / USD (Dólares Americanos) anclado a la Tasa Oficial BCV.
- **Zona Horaria:** `America/Caracas` (VET -04:00).

---

## 2. Ecosistema de 11 Agentes Especializados y Asignación de Capas
1. `@Orquestador`: Planificación estratégica, gobernanza de dependencias y aislamiento de colisiones.
2. `@Finanzas`: Motor bimonetario BCV, conciliación de pagos atómica, facturación proforma y cuentas por pagar.
3. `@RRHH`: Gestión de talento humano, cálculo de nóminas y pasivos laborales.
4. `@Backend`: Esquemas seguros en Firestore / IndexedDB, reglas de seguridad (`firestore.rules`) y endpoints de proxy en Vite.
5. `@Frontend`: Vistas funcionales, tablas responsivas, reactividad en tiempo real y formularios validados.
6. `@Dashboards`: Paneles ejecutivos de biomasa, rentabilidad acumulada, tarjetas KPI y gráficos de rendimiento.
7. `@Documentos`: Generación y exportación de informes ejecutivos en PDF y Word con branding oficial.
8. `@UX`: Diseño adaptativo móvil y de escritorio con controles táctiles mínimos de 44x44px (`min-h-[44px]`).
9. `@QA`: Auditoría estática (SAST), verificación de compilación (`tsc --noEmit`, `npm run build`) y pruebas de estrés.
10. `@CRM`: Clon de WhatsApp Web en vivo por conexión QR, directorio comercial 360°, plantillas inteligentes y modo híbrido `wa.me`.
11. `@OCR`: Lectura multimodal, análisis forense de veracidad (4 Candados), detección anti-IA / anti-fraude y bandeja de pre-conciliación.

---

## 3. Líneas Rojas Inquebrantables
1. **Aritmética Exacta:** Prohibido el punto flotante IEEE 754 nativo de JavaScript para dinero. Uso obligatorio de `centsRound` y `round2`.
2. **Separación Pre-Conciliación vs. Verdad Contable:** Los pagos reportados por WhatsApp o captura OCR entran en estado `'pendiente_revision'` en `pagos_reportados_ocr` y no alteran los saldos del libro mayor hasta ser conciliados explícitamente.
3. **Disparo OCR 100% Manual Bajo Demanda:** Prohibido el análisis en segundo plano de imágenes entrantes. Solo se procesa ante el clic explícito del usuario.
4. **Prohibición de `<iframe>` de WhatsApp Web y Diálogos Bloqueables:** Todos los componentes y modales son React nativos sin `window.confirm`, `window.alert` ni `window.prompt`.
5. **Cero Mock Data:** Indicadores en `0.00` y listas vacías descriptivas cuando no hay registros reales en la base de datos.
6. **Protección de Secretos:** `.whatsapp_sessions/` y archivos `.env*` quedan excluidos de cualquier seguimiento Git.
