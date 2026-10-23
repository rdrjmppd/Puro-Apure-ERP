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

---

## 4. Doctrinas Especializadas de @OCR y Matriz Forense de Veracidad
1. **Doble Motor de Alta Disponibilidad:** Gemini Vision API (Capa 1) con fallback inmediato y sin errores a Tesseract OCR sobre píxeles reales (Capa 2).
2. **Filtrado de Íconos de Copiado (`❐`):** Eliminación de pictogramas de portapapeles que añaden un 13° dígito espurio en referencias bancarias SUDEBAN (normalización canónica a 12 dígitos en Bancamiga, BDV y Banesco).
3. **Extracción Multilínea Pura:** Rechazo estricto de fragmentos de etiquetas textuales (`"erencia"` en Mercantil o `"Exitosa"` en Banesco) mediante inspección en ventana multilínea de secuencias numéricas `\b\d{6,16}\b`.
4. **Huellas Dactilares de Plantilla (Template Fingerprinting):** Separación determinista entre Banco Emisor y Banco Receptor. El Banco Receptor jamás sobrescribe al Banco Emisor.
5. **Modo Oscuro y Tolerancia Tipográfica:** Reconocimiento de montos con sufijo monetario (`13.201,00 Bs`, `14.082,00 Bs`) y tolerancia a confusiones ópticas (`8s` por `Bs`).
6. **Compensación Multi-Orientación (0°/90°/180°/270°):** Lectura nativa con Gemini Vision y rotación por Canvas 2D en fallback cliente.
7. **Calibración de Matriz Forense (Base 100 Puntos):** Todo comprobante bancario legítimo con banco, referencia y monto válidos recibe calificación >= 90% (`AUTENTICO_ALTA_CONFIANZA`), erradicando falsos estados sospechosos (60% u 80%).
8. **Aislamiento Óptico de Alta Luminancia (Y >= 195) y Prevención de Colapso Bimodal de Otsu:** Para comprobantes en modo oscuro como `PagomóvilBDV Personas`, donde el texto blanco (`#FFFFFF`) se halla dentro de cápsulas o píldoras grises (`~#8E8E93`, Y ~ 138) sobre fondo negro (`#1C1C1E`, Y ~ 28). El filtro binariza los píxeles con alta luminancia (`Y >= 195` o `R >= 190 && G >= 190 && B >= 190`) a negro puro (`0`) y todo píxel con luminancia menor a blanco puro (`255`), erradicando la píldora gris y permitiendo a Tesseract leer montos como `13.201,00 Bs` con 100% de nitidez sin colapso de contraste.
9. **Extracción y Normalización de Identificación sin Prefijo:** Detección de la etiqueta `Identificación:` con secuencias numéricas de 6 a 9 dígitos (ej. `15235343`), autocompletando y normalizando como `V-15235343` para evitar omisiones `CI/RIF: N/A`.
10. **Memoria Persistente e Invalidación Inteligente de Transcripciones OCR:** Registro automático en memoria activa (`Map`) y en `localStorage` indexado por SHA-256 de la imagen, `ocrId` y referencia. Se descartan e invalidan automáticamente registros cacheados corruptos o incompletos con `montoOriginal <= 0`, sin referencia o sin banco emisor, forzando la re-ejecución del motor actualizado.

---

## 5. Arquitectura Multimedia del CRM: Notas de Voz y Mensajes de Audio en WhatsApp
1. **Desempaquetado y Descarga Binaria:** El listener de Baileys desempaqueta mensajes anidados (`ephemeralMessage`, `viewOnceMessage`, `viewOnceMessageV2`, `documentWithCaptionMessage`) y detecta `audioMessage`.
2. **Descarga y Data URL Segura:** Descarga el binario completo mediante `downloadMediaMessage`, tipa como `tipoMensaje: 'AUDIO'`, calcula la duración (`audioDurationSeconds`), extrae si es PTT (`isPtt`), y genera un Data URL Base64 con tipo MIME limpio (`audio/ogg`, `audio/mp4`, etc.) respetando el límite seguro de Firestore.
3. **Erradicación de Burbujas en Blanco:** Si el mensaje de audio no posee texto, se inyecta una etiqueta descriptiva normalizada (`🎤 Nota de voz (MM:SS)` o `🎵 Mensaje de audio (MM:SS)`) para la barra lateral y vistas previas.
4. **Reproductor Nativo WhatsApp Web con Accesibilidad Táctil:**
   - Componente React dedicado `WhatsAppAudioMessagePlayer` integrado en la burbuja del chat.
   - Conversión de Base64 a `Blob URL` en memoria para reproducción fluida e instantánea en navegadores de PC y móviles.
   - Botón Play/Pause accesible con dimensiones mínimas de 44x44px (`min-w-[44px] min-h-[44px]`).
   - Scrubber / barra de progreso interactiva con control de tiempo transcurrido y duración total.
   - Selector rápido de velocidad de reproducción (`1x`, `1.5x`, `2x`).
