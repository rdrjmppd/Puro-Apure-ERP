import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  X,
  User,
  Wifi,
  WifiOff,
  RefreshCw,
  HelpCircle,
  MessageSquare,
  ChevronDown,
  Maximize2,
  Minimize2,
  Trash2,
  Smile,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLocation } from '../hooks/useLocation';
import { generateFabiLocalResponse } from '../services/fabiOfflineEngine';
import { buildFabiSystemPrompt } from '../services/fabiKnowledgeMatrix';

export interface FloatingAIAssistantProps {
  currentModule?: string;
  userRole?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

/**
 * Avatar humanizado y amigable de Fabi
 */
export const FabiAvatar: React.FC<{
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
  className?: string;
}> = ({ size = 'md', pulse = false, className = '' }) => {
  const sizeClasses = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  }[size];

  return (
    <div
      className={`relative rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-emerald-400 text-white font-extrabold flex items-center justify-center select-none shadow-sm border border-emerald-300/40 shrink-0 ${sizeClasses} ${className}`}
      aria-label="Avatar de Fabi"
    >
      <span className="font-heading font-black tracking-tight leading-none text-white drop-shadow-xs">
        F
      </span>
      <Sparkles className="absolute -top-1 -right-1 w-3 h-3 text-amber-300 drop-shadow-xs pointer-events-none" />
      {pulse && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400 border border-white dark:border-slate-900"></span>
        </span>
      )}
    </div>
  );
};

const MODULE_METADATA: Record<
  string,
  { label: string; iconDesc: string; obreroSuggestions: string[]; adminSuggestions: string[] }
> = {
  PANEL_CONTROL: {
    label: 'Panel Ejecutivo / Resumen',
    iconDesc: 'Resumen consolidado de operaciones y finanzas',
    obreroSuggestions: [
      '¿Cómo veo mis tareas pendientes?',
      '¿Cómo sé si estoy en modo offline?',
      '¿Dónde registro un pesaje de granja?',
    ],
    adminSuggestions: [
      '¿Cómo interpretar el margen EBITDA?',
      '¿Qué es el Delta de Devaluación?',
      '¿Cómo conciliar las tasas BCV?',
    ],
  },
  INVENTARIOS: {
    label: 'Inventarios & Granja Biológica',
    iconDesc: 'Lotes avícolas, porcinos, consumos y beneficio',
    obreroSuggestions: [
      '¿Cómo anoto un pesaje de aves o cerdos?',
      '¿Cómo registro sacos de comida consumidos?',
      '¿Cómo registrar la carne en la sala de beneficio?',
    ],
    adminSuggestions: [
      '¿Cómo se calcula la merma y el rendimiento en canal?',
      '¿Cuál es el ciclo biológico avícola y porcino?',
      '¿Cómo dar de alta un nuevo lote?',
    ],
  },
  FINANZAS: {
    label: 'Finanzas Bimonetarias & BCV',
    iconDesc: 'Cuentas por cobrar/pagar, Compras, Días Calle y Tasa BCV',
    obreroSuggestions: [
      '¿Cómo sé si hay insumos en alerta roja?',
      '¿Cómo consultar mis recibos de pago?',
      '¿Qué significa la tasa BCV oficial?',
    ],
    adminSuggestions: [
      '¿Cómo registrar una factura de compra y días calle?',
      '¿Qué es el Delta de Devaluación (Mark-to-Market)?',
      '¿Cómo opera el cruce de deudas entre contrapartes?',
    ],
  },
  COMPRAS_CXP: {
    label: 'Compras & Cuentas por Pagar (CxP)',
    iconDesc: 'Facturas a crédito/contado, días calle y alertas de insumos',
    obreroSuggestions: [
      '¿Dónde veo el alimento que está por acabarse?',
      '¿Qué hago si llega un camión con sacos de comida?',
      '¿Cómo consultar el inventario de sacos?',
    ],
    adminSuggestions: [
      '¿Cómo registrar una factura de compra a crédito?',
      '¿Qué significan los semáforos de Días Calle?',
      '¿Cómo calibrar los niveles críticos de insumos?',
    ],
  },
  RRHH: {
    label: 'Talento Humano & Nómina',
    iconDesc: 'Ficha de trabajadores, cargos y asignaciones',
    obreroSuggestions: [
      '¿Cómo consultar mi sueldo asignado?',
      '¿Dónde ver mis adelantos y préstamos?',
      '¿Cómo registrar asistencia de campo?',
    ],
    adminSuggestions: [
      '¿Cómo liquidar la nómina bimonetaria?',
      '¿Cómo registrar un nuevo operario?',
      '¿Cómo auditar pagos y deducciones de personal?',
    ],
  },
  ANALITICA: {
    label: 'Analítica Financiera P&L',
    iconDesc: 'Balance General, P&L y valuación de inventario vivo',
    obreroSuggestions: [
      '¿Qué significa este resumen?',
      '¿Cómo ver el total producido?',
      '¿Cómo filtrar por fecha?',
    ],
    adminSuggestions: [
      '¿Cómo se valúa el inventario biológico vivo?',
      '¿Cómo se genera el Balance General?',
      '¿Cómo exportar reportes a Excel XML?',
    ],
  },
  GOBERNANZA: {
    label: 'Gobernanza IAM & Accesos',
    iconDesc: 'Usuarios, roles ABAC/RBAC y seguridad',
    obreroSuggestions: [
      '¿Cómo cambiar mi contraseña?',
      '¿Quién es mi supervisor asignado?',
      '¿Qué permisos tiene mi usuario?',
    ],
    adminSuggestions: [
      '¿Cómo crear usuarios con perfil OBRERO o ADMIN?',
      '¿Cómo funciona la revocación de credenciales?',
      '¿Cómo auditar la matriz de roles y permisos?',
    ],
  },
  AUDITORIA: {
    label: 'Auditoría DevSecOps & Trazabilidad',
    iconDesc: 'Logs inmutables, cuota y sincronización',
    obreroSuggestions: [
      '¿Cómo sé si se guardó mi pesaje en la cola?',
      '¿Qué pasa si no hay internet en la granja?',
      '¿Cómo forzar la sincronización batch?',
    ],
    adminSuggestions: [
      '¿Cómo opera el algoritmo de deduplicación de lotes?',
      '¿Cómo funciona el desalojo TTL de 90 días?',
      '¿Cómo ejecutar la suite de pruebas E2E?',
    ],
  },
  TELEMETRIA: {
    label: 'Telemetría & Concurrencia',
    iconDesc: 'Monitoreo de red, latencia y IndexedDB',
    obreroSuggestions: [
      '¿Por qué tarda en sincronizar la red?',
      '¿Cómo saber si el internet se recuperó?',
      '¿Dónde revisar el estado del sistema?',
    ],
    adminSuggestions: [
      '¿Cómo monitorear bloqueos en el hilo principal?',
      '¿Cuál es el volumen actual en IndexedDB?',
      '¿Cómo inspeccionar latencia de Firestore?',
    ],
  },
  ESQUEMAS: {
    label: 'Constructor Dinámico de Esquemas',
    iconDesc: 'Campos personalizados de formularios zootécnicos',
    obreroSuggestions: [
      '¿Cómo llenar campos adicionales?',
      '¿Qué campos son obligatorios?',
      '¿Dónde se guardan los datos personalizados?',
    ],
    adminSuggestions: [
      '¿Cómo agregar nuevos campos zootécnicos?',
      '¿Cómo configurar validaciones regex?',
      '¿Cómo publicar nuevas versiones de esquema?',
    ],
  },
};

/**
 * Conexión Directa con Gemini API (Failover de Alta Disponibilidad)
 * Permite al navegador consultar directamente a Gemini sin depender de la
 * disponibilidad del backend local en AI Studio.
 */
// Consultas de IA generativa canalizadas exclusivamente a través del backend proxy /api/askGeminiAssistant


export const FloatingAIAssistant: React.FC<FloatingAIAssistantProps> = ({
  currentModule: propModule,
  userRole: propRole,
}) => {
  const { role: contextRole, userProfile } = useAuth();
  const { theme } = useTheme();
  const location = useLocation();

  const effectiveRole = propRole || contextRole || 'OBRERO';
  const effectiveModule = propModule || 'PANEL_CONTROL';
  const currentMeta = MODULE_METADATA[effectiveModule] || {
    label: effectiveModule,
    iconDesc: 'Módulo operativo de Puro Apure ERP',
    obreroSuggestions: ['¿Cómo lleno este formulario?', '¿Dónde se guardan los datos?'],
    adminSuggestions: ['¿Cómo opera este módulo?', '¿Qué fórmulas se aplican?'],
  };
  const pantallaActual = `${effectiveModule} — ${currentMeta.label} (${currentMeta.iconDesc}) [Ruta: ${location.pathname}]`;

  const [isOpen, setIsOpen] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showTooltip, setShowTooltip] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSendTimeRef = useRef<number>(0);

  // Listener de conectividad para tolerancia offline
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
      // Notificación informativa no-bloqueante: Fabi continúa operativa en modo local
      setMessages((prev) => [
        ...prev,
        {
          id: `off_${Date.now()}`,
          sender: 'assistant',
          text: '📡 Conexión a internet no detectada. He activado el motor local de contingencia: sigo disponible para responder tus consultas operativas y zootécnicas en el teléfono.',
          timestamp: Date.now(),
        },
      ]);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Inicializar mensaje de bienvenida según el rol del usuario
  useEffect(() => {
    if (messages.length === 0) {
      const isObrero = effectiveRole === 'OBRERO';
      const welcomeText = isObrero
        ? `¡Hola, ${userProfile?.displayName || 'compañero'}! 👋 Soy Fabi, tu guía en Puro Apure ERP.\n\nEstoy aquí para acompañarte en tus tareas de campo: anotar pesajes en la báscula, registrar sacos de comida o verificar datos guardados. ¿En qué te ayudo hoy?`
        : `¡Hola, ${userProfile?.displayName || 'Administrador'}! 👋 Soy Fabi, tu asistente en Puro Apure ERP.\n\nPuedo ayudarte con el Delta de Devaluación (Mark-to-Market), tasas oficiales BCV, conciliación dual de cuentas (CRM/VRM) o reglas biológicas de lotes avícolas y porcinos. ¿Qué consulta deseas realizar?`;

      setMessages([
        {
          id: 'welcome_01',
          sender: 'assistant',
          text: welcomeText,
          timestamp: Date.now(),
        },
      ]);
    }
  }, [effectiveRole, userProfile]);

  // Auto-scroll al final del chat
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isTyping]);

  // Foco en el input al abrir
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [isOpen]);

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputMessage).trim();
    if (!textToSend || isTyping) return;

    // Política de Debounce del cliente (mínimo 600ms entre consultas para evitar dobles clics)
    const now = Date.now();
    if (now - lastSendTimeRef.current < 600) {
      return;
    }
    lastSendTimeRef.current = now;

    // Comando Directo de Autodiagnóstico Técnico
    if (textToSend.toLowerCase().startsWith('/diagnostico') || textToSend.toLowerCase() === 'diagnostico') {
      const diagUserMsg: ChatMessage = {
        id: `usr_${Date.now()}`,
        sender: 'user',
        text: textToSend,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, diagUserMsg]);
      setInputMessage('');
      setIsTyping(true);

      const runDiag = async () => {
        let serverStatus = 'No probado';
        let serverLatency = 0;
        let serverMode = 'Desconocido';
        let serverDetail = '';

        try {
          const t0 = performance.now();
          const testRes = await fetch('/api/askGeminiAssistant', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
              userMessage: 'ping_diagnostico_fabi',
              currentModule: effectiveModule,
              pantalla_actual: pantallaActual,
              userRole: effectiveRole,
            }),
          });
          serverLatency = Math.round(performance.now() - t0);
          if (testRes.ok) {
            const data = await testRes.json();
            serverStatus = `HTTP ${testRes.status} OK`;
            if (data.mode === 'gemini_cloud') {
              serverMode = `Gemini Cloud Activo (${data.modelUsed || 'gemini-flash-latest'})`;
              serverDetail = (data.reply || '').substring(0, 80) + '...';
            } else {
              serverMode = `Local Fallback (${data.debugError || 'Sin GEMINI_API_KEY o modelo inaccesible'})`;
              serverDetail = (data.reply || '').substring(0, 80) + '...';
            }
          } else {
            serverStatus = `HTTP ${testRes.status} ${testRes.statusText}`;
            serverDetail = 'El servidor no devolvió status 200.';
          }
        } catch (e: any) {
          serverStatus = 'Error de red al conectar con /api/askGeminiAssistant';
          serverDetail = e.message;
        }

        const localEbitda = generateFabiLocalResponse({
          userMessage: '¿Cómo interpretar el margen EBITDA?',
          currentModule: effectiveModule,
          pantalla_actual: pantallaActual,
          userRole: effectiveRole,
        });

        const report = `📋 **INFORME DE DIAGNÓSTICO FORENSE — ASISTENTE FABI**
Fecha: ${new Date().toLocaleString()}
--------------------------------------------------
**1. Conectividad del Navegador:**
• Estado de red: ${navigator.onLine ? '🟢 En línea (Online)' : '🔴 Sin internet (Offline)'}
• Módulo actual: \`${effectiveModule}\`
• Rol detectado: \`${effectiveRole}\`
• Pantalla: \`${pantallaActual}\`

**2. Canales de Conexión con Gemini AI:**
• Backend Proxy (/api/askGeminiAssistant): ${serverStatus} [${serverMode}] (${serverLatency} ms)
• Modo de Inferencia: ${serverMode.includes('Gemini Cloud Activo') ? '🟢 Nube Gemini' : '🟡 Motor Autónomo Local'}

**3. Motor Local Offline (Matriz de Conocimiento):**
• Prueba EBITDA: ${localEbitda.includes('EBITDA') ? '🟢 PASÓ (Específica)' : '🔴 FALLÓ (Genérica)'}
• Versión de Matriz: v2.3 (Universal & Resiliente)

--------------------------------------------------
💡 **Interpretación del Diagnóstico:**
${
  serverMode.includes('Gemini Cloud Activo')
    ? '✅ Canal de Gemini Cloud a través del proxy del servidor 100% OPERATIVO.'
    : '✅ Modo Autónomo de Alta Disponibilidad Activo: El asistente opera de forma determinista con la Matriz de Conocimiento de Fabi con 0ms de latencia.'
}`;

        setMessages((prev) => [
          ...prev,
          {
            id: `diag_${Date.now()}`,
            sender: 'assistant',
            text: report,
            timestamp: Date.now(),
          },
        ]);
        console.log(report);
        setIsTyping(false);
      };

      runDiag();
      return;
    }

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: Date.now(),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputMessage('');
    setIsTyping(true);

    const deliverLocalFallback = () => {
      const offlineReply = generateFabiLocalResponse({
        userMessage: textToSend,
        currentModule: effectiveModule,
        pantalla_actual: pantallaActual,
        userRole: effectiveRole,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `ast_${Date.now()}`,
          sender: 'assistant',
          text: offlineReply,
          timestamp: Date.now(),
        },
      ]);
    };

    // Si el dispositivo está sin red o el navegador reporta offline, responder inmediatamente con el motor local (0ms)
    if (!navigator.onLine || !isOnline) {
      setTimeout(() => {
        deliverLocalFallback();
        setIsTyping(false);
      }, 200);
      return;
    }

    // Configurar AbortController con temporizador de 10000ms (10s para permitir respuestas completas de Gemini Cloud)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 10000);

    try {
      const chatHistory = newHistory.map((m) => ({
        role: (m.sender === 'user' ? 'user' : 'model') as 'user' | 'model',
        text: m.text,
      }));

      // Canal 1: Servidor Backend Proxy (/api/askGeminiAssistant)
      try {
        const res = await fetch('/api/askGeminiAssistant', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            userMessage: textToSend,
            currentModule: `${effectiveModule} — ${currentMeta.label} (${currentMeta.iconDesc})`,
            pantalla_actual: pantallaActual,
            userRole: effectiveRole,
            chatHistory: chatHistory.slice(-6),
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          // Solo si el servidor devolvió respuesta real de Gemini Cloud
          if (data.success && data.reply && data.mode === 'gemini_cloud') {
            setMessages((prev) => [
              ...prev,
              {
                id: `ast_${Date.now()}`,
                sender: 'assistant',
                text: data.reply,
                timestamp: Date.now(),
              },
            ]);
            return;
          }
        }
      } catch (_backendErr) {
        // Si el backend proxy falla o da timeout, proceder con el motor de contingencia local
        deliverLocalFallback();
        return;
      }

      // Fallback local en caso de respuesta vacía
      deliverLocalFallback();
    } catch (_err: any) {
      clearTimeout(timeoutId);
      deliverLocalFallback();
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: `clear_${Date.now()}`,
        sender: 'assistant',
        text: 'Historial reiniciado. Estoy listo para asistirte en el módulo actual.',
        timestamp: Date.now(),
      },
    ]);
  };

  // Sugerencias dinámicas según el módulo activo y rol del usuario
  const suggestions =
    effectiveRole === 'OBRERO'
      ? currentMeta.obreroSuggestions
      : currentMeta.adminSuggestions;

  return (
    <>
      {/* ====================================================================== */}
      {/* FLOATING ACTION BUTTON (FAB) — ESQUINA INFERIOR DERECHA */}
      {/* ====================================================================== */}
      <div className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40 select-none">
        {/* Tooltip cuando está offline o hover */}
        {showTooltip && (
          <div className="absolute bottom-full right-0 mb-3 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-medium shadow-2xl whitespace-nowrap animate-fadeIn flex items-center gap-1.5">
            {isOnline ? (
              <>
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Asistente virtual Fabi (En línea)</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                <span>Fabi activo • Motor local offline</span>
              </>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setIsOpen((prev) => !prev);
          }}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          aria-label={
            isOpen
              ? 'Cerrar asistente Fabi'
              : isOnline
              ? 'Abrir asistente virtual Fabi'
              : 'Abrir asistente virtual Fabi (Modo local)'
          }
          className={`w-14 h-14 min-w-[56px] min-h-[56px] rounded-2xl flex items-center justify-center transition-all duration-300 transform active:scale-95 shadow-2xl relative ${
            isOpen
              ? 'bg-emerald-700 border border-emerald-400 text-white rotate-90 shadow-emerald-950/60'
              : isOnline
              ? 'bg-gradient-to-tr from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 border border-emerald-300/60 text-white hover:scale-105 shadow-emerald-950/50 ring-4 ring-emerald-500/20'
              : 'bg-gradient-to-tr from-emerald-800 via-teal-800 to-amber-700 hover:from-emerald-700 hover:to-teal-700 border border-amber-400/50 text-white hover:scale-105 shadow-emerald-950/50 ring-4 ring-amber-500/20'
          }`}
        >
          {isOpen ? (
            <X className="w-6 h-6 text-white" />
          ) : (
            <div className="relative flex items-center justify-center">
              <span className="font-heading font-black text-2xl tracking-tight text-white drop-shadow-sm">F</span>
              {isOnline ? (
                <>
                  <Sparkles className="absolute -top-1.5 -right-2.5 w-4 h-4 text-amber-300 animate-pulse" />
                  <span className="absolute -bottom-1 -right-1.5 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400 border-2 border-white dark:border-slate-900"></span>
                  </span>
                </>
              ) : (
                <span className="absolute -bottom-1 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 border-2 border-white dark:border-slate-900" title="Motor Local Activo">
                  <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                </span>
              )}
            </div>
          )}
        </button>
      </div>

      {/* ====================================================================== */}
      {/* MOBILE BACKDROP (Para Bottom Sheet en teléfonos) */}
      {/* ====================================================================== */}
      {isOpen && (
        <div
          className="sm:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-xs transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* ====================================================================== */}
      {/* CHAT CONTAINER: BOTTOM SHEET EN MÓVIL / SIDEBAR-MODAL EN ESCRITORIO */}
      {/* ====================================================================== */}
      {isOpen && (
        <div
          role="dialog"
          aria-labelledby="ai-assistant-heading"
          className={`fixed z-50 flex flex-col shadow-2xl transition-all duration-300 ease-out border overflow-hidden ${
            // Móvil: Bottom Sheet deslizable
            'inset-x-0 bottom-0 h-[82vh] max-h-[640px] rounded-t-3xl sm:inset-x-auto sm:bottom-24 sm:right-6 sm:w-[420px] sm:h-[560px] sm:max-h-[85vh] sm:rounded-3xl'
          } ${
            theme === 'dark'
              ? 'bg-slate-900 border-slate-700/80 text-slate-100 shadow-emerald-950/20'
              : 'bg-white border-slate-200 text-slate-800 shadow-slate-900/10'
          }`}
        >
          {/* Header del Chat */}
          <div
            className={`px-5 py-3.5 border-b flex items-center justify-between shrink-0 ${
              theme === 'dark'
                ? 'bg-slate-950/80 border-slate-800'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <FabiAvatar size="md" pulse={isOnline} />
              <div>
                <div className="flex items-center gap-2">
                  <h3
                    id="ai-assistant-heading"
                    className="font-extrabold text-sm font-heading leading-tight flex items-center gap-1.5"
                  >
                    <span>Fabi</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Guía ERP
                    </span>
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.2 rounded-md border flex items-center gap-1 ${
                        isOnline
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {isOnline ? (
                        <>
                          <Wifi className="w-2.5 h-2.5" />
                          <span>Nube</span>
                        </>
                      ) : (
                        <>
                          <WifiOff className="w-2.5 h-2.5" />
                          <span>Local</span>
                        </>
                      )}
                    </span>
                  </h3>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                  <span className="text-emerald-500 font-semibold">{effectiveRole}</span>
                  <span>•</span>
                  <span className="truncate max-w-[180px]" title={currentMeta.label}>{currentMeta.label}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 text-slate-400">
              <button
                type="button"
                onClick={clearChat}
                title="Limpiar conversación"
                className="p-1.5 rounded-lg hover:text-white hover:bg-slate-800 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Cerrar asistente"
                className="p-1.5 rounded-lg hover:text-white hover:bg-slate-800 transition"
              >
                <ChevronDown className="w-5 h-5 sm:hidden" />
                <X className="w-5 h-5 hidden sm:block" />
              </button>
            </div>
          </div>

          {/* Quick Suggestions Chips */}
          <div
            className={`px-4 py-2 border-b overflow-x-auto flex items-center gap-2 text-xs shrink-0 no-scrollbar ${
              theme === 'dark' ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-100/60 border-slate-200'
            }`}
          >
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider shrink-0">
              Sugerencias:
            </span>
            {suggestions.map((sug, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(sug)}
                disabled={isTyping}
                className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 whitespace-nowrap transition active:scale-95 disabled:opacity-50"
              >
                {sug}
              </button>
            ))}
          </div>

          {/* Body de Mensajes */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && <FabiAvatar size="sm" />}

                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm leading-relaxed ${
                      isUser
                        ? 'bg-emerald-600 text-white rounded-br-xs'
                        : theme === 'dark'
                        ? 'bg-slate-800 border border-slate-700/70 text-slate-100 rounded-bl-xs'
                        : 'bg-amber-50 border border-amber-200/70 text-slate-800 rounded-bl-xs'
                    }`}
                  >
                    <div className="whitespace-pre-line text-xs sm:text-sm">{msg.text}</div>
                    <div
                      className={`text-[9px] font-mono mt-1 text-right ${
                        isUser ? 'text-emerald-200' : 'text-slate-400'
                      }`}
                    >
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>

                  {isUser && (
                    <div className="w-7 h-7 rounded-lg bg-emerald-800 flex items-center justify-center text-white shrink-0 mt-0.5 text-xs font-bold shadow-xs">
                      {userProfile?.displayName?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Indicador de "Escribiendo..." */}
            {isTyping && (
              <div className="flex items-start gap-2.5">
                <FabiAvatar size="sm" />
                <div
                  className={`rounded-2xl px-4 py-3 rounded-bl-xs border flex items-center gap-2 ${
                    theme === 'dark'
                      ? 'bg-slate-800 border-slate-700 text-slate-300'
                      : 'bg-amber-50 border-amber-200 text-slate-700'
                  }`}
                >
                  <span className="text-xs font-mono text-emerald-400 font-semibold">
                    Fabi está preparando la respuesta...
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce"></span>
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce"
                      style={{ animationDelay: '0.15s' }}
                    ></span>
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce"
                      style={{ animationDelay: '0.3s' }}
                    ></span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div
            className={`p-3 border-t shrink-0 ${
              theme === 'dark' ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isOnline
                    ? effectiveRole === 'OBRERO'
                      ? 'Escribe tu pregunta sobre la pantalla...'
                      : 'Consulte sobre variables, fórmulas o flujos...'
                    : 'Fabi activa en modo local: consulte pesajes, cerdos, aves o tasas...'
                }
                disabled={isTyping}
                className={`flex-1 min-h-[44px] px-4 rounded-xl text-xs sm:text-sm border focus:outline-hidden focus:ring-2 focus:ring-emerald-500 transition ${
                  theme === 'dark'
                    ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                } disabled:opacity-50`}
              />

              <button
                type="submit"
                disabled={!inputMessage.trim() || isTyping}
                aria-label="Enviar mensaje"
                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-emerald-950/30"
              >
                {isTyping ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <Send className="w-4 h-4 text-white" />
                )}
              </button>
            </form>

            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-2 px-1">
              <span>Fabi • Asistente Puro Apure</span>
              <span className={`flex items-center gap-1.5 ${isOnline ? 'text-emerald-400' : 'text-amber-400 font-medium'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
                {isOnline ? 'En línea (Gemini)' : 'Motor Local Offline'}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
