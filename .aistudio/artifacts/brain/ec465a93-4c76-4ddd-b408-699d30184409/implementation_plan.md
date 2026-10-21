# Informe de Auditoría y Plan de Remediación Técnica: WhatsApp CRM

Auditoría forense de causas raíz y propuesta de solución técnica para la normalización de identificadores de cuenta (WhatsApp LIDs) y la resolución del fallo de escritura en Cloud Firestore al emitir mensajes salientes desde la plataforma.

---

## 1. Resumen Ejecutivo del Diagnóstico

A partir del análisis de la captura de pantalla (`image_9b447a05.png`) y la inspección de la arquitectura de comunicación entre Baileys y Cloud Firestore, se determinó que la recepción de mensajes opera satisfactoriamente a nivel de transporte de red, pero presenta dos fallas de integración y serialización en capa de datos:

1. **Distorsión de Identidad (LIDs expuestos como números telefónicos):** Los remitentes mostrados como `+25404815458478` y `+83983891230953` no son números internacionales de Kenia o destinos foráneos, sino identificadores internos **WhatsApp LID (Linked Identity ID)** generados por la arquitectura multi-dispositivo de WhatsApp para proteger la privacidad del usuario. Al recibir el mensaje, el sistema extrajo únicamente la cadena numérica del LID y le antepuso un signo `+`, visualizándolo como un número telefónico inválido.
2. **Colapso al Enviar Mensajes (`setDoc() with undefined value`):** Al enviar texto simple como "hola", la función constructora del mensaje deja `mediaUrl` y `mediaMimeType` con valor `undefined`. El SDK cliente de Cloud Firestore rechaza de forma estricta cualquier campo con valor `undefined`, abortando la operación antes de alcanzar la red.

---

## 2. Aislamiento Detallado de Causas Raíz

### Causa Raíz 1: Distorsión de Números Telefónicos por Identificadores LID
* **Contexto de Baileys v6/v7:** En conexiones multi-dispositivo, WhatsApp no siempre transmite el número telefónico directo (`@s.whatsapp.net`), sino un identificador de dispositivo local (`@lid`), por ejemplo: `25404815458478@lid` o `83983891230953:1@lid`.
* **Falla en `server/whatsappQrBridge.ts`:**
  ```typescript
  // Código actual que ocasiona el problema:
  let phoneDigits = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^\d]/g, '');
  const senderPhone = phoneDigits ? `+${phoneDigits}` : undefined;
  ```
  Al remover `@lid` de `25404815458478@lid`, el código asume ciegamente que `25404815458478` son dígitos telefónicos y crea `+25404815458478`.
* **Mecanismo de Resolución Omitido:** Baileys genera y almacena localmente en `.whatsapp_sessions/<lineaId>/` una serie de archivos de mapeo inverso (`lid-mapping-<lid>_reverse.json`) cuyo contenido es el número telefónico E.164 real del contacto (por ejemplo `"584245390630"`). Además, el mensaje entrante contiene el nombre público de perfil en `msg.pushName`. El servidor no estaba consultando este mapeo inverso antes de persistir el mensaje.

---

### Causa Raíz 2: Error Fatal al Enviar Mensajes (`Unsupported field value: undefined in mediaUrl`)
* **Falla en `src/services/whatsappCloneService.ts` (`sendWhatsAppMessage`):**
  ```typescript
  const message: WhatsAppMessage = {
    id: msgId,
    whatsappMessageId: msgId,
    lineaId,
    remitenteTelefono: remNorm,
    destinatarioTelefono: destNorm,
    direccion: 'SALIENTE',
    texto,
    timestamp: now,
    estado: 'ENVIADO',
    tipoMensaje,
    mediaUrl, // <-- undefined cuando el mensaje es solo texto
    mediaMimeType, // <-- undefined cuando el mensaje es solo texto
    hasComprobantePago: false,
    ocrStatus: 'NO_ANALIZADO',
  };
  await setDoc(docRef, message); // <-- EXCEPCIÓN FATAL DE FIRESTORE
  ```
* **Contrato de Firestore Web SDK:** A diferencia del entorno Node.js Admin SDK (donde se puede activar `ignoreUndefinedProperties`), el SDK web cliente de Firestore prohíbe explícitamente valores `undefined` en documentos. Al detectar `mediaUrl: undefined`, Firestore bloquea la promesa y lanza:
  `Function setDoc() called with invalid data. Unsupported field value: undefined (found in field mediaUrl in document whatsapp_mensajes/WAM-...)`.

---

## 3. Decisiones de Arquitectura Acordadas

1. **Resolución de Identidad:** Mapeo automático de identificadores LID hacia su número telefónico E.164 real utilizando la base de datos de mapeo de Baileys, complementado con el nombre de perfil público (`pushName`) como titular principal en la interfaz.
2. **Sanitización de Datos:** Limpieza defensiva en el cliente previa a la llamada de `setDoc()`, eliminando cualquier propiedad con valor `undefined` mediante un serializador estricto sin pérdida de metadatos.

---

## 4. Plan de Remediación Propuesto (Sin Ejecución de Código)

### Fase 1: Motor de Resolución Inversa LID $\rightarrow$ E.164 (`server/whatsappQrBridge.ts`)
* Implementar la función auxiliar `resolveLidToPhoneNumber(lineaId: string, remoteJid: string): string`:
  1. Si el JID termina en `@s.whatsapp.net`, extraer directamente los dígitos del teléfono.
  2. Si el JID termina en `@lid`, consultar la caché en memoria y el archivo `lid-mapping-<lid>_reverse.json` dentro del directorio de la sesión para obtener el número telefónico real.
  3. Si no existe mapeo previo (contacto nuevo), registrar el JID limpio pero priorizar el `pushName` (nombre público de WhatsApp) como nombre principal del remitente.
* Almacenar en el documento de Firestore tanto el número resuelto como el `pushName` y el `remoteJid` original para trazabilidad completa.

### Fase 2: Sanitización DevSecOps en el Cliente (`src/services/whatsappCloneService.ts`)
* Implementar la función de utilidad `sanitizeFirestorePayload<T>(data: T): Record<string, any>` que filtre y elimine recursivamente todas las propiedades con valor `undefined`:
  ```typescript
  const cleanMessage = Object.fromEntries(
    Object.entries(message).filter(([_, value]) => value !== undefined)
  );
  await setDoc(docRef, cleanMessage);
  ```
* Garantizar que los campos opcionales como `mediaUrl` y `mediaMimeType` solo se adjunten al documento cuando realmente existan datos binarios o URLs válidas.

### Fase 3: Enriquecimiento de la Interfaz Lateral (`WhatsAppWebCloneView.tsx`)
* Ajustar la tarjeta del contacto en la barra lateral para que:
  * Si el contacto tiene un `pushName` o nombre registrado en el ERP, lo muestre como título destacado.
  * Debajo del nombre se muestre el número telefónico real (ej. `+58 424 5390630`) en tipografía monoespaciada legible, en lugar del código LID interno.
  * La caja de error inferior se limpie automáticamente al reintentar el envío.

### Fase 4: Protocolo de Verificación y Auditoría
1. **Prueba de Envío de Texto:** Enviar un mensaje de prueba ("hola") desde la plataforma y confirmar que se entregue a la pasarela Baileys sin arrojar la excepción de `setDoc()`.
2. **Prueba de Recepción con LID:** Enviar un mensaje desde un teléfono vinculado y comprobar que en la ventana lateral aparezca el nombre del contacto y su número telefónico real sin distorsión.
3. **Pruebas Automatizadas:** Ejecutar `npm run lint` y la suite de pruebas unitarias para certificar la estabilidad de la aplicación.
