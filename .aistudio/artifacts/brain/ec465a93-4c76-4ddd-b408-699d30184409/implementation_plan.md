# Plan de Implementación: Resolución Definitiva de Desvinculación y Sincronización en Vivo de WhatsApp CRM

Diagnóstico y plan integral para corregir el cierre intempestivo de la ventana de desvinculación (< 2 segundos) y habilitar la sincronización bidireccional reactiva de mensajes entrantes en la ventana lateral del CRM, asegurando la visualización inmediata de clientes y prospectos.

---

## 1. Diagnóstico Integral y Causas Raíces

### A. Causa Raíz del Cierre Prematuro del Modal de Desvinculación (< 2 segundos)
En `src/components/crm/WhatsAppWebCloneView.tsx` (líneas 287-313):
* El efecto de polling `fetchStatusAndQr` se activa automáticamente en cuanto `showQrModal` es verdadero.
* Inmediatamente al montarse (y luego cada 3000 ms), invoca al endpoint `/api/whatsapp/status?lineaId=...`.
* Dentro del bloque de éxito se encuentra la siguiente condición rígida:
  ```typescript
  if (res.estado === 'CONECTADO') {
    setShowQrModal(false);
  }
  ```
* **Mecanismo del fallo:** Cuando la línea ya se encuentra emparejada (`CONECTADO`) y el operador hace clic para consultar el número o pulsar **"Desvincular"**, el endpoint responde casi de forma instantánea indicando `estado: 'CONECTADO'`. El hook asume erróneamente que se acaba de escanear un código QR con éxito y fuerza `setShowQrModal(false)`. Esto destruye la ventana modal en menos de 1 o 2 segundos, haciendo imposible pulsar el botón de desvinculación.
* **Resolución técnica:** El auto-cierre debe condicionarse **únicamente** a transiciones vivas de escaneo (`ESPERANDO_QR` $\rightarrow$ `CONECTADO`). Si el modal fue abierto por el usuario cuando la línea ya estaba conectada, el modal debe permanecer abierto de manera persistente hasta que el usuario decida cerrarlo manualmente o ejecute la acción de desvincular.

---

### B. Causa Raíz de la Ausencia de Mensajes Entrantes en la Ventana Lateral
En `src/components/crm/WhatsAppWebCloneView.tsx` y `src/services/whatsappCloneService.ts`:
1. **Directorio Lateral Desconectado de los Mensajes Reales:**
   * La lista de la ventana lateral (`contactList`) se genera exclusivamente iterando sobre el arreglo estático `entities` del ERP (`for (const ent of entities)`).
   * **Mecanismo del fallo:** Si un cliente o prospecto escribe al número de WhatsApp vinculado, pero dicho número aún no ha sido dado de alta como cliente o proveedor en el ERP, el contacto es **completamente invisible** en la barra lateral.
2. **Ausencia de Previsualización de Mensajes y Marcas de Tiempo en la Lista:**
   * Los elementos de la barra lateral no se suscriben a la actividad de los mensajes; no muestran el extracto del último mensaje recibido ("Hola, transferí...", etc.), la hora ni el contador de mensajes.
3. **Filtro de Historial en la Inicialización del Socket Baileys:**
   * En `server/whatsappQrBridge.ts`, el socket de Baileys se inicializa con `syncFullHistory: false`, omitiendo conversaciones previas existentes en el dispositivo físico.
4. **Resolución técnica:** 
   * Implementar un observador en tiempo real de conversaciones para la línea activa en Firestore (`whatsapp_mensajes`).
   * Unificar de forma reactiva las entidades del ERP con **todos los números entrantes/salientes** que interactúen con la línea.
   * Mostrar el último mensaje y ordenar cronológicamente las conversaciones en la barra lateral según la actividad más reciente.

---

## 2. Decisiones de Arquitectura Acordadas con el Usuario
* **Directorio Unificado:** Mostrar en la ventana lateral tanto las entidades existentes del ERP como **todos los clientes que escriban**, permitiendo atender prospectos nuevos de inmediato.
* **Alcance de Sincronización:** Habilitar sincronización de historial reciente al vincular y persistencia en tiempo real de mensajes entrantes y salientes.

---

## 3. Plan de Trabajo Detallado

### Fase 1: Blindaje del Modal de Estado y Desvinculación (`WhatsAppWebCloneView.tsx`)
* En `WhatsAppWebCloneView.tsx`:
  * Almacenar mediante una referencia (`wasWaitingQrOnOpenRef`) si el modal se abrió en modo emparejamiento (`ESPERANDO_QR` / `DESCONECTADO`).
  * Modificar `fetchStatusAndQr` para que `setShowQrModal(false)` se dispare **únicamente** si `wasWaitingQrOnOpenRef.current === true` y el nuevo estado recibido es `CONECTADO`.
  * Si el usuario abrió el modal estando ya conectado (para ver el estado o desvincular), garantizar que la ventana se mantenga abierta permanentemente.
  * Añadir confirmación visual durante el proceso de desvinculación (`isDisconnecting`) con resguardo ante clics repetidos.

### Fase 2: Motor Reactivo de Conversaciones para la Barra Lateral (`whatsappCloneService.ts` & `WhatsAppWebCloneView.tsx`)
* **Servicio `whatsappCloneService.ts`:**
  * Crear método `subscribeLineRecentConversations(lineaId, callback)` que escuche la colección `whatsapp_mensajes` para la línea activa y extraiga un mapa resumido por teléfono:
    ```typescript
    interface ConversationSummary {
      telefonoE164: string;
      ultimoMensajeTexto: string;
      ultimoMensajeTimestamp: number;
      ultimoMensajeDireccion: 'ENTRANTE' | 'SALIENTE';
      hasComprobantePago: boolean;
      unreadCount: number;
    }
    ```
* **Componente `WhatsAppWebCloneView.tsx`:**
  * Enriquecer `contactList`:
    1. Mapear las entidades del ERP vinculando su saldo pendiente y estado crediticio.
    2. Incorporar cualquier número telefónico que registre mensajes en Firestore y que no esté aún en `entities`, asignándole el rol `PROSPECTO_WHATSAPP`.
    3. Asociar a cada tarjeta su último mensaje, fecha/hora formateada y etiqueta visual si contiene comprobante de pago.
    4. Ordenar la lista lateral en orden descendente por `ultimoMensajeTimestamp`.

### Fase 3: Optimización del Socket Baileys en Backend (`server/whatsappQrBridge.ts`)
* Configurar la pasarela Baileys para procesar eventos de sincronización de chats y mensajes al completar la vinculación.
* Asegurar que cada mensaje recibido (`messages.upsert`) normalice el teléfono a formato E.164 y guarde de inmediato en `whatsapp_mensajes` con atributos completos: `remitenteTelefono`, `destinatarioTelefono`, `texto`, `mediaUrl`, `timestamp`, `direccion`.
* Si un mensaje entrante contiene una imagen, registrarlo simultáneamente en `pagos_reportados_ocr` para el flujo de pre-conciliación financiera sin alterar el libro mayor.

### Fase 4: Certificación y Pruebas
* **Prueba de Desvinculación:** Abrir el modal de una línea ya conectada y verificar que permanece abierto sin cerrarse. Ejecutar la desvinculación y comprobar el cambio de estado a `DESCONECTADO`.
* **Prueba de Mensajes Entrantes:** Enviar un mensaje de prueba al número conectado y verificar que aparezca instantáneamente en la barra lateral con su texto y marca de tiempo.
* **Prueba de Reanudación de Sesión:** Reiniciar el servidor de desarrollo y verificar que la sesión se restaure con credenciales cifradas sin requerir re-escaneo de QR.
* **Compilación y Linters:** Ejecutar `npm run lint` y `npm run build` para validar ausencia de errores de tipos o advertencias de React.
