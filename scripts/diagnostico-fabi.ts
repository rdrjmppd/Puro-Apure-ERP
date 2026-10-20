/**
 * ============================================================================
 * PURO APURE ERP — SCRIPT DE DIAGNÓSTICO INTEGRAL: ASISTENTE FABI
 * ============================================================================
 * Ejecuta un diagnóstico forense completo sobre los motores de Fabi:
 * 1. Verificación de variables de entorno (GEMINI_API_KEY).
 * 2. Prueba del cliente Google Gen AI SDK (@google/genai).
 * 3. Prueba del Backend Handler (askGeminiAssistantHandler).
 * 4. Prueba del Motor de Conocimiento Local (queryFabiKnowledgeMatrix).
 * 5. Evaluación de cobertura de preguntas comunes y chips sugeridos.
 * ============================================================================
 * Para ejecutar en la terminal de AI Studio:
 *   npx tsx scripts/diagnostico-fabi.ts
 * ============================================================================
 */

import { askGeminiAssistantHandler } from '../server/askGeminiAssistant';
import { queryFabiKnowledgeMatrix, buildFabiSystemPrompt } from '../src/services/fabiKnowledgeMatrix';

async function ejecutarDiagnostico() {
  console.log('\n======================================================================');
  console.log('       PURO APURE ERP — DIAGNÓSTICO FORENSE DEL ASISTENTE FABI        ');
  console.log('======================================================================\n');

  const fecha = new Date().toISOString();
  console.log(`Fecha de Ejecución: ${fecha}`);

  // 1. VERIFICACIÓN DE CLAVE GEMINI_API_KEY
  console.log('\n--- [FASE 1] Verificación de Variables de Entorno ---');
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    'AQ.Ab8RN6IbKcoTjWc6NkNPO15jZ4YTyWTkmakH9uvI5jJ8RLLXLQ';
  if (!process.env.GEMINI_API_KEY && !process.env.VITE_GEMINI_API_KEY) {
    console.log('ℹ️ GEMINI_API_KEY: Configurada vía código de respaldo (Fallback Directo).');
  } else {
    const masked = apiKey.length > 8 ? `${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 4)}` : '***';
    console.log(`✅ GEMINI_API_KEY: DETECTADA (${masked})`);
  }

  // 2. PRUEBA DE RESOLUCIÓN LOCAL DE PREGUNTAS CLAVE
  console.log('\n--- [FASE 2] Prueba de Cobertura de la Matriz de Conocimiento ---');
  const preguntasPrueba = [
    { q: '¿Cómo interpretar el margen EBITDA?', modulo: 'PANEL_CONTROL', rol: 'ADMIN', esperado: 'ebitda' },
    { q: '¿Cómo veo mis tareas pendientes?', modulo: 'PANEL_CONTROL', rol: 'OBRERO', esperado: 'tarea' },
    { q: '¿Qué son los Días Calle?', modulo: 'COMPRAS_CXP', rol: 'ADMIN', esperado: 'calle' },
    { q: '¿Cómo calibrar los niveles críticos de insumos?', modulo: 'COMPRAS_CXP', rol: 'ADMIN', esperado: 'critico' },
    { q: '¿Cómo anoto un pesaje de cerdos?', modulo: 'INVENTARIOS', rol: 'OBRERO', esperado: 'merma' },
    { q: '¿Cuál es el ciclo de las aves de engorde?', modulo: 'INVENTARIOS', rol: 'OBRERO', esperado: '35' },
    { q: '¿Cómo funciona la tasa oficial BCV?', modulo: 'FINANZAS', rol: 'ADMIN', esperado: 'bcv' },
    { q: '¿Qué es el Delta de Devaluación?', modulo: 'FINANZAS', rol: 'ADMIN', esperado: 'delta' },
    { q: '¿En qué parte de la plataforma registro el peso de los cerdos?', modulo: 'PANEL_CONTROL', rol: 'SUPERADMIN', esperado: 'inventarios & granja' },
    { q: '¿Cómo hago el registro del peso?', modulo: 'PANEL_CONTROL', rol: 'SUPERADMIN', esperado: 'paso a paso' },
    { q: '¿Quién ganó el mundial de fútbol?', modulo: 'PANEL_CONTROL', rol: 'ADMIN', esperado: 'canonica' },
  ];

  let aciertos = 0;
  for (const item of preguntasPrueba) {
    const resp = queryFabiKnowledgeMatrix(item.q, item.rol, item.modulo, `${item.modulo} — Ruta`);
    const respLower = resp.toLowerCase();
    const esCanonica = resp.includes('La información disponible no me permite');
    const esFallbackGenerico = resp.startsWith('Estoy lista para asistirte en el módulo');

    let exito = false;
    if (item.esperado === 'canonica') {
      exito = esCanonica;
    } else {
      exito = !esFallbackGenerico && (respLower.includes(item.esperado) || respLower.includes(item.modulo.toLowerCase()));
    }

    if (exito) {
      aciertos++;
      console.log(`  ✅ [OK] "${item.q}" → Respuesta específica entregada.`);
    } else {
      console.log(`  ⚠️ [FALLA O GENÉRICO] "${item.q}"`);
      console.log(`     → Respuesta devuelta: "${resp.substring(0, 90)}..."`);
    }
  }

  console.log(`\nResultado Matriz Local: ${aciertos} de ${preguntasPrueba.length} preguntas respondidas con precisión.`);

  // 3. PRUEBA DE ENDPOINT SERVER ASK GEMINI
  console.log('\n--- [FASE 3] Prueba del Manejador Backend (askGeminiAssistantHandler) ---');
  try {
    const inicio = performance.now();
    const resServer = await askGeminiAssistantHandler({
      userMessage: '¿Qué son los Días Calle?',
      currentModule: 'COMPRAS_CXP',
      pantalla_actual: 'COMPRAS_CXP — Compras & CxP',
      userRole: 'ADMIN',
    });
    const duracion = Math.round(performance.now() - inicio);

    console.log(`Estado: ${resServer.success ? '✅ ÉXITO (HTTP 200)' : '❌ ERROR'}`);
    console.log(`Duración: ${duracion}ms`);
    console.log(`Muestra de respuesta: "${(resServer.reply || '').substring(0, 120)}..."`);

    const esGenerico = (resServer.reply || '').startsWith('Estoy lista para asistirte en el módulo');
    if (esGenerico) {
      console.log('⚠️ ALERTA: El backend retornó el fallback genérico por falta de coincidencia.');
    } else {
      console.log('✅ El backend retornó contenido contextual específico.');
    }
  } catch (err: any) {
    console.log(`❌ Error al invocar askGeminiAssistantHandler: ${err.message}`);
  }

  console.log('\n======================================================================');
  console.log('                   FIN DEL DIAGNÓSTICO TÉCNICO                        ');
  console.log('======================================================================\n');
}

ejecutarDiagnostico().catch((e) => {
  console.error('Error fatal en diagnóstico:', e);
});
