/**
 * Motor Matemático y Lógica Pura de Alarmas de Insumos y Cuentas por Pagar (CxP)
 * Puro Apure ERP - Sistema de Alertas Proactivas
 * 
 * Funciones puras libres de efectos secundarios y llamadas a red para máxima testabilidad.
 */

import {
  InsumoAlertEvaluation,
  PayableInvoiceEvaluation,
  StartupAlertDigest,
  SupplyAlertConfig,
  PurchaseInvoice,
  NivelAlarma,
  EstadoVencimiento,
} from '../types/purchasing';
import { InventoryItem } from '../types/inventory';
import { centsRound } from './financialAnalyticsService';

/**
 * Calcula la diferencia en días enteros entre dos fechas en formato YYYY-MM-DD
 * en hora local (evita desfases por conversión UTC).
 * Retorna (targetDate - fromDate) en días:
 * > 0 : targetDate es en el futuro
 * = 0 : mismo día
 * < 0 : targetDate está en el pasado
 */
export function localDateDiffDays(targetDateStr: string, fromDateStr: string): number {
  const [tY, tM, tD] = targetDateStr.split('-').map(Number);
  const [fY, fM, fD] = fromDateStr.split('-').map(Number);

  // Crear fechas usando componentes locales (año, mes - 1, día a mediodía para ser inmune a DST)
  const target = new Date(tY, tM - 1, tD, 12, 0, 0);
  const from = new Date(fY, fM - 1, fD, 12, 0, 0);

  const diffMs = target.getTime() - from.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Obtiene la fecha local actual en formato YYYY-MM-DD
 */
export function getTodayLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================================================
// 1. EVALUACIÓN DE NIVELES CRÍTICOS DE INSUMOS
// ============================================================================

export function evaluateInsumoAlert(
  item: InventoryItem,
  config?: SupplyAlertConfig
): InsumoAlertEvaluation {
  const Q = item.quantity || 0;
  const C = config && config.activo ? config.puntoCritico : 0;
  const p = config && config.activo ? config.porcentajeAmarillo : 20; // 20% default si no hay config
  const umbralAmarillo = centsRound(C * (1 + p / 100));

  let diasCobertura: number | undefined = undefined;
  let esAltaRotacionCritica = false;

  if (config?.consumoDiarioEstimado && config.consumoDiarioEstimado > 0) {
    diasCobertura = Math.max(0, Number((Q / config.consumoDiarioEstimado).toFixed(1)));
    // Si queda para 3 días o menos por alta rotación, se eleva a crítica
    if (diasCobertura <= 3 && Q > 0) {
      esAltaRotacionCritica = true;
    }
  }

  let nivel: NivelAlarma = 'VERDE';

  if (!config || !config.activo) {
    // Si no tiene config explícita, alerta roja si está en cero o negativo
    nivel = Q <= 0 ? 'ROJO' : 'VERDE';
  } else {
    // Reglas de umbral explícito
    if (C === 0) {
      // Si el punto crítico es 0, solo se alarma en rojo si se agotó totalmente
      nivel = Q <= 0 ? 'ROJO' : (Q <= umbralAmarillo ? 'AMARILLO' : 'VERDE');
    } else if (Q <= C || esAltaRotacionCritica) {
      nivel = 'ROJO';
    } else if (Q <= umbralAmarillo) {
      nivel = 'AMARILLO';
    } else {
      nivel = 'VERDE';
    }
  }

  return {
    itemId: item.id,
    nombreInsumo: item.name,
    unidad: item.unit,
    existenciaActual: Q,
    puntoCritico: C,
    umbralAmarillo,
    nivel,
    diasCobertura,
    esAltaRotacionCritica,
    notaReorden: config?.notaReorden,
  };
}

// ============================================================================
// 2. EVALUACIÓN DE CUENTAS POR PAGAR (DÍAS CALLE, ESTADOS Y MORA)
// ============================================================================

export function calculateLateFeeProjection(
  saldoUSD: number,
  tasaMoraPorcentaje: number,
  periodicidad: 'DIARIA' | 'SEMANAL' | 'MENSUAL' | 'UNICA',
  diasVencidosEfectivos: number,
  penalizacionFijaUSD?: number
): { moraProyectadaUSD: number; riesgoTotalUSD: number; aplicaMoraEfectiva?: boolean };

export function calculateLateFeeProjection(
  saldoUSD: number,
  diasAtraso: number,
  diasGracia: number,
  tasaMoraPorcentaje: number,
  periodicidad: 'DIARIA' | 'SEMANAL' | 'MENSUAL' | 'UNICA',
  penalizacionFijaUSD?: number
): { moraProyectadaUSD: number; riesgoTotalUSD: number; aplicaMoraEfectiva: boolean };

export function calculateLateFeeProjection(
  saldoUSD: number,
  arg2: number,
  arg3: any,
  arg4?: any,
  arg5?: any,
  arg6?: number
): { moraProyectadaUSD: number; riesgoTotalUSD: number; aplicaMoraEfectiva: boolean } {
  // Caso 1: 6 argumentos (saldoUSD, diasAtraso, diasGracia, tasaMoraPorcentaje, periodicidad, penalizacionFijaUSD)
  if (typeof arg4 === 'number' && typeof arg5 === 'string') {
    const diasAtraso = arg2;
    const diasGracia = arg3;
    const tasaMoraPorcentaje = arg4;
    const periodicidad = arg5 as 'DIARIA' | 'SEMANAL' | 'MENSUAL' | 'UNICA';
    const penalizacionFijaUSD = arg6 || 0;

    const diasEfectivos = Math.max(0, diasAtraso - diasGracia);
    const aplicaMoraEfectiva = diasEfectivos > 0;

    if (saldoUSD <= 0 || !aplicaMoraEfectiva) {
      return {
        moraProyectadaUSD: 0,
        riesgoTotalUSD: centsRound(saldoUSD + penalizacionFijaUSD),
        aplicaMoraEfectiva: false,
      };
    }

    const t = tasaMoraPorcentaje / 100;
    let mora = 0;
    switch (periodicidad) {
      case 'DIARIA':
        mora = saldoUSD * t * diasEfectivos;
        break;
      case 'SEMANAL':
        mora = saldoUSD * t * Math.ceil(diasEfectivos / 7);
        break;
      case 'MENSUAL':
        mora = saldoUSD * t * Math.ceil(diasEfectivos / 30);
        break;
      case 'UNICA':
        mora = saldoUSD * t;
        break;
    }

    const moraUSD = centsRound(mora);
    return {
      moraProyectadaUSD: moraUSD,
      riesgoTotalUSD: centsRound(saldoUSD + moraUSD + penalizacionFijaUSD),
      aplicaMoraEfectiva: true,
    };
  }

  // Caso 2: 4 a 5 argumentos (saldoUSD, tasaMoraPorcentaje, periodicidad, diasVencidosEfectivos, penalizacionFijaUSD)
  const tasaMoraPorcentaje = arg2;
  const periodicidad = arg3 as 'DIARIA' | 'SEMANAL' | 'MENSUAL' | 'UNICA';
  const diasVencidosEfectivos = Number(arg4) || 0;
  const penalizacionFijaUSD = Number(arg5) || 0;

  if (saldoUSD <= 0 || diasVencidosEfectivos <= 0) {
    return {
      moraProyectadaUSD: 0,
      riesgoTotalUSD: centsRound(saldoUSD),
      aplicaMoraEfectiva: false,
    };
  }

  const t = tasaMoraPorcentaje / 100;
  let mora = 0;
  switch (periodicidad) {
    case 'DIARIA':
      mora = saldoUSD * t * diasVencidosEfectivos;
      break;
    case 'SEMANAL':
      mora = saldoUSD * t * Math.ceil(diasVencidosEfectivos / 7);
      break;
    case 'MENSUAL':
      mora = saldoUSD * t * Math.ceil(diasVencidosEfectivos / 30);
      break;
    case 'UNICA':
      mora = saldoUSD * t;
      break;
  }

  const moraUSD = centsRound(mora);
  return {
    moraProyectadaUSD: moraUSD,
    riesgoTotalUSD: centsRound(saldoUSD + moraUSD + penalizacionFijaUSD),
    aplicaMoraEfectiva: true,
  };
}

export function evaluatePayableInvoice(
  invoice: PurchaseInvoice,
  todayStr = getTodayLocalDateString()
): PayableInvoiceEvaluation {
  const d = localDateDiffDays(invoice.fechaVencimiento, todayStr);
  const cond = invoice.condicionesAplicadas || {
    diasCalle: 0,
    diasGracia: 0,
    aplicaMora: false,
    tasaMoraPorcentaje: 0,
    periodicidadMora: 'MENSUAL',
    penalizacionFijaUSD: 0,
  };

  const g = cond.diasGracia || 0;
  const A = cond.diasCalle > 0 ? Math.min(5, cond.diasCalle) : 3; // Anticipación por defecto

  let estadoVencimiento: EstadoVencimiento = 'AL_DIA';
  if (d > A) {
    estadoVencimiento = 'AL_DIA';
  } else if (d > 0 && d <= A) {
    estadoVencimiento = 'POR_VENCER';
  } else if (d === 0) {
    estadoVencimiento = 'VENCE_HOY';
  } else if (d < 0 && d >= -g) {
    estadoVencimiento = 'EN_GRACIA';
  } else {
    estadoVencimiento = 'VENCIDA';
  }

  // Días vencidos fuera de gracia
  const diasVencidosEfectivos = Math.max(0, -d - g);

  let moraProyectadaUSD = 0;
  let riesgoTotalUSD = invoice.saldoPendienteUSD;

  if (cond.aplicaMora && diasVencidosEfectivos > 0) {
    const calc = calculateLateFeeProjection(
      invoice.saldoPendienteUSD,
      cond.tasaMoraPorcentaje,
      cond.periodicidadMora,
      diasVencidosEfectivos,
      cond.penalizacionFijaUSD
    );
    moraProyectadaUSD = calc.moraProyectadaUSD;
    riesgoTotalUSD = calc.riesgoTotalUSD;
  }

  const saldoPendienteVES = centsRound(invoice.saldoPendienteUSD * (invoice.tasaBcv || 1));

  return {
    facturaId: invoice.id,
    numeroFacturaProveedor: invoice.numeroFacturaProveedor,
    proveedorId: invoice.proveedorId,
    proveedorNombre: invoice.proveedorNombre,
    proveedorRif: invoice.proveedorRif,
    fechaEmision: invoice.fechaEmision,
    fechaVencimiento: invoice.fechaVencimiento,
    diasRestantes: d,
    estadoVencimiento,
    saldoPendienteUSD: invoice.saldoPendienteUSD,
    saldoPendienteVES,
    aplicaMora: cond.aplicaMora,
    tasaMoraPorcentaje: cond.tasaMoraPorcentaje,
    periodicidadMora: cond.periodicidadMora,
    penalizacionFijaUSD: cond.penalizacionFijaUSD,
    moraProyectadaUSD,
    riesgoTotalUSD,
    notaRiesgoManual: invoice.notaRiesgoManual,
  };
}

// ============================================================================
// 3. CONSOLIDACIÓN DE DIGEST DE ARRANQUE (STARTUP ALERTS)
// ============================================================================

export function buildStartupAlertDigest(
  insumos: InventoryItem[],
  configs: Map<string, SupplyAlertConfig>,
  facturasAbiertas: PurchaseInvoice[],
  todayStr = getTodayLocalDateString()
): StartupAlertDigest {
  const insumosCriticosRojos: InsumoAlertEvaluation[] = [];
  const insumosAlertaAmarillos: InsumoAlertEvaluation[] = [];

  for (const item of insumos) {
    if (item.category !== 'INSUMO') continue;
    const cfg = configs.get(item.id);
    const evalResult = evaluateInsumoAlert(item, cfg);
    if (evalResult.nivel === 'ROJO') {
      insumosCriticosRojos.push(evalResult);
    } else if (evalResult.nivel === 'AMARILLO') {
      insumosAlertaAmarillos.push(evalResult);
    }
  }

  const facturasVencidasRojas: PayableInvoiceEvaluation[] = [];
  const facturasPorVencerAmarillas: PayableInvoiceEvaluation[] = [];

  let totalDeudaVencidaUSD = 0;
  let totalMoraRiesgoUSD = 0;

  for (const inv of facturasAbiertas) {
    if (inv.estadoPago === 'PAGADA' || inv.estadoPago === 'ANULADA' || inv.saldoPendienteUSD <= 0) {
      continue;
    }
    const evalInv = evaluatePayableInvoice(inv, todayStr);
    if (evalInv.estadoVencimiento === 'VENCIDA' || evalInv.estadoVencimiento === 'EN_GRACIA') {
      facturasVencidasRojas.push(evalInv);
      totalDeudaVencidaUSD += evalInv.saldoPendienteUSD;
      totalMoraRiesgoUSD += evalInv.moraProyectadaUSD + evalInv.penalizacionFijaUSD;
    } else if (evalInv.estadoVencimiento === 'POR_VENCER' || evalInv.estadoVencimiento === 'VENCE_HOY') {
      facturasPorVencerAmarillas.push(evalInv);
    }
  }

  return {
    timestamp: Date.now(),
    fechaLocal: todayStr,
    insumosCriticosRojos,
    insumosAlertaAmarillos,
    facturasVencidasRojas,
    facturasPorVencerAmarillas,
    totalDeudaVencidaUSD: centsRound(totalDeudaVencidaUSD),
    totalMoraRiesgoUSD: centsRound(totalMoraRiesgoUSD),
    tieneAlertasCriticas: insumosCriticosRojos.length > 0 || facturasVencidasRojas.length > 0,
    tieneAlertasModeradas: insumosAlertaAmarillos.length > 0 || facturasPorVencerAmarillas.length > 0,
  };
}
