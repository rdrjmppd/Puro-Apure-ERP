/**
 * Suite de Pruebas Automatizadas de Estrés, Seguridad y Certificación Forense
 * Módulos: Clon de WhatsApp Web (CRM/BRM) & Motor OCR Forense Anti-IA / Anti-Fraude
 * Entorno: Google Antigravity 2.0 / Puro Apure ERP
 */

import {
  normalizeToE164,
  WhatsAppCloneService,
} from '../src/services/whatsappCloneService';
import {
  calculateSha256,
  calculatePHash,
  calculateHammingDistance,
  inspectExifAndMagicBytes,
  evaluateVeracityScore,
  OcrForensicService,
} from '../src/services/ocrForensicService';
import { DualEntity } from '../src/types/finance';
import { centsRound } from '../src/services/financialAnalyticsService';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${testName} - ${detail || 'Condición no cumplida'}`);
    failedTests++;
  }
}

async function runCrmOcrTestSuite() {
  console.log('================================================================');
  console.log('🚀 INICIANDO AUDITORÍA FORENSE Y BATERÍA DE PRUEBAS DE ESTRÉS');
  console.log('   Módulos: CRM WhatsApp Clone & OCR Forense Anti-IA/Anti-Fraude');
  console.log('================================================================\n');

  // ================================================================
  // SECCIÓN 1: NORMALIZACIÓN E.164 Y SERVICIO WHATSAPP
  // ================================================================
  console.log('📌 SECCIÓN 1: Normalización Telefónica E.164 y Plantillas Dinámicas');

  const testPhones = [
    { input: '0414 123 4567', expected: '+584141234567' },
    { input: '0424-987-6543', expected: '+584249876543' },
    { input: '+58 412 555 1234', expected: '+584125551234' },
    { input: '584161112233', expected: '+584161112233' },
    { input: '4143334455', expected: '+584143334455' },
  ];

  for (const t of testPhones) {
    const res = normalizeToE164(t.input);
    assert(
      res === t.expected,
      `Normalización E.164: "${t.input}" -> "${res}"`,
      `Esperado: ${t.expected}, Obtenido: ${res}`
    );
  }

  // Plantillas inteligentes con variables dinámicas
  const templateSample =
    'Estimado {{cliente}}, le recordamos el saldo pendiente de {{monto_usd}} USD (Bs. {{monto_ves}}) de la factura {{factura}}, con vencimiento el {{fecha_vencimiento}}.';

  const renderedTpl = WhatsAppCloneService.renderTemplate(templateSample, {
    cliente: 'Agropecuaria El Médano C.A.',
    factura: 'PRO-2026-0042',
    monto_usd: 1540.5,
    monto_ves: 61620.0,
    fecha_vencimiento: '2026-10-31',
  });

  assert(
    renderedTpl.includes('Agropecuaria El Médano C.A.') &&
      renderedTpl.includes('1,540.50') &&
      renderedTpl.includes('61,620.00') &&
      renderedTpl.includes('PRO-2026-0042'),
    'Renderizado de Plantilla Inteligente de Cobranza',
    `Resultado: ${renderedTpl}`
  );

  // Generación de URL directa wa.me
  const waUrl = WhatsAppCloneService.generateDirectWhatsAppUrl(
    '+584141234567',
    'Hola! Saludos cordiales'
  );
  assert(
    waUrl.startsWith('https://wa.me/584141234567?text='),
    'Generación de Enlace Universal wa.me',
    `URL: ${waUrl}`
  );

  // Enriquecimiento de contactos con Directorio ERP
  const mockEntities: DualEntity[] = [
    {
      id: 'ent_cliente_1',
      name: 'Distribuidora Avícola Apure',
      rifCedula: 'J-12345678-9',
      roles: ['CLIENTE'],
      city: 'San Fernando',
      address: 'Av. Caracas',
      phone: '+584141112233',
      balanceUSD: 2450.0,
      balanceVES: 98000.0,
      lastUpdatedTimestamp: Date.now(),
    },
    {
      id: 'ent_dual_1',
      name: 'Agropecuaria Dual San Juan',
      rifCedula: 'J-98765432-1',
      roles: ['CLIENTE', 'PROVEEDOR'],
      city: 'Biruaca',
      address: 'Carretera Nacional',
      phone: '+584249998877',
      balanceUSD: 500.0,
      balanceVES: 20000.0,
      lastUpdatedTimestamp: Date.now(),
    },
  ];

  const enrichedCliente = WhatsAppCloneService.enrichContactWithERP(
    '0414-111-2233',
    mockEntities,
    2450.0,
    0
  );
  assert(
    enrichedCliente.entityRole === 'CLIENTE' &&
      enrichedCliente.estadoSolvencia === 'EN_MORA' &&
      enrichedCliente.nombreDisplay === 'Distribuidora Avícola Apure',
    'Enriquecimiento ERP: Cliente con Factura Pendiente'
  );

  const enrichedDual = WhatsAppCloneService.enrichContactWithERP(
    '+58 424 999 8877',
    mockEntities,
    1000.0,
    600.0
  );
  assert(
    enrichedDual.entityRole === 'DUAL' &&
      enrichedDual.saldoNetoCompensadoUSD === 400.0,
    'Enriquecimiento ERP: Entidad Dual con Compensación Cruzada'
  );

  const enrichedLead = WhatsAppCloneService.enrichContactWithERP(
    '+584120000000',
    mockEntities,
    0,
    0
  );
  assert(
    enrichedLead.entityRole === 'LEAD' &&
      enrichedLead.estadoSolvencia === 'SIN_DEUDA',
    'Enriquecimiento ERP: Prospecto no registrado (LEAD)'
  );

  // ================================================================
  // SECCIÓN 2: AUDITORÍA FORENSE OCR (LOS 4 CANDADOS DE VERACIDAD)
  // ================================================================
  console.log('\n📌 SECCIÓN 2: Algoritmos Criptográficos y de Visión Perceptual');

  // Prueba SHA-256
  const sampleBytes1 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const sampleBytes2 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const sampleBytes3 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 99]);

  const hash1 = await calculateSha256(sampleBytes1);
  const hash2 = await calculateSha256(sampleBytes2);
  const hash3 = await calculateSha256(sampleBytes3);

  assert(
    hash1 === hash2 && hash1 !== hash3 && hash1.length > 0,
    'Criptografía SHA-256: Idempotencia y Resistencia a Colisiones',
    `Hash1: ${hash1}, Hash3: ${hash3}`
  );

  // Prueba pHash (Hash Perceptual) y Distancia de Hamming
  const pHash1 = await calculatePHash('', sampleBytes1);
  const pHash2 = await calculatePHash('', sampleBytes2);
  const pHash3 = await calculatePHash('', sampleBytes3);

  assert(
    pHash1.length === 16 && /^[0-9a-f]+$/i.test(pHash1),
    'pHash: Generación de huella perceptual de 16 caracteres hexadecimales (64 bits)'
  );

  const distIdentical = calculateHammingDistance(pHash1, pHash2);
  assert(
    distIdentical === 0,
    'Distancia Hamming entre imágenes idénticas = 0'
  );

  const distDiff = calculateHammingDistance(
    '0000000000000000',
    'ffff000000000000'
  );
  assert(
    distDiff === 16,
    `Cálculo exacto de Distancia de Hamming: ${distDiff} diferencias`
  );

  // Candado 2: Inspección Binaria de EXIF y Firmas de Software
  console.log('\n📌 SECCIÓN 3: Inspección de Metadatos EXIF & Detección Anti-IA / Anti-Edición');

  // Caso A: Archivo Limpio (Captura móvil auténtica)
  const cleanBytes = new TextEncoder().encode('Comprobante original Banco de Venezuela Pago Movil 123456');
  const cleanInspection = inspectExifAndMagicBytes(cleanBytes);
  assert(
    !cleanInspection.tieneFirmasIAOEdicion,
    'Inspección EXIF: Archivo genuino sin firmas de edición'
  );

  // Caso B: Archivo con firma de Photoshop
  const photoshopBytes = new TextEncoder().encode('Header... Adobe Photoshop 2024 ... Footer');
  const psInspection = inspectExifAndMagicBytes(photoshopBytes);
  assert(
    psInspection.tieneFirmasIAOEdicion && psInspection.softwareDetectado === 'Adobe Photoshop',
    'Detección de Edición Digital: Adobe Photoshop detectado'
  );

  // Caso C: Archivo con firma de Canva
  const canvaBytes = new TextEncoder().encode('Header... Canva Creative Engine ... Footer');
  const canvaInspection = inspectExifAndMagicBytes(canvaBytes);
  assert(
    canvaInspection.tieneFirmasIAOEdicion && canvaInspection.softwareDetectado?.includes('Canva'),
    `Detección de Edición Digital: Canva detectado (${canvaInspection.softwareDetectado})`
  );

  // Caso D: Archivo generado por Inteligencia Artificial (Midjourney)
  const mjBytes = new TextEncoder().encode('Metadata... Midjourney v6 synthesized ...');
  const mjInspection = inspectExifAndMagicBytes(mjBytes);
  assert(
    mjInspection.tieneFirmasIAOEdicion && mjInspection.softwareDetectado?.includes('Midjourney'),
    `Detección Forense Anti-IA: Generador Midjourney detectado (${mjInspection.softwareDetectado})`
  );

  // Caso E: Archivo generado por DALL-E
  const dalleBytes = new TextEncoder().encode('Metadata... OpenAI DALL-E generative stream ...');
  const dalleInspection = inspectExifAndMagicBytes(dalleBytes);
  assert(
    dalleInspection.tieneFirmasIAOEdicion && dalleInspection.softwareDetectado?.includes('DALL-E'),
    `Detección Forense Anti-IA: Generador DALL-E detectado (${dalleInspection.softwareDetectado})`
  );

  // ================================================================
  // SECCIÓN 4: MOTOR DE PUNTUACIÓN Y SEMÁFORO DE VERACIDAD (0-100)
  // ================================================================
  console.log('\n📌 SECCIÓN 4: Semáforo de Veracidad y Reglas de Puntuación (Spec-Driven)');

  // Caso 1: Comprobante Genuino y Auténtico
  const dictamenAutentico = evaluateVeracityScore({
    esDuplicado: false,
    tieneFirmasIAOEdicion: false,
    consistenciaTipografica: true,
    halosDeColor: false,
    patronBancarioValido: true,
  });
  assert(
    dictamenAutentico.veredicto === 'AUTENTICO_ALTA_CONFIANZA' && dictamenAutentico.score >= 80,
    `Comprobante Genuino: Score ${dictamenAutentico.score} pts -> ${dictamenAutentico.veredicto}`
  );

  // Caso 2: Intento de Fraude por Reciclaje (Mismo Hash o Referencia)
  const dictamenReciclaje = evaluateVeracityScore({
    esDuplicado: true,
    hashDuplicado: 'a1b2c3d4...',
    tieneFirmasIAOEdicion: false,
    consistenciaTipografica: true,
    halosDeColor: false,
    patronBancarioValido: true,
  });
  assert(
    dictamenReciclaje.veredicto === 'ALERTA_FRAUDE_EDICION_O_IA' && dictamenReciclaje.score < 50,
    `Intento de Reciclaje: Score ${dictamenReciclaje.score} pts -> ${dictamenReciclaje.veredicto}`
  );

  // Caso 3: Intento de Fraude por IA o Edición Photoshop
  const dictamenEdicionIA = evaluateVeracityScore({
    esDuplicado: false,
    tieneFirmasIAOEdicion: true,
    softwareDetectado: 'Midjourney',
    consistenciaTipografica: false,
    halosDeColor: true,
    patronBancarioValido: false,
  });
  assert(
    dictamenEdicionIA.veredicto === 'ALERTA_FRAUDE_EDICION_O_IA' && dictamenEdicionIA.score < 50,
    `Imagen Sintética IA: Score ${dictamenEdicionIA.score} pts -> ${dictamenEdicionIA.veredicto}`
  );

  // Caso 4: Comprobante Dudoso / Discrepancia Leve (Revisión Humana)
  const dictamenDudoso = evaluateVeracityScore({
    esDuplicado: false,
    tieneFirmasIAOEdicion: false,
    consistenciaTipografica: false, // Ligera inconsistencia de fuente
    halosDeColor: false,
    patronBancarioValido: true,
  });
  assert(
    dictamenDudoso.veredicto === 'SOSPECHOSO_REVISION_HUMANA' &&
      dictamenDudoso.score >= 50 &&
      dictamenDudoso.score < 80,
    `Discrepancia Leve: Score ${dictamenDudoso.score} pts -> ${dictamenDudoso.veredicto}`
  );

  // ================================================================
  // SECCIÓN 5: EXACTITUD MATEMÁTICA Y REDONDEO BIMONETARIO
  // ================================================================
  console.log('\n📌 SECCIÓN 5: Certificación de Exactitud Matemática (centsRound)');

  const testMaths = [
    { input: 0.1 + 0.2, expected: 0.3 },
    { input: 1250.555, expected: 1250.56 },
    { input: 45000.004, expected: 45000.0 },
    { input: 100 / 3, expected: 33.33 },
  ];

  for (const tm of testMaths) {
    const res = centsRound(tm.input);
    assert(
      res === tm.expected,
      `centsRound(${tm.input}) = ${res}`,
      `Esperado: ${tm.expected}, Obtenido: ${res}`
    );
  }

  // ================================================================
  // RESUMEN FINAL
  // ================================================================
  console.log('\n================================================================');
  console.log(`📊 RESULTADO DE LA BATERÍA DE PRUEBAS AUTOMATIZADA:`);
  console.log(`   Pruebas Exitosas: ${passedTests}`);
  console.log(`   Pruebas Fallidas: ${failedTests}`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    throw new Error(`Se detectaron ${failedTests} fallos en la batería de pruebas.`);
  }
}

runCrmOcrTestSuite()
  .then(() => {
    console.log('✨ Certificación Forense y Batería de Pruebas Superadas con Éxito (0 errores).');
    process.exit(0);
  })
  .catch((err) => {
    console.error('💥 Error durante la ejecución de las pruebas:', err);
    process.exit(1);
  });
