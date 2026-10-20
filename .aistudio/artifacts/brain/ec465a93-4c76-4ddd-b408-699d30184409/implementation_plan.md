# Plan de Implementación: Solución Definitiva para el Asistente de IA Fabi

Diagnóstico y resolución integral del error "Fallo de red temporal" en el asistente de IA Fabi, asegurando disponibilidad total tanto en entornos conectados con Gemini API como en modo fuera de línea (*Offline-First*) en operaciones de granja y entre diferentes navegadores o plataformas.

---

## 1. Diagnóstico de Causa Raíz

A través de la inspección del código fuente y pruebas directas sobre los endpoints de la aplicación (`/api/askGeminiAssistant`), se determinaron las siguientes causas raíz:

1. **Atrapamiento Indiscriminado en el Cliente (`FloatingAIAssistant.tsx`)**:
   - La función `handleSendMessage` ejecutaba `const res = await fetch('/api/askGeminiAssistant', ...)` seguido de `const data = await res.json()`.
   - Si la petición recibía una respuesta no-JSON (por ejemplo, redirecciones HTTP 302 generadas por el balanceador o proxy de AI Studio al abrir en nuevos navegadores como `/__cookie_check.html`, o páginas de error 502/504 en HTML), `res.json()` arrojaba un error de sintaxis fatal (`SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`).
   - El bloque `catch (err)` capturaba esta excepción y emitía el mensaje rígido: *"Fallo de red temporal. Asegúrese de tener conectividad a internet"*, sin intentar ninguna alternativa de recuperación.

2. **Aislamiento del Motor de Contingencia en el Backend**:
   - El archivo `server/askGeminiAssistant.ts` cuenta con un motor heurístico de contingencia con conocimiento profundo del ERP (`generateLocalDomainFallback`).
   - Sin embargo, dicho motor residía exclusivamente en el servidor Node.js. Si el usuario no tenía conexión directa al backend (por fallas de red, modo avión o desconexión en granja), el cliente no tenía acceso a esa inteligencia y colapsaba.

3. **Carencia de Control de Tiempos de Espera (`AbortController`)**:
   - El frontend no implementaba un límite de tiempo de espera controlado por el cliente. Si la API de Gemini o la red externa demoraban más de lo aceptable, la petición quedaba colgada hasta fallar abruptamente.

4. **Restricciones de Red en Navegadores y Políticas de Cookies**:
   - En navegadores secundarios o dispositivos móviles, la falta de configuración explícita de credenciales (`credentials: 'same-origin'`) y encabezados en la petición generaba bloqueos de sesión o preflight, impidiendo la entrega del payload JSON.

---

## 2. Decisiones de Arquitectura Acordadas

Con base en las respuestas del usuario:
* **Conmutación Automática:** Fabi conmutará de forma inmediata y transparente al motor local offline de contingencia ante cualquier degradación o fallo de red.
* **Tiempo Máximo de Espera:** 4 segundos para garantizar una interacción ágil sin bloqueos prolongados.

---

## 3. Plan de Trabajo Detallado

### Fase 1: Creación del Motor de Inteligencia Local Offline (`src/services/fabiOfflineEngine.ts`)
* Extraer y enriquecer la matriz de pensamiento y conocimiento operativo de Fabi en un servicio cliente TypeScript puro sin dependencias externas:
  - **Ciclo Avícola:** 35 a 40 días, sin deducción de merma, facturación a peso vivo * $4.00 USD/kg.
  - **Ciclo Porcino:** 150 días (5 meses), deducción de merma de 15 a 20 kg, facturación a peso neto * $6.00 USD/kg, estándar de consumo de 4 sacos de alimento por cerdo ($40.00 USD/saco = $160.00 USD por cerdo).
  - **Tasa Oficial BCV y Bimonetarismo:** Liquidación en USD y VES, tasa oficial, delta de devaluación Mark-to-Market para cuentas por cobrar/pagar.
  - **Cruce Dual de Cuentas:** Compensación bidireccional entre cliente y proveedor a la tasa oficial.
  - **Pedagogía por Rol y Pantalla:** Lenguaje paso a paso para Obreros de campo (pesajes en balanza, consumos) y respuestas ejecutivas para Administradores.
  - **Gobernanza y Cláusula Canónica:** Respuesta fija ante consultas fuera de dominio y protección de contraseñas/secretos.

### Fase 2: Blindaje y Resiliencia en el Cliente (`src/components/FloatingAIAssistant.tsx`)
* Implementar `AbortController` con temporizador estricto de **4000 ms** (4 segundos).
* Incorporar detección proactiva de conectividad (`navigator.onLine`). Si el usuario está offline, responder inmediatamente con el motor local sin esperar la llamada de red.
* Configurar `fetch` con `credentials: 'same-origin'` y validación defensiva de cabeceras (`res.ok` y comprobación de `res.headers.get('content-type')?.includes('application/json')`).
* Envolver la llamada en un mecanismo de salvaguarda: si `fetch` falla, aborta por timeout (4s) o devuelve datos no válidos, invocar inmediatamente `generateFabiLocalResponse(...)`, garantizando que el usuario **nunca** reciba un error bloqueante.

### Fase 3: Optimización del Backend y Middleware (`server/askGeminiAssistant.ts` y `vite.config.ts`)
* Reducir el timeout interno de la llamada a `@google/genai` en el servidor a 3500ms para responder antes del corte del cliente.
* En `vite.config.ts`, añadir soporte explícito para preflight `OPTIONS` y manejo robusto de buffers en el middleware `/api/askGeminiAssistant`.

### Fase 4: Verificación y Pruebas de Integración
* Ejecutar compilación de producción (`npm run build`) y verificación de tipos (`npm run lint`).
* Probar llamadas exitosas hacia Gemini API con conexión activa.
* Simular desconexión de red y timeout superior a 4s para verificar la conmutación instantánea al motor local sin mensajes de error.
* Probar en múltiples contextos de pantalla y roles (Obrero vs Administrador).
