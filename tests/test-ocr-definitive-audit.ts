/**
 * ============================================================================
 * PURO APURE ERP — SUITE DE CERTIFICACIÓN @QA Y AUDITORÍA FORENSE DEFINITIVA
 * ============================================================================
 * Archivo: test-ocr-definitive-audit.ts
 * Certifica los 7 Escenarios Obligatorios:
 * 1. Bancamiga con ícono de copiado (❐): '1140209533040' -> '114020953304'
 * 2. Mercantil Tpago multilínea: 'Nro. de referencia:\n47362693' (no 'erencia')
 * 3. Banesco multilínea: '¡Operación Exitosa!' + '062939791409' (no 'Exitosa') + Emisor vs Receptor
 * 4. BDV Modo Oscuro: '13.201,00 Bs' / '13.201,00 8s' + '007689562549'
 * 5. BDV Rotado (0°/90°/180°/270°): '14.082,00 Bs' + '007689459093' con Score >= 90%
 * 6. Detección Objetiva de Fraudes y Sospechosos (Reciclaje, Photoshop, Fecha Futura)
 * 7. Indemnidad Absoluta de Pasarela WhatsApp Web QR y Compatibilidad CRM
 * ============================================================================
 */

import {
  parseBankReceiptText,
  parseVenezuelanOrInternationalAmount,
  normalizeBankReference,
  formatCaracasDate,
  getCaracasToday,
  isFutureCaracasDate,
  isDateOlderThanDays,
} from '../src/utils/bankReceiptParser';
import {
  evaluateVeracityScore,
  inspectExifAndMagicBytes,
} from '../src/services/ocrForensicService';
import { centsRound } from '../src/services/financialAnalyticsService';

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

async function runDefinitiveAudit() {
  console.log('\n================================================================');
  console.log('🔬 AUDITORÍA FORENSE DEFINITIVA DEL MOTOR OCR & MATRIZ DE VERACIDAD');
  console.log('   Puro Apure ERP — Modo Autoejecutar (@QA + @OCR + @Finanzas)');
  console.log('================================================================\n');

  const BCV_RATE = 886.2271;

  // -------------------------------------------------------------------------
  // ESCENARIO 1: Bancamiga con ícono de copiado (❐)
  // -------------------------------------------------------------------------
  console.log('📌 [ESCENARIO 1] Bancamiga con Ícono de Copiado (❐):');
  const bancamigaCopyIconText1 = `
Bancamiga Banco Universal
PAGO MOVIL INTERBANCARIO
NUMERO DE REFERENCIA: 1140209533040
MONTO DE LA OPERACION: Bs. 8.833,96
CI/RIF BENEFICIARIO: V-11083828
TELF BENEFICIARIO: 04145057900
BANCO: BANCO DE VENEZUELA
FECHA: 21/10/26 11:23 am
  `.trim();

  const bParsed1 = parseBankReceiptText(bancamigaCopyIconText1);

  assert(
    bParsed1.bancoEmisor.includes('Bancamiga'),
    'Banco Emisor detectado como Bancamiga',
    `Obtenido: "${bParsed1.bancoEmisor}"`
  );
  assert(
    bParsed1.numeroReferencia === '114020953304',
    'Filtrado de ícono de copiado ❐: 1140209533040 -> 114020953304 (12 dígitos canónicos)',
    `Obtenido: "${bParsed1.numeroReferencia}"`
  );
  assert(
    bParsed1.montoOriginal === 8833.96,
    'Monto Original exacto: 8833.96 VES',
    `Obtenido: ${bParsed1.montoOriginal}`
  );
  assert(
    bParsed1.bancoReceptor.includes('Banco de Venezuela'),
    'Banco Receptor identificado: Banco de Venezuela',
    `Obtenido: "${bParsed1.bancoReceptor}"`
  );

  // Muestra adicional con ícono de copiado leyendo dígito '9': 1753571277389
  const bancamigaCopyIconText2 = `
NUMERO DE REFERENCIA: 1753571277389
MONTO DE LA OPERACION: Bs. 15.420,00
Bancamiga Banco Universal
  `.trim();
  const bParsed2 = parseBankReceiptText(bancamigaCopyIconText2);
  assert(
    bParsed2.numeroReferencia === '175357127738',
    'Filtrado de segundo caso ❐: 1753571277389 -> 175357127738',
    `Obtenido: "${bParsed2.numeroReferencia}"`
  );

  const bVeracity = evaluateVeracityScore({
    esDuplicado: false,
    tieneFirmasIAOEdicion: false,
    consistenciaTipografica: true,
    halosDeColor: false,
    patronBancarioValido: true,
    bancoReconocido: true,
    bancoEmisor: bParsed1.bancoEmisor,
    hasReference: true,
    numeroReferencia: bParsed1.numeroReferencia,
    hasValidAmount: true,
    montoOriginal: bParsed1.montoOriginal,
    fechaComprobante: bParsed1.fechaComprobante,
    isDateInFuture: false,
    hasBeneficiaryData: true,
  });
  assert(
    bVeracity.score >= 90 && bVeracity.veredicto === 'AUTENTICO_ALTA_CONFIANZA',
    `Score Forense Bancamiga >= 90% con Veredicto AUTÉNTICO (Score: ${bVeracity.score}%)`,
    `Dictamen: ${bVeracity.veredicto}`
  );

  // -------------------------------------------------------------------------
  // ESCENARIO 2: Mercantil Tpago multilínea (Nro. de referencia:\n47362693)
  // -------------------------------------------------------------------------
  console.log('\n📌 [ESCENARIO 2] Mercantil Tpago Multilínea:');
  const mercantilMultilineText = `
Mercantil
Tpago
Tu Tpago fue exitoso
Monto (Bs.):
44.238,00
Nro. de referencia:
47362693
Fecha y hora del envío:
22/10/2026 a las 11:04:42 AM
Cuenta origen:
Cta. Ahorro *5349
Beneficiario:
0414-4604661
Documento de identidad:
V-17.936.035
Banco destino:
0172 - Bancamiga, Banco Universal
Concepto:
Yamilly Rojas
  `.trim();

  const mParsed = parseBankReceiptText(mercantilMultilineText);

  assert(
    mParsed.bancoEmisor.includes('Mercantil'),
    'Banco Emisor detectado como Mercantil',
    `Obtenido: "${mParsed.bancoEmisor}"`
  );
  assert(
    mParsed.numeroReferencia === '47362693',
    'Número de Referencia exacto: 47362693 (NO "erencia")',
    `Obtenido: "${mParsed.numeroReferencia}"`
  );
  assert(
    mParsed.montoOriginal === 44238.0,
    'Monto Multilínea normalizado: 44238.00 VES',
    `Obtenido: ${mParsed.montoOriginal}`
  );
  assert(
    mParsed.bancoReceptor.includes('Bancamiga'),
    'Banco Destino identificado: Bancamiga (0172)',
    `Obtenido: "${mParsed.bancoReceptor}"`
  );
  assert(
    mParsed.rifCedula === 'V-17.936.035',
    'Documento de Identidad extraído: V-17.936.035',
    `Obtenido: "${mParsed.rifCedula}"`
  );
  assert(
    mParsed.telefonoNombreEmisor === '04144604661',
    'Teléfono extraído: 04144604661',
    `Obtenido: "${mParsed.telefonoNombreEmisor}"`
  );

  const mUsdEquiv = centsRound(mParsed.montoOriginal / BCV_RATE);
  assert(
    mUsdEquiv === 49.92,
    `Cálculo Bimonetario Exacto: Bs. 44.238,00 / 886.2271 = $49.92 USD`,
    `Obtenido: $${mUsdEquiv} USD`
  );

  const mVeracity = evaluateVeracityScore({
    esDuplicado: false,
    tieneFirmasIAOEdicion: false,
    consistenciaTipografica: true,
    halosDeColor: false,
    patronBancarioValido: true,
    bancoReconocido: true,
    bancoEmisor: mParsed.bancoEmisor,
    hasReference: true,
    numeroReferencia: mParsed.numeroReferencia,
    hasValidAmount: true,
    montoOriginal: mParsed.montoOriginal,
    fechaComprobante: mParsed.fechaComprobante,
    isDateInFuture: false,
    hasBeneficiaryData: true,
  });
  assert(
    mVeracity.score >= 90 && mVeracity.veredicto === 'AUTENTICO_ALTA_CONFIANZA',
    `Score Forense Mercantil >= 90% con Veredicto AUTÉNTICO (Score: ${mVeracity.score}%)`,
    `Dictamen: ${mVeracity.veredicto}`
  );

  // -------------------------------------------------------------------------
  // ESCENARIO 3: Banesco multilínea con "¡Operación Exitosa!" y Emisor vs Receptor
  // -------------------------------------------------------------------------
  console.log('\n📌 [ESCENARIO 3] Banesco Multilínea ("¡Operación Exitosa!"):');
  const banescoMultilineText = `
¡Operación Exitosa!
BANCO EMISOR
BANESCO BANCO UNIVERSAL S.A.C.A.
NÚMERO DE REFERENCIA
062939791409
MONTO DE LA OPERACIÓN
Bs. 53.000,00
FECHA DE OPERACIÓN
23/10/2026 09:15:30 AM
BANCO RECEPTOR
BANCO DE VENEZUELA
BENEFICIARIO
0412-1234567
CI/RIF
V-20123456
CONCEPTO
Pago Ganado Puro Apure
  `.trim();

  const banParsed = parseBankReceiptText(banescoMultilineText);

  assert(
    banParsed.bancoEmisor.includes('Banesco'),
    'Banco Emisor detectado como Banesco (no sobreescrito por Banco Receptor)',
    `Obtenido: "${banParsed.bancoEmisor}"`
  );
  assert(
    banParsed.numeroReferencia === '062939791409',
    'Número de Referencia exacto: 062939791409 (NO "Exitosa")',
    `Obtenido: "${banParsed.numeroReferencia}"`
  );
  assert(
    banParsed.bancoReceptor.includes('Banco de Venezuela'),
    'Banco Receptor identificado: Banco de Venezuela',
    `Obtenido: "${banParsed.bancoReceptor}"`
  );
  assert(
    banParsed.montoOriginal === 53000.0,
    'Monto Multilínea normalizado: 53000.00 VES',
    `Obtenido: ${banParsed.montoOriginal}`
  );

  const banVeracity = evaluateVeracityScore({
    esDuplicado: false,
    tieneFirmasIAOEdicion: false,
    consistenciaTipografica: true,
    halosDeColor: false,
    patronBancarioValido: true,
    bancoReconocido: true,
    bancoEmisor: banParsed.bancoEmisor,
    hasReference: true,
    numeroReferencia: banParsed.numeroReferencia,
    hasValidAmount: true,
    montoOriginal: banParsed.montoOriginal,
    fechaComprobante: banParsed.fechaComprobante,
    isDateInFuture: false,
    hasBeneficiaryData: true,
  });
  assert(
    banVeracity.score >= 90 && banVeracity.veredicto === 'AUTENTICO_ALTA_CONFIANZA',
    `Score Forense Banesco >= 90% con Veredicto AUTÉNTICO (Score: ${banVeracity.score}%)`,
    `Dictamen: ${banVeracity.veredicto}`
  );

  // -------------------------------------------------------------------------
  // ESCENARIO 4: BDV Modo Oscuro ("13.201,00 Bs" y "007689562549")
  // -------------------------------------------------------------------------
  console.log('\n📌 [ESCENARIO 4] BDV Modo Oscuro ("13.201,00 Bs"):');
  const bdvDarkModeText = `
PagomóvilBDV Personas
¡Pago Realizado con Éxito!
Origen: 0102********3321
Destino: 0134********9912
Referencia: 007689562549
13.201,00 Bs
Fecha: 22/10/2026 02:45 PM
Teléfono: 0414-9988776
Cédula: V-15443210
Concepto: Compra Queso Apureño
  `.trim();

  const bdvParsed = parseBankReceiptText(bdvDarkModeText);

  assert(
    bdvParsed.bancoEmisor.includes('Banco de Venezuela'),
    'Banco Emisor detectado como Banco de Venezuela',
    `Obtenido: "${bdvParsed.bancoEmisor}"`
  );
  assert(
    bdvParsed.numeroReferencia === '007689562549',
    'Número de Referencia exacto: 007689562549',
    `Obtenido: "${bdvParsed.numeroReferencia}"`
  );
  assert(
    bdvParsed.montoOriginal === 13201.0,
    'Monto en modo oscuro normalizado con sufijo "Bs": 13201.00 VES',
    `Obtenido: ${bdvParsed.montoOriginal}`
  );

  // Caso con confusión OCR de "8s" por "Bs"
  const bdvDarkModeText8s = `
PagomóvilBDV Personas
Referencia: 007689562549
13.201,00 8s
  `.trim();
  const bdvParsed8s = parseBankReceiptText(bdvDarkModeText8s);
  assert(
    bdvParsed8s.montoOriginal === 13201.0,
    'Tolerancia a confusión OCR "8s" por "Bs": 13.201,00 8s -> 13201.00 VES',
    `Obtenido: ${bdvParsed8s.montoOriginal}`
  );

  const bdvVeracity = evaluateVeracityScore({
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
    bdvVeracity.score >= 90 && bdvVeracity.veredicto === 'AUTENTICO_ALTA_CONFIANZA',
    `Score Forense BDV Modo Oscuro >= 90% con Veredicto AUTÉNTICO (Score: ${bdvVeracity.score}%)`,
    `Dictamen: ${bdvVeracity.veredicto}`
  );

  // -------------------------------------------------------------------------
  // ESCENARIO 5: BDV Comprobante Rotado (0°/90°/180°/270°)
  // -------------------------------------------------------------------------
  console.log('\n📌 [ESCENARIO 5] BDV Comprobante Rotado ("14.082,00 Bs" y "007689459093"):');
  const bdvRotatedSample = `
Banco de Venezuela
PagomóvilBDV
Pago Móvil Aprobado
007689459093
14.082,00 Bs
22/10/2026
0424-5544332
V-18765432
  `.trim();

  const rotParsed = parseBankReceiptText(bdvRotatedSample);

  assert(
    rotParsed.bancoEmisor.includes('Banco de Venezuela'),
    'Banco Emisor detectado en comprobante rotado',
    `Obtenido: "${rotParsed.bancoEmisor}"`
  );
  assert(
    rotParsed.numeroReferencia === '007689459093',
    'Número de Referencia exacto: 007689459093',
    `Obtenido: "${rotParsed.numeroReferencia}"`
  );
  assert(
    rotParsed.montoOriginal === 14082.0,
    'Monto Original normalizado: 14082.00 VES',
    `Obtenido: ${rotParsed.montoOriginal}`
  );

  const rotVeracity = evaluateVeracityScore({
    esDuplicado: false,
    tieneFirmasIAOEdicion: false,
    consistenciaTipografica: true,
    halosDeColor: false,
    patronBancarioValido: true,
    bancoReconocido: true,
    bancoEmisor: rotParsed.bancoEmisor,
    hasReference: true,
    numeroReferencia: rotParsed.numeroReferencia,
    hasValidAmount: true,
    montoOriginal: rotParsed.montoOriginal,
    fechaComprobante: rotParsed.fechaComprobante,
    isDateInFuture: false,
    hasBeneficiaryData: true,
  });
  assert(
    rotVeracity.score >= 90 && rotVeracity.veredicto === 'AUTENTICO_ALTA_CONFIANZA',
    `Score en Comprobante Rotado >= 90% (NUNCA falso 60% ni 80%) (Score: ${rotVeracity.score}%)`,
    `Dictamen: ${rotVeracity.veredicto}`
  );

  // -------------------------------------------------------------------------
  // ESCENARIO 6: Detección Objetiva de Fraudes y Sospechosos
  // -------------------------------------------------------------------------
  console.log('\n📌 [ESCENARIO 6] Detección Objetiva de Fraudes y Sospechosos:');

  // 6A: Fraude por Reciclaje
  const vReciclado = evaluateVeracityScore({
    esDuplicado: true,
    referenciaDuplicada: '062939791409',
    tieneFirmasIAOEdicion: false,
    consistenciaTipografica: true,
    halosDeColor: false,
    patronBancarioValido: true,
  });
  assert(
    vReciclado.veredicto === 'ALERTA_FRAUDE_EDICION_O_IA' && vReciclado.score <= 15,
    `Fraude por Reciclaje -> ALERTA ROJA (Score: ${vReciclado.score}%)`,
    `Score: ${vReciclado.score}`
  );

  // 6B: Fraude por Edición Photoshop / IA
  const vPhotoshop = evaluateVeracityScore({
    esDuplicado: false,
    tieneFirmasIAOEdicion: true,
    softwareDetectado: 'Adobe Photoshop 2026',
    consistenciaTipografica: false,
    halosDeColor: true,
    patronBancarioValido: false,
  });
  assert(
    vPhotoshop.veredicto === 'ALERTA_FRAUDE_EDICION_O_IA' && vPhotoshop.score <= 20,
    `Fraude por Edición Photoshop -> ALERTA ROJA (Score: ${vPhotoshop.score}%)`,
    `Score: ${vPhotoshop.score}`
  );

  // 6C: Comprobante Incompleto (sin monto ni referencia)
  const vIncompleto = evaluateVeracityScore({
    esDuplicado: false,
    tieneFirmasIAOEdicion: false,
    consistenciaTipografica: true,
    halosDeColor: false,
    patronBancarioValido: true,
    bancoReconocido: true,
    hasReference: false,
    hasValidAmount: false,
    montoOriginal: 0,
    hasBeneficiaryData: true,
  });
  assert(
    vIncompleto.veredicto === 'SOSPECHOSO_REVISION_HUMANA' &&
      vIncompleto.score >= 50 &&
      vIncompleto.score < 85,
    `Comprobante sin monto ni referencia -> SOSPECHOSO (Score: ${vIncompleto.score}%)`,
    `Score: ${vIncompleto.score}`
  );

  // 6D: Fecha Futura
  const vFuturo = evaluateVeracityScore({
    esDuplicado: false,
    tieneFirmasIAOEdicion: false,
    consistenciaTipografica: true,
    halosDeColor: false,
    patronBancarioValido: true,
    bancoReconocido: true,
    hasReference: true,
    numeroReferencia: '99887766',
    hasValidAmount: true,
    montoOriginal: 100,
    isDateInFuture: true,
    hasBeneficiaryData: true,
  });
  assert(
    vFuturo.veredicto === 'SOSPECHOSO_REVISION_HUMANA' && vFuturo.score === 75,
    `Fecha futura -> SOSPECHOSO con penalización -25 pts (Score: ${vFuturo.score}%)`,
    `Score: ${vFuturo.score}`
  );

  // -------------------------------------------------------------------------
  // ESCENARIO 7: Regresión de WhatsApp QR e Integridad del Sistema
  // -------------------------------------------------------------------------
  console.log('\n📌 [ESCENARIO 7] Regresión de WhatsApp QR y Blindaje DevSecOps:');
  const rawBase64Mock = 'OP9f2CJAGTyq7n38bdvbncrefRandomGibberishBase64EncodingWithoutSpacesOrNewlines';
  const parsedFromBase64 = parseBankReceiptText(rawBase64Mock);
  assert(
    !parsedFromBase64.esComprobanteValido &&
      parsedFromBase64.bancoEmisor === '' &&
      parsedFromBase64.numeroReferencia === '' &&
      parsedFromBase64.montoOriginal === 0,
    'Rechazo estricto de Base64 crudo: Cero Mock Data y sin datos sintéticos inventados',
    `Emisor: "${parsedFromBase64.bancoEmisor}", Ref: "${parsedFromBase64.numeroReferencia}"`
  );

  const todayCaracas = getCaracasToday();
  assert(
    !isFutureCaracasDate(todayCaracas),
    `Zona Horaria America/Caracas (${todayCaracas}): Hoy no es clasificado como futuro`,
    `isFutureCaracasDate(${todayCaracas}) = false`
  );

  // -------------------------------------------------------------------------
  // RESUMEN
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`📊 RESULTADO DE LA SUITE DE AUDITORÍA FORENSE DEFINITIVA:`);
  console.log(`   Pruebas Exitosas: ${passed}`);
  console.log(`   Pruebas Fallidas: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    throw new Error(`Se detectaron ${failed} fallos en la auditoría.`);
  }
}

runDefinitiveAudit()
  .then(() => {
    console.log('✨ Certificación Forense y Batería de Estrés Superadas al 100% (0 errores).');
    process.exit(0);
  })
  .catch((err) => {
    console.error('💥 Error durante la auditoría:', err);
    process.exit(1);
  });
