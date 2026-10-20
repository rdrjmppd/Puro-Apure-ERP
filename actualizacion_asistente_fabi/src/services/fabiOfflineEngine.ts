/**
 * ============================================================================
 * PURO APURE ERP — MOTOR DE INTELIGENCIA LOCAL OFFLINE: Fabi (Frontend & Fallback)
 * ============================================================================
 * Proporciona asistencia inmediata, contextual y humanizada sin depender de
 * llamadas de red o cuotas de API. Permite que el asistente Fabi funcione
 * de manera ininterrumpida en granjas, potreros y navegadores con restricciones
 * de red o desconexión total, respaldado por la Matriz Central de Conocimiento.
 * ============================================================================
 */

import {
  OUT_OF_SCOPE_CANONICAL_REPLY,
  SECURITY_CANONICAL_REPLY,
  queryFabiKnowledgeMatrix,
} from './fabiKnowledgeMatrix';

export { OUT_OF_SCOPE_CANONICAL_REPLY, SECURITY_CANONICAL_REPLY };

export interface FabiLocalContext {
  userMessage: string;
  currentModule?: string;
  pantalla_actual?: string;
  userRole?: string;
}

/**
 * Genera una respuesta inteligente de dominio para Fabi cuando no hay conexión,
 * se supera el timeout de 4s o la API externa no está disponible.
 */
export function generateFabiLocalResponse(context: FabiLocalContext): string {
  const {
    userMessage,
    currentModule = 'PANEL_CONTROL',
    pantalla_actual = '',
    userRole = 'OBRERO',
  } = context;

  return queryFabiKnowledgeMatrix(
    userMessage,
    userRole,
    currentModule,
    pantalla_actual
  );
}
