/**
 * ============================================================================
 * PURO APURE ERP — CLOUD FUNCTION / BACKEND PROXY: askGeminiAssistant
 * ============================================================================
 * Canal seguro y desacoplado hacia la API de Gemini (@google/genai).
 * Oculta credenciales del cliente, procesa contexto operativo y aplica
 * el System Prompt estricto de gobernanza alimentado por la Matriz Central
 * de Conocimiento de Fabi.
 * ============================================================================
 */

import { GoogleGenAI } from '@google/genai';
import {
  OUT_OF_SCOPE_CANONICAL_REPLY,
  SECURITY_CANONICAL_REPLY,
  buildFabiSystemPrompt,
  queryFabiKnowledgeMatrix,
  normalizeQuery,
} from '../src/services/fabiKnowledgeMatrix';

export interface ChatHistoryItem {
  role: 'user' | 'model';
  text: string;
}

export interface AskGeminiAssistantRequest {
  userMessage: string;
  currentModule?: string;
  pantalla_actual?: string;
  userRole?: string;
  chatHistory?: ChatHistoryItem[];
}

export interface AskGeminiAssistantResponse {
  success: boolean;
  reply?: string;
  error?: string;
  mode?: 'gemini_cloud' | 'local_fallback';
  modelUsed?: string;
  debugError?: string;
}

export { OUT_OF_SCOPE_CANONICAL_REPLY, SECURITY_CANONICAL_REPLY };

/**
 * Rate Limiter en memoria: Ventana deslizante para protección de cuotas de Gemini
 */
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minuto
const MAX_REQUESTS_PER_WINDOW = 4; // Límite adaptado al Free Tier de Gemini (5 req/min) para evitar 429

// Circuit Breaker: Si la API de Gemini agota cuotas (429/RESOURCE_EXHAUSTED), conmutar temporalmente a motor de dominio local
let quotaExceededUntil = 0;

export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(key) || []).filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW_MS
  );

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    rateLimitMap.set(key, timestamps);
    return false; // Límite superado
  }

  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  return true; // Permitido
}

/**
 * Motor de Fallback de Dominio Local Inteligente y Humanizado:
 * Utiliza la Matriz Central de Conocimiento de Fabi para responder al instante
 * sin latencia, ante fallos de red o saturación de cuotas.
 */
function generateLocalDomainFallback(
  userMessage: string,
  currentModule: string,
  userRole: string,
  pantallaActual: string = ''
): string {
  return queryFabiKnowledgeMatrix(
    userMessage,
    userRole,
    currentModule,
    pantallaActual || currentModule
  );
}

/**
 * Manejador principal de la Cloud Function askGeminiAssistant
 */
export async function askGeminiAssistantHandler(
  payload: AskGeminiAssistantRequest
): Promise<AskGeminiAssistantResponse> {
  const currentModule = payload.pantalla_actual || payload.currentModule || 'PANEL_CONTROL';
  const pantallaActual = payload.pantalla_actual || payload.currentModule || '';
  const userRole = payload.userRole || 'OBRERO';
  const { userMessage, chatHistory = [] } = payload;

  if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
    return {
      success: false,
      error: 'Mensaje de usuario requerido.',
    };
  }

  const cleanMessage = userMessage.trim();
  const qNorm = normalizeQuery(cleanMessage);

  // Verificación de Rate Limit: Si se satura la ventana de consultas, responder con el motor local transparente
  const clientKey = `${userRole || 'ANON'}_client`;
  if (!checkRateLimit(clientKey)) {
    return {
      success: true,
      reply: generateLocalDomainFallback(cleanMessage, currentModule, userRole, pantallaActual),
    };
  }

  // Detección estricta de Desvío / Fuera de Dominio (Gobernanza Inflexible y Cláusula Canónica)
  const offTopicKeywords = [
    'futbol', 'mundial', 'pizza', 'receta', 'pelicula', 'presidente',
    'politica', 'musica', 'cancion', 'chiste', 'capital de',
    'clima', 'francia', 'espana', 'noticias', 'beisbol', 'astrologia', 'horoscopo'
  ];
  if (offTopicKeywords.some((kw) => qNorm.includes(kw))) {
    return {
      success: true,
      reply: OUT_OF_SCOPE_CANONICAL_REPLY,
    };
  }

  // Defensa estricta contra Prompt Injection y Fuga de Secretos
  const securityKeywords = [
    'contrasena', 'password', 'clave secreta', 'apikey', 'api key',
    'token', 'secret', 'ignora tus instrucciones', 'system prompt', 'credencial'
  ];
  if (securityKeywords.some((kw) => qNorm.includes(kw))) {
    return {
      success: true,
      reply: SECURITY_CANONICAL_REPLY,
    };
  }

  // Verificación de Circuit Breaker (si la cuota externa de la API está temporalmente en backoff)
  if (Date.now() < quotaExceededUntil) {
    return {
      success: true,
      reply: generateLocalDomainFallback(cleanMessage, currentModule, userRole, pantallaActual),
    };
  }

  // Verificación de clave de API
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    'AQ.Ab8RN6IbKcoTjWc6NkNPO15jZ4YTyWTkmakH9uvI5jJ8RLLXLQ';
  if (!apiKey) {
    return {
      success: true,
      reply: generateLocalDomainFallback(cleanMessage, currentModule, userRole, pantallaActual),
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const systemInstruction = buildFabiSystemPrompt(userRole, currentModule);

    // Mapear historial al formato de la API de Gemini
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    // Limitar historial a los últimos 6 mensajes para no saturar tokens en dispositivos móviles
    const recentHistory = chatHistory.slice(-6);

    for (const h of recentHistory) {
      if (h.text && (h.role === 'user' || h.role === 'model')) {
        contents.push({
          role: h.role,
          parts: [{ text: h.text }],
        });
      }
    }

    // Desacoplamiento estricto de metadatos: El mensaje del usuario va limpio sin etiquetas de rol o módulo
    contents.push({
      role: 'user',
      parts: [{ text: cleanMessage }],
    });

    const candidateModels = [
      'gemini-flash-latest',
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
    ];

    let lastErr: any = null;
    let responseText = '';
    let usedModel = '';

    for (const modelName of candidateModels) {
      try {
        const generatePromise = ai.models.generateContent({
          model: modelName,
          contents: contents,
          config: {
            systemInstruction,
            temperature: 0.2, // Baja temperatura para apego estricto a directrices de seguridad
            maxOutputTokens: 2048,
          },
        });

        // Timeout preventivo de 10000ms
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('GEMINI_API_TIMEOUT')), 10000)
        );

        const response: any = await Promise.race([generatePromise, timeoutPromise]);
        responseText = (response.text || '').trim();
        if (responseText) {
          usedModel = modelName;
          lastErr = null;
          break;
        }
      } catch (err: any) {
        lastErr = err;
        // Si la cuota externa está agotada (429/RESOURCE_EXHAUSTED), activar circuit breaker breve (15s)
        if (
          err?.status === 429 ||
          err?.message?.includes('429') ||
          err?.message?.includes('RESOURCE_EXHAUSTED')
        ) {
          quotaExceededUntil = Date.now() + 15_000;
          break;
        }
      }
    }

    if (lastErr || !responseText) {
      throw lastErr || new Error('EMPTY_GEMINI_RESPONSE');
    }

    return {
      success: true,
      reply: responseText,
      mode: 'gemini_cloud',
      modelUsed: usedModel,
    };
  } catch (error: any) {
    if (
      error?.status === 429 ||
      error?.message?.includes('429') ||
      error?.message?.includes('RESOURCE_EXHAUSTED')
    ) {
      quotaExceededUntil = Date.now() + 15_000;
    }
    // Contingencia de alta disponibilidad: Respuesta de dominio segura y enriquecida
    const fallback = generateLocalDomainFallback(cleanMessage, currentModule, userRole, pantallaActual);
    return {
      success: true,
      reply: fallback,
      mode: 'local_fallback',
      debugError: error?.message || String(error),
    };
  }
}
