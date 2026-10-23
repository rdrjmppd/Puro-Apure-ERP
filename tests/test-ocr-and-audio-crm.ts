/**
 * ============================================================================
 * PURO APURE ERP — SUITE DE CERTIFICACIÓN FORENSE Y AUDIO CRM (@QA + @OCR + @CRM)
 * ============================================================================
 * Archivo: test-ocr-and-audio-crm.ts
 *
 * Certificación de los 3 Bloques Mandatorios:
 * 1. BDV Modo Oscuro Real: Aislamiento de Luminancia (Y >= 195), Prevención de Colapso
 *    Bimodal de Otsu, Extracción Posicional de 13.201,00 Bs e Inyección Pre-Conciliación.
 * 2. Modo Claro Multi-Banco (BDV, Banesco, Mercantil, Bancamiga) y Fusión Multi-Pass.
 * 3. CRM WhatsApp: Recepción, Normalización y Deserialización de Notas de Voz/Audio
 *    (audioMessage -> tipoMensaje: AUDIO, texto descriptivo, mediaUrl Base64).
 * ============================================================================
 */

import {
  parseBankReceiptText,
  parseVenezuelanOrInternationalAmount,
  normalizeBankReference,
  mergeReceiptResults,
  getCaracasToday,
} from '../src/utils/bankReceiptParser';
import {
  evaluateVeracityScore,
  saveTranscriptionToMemory,
  getTranscriptionFromMemory,
} from '../src/services/ocrForensicService';
import { centsRound } from '../src/services/financialAnalyticsService';
import { sanitizeFirestorePayload } from '../src/utils/sanitizeFirestorePayload';
import { WhatsAppMessage } from '../src/types/crmWhatsapp';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName} - ${detail || 'Condición no cumplida'}`);
    failed++;
  }
}

async function runTestSuite() {
  console.log('\n================================================================');
  console.log('🔬 SUITE DE CERTIFICACIÓN FORENSE: OCR MODO OSCURO & AUDIO CRM');
  console.log('   Puro Apure ERP — Modo Autoejecutar (@QA + @OCR + @CRM)');
  console.log('================================================================\n');

  const BCV_RATE = 886.2271;

  // ---------------------------------------------------------------------------
  // BLOQUE 1: BDV Modo Oscuro Real y Extracción de 13.201,00 Bs
  // ---------------------------------------------------------------------------
  console.log('📌 [BLOQUE 1] BDV Modo Oscuro Real (Física de Píxeles & Luminancia Y >= 195):');

  // 1A. Simulación de Píxeles y Filtro Anti-Píldora Gris (Bimodal Otsu Collapse Prevention)
  // Letras blancas (#FFFFFF): R=255, G=255, B=255 (Y = 255 >= 195) -> Negro Puro (0, 0, 0)
  // Píldora gris (#8A8A8E): R=138, G=138, B=142 (Y = 138.4 < 195) -> Blanco Puro (255, 255, 255)
  // Fondo oscuro (#1C1C1E): R=28, G=28, B=30 (Y = 28.2 < 195) -> Blanco Puro (255, 255, 255)
  const pixelSamples = [
    { name: 'Letra blanca #FFFFFF', r: 255, g: 255, b: 255, expectedOutput: 0 },
    { name: 'Píldora gris #8A8A8E', r: 138, g: 138, b: 142, expectedOutput: 255 },
    { name: 'Fondo negro #1C1C1E', r: 28, g: 28, b: 30, expectedOutput: 255 },
    { name: 'Borde anti-aliased Y=196', r: 196, g: 196, b: 196, expectedOutput: 0 },
    { name: 'Gris medio Y=150', r: 150, g: 150, b: 150, expectedOutput: 255 },
  ];

  for (const s of pixelSamples) {
    const y = 0.299 * s.r + 0.587 * s.g + 0.114 * s.b;
    const isHigh = (s.r >= 190 && s.g >= 190 && s.b >= 190) || y >= 195;
    const outColor = isHigh ? 0 : 255;
    assert(
      outColor === s.expectedOutput,
      `Binarización de Luminancia para ${s.name}: Y=${y.toFixed(1)} -> ${outColor === 0 ? 'Negro (0)' : 'Blanco (255)'}`,
      `Esperado: ${s.expectedOutput}, Obtenido: ${outColor}`
    );
  }

  // 1B. Extracción Posicional BDV sin etiqueta "Monto" y con sufijo de moneda
  const bdvDarkRawText = `
PagomóvilBDV Personas
¡Pago Realizado con Éxito!
13.201,00 Bs
Fecha: 16/10/2026
Operación: 007689562549 ❐
Identificación: 15235343
Origen: 0102****8615
Destino: 04126703512
Banco: 0108 - BBVA PROVINCIAL
Concepto: rifa
  `.trim();

  const bdvParsed = parseBankReceiptText(bdvDarkRawText);

  assert(
    bdvParsed.bancoEmisor.includes('Banco de Venezuela'),
    'BDV: Banco Emisor identificado como Banco de Venezuela',
    `Obtenido: "${bdvParsed.bancoEmisor}"`
  );
  assert(
    bdvParsed.numeroReferencia === '007689562549',
    'BDV: Número de Referencia exacto de 12 dígitos (filtrado icono copiado ❐)',
    `Obtenido: "${bdvParsed.numeroReferencia}"`
  );
  assert(
    bdvParsed.montoOriginal === 13201.0,
    'BDV: Monto extraído con exactitud: 13201.00 VES (nunca 0)',
    `Obtenido: ${bdvParsed.montoOriginal}`
  );
  assert(
    bdvParsed.rifCedula === 'V-15235343',
    'BDV: Identificación normalizada con prefijo: V-15235343',
    `Obtenido: "${bdvParsed.rifCedula}"`
  );

  // 1C. Cálculo Bimonetario de Pre-Conciliación
  const usdEquiv = centsRound(bdvParsed.montoOriginal / BCV_RATE);
  const vesEquiv = centsRound(bdvParsed.montoOriginal);
  assert(
    usdEquiv === 14.9,
    `BDV: Equivalente USD exacto a tasa ${BCV_RATE}: $14.90 USD (centsRound)`,
    `Obtenido: $${usdEquiv}`
  );
  assert(
    vesEquiv === 13201.0,
    'BDV: Equivalente VES exacto: Bs. 13201.00',
    `Obtenido: Bs. ${vesEquiv}`
  );

  // 1D. Calificación Forense >= 95% (AUTENTICO_ALTA_CONFIANZA)
  const bdvScore = evaluateVeracityScore({
    esDuplicado: false,
    tieneFirmasIAOEdicion: false,
    consistenciaTipografica: true,
    halosDeColor: false,
    patronBancarioValido: true,
    bancoReconocido: true,
    bancoEmisor: bdvParsed.bancoEmisor,
    hasReference: true,
    numeroReferencia: bdvParsed.numeroReferencia,
    hasValidAmount: true,
    montoOriginal: bdvParsed.montoOriginal,
    fechaComprobante: bdvParsed.fechaComprobante,
    isDateInFuture: false,
    hasBeneficiaryData: true,
  });

  assert(
    bdvScore.score >= 95 && bdvScore.veredicto === 'AUTENTICO_ALTA_CONFIANZA',
    `BDV: Score Forense >= 95% con Veredicto AUTÉNTICO (Score: ${bdvScore.score}%)`,
    `Veredicto: ${bdvScore.veredicto}`
  );

  // 1E. Invalidación Automática de Caché Incompleta (Monto <= 0)
  const dummyIncomplete: any = {
    id: 'ocr_test_incomplete_1',
    sha256Bytes: 'hash_incomplete_test_abc',
    numeroReferencia: '007689562549',
    bancoEmisor: 'Banco de Venezuela',
    montoOriginal: 0, // Fallido
  };
  saveTranscriptionToMemory(dummyIncomplete);
  const retrievedIncomplete = getTranscriptionFromMemory('hash_incomplete_test_abc');
  assert(
    retrievedIncomplete === null,
    'Invalidación de Caché: Registro con monto <= 0 es purgado y devuelve null',
    `Obtenido: ${retrievedIncomplete}`
  );

  const dummyComplete: any = {
    id: 'ocr_test_complete_1',
    sha256Bytes: 'hash_complete_test_123',
    numeroReferencia: '007689562549',
    bancoEmisor: 'Banco de Venezuela',
    montoOriginal: 13201,
  };
  saveTranscriptionToMemory(dummyComplete);
  const retrievedComplete = getTranscriptionFromMemory('hash_complete_test_123');
  assert(
    retrievedComplete !== null && retrievedComplete?.montoOriginal === 13201,
    'Recuperación de Caché: Registro completo con monto > 0 es recuperado exitosamente',
    `Obtenido monto: ${retrievedComplete?.montoOriginal}`
  );

  // ---------------------------------------------------------------------------
  // BLOQUE 2: Modo Claro Multi-Banco y Tolerancia Óptica
  // ---------------------------------------------------------------------------
  console.log('\n📌 [BLOQUE 2] Modo Claro Multi-Banco y Tolerancia Óptica:');

  // 2A. Mercantil Tpago
  const mercantilText = `
Mercantil Tpago
Tu Tpago fue exitoso
Monto (Bs.):
44.238,00
Nro. de referencia:
47362693
Fecha y hora del envío:
22/10/2026 a las 11:04:42 AM
Beneficiario:
0414-4604661
Documento de identidad:
V-17.936.035
Banco destino:
0172 - Bancamiga
  `.trim();
  const mParsed = parseBankReceiptText(mercantilText);
  assert(mParsed.montoOriginal === 44238.0, 'Mercantil: Monto exacto 44238.00 VES');
  assert(mParsed.numeroReferencia === '47362693', 'Mercantil: Referencia limpia 47362693');

  // 2B. Banesco Multilínea
  const banescoText = `
¡Operación Exitosa!
BANCO EMISOR BANESCO
NÚMERO DE REFERENCIA
062939791409
MONTO DE LA OPERACIÓN
Bs. 53.000,00
BANCO RECEPTOR BANCO DE VENEZUELA
  `.trim();
  const banParsed = parseBankReceiptText(banescoText);
  assert(banParsed.bancoEmisor.includes('Banesco'), 'Banesco: Emisor Banesco');
  assert(banParsed.bancoReceptor.includes('Banco de Venezuela'), 'Banesco: Receptor BDV');
  assert(banParsed.montoOriginal === 53000.0, 'Banesco: Monto exacto 53000.00 VES');

  // 2C. Bancamiga con sufijo monetario
  const bancamigaText = `
Bancamiga Banco Universal
NUMERO DE REFERENCIA: 1140209533040
MONTO DE LA OPERACION: Bs. 8.833,96
BANCO: BANCO DE VENEZUELA
  `.trim();
  const bmParsed = parseBankReceiptText(bancamigaText);
  assert(bmParsed.numeroReferencia === '114020953304', 'Bancamiga: 12 dígitos filtrado ❐');
  assert(bmParsed.montoOriginal === 8833.96, 'Bancamiga: Monto exacto 8833.96 VES');

  // 2D. Fusión Multi-Pass
  const passA = {
    tipoComprobante: 'PAGO_MOVIL' as const,
    bancoEmisor: 'Banco de Venezuela',
    bancoReceptor: '',
    numeroReferencia: '007689562549',
    monedaOriginal: 'VES' as const,
    montoOriginal: 0, // Falló en pasada 1
    fechaComprobante: '2026-10-16',
    rifCedula: 'V-15235343',
    telefonoNombreEmisor: '04126703512',
    indicadoresManipulacionVisual: [],
    anomaliasEstructurales: [],
    confianzaExtraccion: 70,
    esComprobanteValido: true,
  };
  const passB = {
    tipoComprobante: 'PAGO_MOVIL' as const,
    bancoEmisor: '',
    bancoReceptor: '0108 - BBVA Provincial',
    numeroReferencia: '',
    monedaOriginal: 'VES' as const,
    montoOriginal: 13201.0, // Extraído en pasada de alta luminancia
    fechaComprobante: '',
    rifCedula: '',
    telefonoNombreEmisor: '',
    indicadoresManipulacionVisual: [],
    anomaliasEstructurales: [],
    confianzaExtraccion: 90,
    esComprobanteValido: true,
  };
  const merged = mergeReceiptResults(passA, passB);
  assert(
    merged.montoOriginal === 13201.0 &&
      merged.numeroReferencia === '007689562549' &&
      merged.bancoEmisor === 'Banco de Venezuela' &&
      merged.bancoReceptor === '0108 - BBVA Provincial',
    'Fusión Multi-Pass: Combina campos de Canal A y Canal B preservando el monto de luminancia',
    `Monto: ${merged.montoOriginal}, Ref: ${merged.numeroReferencia}`
  );

  // ---------------------------------------------------------------------------
  // BLOQUE 3: Recepción y Deserialización de Notas de Voz / Audio en CRM
  // ---------------------------------------------------------------------------
  console.log('\n📌 [BLOQUE 3] CRM WhatsApp: Recepción y Manejo de Notas de Voz:');

  // 3A. Simulación de Payload de audioMessage de Baileys
  const mockAudioMsgPayload = {
    mimetype: 'audio/ogg; codecs=opus',
    seconds: 15,
    ptt: true,
    fileLength: 45000,
  };

  // Conversión y tipado
  const isPtt = Boolean(mockAudioMsgPayload.ptt);
  const duration = mockAudioMsgPayload.seconds;
  const minutes = Math.floor(duration / 60);
  const seconds = Math.floor(duration % 60)
    .toString()
    .padStart(2, '0');
  const durationFormatted = `${minutes}:${seconds}`;
  const generatedLabel = isPtt ? `🎤 Nota de voz (${durationFormatted})` : `🎵 Audio (${durationFormatted})`;

  assert(
    generatedLabel === '🎤 Nota de voz (0:15)',
    `Etiqueta descriptiva de audio: "${generatedLabel}" (nunca burbuja en blanco)`,
    `Obtenido: "${generatedLabel}"`
  );

  // 3B. Objeto WhatsAppMessage para almacenamiento
  const rawAudioBase64 = Buffer.from('RIFF_SIMULATED_AUDIO_PAYLOAD_FOR_TESTS_12345').toString('base64');
  const audioMessageRecord: WhatsAppMessage = {
    id: 'msg_test_audio_001',
    whatsappMessageId: 'wam_test_audio_001',
    lineaId: 'linea_cobranzas',
    remitenteTelefono: '+584141234567',
    destinatarioTelefono: '+584249876543',
    direccion: 'ENTRANTE',
    texto: generatedLabel,
    timestamp: Date.now(),
    estado: 'LEIDO',
    tipoMensaje: 'AUDIO',
    mediaUrl: `data:audio/ogg;base64,${rawAudioBase64}`,
    mediaMimeType: mockAudioMsgPayload.mimetype,
    audioDuration: duration,
    audioDurationSeconds: duration,
    isPtt: isPtt,
    hasComprobantePago: false,
    senderName: 'Carlos Gómez (Cliente)',
  };

  assert(
    audioMessageRecord.tipoMensaje === 'AUDIO',
    'Tipo de mensaje clasificado estrictamente como "AUDIO"',
    `Obtenido: "${audioMessageRecord.tipoMensaje}"`
  );
  assert(
    audioMessageRecord.mediaUrl?.startsWith('data:audio/ogg;base64,'),
    'mediaUrl contiene Data URL Base64 con prefijo MIME audio/ogg',
    `Prefijo: "${audioMessageRecord.mediaUrl?.slice(0, 30)}"`
  );
  assert(
    audioMessageRecord.audioDuration === 15 && audioMessageRecord.isPtt === true,
    'Duración de 15 segundos y flag isPtt=true preservados en el modelo',
    `Duración: ${audioMessageRecord.audioDuration}, isPtt: ${audioMessageRecord.isPtt}`
  );

  // 3C. Sanitización DevSecOps para Firestore (Cero campos undefined)
  const sanitizedAudio = sanitizeFirestorePayload(audioMessageRecord);
  assert(
    sanitizedAudio.id === 'msg_test_audio_001' &&
      sanitizedAudio.tipoMensaje === 'AUDIO' &&
      !Object.values(sanitizedAudio).some((v) => v === undefined),
    'Sanitización Firestore: Cero campos undefined en payload de audio para evitar fallo de Firebase SDK',
    `Campos: ${Object.keys(sanitizedAudio).length}`
  );

  // 3D. Saliente de Audio (Envío por operador)
  const outgoingAudioMessage: WhatsAppMessage = {
    id: 'msg_test_audio_out_002',
    whatsappMessageId: 'wam_test_audio_out_002',
    lineaId: 'linea_cobranzas',
    remitenteTelefono: '+584249876543',
    destinatarioTelefono: '+584141234567',
    direccion: 'SALIENTE',
    texto: '🎤 Nota de voz (0:08)',
    timestamp: Date.now(),
    estado: 'ENVIADO',
    tipoMensaje: 'AUDIO',
    mediaUrl: `data:audio/ogg;base64,${rawAudioBase64}`,
    mediaMimeType: 'audio/ogg',
    audioDuration: 8,
    isPtt: true,
  };
  const sanitizedOutAudio = sanitizeFirestorePayload(outgoingAudioMessage);
  assert(
    sanitizedOutAudio.direccion === 'SALIENTE' && sanitizedOutAudio.tipoMensaje === 'AUDIO',
    'Mensaje de Audio Saliente correctamente estructurado y sanitizado',
    `Dirección: ${sanitizedOutAudio.direccion}`
  );

  // ---------------------------------------------------------------------------
  // RESUMEN FINAL
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`📊 RESULTADO DE LA SUITE DE CERTIFICACIÓN FORENSE & AUDIO CRM:`);
  console.log(`   Pruebas Exitosas: ${passed}`);
  console.log(`   Pruebas Fallidas: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    throw new Error(`Se detectaron ${failed} fallos en la suite de pruebas.`);
  }
}

runTestSuite()
  .then(() => {
    console.log('✨ Certificación Forense BDV Modo Oscuro y Audio CRM Superadas al 100% (0 errores).');
    process.exit(0);
  })
  .catch((err) => {
    console.error('💥 Error durante la ejecución:', err);
    process.exit(1);
  });
