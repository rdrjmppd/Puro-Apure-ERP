/**
 * Puro Apure ERP — Parser Especializado de Comprobantes Bancarios Nacionales e Internacionales
 * Extrae texto óptico real de píxeles (Gemini Vision / Tesseract OCR)
 * Prohibido el procesamiento de Base64 crudo o sustitución por datos sintéticos.
 */

import { centsRound } from '../services/financialAnalyticsService';
import { TipoComprobanteOCR } from '../types/ocrForensic';

export interface ParsedBankReceipt {
  esComprobanteValido: boolean;
  tipoComprobante: TipoComprobanteOCR;
  bancoEmisor: string;
  bancoReceptor: string;
  codigoBancoDestino?: string;
  numeroReferencia: string;
  monedaOriginal: 'VES' | 'USD';
  montoOriginal: number;
  fechaComprobante: string; // YYYY-MM-DD
  horaComprobante?: string;
  fechaHoraDisplay?: string; // e.g. 22/10/2026 11:04:42 AM
  rifCedula: string;
  telefonoNombreEmisor: string;
  cuentaOrigen?: string;
  concepto?: string;
  indicadoresManipulacionVisual: string[];
  anomaliasEstructurales: string[];
  confianzaExtraccion: number; // 0 - 100
}

/**
 * Obtiene la fecha actual en la zona horaria oficial de Venezuela (America/Caracas - VET UTC-4)
 * en formato YYYY-MM-DD, evitando el salto al día siguiente por UTC.
 */
export function getCaracasToday(): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  } catch {
    // Fallback restando 4 horas a UTC
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const caracasDate = new Date(utcMs - 4 * 3600000);
    return caracasDate.toISOString().slice(0, 10);
  }
}

/**
 * Convierte cualquier fecha a YYYY-MM-DD respetando America/Caracas
 */
export function formatCaracasDate(dateInput?: Date | string): string {
  if (!dateInput) return getCaracasToday();
  if (typeof dateInput === 'string') {
    // Si ya viene como YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) return dateInput;
    // Si viene como DD/MM/YYYY o DD-MM-YYYY
    const dmy = dateInput.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (dmy) {
      const day = dmy[1].padStart(2, '0');
      const month = dmy[2].padStart(2, '0');
      let year = dmy[3];
      if (year.length === 2) year = `20${year}`;
      return `${year}-${month}-${day}`;
    }
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return getCaracasToday();
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Evalúa si una fecha está en el futuro respecto a la fecha actual de Venezuela
 */
export function isFutureCaracasDate(dateStr: string): boolean {
  if (!dateStr) return false;
  const normalized = formatCaracasDate(dateStr);
  const today = getCaracasToday();
  return normalized > today;
}

/**
 * Evalúa si una fecha tiene más de N días de antigüedad respecto a la fecha de Venezuela
 */
export function isDateOlderThanDays(dateStr: string, maxDays: number = 90): boolean {
  if (!dateStr) return false;
  const normalized = formatCaracasDate(dateStr);
  const dateObj = new Date(`${normalized}T12:00:00Z`);
  const todayObj = new Date(`${getCaracasToday()}T12:00:00Z`);
  const diffDays = Math.floor((todayObj.getTime() - dateObj.getTime()) / (1000 * 3600 * 24));
  return diffDays > maxDays;
}

/**
 * Normaliza montos en formato venezolano (44.238,00 -> 44238.00) o internacional (1,540.50 -> 1540.50)
 */
export function parseVenezuelanOrInternationalAmount(raw: string): number {
  if (!raw) return 0;
  let clean = raw.trim().replace(/[^\d.,]/g, '');
  if (!clean) return 0;

  const lastComma = clean.lastIndexOf(',');
  const lastDot = clean.lastIndexOf('.');

  if (lastComma > lastDot) {
    // Coma decimal venezolana / europea (ej. 44.238,00 o 8833,96)
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // Punto decimal internacional (ej. 1,540.50 o 150.00)
    clean = clean.replace(/,/g, '');
  } else if (lastComma !== -1 && lastDot === -1) {
    // Solo coma (ej. 44238,00)
    clean = clean.replace(',', '.');
  }

  const num = parseFloat(clean);
  return isNaN(num) ? 0 : centsRound(num);
}

/**
 * Normaliza cualquier número de referencia bancaria a formato alfanumérico en mayúsculas sin espacios
 * Filtra artefactos comunes de íconos de copiado (❐) que agregan un 13° dígito espurio o corchetes.
 */
export function normalizeBankReference(ref: string): string {
  if (!ref) return '';
  let clean = ref.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Si tiene 13 dígitos numéricos en pagos móviles venezolanos estándar (12 dígitos canónicos)
  if (/^\d{13}$/.test(clean)) {
    clean = clean.slice(0, 12);
  }
  return clean;
}

/**
 * Catálogo SUDEBAN y de Plataformas de Pago
 */
const BANCOS_SUDEBAN = [
  { code: '0102', nombre: 'Banco de Venezuela', aliases: ['banco de venezuela', 'bdv', 'pago clave'] },
  { code: '0104', nombre: 'Venezolano de Crédito', aliases: ['venezolano de credito', 'venezolano de crédito'] },
  { code: '0105', nombre: 'Mercantil Banco Universal', aliases: ['mercantil', 'tpago', 't-pago', 'banco mercantil'] },
  { code: '0108', nombre: 'BBVA Provincial', aliases: ['bbva', 'provincial', 'dinero rapido', 'dinero rápido'] },
  { code: '0114', nombre: 'Bancaribe', aliases: ['bancaribe', 'mi pago bancaribe'] },
  { code: '0115', nombre: 'Banco Exterior', aliases: ['exterior', 'banco exterior'] },
  { code: '0128', nombre: 'Banco Caroní', aliases: ['caroni', 'caroní'] },
  { code: '0134', nombre: 'Banesco Banco Universal', aliases: ['banesco', 'pago movil banesco', 'pago móvil banesco'] },
  { code: '0137', nombre: 'Banco Sofitasa', aliases: ['sofitasa'] },
  { code: '0138', nombre: 'Banco Plaza', aliases: ['plaza', 'banco plaza'] },
  { code: '0151', nombre: 'BFC Banco Fondo Común', aliases: ['bfc', 'fondo comun', 'fondo común'] },
  { code: '0156', nombre: '100% Banco', aliases: ['100% banco', '100%banco'] },
  { code: '0157', nombre: 'DelSur Banco Universal', aliases: ['delsur'] },
  { code: '0163', nombre: 'Banco del Tesoro', aliases: ['tesoro', 'banco del tesoro'] },
  { code: '0168', nombre: 'Bancrecer', aliases: ['bancrecer'] },
  { code: '0169', nombre: 'Mi Banco', aliases: ['mi banco'] },
  { code: '0171', nombre: 'Banco Activo', aliases: ['activo', 'banco activo'] },
  { code: '0172', nombre: 'Bancamiga Banco Universal', aliases: ['bancamiga', 'pago movil bancamiga'] },
  { code: '0174', nombre: 'Banplus Banco Universal', aliases: ['banplus'] },
  { code: '0175', nombre: 'Banco Bicentenario', aliases: ['bicentenario', 'banco bicentenario'] },
  { code: '0177', nombre: 'Banco de la Fuerza Armada Nacional Bolivariana (BANFANB)', aliases: ['banfanb'] },
  { code: '0191', nombre: 'Banco Nacional de Crédito (BNC)', aliases: ['bnc', 'banco nacional de credito', 'banco nacional de crédito'] },
];

/**
 * Parser de Texto Real extraído de la imagen (OCR)
 * Procesa el texto plano impreso sin contaminarse de cadenas Base64.
 * Incluye soporte multilínea, huellas dactilares de plantilla bancaria,
 * filtrado de íconos de copiado (❐) y reconocimiento de montos en modo oscuro / claro.
 */
export function parseBankReceiptText(ocrText: string): ParsedBankReceipt {
  const anomalies: string[] = [];
  const text = (ocrText || '').trim();

  // Un comprobante bancario real siempre contiene múltiples palabras y líneas.
  // Si no tiene espacios o parece Base64/hash crudo:
  if (!text || !text.includes(' ') || /^[A-Za-z0-9+/=_-]{20,}$/.test(text)) {
    return {
      esComprobanteValido: false,
      tipoComprobante: 'PAGO_MOVIL',
      bancoEmisor: '',
      bancoReceptor: '',
      numeroReferencia: '',
      monedaOriginal: 'VES',
      montoOriginal: 0,
      fechaComprobante: getCaracasToday(),
      rifCedula: '',
      telefonoNombreEmisor: '',
      indicadoresManipulacionVisual: [],
      anomaliasEstructurales: ['Texto no legible o parece una cadena codificada no procesada'],
      confianzaExtraccion: 0,
    };
  }

  const lines = text
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const lower = text.toLowerCase();

  // 1. MODALIDAD / TIPO DE COMPROBANTE
  let tipoComprobante: TipoComprobanteOCR = 'PAGO_MOVIL';
  let monedaOriginal: 'VES' | 'USD' = 'VES';

  if (lower.includes('zelle')) {
    tipoComprobante = 'ZELLE';
    monedaOriginal = 'USD';
  } else if (lower.includes('binance') || lower.includes('usdt') || lower.includes('cripto') || lower.includes('pay id')) {
    tipoComprobante = 'CRIPTOACTIVOS';
    monedaOriginal = 'USD';
  } else if (lower.includes('retencion') || lower.includes('retención') || lower.includes('seniat') || lower.includes('iva retenido')) {
    tipoComprobante = 'RETENCION_FISCAL';
  } else if (lower.includes('transferencia') || lower.includes('interbancaria') || lower.includes('mismo banco')) {
    tipoComprobante = 'TRANSFERENCIA';
  } else if (lower.includes('tpago') || lower.includes('pago movil') || lower.includes('pago móvil') || lower.includes('pago clave')) {
    tipoComprobante = 'PAGO_MOVIL';
  }

  // 2. DETECCIÓN DE BANCOS Y HUELLAS DACTILARES DE PLANTILLA
  let bancoEmisor = '';
  let bancoReceptor = '';
  let codigoBancoDestino = '';

  // Huella Banesco: "¡Operación Exitosa!", "En breve le llegará un SMS", mención de Banesco o "BANCO EMISOR BANESCO"
  const isBanescoFingerprint =
    /banesco/i.test(text) ||
    /operaci[oó]n exitosa/i.test(text) ||
    /en breve le llegar[aá] un sms/i.test(text) ||
    /n[uú]mero celular de origen/i.test(text);

  if (isBanescoFingerprint) {
    bancoEmisor = 'Banesco Banco Universal';
  }

  // Huella Bancamiga: mención explícita o secuencia canónica de campos
  const isBancamigaFingerprint =
    /bancamiga/i.test(text) ||
    (/numero\s*de\s*referencia/i.test(text) &&
      (/monto\s*de\s*la\s*operaci[oó]n/i.test(text) ||
        /ci\s*\/?\s*rif\s*beneficiario/i.test(text) ||
        /telf\s*beneficiario/i.test(text)));

  if (isBancamigaFingerprint && !bancoEmisor) {
    bancoEmisor = 'Bancamiga Banco Universal';
  }

  // Huella Mercantil: "Tpago", "Tu Tpago fue exitoso", "Cuenta origen"
  const isMercantilFingerprint =
    /mercantil/i.test(text) ||
    /tpago|t-pago/i.test(text) ||
    /tu tpago fue exitoso/i.test(text);

  if (isMercantilFingerprint) {
    bancoEmisor = 'Mercantil Banco Universal';
  }

  // Huella Banco de Venezuela (BDV): "PagomóvilBDV", "Pago Clave", "Origen: 0102"
  const isBdvFingerprint =
    /pagom[oó]vilbdv/i.test(text) ||
    /pago clave/i.test(text) ||
    /origen:\s*(?:\*\*\*\*)*0102/i.test(text) ||
    /\b0102\*{4,}/i.test(text);

  if (isBdvFingerprint && !bancoEmisor) {
    bancoEmisor = 'Banco de Venezuela';
  }

  // Huella BBVA Provincial
  const isProvincialFingerprint = /provincial|bbva|dinero r[aá]pido/i.test(text);
  if (isProvincialFingerprint && !bancoEmisor) {
    bancoEmisor = 'BBVA Provincial';
  }

  // Huella BNC
  const isBncFingerprint = /banco nacional de cr[eé]dito|pos bnc|\bbnc\b/i.test(text);
  if (isBncFingerprint && !bancoEmisor) {
    bancoEmisor = 'Banco Nacional de Crédito (BNC)';
  }

  // Parseo línea a línea de BANCO EMISOR y BANCO RECEPTOR / DESTINO
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Reconocimiento de BANCO EMISOR
    if (/^(?:banco\s*emisor|cuenta\s*origen|banco\s*origen)\b/i.test(line)) {
      const restOfLine = line.replace(/^(?:banco\s*emisor|cuenta\s*origen|banco\s*origen)[:\s]*/i, '').trim();
      const candidateText = restOfLine || (lines[i + 1] ? lines[i + 1].trim() : '');
      for (const b of BANCOS_SUDEBAN) {
        if (b.aliases.some((alias) => candidateText.toLowerCase().includes(alias))) {
          bancoEmisor = b.nombre;
          break;
        }
      }
    }

    // Reconocimiento de BANCO RECEPTOR / BANCO DESTINO / BANCO BENEFICIARIO
    if (/^(?:banco\s*receptor|banco\s*destino|banco\s*beneficiario|banco)\b/i.test(line)) {
      if (/banco\s*emisor/i.test(line)) continue;
      const restOfLine = line.replace(/^(?:banco\s*receptor|banco\s*destino|banco\s*beneficiario|banco)[:\s]*/i, '').trim();
      const candidateText = restOfLine || (lines[i + 1] ? lines[i + 1].trim() : '');
      if (candidateText) {
        const codeMatch = candidateText.match(/\b(01\d{2})\b/);
        if (codeMatch) {
          codigoBancoDestino = codeMatch[1];
          const found = BANCOS_SUDEBAN.find((b) => b.code === codigoBancoDestino);
          if (found) {
            bancoReceptor = `${found.code} - ${found.nombre}`;
          } else {
            bancoReceptor = candidateText;
          }
        } else {
          for (const b of BANCOS_SUDEBAN) {
            if (b.aliases.some((alias) => candidateText.toLowerCase().includes(alias))) {
              bancoReceptor = b.nombre;
              codigoBancoDestino = b.code;
              break;
            }
          }
          if (!bancoReceptor && candidateText.length > 2 && !/^\d+$/.test(candidateText)) {
            bancoReceptor = candidateText;
          }
        }
      }
    }
  }

  // Fallback si aún no se detectó emisor: buscar por menciones bancarias generales
  if (!bancoEmisor) {
    for (const b of BANCOS_SUDEBAN) {
      if (b.aliases.some((alias) => lower.includes(alias))) {
        if (!bancoReceptor || !bancoReceptor.toLowerCase().includes(b.nombre.toLowerCase())) {
          bancoEmisor = b.nombre;
          break;
        }
      }
    }
  }

  // Si bancoEmisor y bancoReceptor son idénticos
  if (bancoEmisor && bancoReceptor && bancoEmisor.toLowerCase() === bancoReceptor.toLowerCase()) {
    bancoReceptor = '';
  }

  // 3. NÚMERO DE REFERENCIA (Con soporte multilínea, descarte de etiquetas y filtrado de íconos de copia)
  let numeroReferencia = '';

  const cleanReferenceCandidate = (raw: string): string => {
    if (!raw) return '';
    // Eliminar pictogramas de copiado (como ❐, □, [], pipes) y signos no alfanuméricos
    let clean = raw.replace(/[\[\]|\u25A1\u29C9\u274F\u25FB\u25FC\u2398\u2B1A]/g, '').trim();
    // Extraer secuencia alfanumérica
    const match = clean.match(/[0-9A-Za-z]{6,16}/);
    if (!match) return '';
    let val = match[0];
    // Descartar si es una palabra de diccionario / etiqueta
    const wordBlacklist = [
      'exitosa', 'operacion', 'operación', 'erencia', 'referencia', 'comprobante',
      'bancamiga', 'banesco', 'mercantil', 'venezuela', 'provincial', 'aprobada',
      'aprobado', 'exitoso', 'transferencia', 'transaccion', 'transacción', 'enlinea',
    ];
    if (wordBlacklist.includes(val.toLowerCase()) || /^[A-Za-z]+$/.test(val)) {
      return '';
    }
    // Descartar si parece fecha DDMMYYYY o YYYYMMDD
    if (/^(?:19|20)\d{6}$/.test(val) || /^\d{2}(?:0[1-9]|1[0-2])(?:19|20)\d{2}$/.test(val)) {
      return '';
    }
    // Si tiene 13 dígitos numéricos (ícono ❐ leído como 0, 8, 9 en referencias canónicas de 12 dígitos)
    if (/^\d{13}$/.test(val)) {
      val = val.slice(0, 12);
    }
    return val;
  };

  // Buscar en líneas con etiquetas de referencia (multilínea tolerante)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Ignorar encabezados como "¡Operación Exitosa!"
    if (/operaci[oó]n exitosa/i.test(line)) {
      continue;
    }

    if (
      /(?:nro\.?\s*(?:de\s*)?referencia|n[uú]mero\s*(?:de\s*)?referencia|referencia\b|ref\b|nro\b|secuencia\b|n[uú]mero\s*(?:de\s*)?operaci[oó]n)/i.test(
        line
      )
    ) {
      // 1. Intentar en la misma línea después de la etiqueta
      const afterLabel = line
        .replace(
          /^.*?(?:nro\.?\s*(?:de\s*)?referencia|n[uú]mero\s*(?:de\s*)?referencia|referencia|ref|nro|secuencia|n[uú]mero\s*(?:de\s*)?operaci[oó]n)[:\s#.]*/i,
          ''
        )
        .trim();
      const candSameLine = cleanReferenceCandidate(afterLabel);
      if (candSameLine) {
        numeroReferencia = candSameLine;
        break;
      }

      // 2. Multilínea: Buscar en la línea siguiente (o subsiguiente)
      if (lines[i + 1]) {
        const candNext = cleanReferenceCandidate(lines[i + 1]);
        if (candNext) {
          numeroReferencia = candNext;
          break;
        }
      }
      if (lines[i + 2]) {
        const candNext2 = cleanReferenceCandidate(lines[i + 2]);
        if (candNext2) {
          numeroReferencia = candNext2;
          break;
        }
      }
    }
  }

  // Fallback si no se encontró con etiqueta: buscar secuencia de 8 a 14 dígitos aislada
  if (!numeroReferencia) {
    const digitMatches = text.match(/\b([0-9]{8,14})\b/g);
    if (digitMatches) {
      for (const dm of digitMatches) {
        // Filtrar números de cuenta, teléfonos o fechas
        if (
          dm.startsWith('0414') ||
          dm.startsWith('0424') ||
          dm.startsWith('0412') ||
          dm.startsWith('0416') ||
          dm.startsWith('0426')
        ) {
          continue;
        }
        const cleaned = cleanReferenceCandidate(dm);
        if (cleaned) {
          numeroReferencia = cleaned;
          break;
        }
      }
    }
  }

  // 4. MONTO ORIGINAL Y MONEDA (Multilínea tolerante, sufijos "Bs", "8s" y modo oscuro)
  let montoOriginal = 0;

  const cleanAmountCandidate = (raw: string): number => {
    if (!raw) return 0;
    // Normalizar lecturas de Tesseract en modo oscuro donde "Bs" se confunde con "8s" o "$s"
    const sanitized = raw.replace(/\b8s\b/gi, 'Bs').replace(/\$s\b/gi, 'Bs');
    return parseVenezuelanOrInternationalAmount(sanitized);
  };

  // 1. Multilínea tolerante para etiquetas de monto (ej. "Monto (Bs.):\n44.238,00" o "MONTO DE LA OPERACIÓN:\nBs. 8.833,96")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      /(?:monto\s*\((?:bs\.?|ves)\)|monto\s*de\s*la\s*operaci[oó]n|monto\s*total|importe|total|pagado|monto\b)/i.test(
        line
      )
    ) {
      // Misma línea
      const afterMonto = line
        .replace(
          /^.*?(?:monto\s*\((?:bs\.?|ves)\)|monto\s*de\s*la\s*operaci[oó]n|monto\s*total|importe|total|pagado|monto)[:\s]*/i,
          ''
        )
        .trim();
      const parsedSame = cleanAmountCandidate(afterMonto);
      if (parsedSame > 0) {
        montoOriginal = parsedSame;
        if (/usd|\$/i.test(line)) monedaOriginal = 'USD';
        break;
      }
      // Línea siguiente
      if (lines[i + 1]) {
        const nextLine = lines[i + 1].trim();
        const parsedNext = cleanAmountCandidate(nextLine);
        if (parsedNext > 0) {
          montoOriginal = parsedNext;
          if (/usd|\$/i.test(line) || /usd|\$/i.test(nextLine)) monedaOriginal = 'USD';
          break;
        }
      }
    }
  }

  // 2. Patrones directos con prefijo o sufijo de moneda (incluyendo Tesseract "8s" por "Bs")
  if (montoOriginal === 0) {
    const directPatterns = [
      // Sufijo venezolano: "13.201,00 Bs", "14.082,00 Bs", "13.201,00 8s", "44.238,00 VES"
      /([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})\s*(?:bs\.?|ves|8s|bol[ií]vares)\b/i,
      // Prefijo venezolano: "Bs. 44.238,00", "Bs 13.201,00", "8s. 14.082,00"
      /(?:bs\.?|ves|8s|bol[ií]vares)[:\s]*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/i,
      // Sufijo USD: "50.00 USD", "49.92 $"
      /([0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2})\s*(?:usd|\$)/i,
      // Prefijo USD: "$ 50.00", "USD 49.92"
      /(?:\$|usd)[:\s]*([0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2})/i,
    ];

    for (const pat of directPatterns) {
      const m = text.match(pat);
      if (m && m[1]) {
        const val = cleanAmountCandidate(m[1]);
        if (val > 0) {
          montoOriginal = val;
          if (/usd|\$/i.test(m[0])) {
            monedaOriginal = 'USD';
          }
          break;
        }
      }
    }
  }

  // 3. Fallback genérico para cualquier decimal con formato venezolano
  if (montoOriginal === 0) {
    const genericVesMatches = text.match(/\b([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})\b/g);
    if (genericVesMatches) {
      for (const gm of genericVesMatches) {
        const val = cleanAmountCandidate(gm);
        if (val > 0) {
          montoOriginal = val;
          break;
        }
      }
    }
  }

  // 5. FECHA Y HORA DEL COMPROBANTE
  let fechaComprobante = getCaracasToday();
  let horaComprobante = '';
  let fechaHoraDisplay = '';

  const fechaPattern = text.match(
    /(?:fecha\s*y\s*hora(?:\s*del\s*env[ií]o)?|fecha|date)[:\s]*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})(?:\s*(?:a\s*las\s*)?([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?(?:\s*[AaPp][Mm])?))?/i
  );

  if (fechaPattern) {
    fechaComprobante = formatCaracasDate(fechaPattern[1]);
    if (fechaPattern[2]) {
      horaComprobante = fechaPattern[2].trim();
      fechaHoraDisplay = `${fechaPattern[1]} ${horaComprobante}`;
    } else {
      fechaHoraDisplay = fechaPattern[1];
    }
  } else {
    for (let i = 0; i < lines.length; i++) {
      if (/fecha/i.test(lines[i])) {
        const candidate = lines[i + 1] || '';
        const m = candidate.match(/\b([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})\b/);
        if (m) {
          fechaComprobante = formatCaracasDate(m[1]);
          fechaHoraDisplay = m[1];
          break;
        }
      }
    }
    if (!fechaHoraDisplay) {
      const isolatedDate = text.match(/\b([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})\b/);
      if (isolatedDate) {
        fechaComprobante = formatCaracasDate(isolatedDate[1]);
        fechaHoraDisplay = isolatedDate[1];
      }
    }
  }

  // 6. CÉDULA O RIF
  let rifCedula = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      /(?:documento\s*de\s*identidad|ci\s*\/?\s*rif\s*beneficiario|ci\s*\/?\s*rif|ci|rif|c[ée]dula)\b/i.test(
        line
      )
    ) {
      const cand = line
        .replace(
          /^.*?(?:documento\s*de\s*identidad|ci\s*\/?\s*rif\s*beneficiario|ci\s*\/?\s*rif|ci|rif|c[ée]dula)[:\s]*/i,
          ''
        )
        .trim();
      const m =
        cand.match(
          /\b([VvJjEeGg]-?[0-9]{1,2}(?:\.[0-9]{3}){2}(?:-[0-9])?|[VvJjEeGg]-?[0-9]{6,9}(?:-[0-9])?|[0-9]{1,2}(?:\.[0-9]{3}){2})\b/
        ) ||
        (lines[i + 1] &&
          lines[i + 1].match(
            /\b([VvJjEeGg]-?[0-9]{1,2}(?:\.[0-9]{3}){2}(?:-[0-9])?|[VvJjEeGg]-?[0-9]{6,9}(?:-[0-9])?|[0-9]{1,2}(?:\.[0-9]{3}){2})\b/
          ));
      if (m) {
        let rawRif = m[1].toUpperCase().trim();
        if (
          !rawRif.startsWith('V-') &&
          !rawRif.startsWith('J-') &&
          !rawRif.startsWith('E-') &&
          !rawRif.startsWith('G-')
        ) {
          if (/^[VJEG]/i.test(rawRif)) {
            rawRif = `${rawRif[0]}-${rawRif.slice(1)}`;
          } else {
            rawRif = `V-${rawRif}`;
          }
        }
        rifCedula = rawRif;
        break;
      }
    }
  }

  if (!rifCedula) {
    const rawRifMatch = text.match(
      /\b([VvJjEeGg]-?[0-9]{1,2}(?:\.[0-9]{3}){2}(?:-[0-9])?|[VvJjEeGg]-?[0-9]{6,9}(?:-[0-9])?)\b/
    );
    if (rawRifMatch) {
      let rawRif = rawRifMatch[1].toUpperCase().trim();
      if (
        !rawRif.startsWith('V-') &&
        !rawRif.startsWith('J-') &&
        !rawRif.startsWith('E-') &&
        !rawRif.startsWith('G-')
      ) {
        rawRif = `${rawRif[0]}-${rawRif.slice(1)}`;
      }
      rifCedula = rawRif;
    }
  }

  // 7. TELÉFONO O BENEFICIARIO
  let telefonoNombreEmisor = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      /(?:beneficiario|telf\s*beneficiario|tel[eé]fono|celular|n[uú]mero\s*celular)\b/i.test(line)
    ) {
      const cand = line
        .replace(
          /^.*?(?:beneficiario|telf\s*beneficiario|tel[eé]fono|celular|n[uú]mero\s*celular)[:\s]*/i,
          ''
        )
        .trim();
      const m =
        cand.match(/([0-9\s-+]{10,16})/) ||
        (lines[i + 1] && lines[i + 1].match(/([0-9\s-+]{10,16})/));
      if (m) {
        const cleanP = m[1].replace(/[^0-9]/g, '');
        if (cleanP.length >= 10) {
          telefonoNombreEmisor = cleanP.startsWith('58')
            ? `+${cleanP}`
            : cleanP.startsWith('0')
            ? cleanP
            : `0${cleanP}`;
          break;
        }
      }
    }
  }

  if (!telefonoNombreEmisor) {
    const venPhone =
      text.match(/\b(0414|0424|0412|0416|0426)[- ]?[0-9]{7}\b/) ||
      text.match(/\b(?:\+?58)?(414|424|412|416|426)[- ]?[0-9]{7}\b/);
    if (venPhone) {
      telefonoNombreEmisor = venPhone[0].replace(/[- ]/g, '');
      if (!telefonoNombreEmisor.startsWith('0') && !telefonoNombreEmisor.startsWith('+')) {
        telefonoNombreEmisor = `0${telefonoNombreEmisor.replace(/^58/, '')}`;
      }
    }
  }

  // 8. CUENTA ORIGEN
  let cuentaOrigen = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/cuenta\s*origen/i.test(line)) {
      const rest = line.replace(/^.*?cuenta\s*origen[:\s]*/i, '').trim();
      cuentaOrigen = rest || (lines[i + 1] ? lines[i + 1].trim() : '');
      break;
    }
  }

  // 9. CONCEPTO
  let concepto = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/(?:concepto|motivo|memo|descripci[oó]n)\b/i.test(line)) {
      const rest = line.replace(/^.*?(?:concepto|motivo|memo|descripci[oó]n)[:\s]*/i, '').trim();
      concepto = rest || (lines[i + 1] ? lines[i + 1].trim() : '');
      break;
    }
  }

  // 10. EVALUACIÓN DE ANOMALÍAS Y CONFIANZA
  if (!bancoEmisor) anomalies.push('Banco emisor no detectado con exactitud.');
  if (!numeroReferencia) anomalies.push('Número de referencia bancaria no detectado.');
  if (montoOriginal <= 0) anomalies.push('Monto numérico no legible o igual a cero.');
  if (isFutureCaracasDate(fechaComprobante)) {
    anomalies.push(`Fecha del comprobante (${fechaComprobante}) está en el futuro respecto a la hora de Venezuela.`);
  }

  const esComprobanteValido = Boolean(
    (bancoEmisor || bancoReceptor) && (numeroReferencia || montoOriginal > 0)
  );

  let confianzaExtraccion = 100;
  if (!bancoEmisor) confianzaExtraccion -= 25;
  if (!numeroReferencia) confianzaExtraccion -= 30;
  if (montoOriginal <= 0) confianzaExtraccion -= 35;
  if (!rifCedula && !telefonoNombreEmisor) confianzaExtraccion -= 10;
  confianzaExtraccion = Math.max(0, confianzaExtraccion);

  return {
    esComprobanteValido,
    tipoComprobante,
    bancoEmisor,
    bancoReceptor,
    codigoBancoDestino,
    numeroReferencia,
    monedaOriginal,
    montoOriginal,
    fechaComprobante,
    horaComprobante,
    fechaHoraDisplay,
    rifCedula,
    telefonoNombreEmisor,
    cuentaOrigen,
    concepto,
    indicadoresManipulacionVisual: [],
    anomaliasEstructurales: anomalies,
    confianzaExtraccion,
  };
}
