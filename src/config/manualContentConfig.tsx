/**
 * Puro Apure ERP - Diccionario de Contenidos Dinámicos del Manual Operativo
 * Spec-Driven Fase 1: Estructura centralizada y tipada con políticas ABAC/RBAC.
 */

import React from 'react';
import {
  Wifi,
  WifiOff,
  Bird,
  Scale,
  DollarSign,
  Activity,
  Shield,
  Package,
  Layers,
  Users,
  BarChart2,
  FileText,
  LucideIcon,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { UserRole } from '../context/AuthContext';

export interface ManualSection {
  id: string;
  title: string;
  icon: LucideIcon;
  content: React.ReactNode;
  allowedRoles: ('SUPERADMIN' | 'ADMIN' | 'OBRERO' | UserRole)[];
}

export const MANUAL_SECTIONS: ManualSection[] = [
  // ---------------------------------------------------------------------------
  // 1. Offline-First & Debounce
  // ---------------------------------------------------------------------------
  {
    id: 'offline_first',
    title: '1. Offline-First & Debounce',
    icon: WifiOff,
    allowedRoles: ['SUPERADMIN', 'ADMIN', 'OBRERO'],
    content: (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
          <Wifi className="w-5 h-5" />
          <span>Arquitectura Offline-First con Motor de Debounce Inteligente (30s)</span>
        </div>
        <p className="leading-relaxed">
          El sistema está diseñado para operar en condiciones de conectividad nula o intermitente en los galpones y corrales del llano venezolano.
        </p>
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="font-semibold text-white">¿Cómo funciona el motor de sincronización?</div>
          <ul className="list-disc list-inside space-y-1 text-slate-400 font-mono text-[11px]">
            <li>Cada pesaje o registro de mortalidad se guarda de inmediato en la base de datos local IndexedDB del dispositivo.</li>
            <li>El temporizador de sincronización inicia una cuenta regresiva de <strong>30 segundos</strong> tras el último tipeo o actividad en pantalla.</li>
            <li>Esto elimina por completo el desperdicio de cuota en Firestore y previene saturaciones de red móvil.</li>
            <li>Al recuperar señal (WiFi o 4G), la cola de mutaciones pendientes se vacía atómicamente en batch.</li>
          </ul>
        </div>
      </div>
    ),
  },

  // ---------------------------------------------------------------------------
  // 2. Línea Avícola (Cobb 500)
  // ---------------------------------------------------------------------------
  {
    id: 'linea_avicola',
    title: '2. Línea Avícola (Cobb 500)',
    icon: Bird,
    allowedRoles: ['SUPERADMIN', 'ADMIN', 'OBRERO'],
    content: (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
          <Bird className="w-5 h-5" />
          <span>Protocolo Zootécnico Avícola (Pollos de Engorde Cobb 500)</span>
        </div>
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="font-semibold text-white">Reglas y Fórmulas Biológicas de Venta:</div>
          <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
            <li><strong>Ciclo Biológico:</strong> 35 a 42 días desde recepción del pollito de un día.</li>
            <li><strong>Precio Oficial Pactado:</strong> <strong>$4.00 USD/kg de peso vivo</strong> (sin deducción de merma de faena).</li>
            <li><strong>Curva de Crecimiento:</strong> Día 7 (~190g), Día 21 (~950g), Día 35 (~2.1kg), Día 42 (~2.8kg).</li>
            <li><strong>Alerta de Crecimiento:</strong> Si el peso medio del lote cae por debajo de -5% respecto al estándar Cobb 500, el sistema emite una advertencia de revisión nutricional.</li>
          </ul>
        </div>
      </div>
    ),
  },

  // ---------------------------------------------------------------------------
  // 3. Línea Porcina (Ceba y Merma)
  // ---------------------------------------------------------------------------
  {
    id: 'linea_porcina',
    title: '3. Línea Porcina (Ceba y Merma)',
    icon: Scale,
    allowedRoles: ['SUPERADMIN', 'ADMIN', 'OBRERO'],
    content: (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-pink-400 font-bold text-sm">
          <Scale className="w-5 h-5" />
          <span>Protocolo Zootécnico Porcino (Ceba Intensiva con Deducción de Merma)</span>
        </div>
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="font-semibold text-white">Reglas y Fórmulas Biológicas de Venta:</div>
          <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
            <li><strong>Ciclo Biológico:</strong> Ceba intensiva de 5 meses (150 días aprox.) tras el destete.</li>
            <li><strong>Consumo Estándar de Alimento:</strong> 4 sacos de alimento balanceado por cerdo durante el ciclo.</li>
            <li><strong>Deducción de Merma Obligatoria:</strong> <strong>15 a 20 kg por animal</strong> (promedio configurable de 17.5 kg de contenido gastrointestinal y desposte).</li>
            <li><strong>Precio Oficial Pactado:</strong> <strong>$6.00 USD/kg de peso neto liquidable</strong>.</li>
            <li><strong>Fórmula de Facturación:</strong> Monto USD = (Peso Bruto - Merma) × $6.00/kg.</li>
          </ul>
        </div>
      </div>
    ),
  },

  // ---------------------------------------------------------------------------
  // 4. Bimonetario & Tasa BCV
  // ---------------------------------------------------------------------------
  {
    id: 'bimonetario_bcv',
    title: '4. Bimonetario & Tasa BCV',
    icon: DollarSign,
    allowedRoles: ['SUPERADMIN', 'ADMIN'],
    content: (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
          <DollarSign className="w-5 h-5" />
          <span>Consolidación Bimonetaria y Motor Cambiario BCV</span>
        </div>
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="font-semibold text-white">Doble Columna y Facturación Oficial:</div>
          <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
            <li>Todos los asientos contables registran simultáneamente el valor en <strong>USD ($)</strong> y en <strong>Bolívares (VES)</strong>.</li>
            <li>La cotización del Banco Central de Venezuela (BCV) se captura como instantánea inmutable (<em>Exchange Rate Snapshot</em>) en el momento exacto del cobro o emisión de proforma.</li>
            <li>El simulador <em>Mark-to-Market</em> permite proyectar la devaluación cambiaria sobre cuentas por cobrar o pasivos en caso de fluctuaciones súbitas de la tasa oficial.</li>
          </ul>
        </div>
      </div>
    ),
  },

  // ---------------------------------------------------------------------------
  // 5. CRM/VRM & Cruce Cuentas
  // ---------------------------------------------------------------------------
  {
    id: 'cruce_cuentas',
    title: '5. CRM/VRM & Cruce Cuentas',
    icon: Activity,
    allowedRoles: ['SUPERADMIN', 'ADMIN'],
    content: (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
          <Activity className="w-5 h-5" />
          <span>CRM / VRM Dual y Liquidación por Compensación de Cuentas</span>
        </div>
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="font-semibold text-white">Cruce de Cuentas (<em>Account Cross-Clearing</em>):</div>
          <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
            <li>Un mismo tercero (RIF o Cédula) puede tener rol dual simultáneo: <strong>Cliente</strong> (compra animales) y <strong>Proveedor</strong> (vende materias primas o insumos).</li>
            <li>El botón <em>"Compensar Saldo"</em> liquida las deudas cruzadas sin necesidad de transferencias bancarias innecesarias, generando el comprobante contable de compensación.</li>
          </ul>
        </div>
      </div>
    ),
  },

  // ---------------------------------------------------------------------------
  // 6. Seguridad & Purga IndexedDB
  // ---------------------------------------------------------------------------
  {
    id: 'seguridad_purga',
    title: '6. Seguridad & Purga IndexedDB',
    icon: Shield,
    allowedRoles: ['SUPERADMIN', 'ADMIN'],
    content: (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
          <Shield className="w-5 h-5" />
          <span>Gobernanza IAM, Resguardo de Datos y Purga Local</span>
        </div>
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="font-semibold text-white">Políticas de Seguridad Activas:</div>
          <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
            <li><strong>Control de Acceso Basado en Roles (RBAC):</strong> Superadministrador (<code>rdrj.mppd@gmail.com</code>), Administradores y Operarios de Campo.</li>
            <li><strong>Autorización por PIN de 4 Dígitos:</strong> Operaciones críticas como altas de insumos y parametrización de tasas exigen confirmación biométrica o PIN.</li>
            <li><strong>Purga Criptográfica al Cerrar Sesión:</strong> Elimina todos los datos en caché de IndexedDB para proteger el terminal si el teléfono es extraviado en la finca.</li>
          </ul>
        </div>
      </div>
    ),
  },

  // ---------------------------------------------------------------------------
  // 7. Evolución de Lotes (Nacimiento vs. Adquisición)
  // ---------------------------------------------------------------------------
  {
    id: 'evolucion_lotes',
    title: '7. Evolución de Lotes (Nacimiento vs. Adquisición)',
    icon: Package,
    allowedRoles: ['SUPERADMIN', 'ADMIN', 'OBRERO'],
    content: (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
          <Package className="w-5 h-5" />
          <span>Evolución de Lotes: Nacimiento Interno vs. Adquisición Externa</span>
        </div>
        <p className="leading-relaxed">
          Trazabilidad zootécnica bifurcada que permite diferenciar el origen genético y el punto de partida biológico de la camada o parvada.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
            <div className="font-bold text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Nacimiento Interno (Cría en Granja)
            </div>
            <p className="text-[11px] text-slate-400">
              Punto de partida biológico $t_0 = 0$ días. Peso inicial automático (ej. 42g en pollito BB, 1.4kg en lechón destetado). El costo de gestación se imputa al lote madre.
            </p>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
            <div className="font-bold text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> Adquisición Externa (Compra a Terceros)
            </div>
            <p className="text-[11px] text-slate-400">
              Punto de partida t0 = edad de ingreso y w0 = peso de compra. Exige número de factura/guía INSAI y emite alerta contable a Finanzas BCV para registrar el costo de compra.
            </p>
          </div>
        </div>
      </div>
    ),
  },

  // ---------------------------------------------------------------------------
  // 8. Transformación de Productos Procesados
  // ---------------------------------------------------------------------------
  {
    id: 'transformacion_productos',
    title: '8. Transformación de Productos Procesados',
    icon: FileText,
    allowedRoles: ['SUPERADMIN', 'ADMIN'],
    content: (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-orange-400 font-bold text-sm">
          <FileText className="w-5 h-5" />
          <span>Industrialización y Transformación de Canales Cárnicas</span>
        </div>
        <p className="leading-relaxed">
          Módulo agroindustrial para la conversión de biomasa viva en productos con valor agregado (desposte, cortes empacados al vacío y embutidos).
        </p>
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="font-semibold text-white">Flujo de Transformación:</div>
          <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
            <li><strong>Rebaja de Biomasa Viva:</strong> Al iniciar la faena, los animales procesados se descuentan del inventario de pie.</li>
            <li><strong>Rendimiento en Canal:</strong> Cálculo del porcentaje de aprovechamiento cárnico respecto al peso vivo despostado.</li>
            <li><strong>Alta de Nuevos SKUs:</strong> Ingreso al catálogo de productos terminados (chuletas, costillas, tocineta, pechugas desosadas) con cálculo de costo unitario ponderado.</li>
          </ul>
        </div>
      </div>
    ),
  },

  // ---------------------------------------------------------------------------
  // 9. Gestión de Talento Humano & Créditos
  // ---------------------------------------------------------------------------
  {
    id: 'talento_humano_creditos',
    title: '9. Gestión de Talento Humano & Créditos',
    icon: Users,
    allowedRoles: ['SUPERADMIN', 'ADMIN'],
    content: (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
          <Users className="w-5 h-5" />
          <span>Gestión de Talento Humano, Préstamos y Créditos en Producto</span>
        </div>
        <p className="leading-relaxed">
          Administración salarial bimonetaria y gobernanza de beneficios laborales con cruce de nómina.
        </p>
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="font-semibold text-white">Directrices de Nómina y Anticipos:</div>
          <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
            <li><strong>Bifurcación Contractual:</strong> Separación estricta entre <em>Nómina Fija</em> (sueldo base + parafiscales) y <em>Servicios Independientes</em> (honorarios por iguala o por obra).</li>
            <li><strong>Trigger de Egreso a Finanzas BCV:</strong> El botón de dispensar pago asienta automáticamente la salida de fondos en el Libro Mayor con la tasa BCV del día.</li>
            <li><strong>Créditos en Producto:</strong> Permite asignar carne de cerdo o pollo al trabajador a precio preferencial, rebajando el inventario físico y descontando la cuota en la siguiente nómina.</li>
          </ul>
        </div>
      </div>
    ),
  },

  // ---------------------------------------------------------------------------
  // 10. Motor de KPIs Operativos (Big Data)
  // ---------------------------------------------------------------------------
  {
    id: 'kpis_operativos',
    title: '10. Motor de KPIs Operativos (Big Data)',
    icon: BarChart2,
    allowedRoles: ['SUPERADMIN', 'ADMIN'],
    content: (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
          <BarChart2 className="w-5 h-5" />
          <span>Analítica Predictiva y Eficiencia Zootécnica de Granja</span>
        </div>
        <p className="leading-relaxed">
          Cruce algorítmico en tiempo real entre los costos del personal y los kilogramos netos de biomasa generados en galpones y corrales.
        </p>
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="font-semibold text-white">Indicadores de Desempeño:</div>
          <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
            <li><strong>Costo Laboral por Kg Producido:</strong> Masa salarial mensual dividida entre la biomasa neta de la granja (USD/kg).</li>
            <li><strong>Incidencia en Precio de Venta:</strong> Porcentaje que representa la mano de obra frente a los precios oficiales ($4.00 avícola / $6.00 porcino).</li>
            <li><strong>Índice de Eficiencia Zootécnica (IEZ):</strong> Calificación de 0 a 100 por supervisor evaluando mortalidad (&lt;3%) y Factor de Conversión Alimenticia (FCA).</li>
          </ul>
        </div>
      </div>
    ),
  },

  // ---------------------------------------------------------------------------
  // 11. Constructor de Esquemas Dinámicos
  // ---------------------------------------------------------------------------
  {
    id: 'constructor_esquemas',
    title: '11. Constructor de Esquemas Dinámicos',
    icon: Layers,
    allowedRoles: ['SUPERADMIN'],
    content: (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
          <Layers className="w-5 h-5" />
          <span>Motor No-Code de Esquemas Dinámicos (Exclusivo SuperAdmin)</span>
        </div>
        <div className="p-4 rounded-2xl bg-purple-950/30 border border-purple-800/60 space-y-2">
          <div className="font-semibold text-purple-200">Gobernanza de Extensibilidad en Caliente:</div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            Permite al Superadministrador (<code>rdrj.mppd@gmail.com</code>) inyectar nuevos atributos a los formularios y tablas del ERP sin requerir despliegues ni mutaciones manuales en base de datos.
          </p>
          <ul className="list-disc list-inside space-y-1 text-purple-300 font-mono text-[11px]">
            <li><strong>Tipos Soportados:</strong> Texto, Numérico, Selector con Opciones y Booleano (Sí/No).</li>
            <li><strong>Módulos Destino:</strong> Inventarios de Insumos, Trazabilidad de Lotes y Registros Financieros.</li>
            <li><strong>Persistencia de Metadatos:</strong> Gobernado mediante la colección <code>/system_schemas</code> con validación estricta en Cloud Firestore.</li>
          </ul>
        </div>
      </div>
    ),
  },
];
