/**
 * Componente: Clon de WhatsApp Web en Vivo con Conexión por QR (CRM / BRM)
 * Puro Apure ERP - Módulo de Mensajería Bidireccional
 * 3 Paneles (Directorio/Chats, Conversación Espejo, Expediente 360°)
 * 100% Nativo React, Responsive Mobile 375px+, Touch Targets >= 44x44px
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  MessageSquare,
  QrCode,
  Send,
  Paperclip,
  Search,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Clock,
  Check,
  CheckCheck,
  Phone,
  User,
  Building2,
  Receipt,
  DollarSign,
  Calendar,
  FileText,
  FileSpreadsheet,
  X,
  RefreshCw,
  Image as ImageIcon,
  ChevronRight,
  SlidersHorizontal,
  Bot,
  Zap,
  UserPlus,
  Trash2,
} from 'lucide-react';
import {
  WhatsAppLine,
  WhatsAppMessage,
  WhatsAppTemplate,
  WhatsAppChatContact,
  WhatsAppLineType,
} from '../../types/crmWhatsapp';
import { WhatsAppCloneService, normalizeToE164 } from '../../services/whatsappCloneService';
import { DualEntity, BillingInvoice, DualEntityRole } from '../../types/finance';
import { FinanceService } from '../../services/financeService';
import { centsRound } from '../../services/financialAnalyticsService';

interface WhatsAppWebCloneViewProps {
  entities: DualEntity[];
  invoices: BillingInvoice[];
  bcvRate: number;
  onAnalyzeReceiptOCR?: (imageDataUrl: string, contact?: WhatsAppChatContact) => void;
  onNavigateToFinance?: () => void;
  onEntityCreated?: (entity: DualEntity) => void;
}

function formatChatTime(timestamp?: number): string {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return 'Ayer';
  }
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export const WhatsAppWebCloneView: React.FC<WhatsAppWebCloneViewProps> = ({
  entities,
  invoices,
  bcvRate,
  onAnalyzeReceiptOCR,
  onNavigateToFinance,
  onEntityCreated,
}) => {
  // 1. Estado de Líneas y Conectividad
  const [lines, setLines] = useState<WhatsAppLine[]>([]);
  const [activeLineId, setActiveLineId] = useState<string>('linea_cobranzas');
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [isGeneratingQr, setIsGeneratingQr] = useState<boolean>(false);
  const [isDisconnecting, setIsDisconnecting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [qrDataUri, setQrDataUri] = useState<string | null>(null);
  const [isHybridMode, setIsHybridMode] = useState<boolean>(false);
  const wasWaitingQrOnOpenRef = useRef<boolean>(false);

  // 2. Estado de Directorio y Chats
  const [selectedContactPhone, setSelectedContactPhone] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<
    'TODOS' | 'CLIENTES' | 'PROVEEDORES' | 'DUAL' | 'CON_PAGO'
  >('TODOS');

  // 3. Estado de Mensajes (Línea completa y Chat individual)
  const [lineMessages, setLineMessages] = useState<WhatsAppMessage[]>([]);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [messageInput, setMessageInput] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [showTemplatesModal, setShowTemplatesModal] = useState<boolean>(false);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);

  // Estados para Registrar Lead y Eliminar Chat
  const [showAddLeadModal, setShowAddLeadModal] = useState<boolean>(false);
  const [showDeleteChatConfirm, setShowDeleteChatConfirm] = useState<boolean>(false);
  const [isSavingLead, setIsSavingLead] = useState<boolean>(false);
  const [isDeletingChat, setIsDeletingChat] = useState<boolean>(false);
  const [leadModalError, setLeadModalError] = useState<string | null>(null);
  const [newLeadForm, setNewLeadForm] = useState<{
    name: string;
    rifCedula: string;
    role: DualEntityRole;
    city: string;
    address: string;
    creditLimitUSD: number;
  }>({
    name: '',
    rifCedula: '',
    role: 'CLIENTE',
    city: 'San Fernando de Apure',
    address: 'Apure, Venezuela',
    creditLimitUSD: 0,
  });

  // 4. Modo Móvil (Pestañas en pantalla < 768px)
  const [mobileTab, setMobileTab] = useState<'CHATS' | 'CONVERSACION' | 'EXPEDIENTE'>('CHATS');
  const [syncedContacts, setSyncedContacts] = useState<Record<string, { id: string; name?: string; phone?: string }>>({});

  // 5. Referencia al contenedor de mensajes para autoscroll
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Inicializar líneas, plantillas y sincronizar contactos reales del dispositivo
  useEffect(() => {
    WhatsAppCloneService.initializeDefaultLines().then((def) => setLines(def));
    WhatsAppCloneService.getTemplates().then((tpls) => setTemplates(tpls));
    WhatsAppCloneService.purgeCorruptedLidMessages();

    const unsubLines = WhatsAppCloneService.subscribeWhatsAppLines((updatedLines) => {
      setLines(updatedLines);
    });

    return () => {
      unsubLines();
    };
  }, []);

  // Suscribir en tiempo real todos los mensajes de la línea activa para la ventana lateral
  useEffect(() => {
    if (!activeLineId) {
      setLineMessages([]);
      return;
    }

    const unsub = WhatsAppCloneService.subscribeLineMessages(activeLineId, (msgs) => {
      setLineMessages(msgs);
    });

    return () => {
      unsub();
    };
  }, [activeLineId]);

  // Línea actualmente activa
  const activeLine = useMemo(() => {
    return lines.find((l) => l.id === activeLineId) || lines[0] || null;
  }, [lines, activeLineId]);

  // Cargar contactos del dispositivo WhatsApp cuando la línea esté conectada
  useEffect(() => {
    if (activeLineId) {
      WhatsAppCloneService.getLineContacts(activeLineId).then((cts) => {
        if (cts && Object.keys(cts).length > 0) {
          setSyncedContacts(cts);
        }
      });
    }
  }, [activeLineId, activeLine?.estado]);

  // Construir Directorio de Contactos unificando entidades del ERP y todos los clientes que escriban
  const contactList = useMemo(() => {
    const list: WhatsAppChatContact[] = [];
    const seenPhones = new Set<string>();

    // 1. Mapear últimos mensajes por teléfono normalizado
    const lastMsgByPhone = new Map<string, WhatsAppMessage>();
    const unreadCountByPhone = new Map<string, number>();

    for (const msg of lineMessages) {
      const otherPhone = msg.direccion === 'ENTRANTE' ? msg.remitenteTelefono : msg.destinatarioTelefono;
      if (!otherPhone) continue;
      const norm = normalizeToE164(otherPhone);
      if (!norm) continue;

      const existing = lastMsgByPhone.get(norm);
      if (!existing || (msg.timestamp || 0) >= (existing.timestamp || 0)) {
        lastMsgByPhone.set(norm, msg);
      }

      if (msg.direccion === 'ENTRANTE' && msg.estado !== 'LEIDO') {
        unreadCountByPhone.set(norm, (unreadCountByPhone.get(norm) || 0) + 1);
      }
    }

    // 2. Agregar contactos basados en entidades del ERP
    for (const ent of entities) {
      const rawPhone = ent.phone || ent.telefonoContacto;
      if (!rawPhone) continue;
      const normPhone = normalizeToE164(rawPhone);
      if (!normPhone || seenPhones.has(normPhone)) continue;
      seenPhones.add(normPhone);

      // Calcular facturas pendientes del cliente
      const clientInvoices = invoices.filter(
        (inv) => inv.customerId === ent.id && inv.paymentStatus !== 'PAGADO'
      );
      const pendingTotalUSD = clientInvoices.reduce(
        (sum, inv) => sum + (Number(inv.saldoPendienteUSD !== undefined ? inv.saldoPendienteUSD : inv.totalUSD) || 0),
        0
      );

      const contact = WhatsAppCloneService.enrichContactWithERP(
        normPhone,
        entities,
        centsRound(pendingTotalUSD),
        0
      );

      const lastMsg = lastMsgByPhone.get(normPhone);
      if (lastMsg) {
        contact.ultimoMensaje = lastMsg;
        contact.mensajesNoLeidos = unreadCountByPhone.get(normPhone) || 0;
      }

      list.push(contact);
    }

    // 3. Agregar clientes y prospectos que hayan interactuado por WhatsApp y no estén en ERP
    const isCorruptedOrRawLid = (ph: string): boolean => {
      const digits = ph.replace(/\D/g, '');
      if (digits === '83983891230953' || digits === '25404815458478') return true;
      if (digits.length >= 13 && !digits.startsWith('58')) return true;
      return false;
    };

    const isValidContactName = (name?: string | null): boolean => {
      if (!name) return false;
      const trimmed = name.trim();
      if (!trimmed) return false;
      if (/^[\.\s\-_]+$/.test(trimmed) || trimmed === '...' || trimmed === '..' || trimmed === '.') return false;
      if (trimmed.startsWith('+') || /^\d+$/.test(trimmed)) return false;
      return true;
    };

    for (const [phone, lastMsg] of lastMsgByPhone.entries()) {
      if (seenPhones.has(phone)) continue;
      // Descartar LIDs huérfanos o corruptos
      if (isCorruptedOrRawLid(phone)) continue;
      seenPhones.add(phone);

      // Buscar en todos los mensajes de este contacto si existe algún pushName o destinatarioNombre guardado
      const allMsgsForPhone = lineMessages.filter((m) => {
        const p1 = normalizeToE164(m.remitenteTelefono);
        const p2 = normalizeToE164(m.destinatarioTelefono);
        return p1 === phone || p2 === phone;
      });

      const syncedEntry = syncedContacts[phone] || syncedContacts[phone.replace(/\D/g, '')];
      const syncedName = isValidContactName(syncedEntry?.name) ? syncedEntry?.name : undefined;

      const pushNameMsg = allMsgsForPhone.find(
        (m) => isValidContactName(m.senderName)
      );
      const destNameMsg = allMsgsForPhone.find(
        (m) => isValidContactName((m as any).destinatarioNombre)
      );

      const cleanSender = syncedName || pushNameMsg?.senderName || (destNameMsg as any)?.destinatarioNombre;
      const displayName = cleanSender || `Prospecto (${phone})`;

      list.push({
        telefonoE164: phone,
        nombreDisplay: displayName,
        entityRole: 'LEAD',
        estadoSolvencia: 'SOLVENTE',
        deudaTotalUSD: 0,
        mensajesNoLeidos: unreadCountByPhone.get(phone) || 0,
        ultimoMensaje: lastMsg,
      });
    }

    // 4. Ordenar las conversaciones: las que tienen mensaje más reciente arriba
    list.sort((a, b) => {
      const timeA = a.ultimoMensaje?.timestamp || 0;
      const timeB = b.ultimoMensaje?.timestamp || 0;
      if (timeA !== timeB) {
        return timeB - timeA;
      }
      return a.nombreDisplay.localeCompare(b.nombreDisplay);
    });

    return list;
  }, [entities, invoices, lineMessages, syncedContacts]);

  // Filtrado de contactos
  const filteredContacts = useMemo(() => {
    return contactList.filter((c) => {
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const matchesName = c.nombreDisplay.toLowerCase().includes(q);
        const matchesPhone = c.telefonoE164.includes(q);
        if (!matchesName && !matchesPhone) return false;
      }

      if (activeCategoryFilter === 'CLIENTES' && c.entityRole !== 'CLIENTE' && c.entityRole !== 'DUAL' && c.entityRole !== 'LEAD') {
        return false;
      }
      if (activeCategoryFilter === 'PROVEEDORES' && c.entityRole !== 'PROVEEDOR' && c.entityRole !== 'DUAL') {
        return false;
      }
      if (activeCategoryFilter === 'DUAL' && c.entityRole !== 'DUAL') {
        return false;
      }
      if (activeCategoryFilter === 'CON_PAGO' && c.estadoSolvencia !== 'EN_MORA' && !c.ultimoMensaje?.hasComprobantePago) {
        return false;
      }

      return true;
    });
  }, [contactList, searchFilter, activeCategoryFilter]);

  // Auto-seleccionar primer contacto si no hay uno seleccionado
  useEffect(() => {
    if (!selectedContactPhone && filteredContacts.length > 0) {
      setSelectedContactPhone(filteredContacts[0].telefonoE164);
    }
  }, [filteredContacts, selectedContactPhone]);

  // Contacto seleccionado actualmente
  const selectedContact = useMemo(() => {
    return (
      contactList.find((c) => c.telefonoE164 === selectedContactPhone) ||
      (selectedContactPhone
        ? WhatsAppCloneService.enrichContactWithERP(selectedContactPhone, entities)
        : null)
    );
  }, [contactList, selectedContactPhone, entities]);

  // Facturas del contacto seleccionado
  const selectedContactInvoices = useMemo(() => {
    if (!selectedContact?.entityId) return [];
    return invoices.filter((inv) => inv.customerId === selectedContact.entityId);
  }, [invoices, selectedContact]);

  // Suscribir mensajes del chat seleccionado
  useEffect(() => {
    if (!activeLineId || !selectedContactPhone) {
      setMessages([]);
      return;
    }

    const unsub = WhatsAppCloneService.subscribeChatMessages(
      activeLineId,
      selectedContactPhone,
      (newMsgs) => {
        setMessages(newMsgs);
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 150);
      }
    );

    return () => {
      unsub();
    };
  }, [activeLineId, selectedContactPhone]);

    // Enviar mensaje
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || messageInput).trim();
    if (!text || !selectedContactPhone || isSending) return;

    if (!activeLine || activeLine.estado !== 'CONECTADO') {
      setErrorMessage(
        'La línea de WhatsApp no está conectada. Por favor escanee el código QR para vincular su cuenta.'
      );
      return;
    }

    setIsSending(true);
    setErrorMessage(null);
    const res = await WhatsAppCloneService.sendWhatsAppMessage(
      activeLineId,
      activeLine.numeroTelefono || '',
      selectedContactPhone,
      text,
      'TEXTO',
      undefined,
      undefined,
      selectedContact?.nombreDisplay
    );

    setIsSending(false);
    if (res.success) {
      setMessageInput('');
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else if (res.error) {
      setErrorMessage(res.error);
    }
  };

  // Adjuntar imagen (comprobante)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedContactPhone) return;

    if (!activeLine || activeLine.estado !== 'CONECTADO') {
      setErrorMessage(
        'La línea de WhatsApp no está conectada. Por favor escanee el código QR para vincular su cuenta.'
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUri = reader.result as string;
      const res = await WhatsAppCloneService.sendWhatsAppMessage(
        activeLineId,
        activeLine.numeroTelefono || '',
        selectedContactPhone,
        `[Adjunto: ${file.name}]`,
        'IMAGEN',
        dataUri,
        file.type
      );
      if (!res.success && res.error) {
        setErrorMessage(res.error);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Abrir modal para registrar Lead en CRM
  const handleOpenAddLeadModal = () => {
    if (!selectedContact) return;
    const cleanName = selectedContact.nombreDisplay.replace(/\(\+?\d+\)/g, '').replace('Prospecto', '').trim();
    setNewLeadForm({
      name: cleanName || 'Nuevo Cliente',
      rifCedula: '',
      role: 'CLIENTE',
      city: 'San Fernando de Apure',
      address: 'Apure, Venezuela',
      creditLimitUSD: 0,
    });
    setLeadModalError(null);
    setShowAddLeadModal(true);
  };

  // Guardar Lead como Cliente oficial del ERP en Firestore
  const handleSaveLeadAsClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadForm.name.trim() || !newLeadForm.rifCedula.trim()) {
      setLeadModalError('Nombre y RIF/Cédula son obligatorios');
      return;
    }
    setIsSavingLead(true);
    setLeadModalError(null);
    try {
      const newId = `ent_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newEntity: DualEntity = {
        id: newId,
        name: newLeadForm.name.trim(),
        nombre: newLeadForm.name.trim(),
        razonSocial: newLeadForm.name.trim(),
        rifCedula: newLeadForm.rifCedula.trim().toUpperCase(),
        rif: newLeadForm.rifCedula.trim().toUpperCase(),
        roles: [newLeadForm.role],
        city: newLeadForm.city.trim() || 'San Fernando de Apure',
        address: newLeadForm.address.trim() || 'Apure, Venezuela',
        phone: selectedContactPhone,
        telefonoContacto: selectedContactPhone,
        balanceUSD: 0,
        balanceVES: 0,
        lastUpdatedTimestamp: Date.now(),
      };

      await FinanceService.saveDualEntity(newEntity, 'admin');
      if (onEntityCreated) {
        onEntityCreated(newEntity);
      }
      setShowAddLeadModal(false);
    } catch (err: any) {
      setLeadModalError(err.message || 'Error guardando cliente');
    } finally {
      setIsSavingLead(false);
    }
  };

  // Eliminar chat e historial
  const handleDeleteChat = async () => {
    if (!selectedContactPhone || isDeletingChat) return;
    setIsDeletingChat(true);
    try {
      await WhatsAppCloneService.deleteChat(activeLineId, selectedContactPhone);
      setMessages([]);
      setSelectedContactPhone('');
      setShowDeleteChatConfirm(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al eliminar chat');
    } finally {
      setIsDeletingChat(false);
    }
  };

  // Polling automático del estado del QR auténtico mientras el modal está abierto
  useEffect(() => {
    if (!showQrModal) return;

    let isMounted = true;
    const fetchStatusAndQr = async () => {
      try {
        const res = await WhatsAppCloneService.getLineLiveStatus(activeLineId);
        if (isMounted && res.success) {
          if (res.qrCodeDataUri) {
            setQrDataUri(res.qrCodeDataUri);
          }
          // Solo auto-cerrar el modal SI el usuario estaba esperando el escaneo QR y se acaba de conectar
          if (res.estado === 'CONECTADO' && wasWaitingQrOnOpenRef.current) {
            wasWaitingQrOnOpenRef.current = false;
            setShowQrModal(false);
          }
        }
      } catch {
        if (isMounted && activeLine?.qrCodeDataUri) {
          setQrDataUri(activeLine.qrCodeDataUri);
        }
      } finally {
        if (isMounted) setIsGeneratingQr(false);
      }
    };

    fetchStatusAndQr();
    const interval = setInterval(fetchStatusAndQr, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [showQrModal, activeLineId, activeLine?.qrCodeDataUri]);

  // Abrir modal QR y solicitar generación a Baileys o gestión de línea conectada
  const handleOpenQrModal = async (forceNew: boolean = false) => {
    const isCurrentlyConnected = activeLine?.estado === 'CONECTADO';
    wasWaitingQrOnOpenRef.current = !isCurrentlyConnected || forceNew;

    setIsGeneratingQr(!isCurrentlyConnected || forceNew);
    setShowQrModal(true);
    setErrorMessage(null);
    setQrDataUri(forceNew ? null : (activeLine?.qrCodeDataUri || null));

    if (!isCurrentlyConnected || forceNew) {
      try {
        const res = await WhatsAppCloneService.requestQrCode(activeLineId, forceNew);
        if (res.success && (res.qrCodeDataUri || res.qrDataUri)) {
          setQrDataUri(res.qrCodeDataUri || res.qrDataUri || null);
        }
      } catch {
        if (!forceNew && activeLine?.qrCodeDataUri) {
          setQrDataUri(activeLine.qrCodeDataUri);
        }
      } finally {
        setIsGeneratingQr(false);
      }
    }
  };

  // Desvincular línea
  const handleDisconnectLine = async () => {
    setIsDisconnecting(true);
    setErrorMessage(null);
    try {
      const res = await WhatsAppCloneService.disconnectLine(activeLineId);
      if (res.success) {
        setQrDataUri(null);
        wasWaitingQrOnOpenRef.current = true;
        await handleOpenQrModal(true);
      } else {
        setErrorMessage(res.error || 'No se pudo desvincular la línea');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al desvincular');
    } finally {
      setIsDisconnecting(false);
    }
  };

  // Aplicar plantilla seleccionada
  const handleSelectTemplate = (tpl: WhatsAppTemplate) => {
    if (!selectedContact) return;
    const inv = selectedContactInvoices[0];
    const rendered = WhatsAppCloneService.renderTemplate(tpl.textoPlantilla, {
      cliente: selectedContact.nombreDisplay,
      factura: inv ? inv.invoiceNumber || inv.id : 'N/A',
      monto_usd: inv
        ? (inv.saldoPendienteUSD !== undefined ? inv.saldoPendienteUSD : inv.totalUSD)
        : (selectedContact.deudaTotalUSD || 0),
      monto_ves: inv
        ? centsRound(Number(inv.saldoPendienteUSD !== undefined ? inv.saldoPendienteUSD : inv.totalUSD) * (bcvRate || 1))
        : centsRound(Number(selectedContact.deudaTotalUSD || 0) * (bcvRate || 1)),
      fecha_vencimiento: inv?.dueDate || new Date().toISOString().split('T')[0],
    });
    setMessageInput(rendered);
    setShowTemplatesModal(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[580px] bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
      {/* 1. CABECERA SUPERIOR: Selector de Línea, Estado QR y Modo Híbrido */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-tight">
                Puro Apure WhatsApp Web en Vivo
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                CRM / BRM Sync
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Gestión directa de Cobranzas, Ventas y Proveedores sin APIs externas de pago
            </p>
          </div>
        </div>

        {/* Selector de Línea Operativa */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            {lines.map((l, index) => (
              <button
                key={l.id ? `line-${l.id}` : `line-idx-${index}`}
                onClick={() => setActiveLineId(l.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 min-h-[38px] ${
                  activeLineId === l.id
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    l.estado === 'CONECTADO' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                  }`}
                />
                <span>{(l.nombre || l.id || 'Línea').replace('Línea de ', '')}</span>
              </button>
            ))}
          </div>

          {/* Botón Gestión / Vincular QR */}
          <button
            onClick={() => handleOpenQrModal(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition min-h-[44px] cursor-pointer"
            title={activeLine?.estado === 'CONECTADO' ? 'Ver Estado y Opciones de Desvinculación' : 'Vincular o Reconectar sesión mediante Código QR'}
          >
            {activeLine?.estado === 'CONECTADO' ? (
              <>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">Línea Conectada</span>
              </>
            ) : (
              <>
                <QrCode className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">Vincular QR</span>
              </>
            )}
          </button>

          {/* Conmutador Modo Híbrido wa.me */}
          <button
            onClick={() => setIsHybridMode(!isHybridMode)}
            className={`p-2 rounded-xl border text-xs font-semibold transition min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer ${
              isHybridMode
                ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title="Alternar Modo Híbrido Directo wa.me para contingencia móvil"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Pestañas Móviles (< 768px) */}
      <div className="flex md:hidden bg-slate-900/90 border-b border-slate-800 p-1 text-xs">
        <button
          onClick={() => setMobileTab('CHATS')}
          className={`flex-1 py-2 text-center font-bold rounded-lg transition min-h-[44px] ${
            mobileTab === 'CHATS' ? 'bg-purple-600 text-white' : 'text-slate-400'
          }`}
        >
          Chats ({filteredContacts.length})
        </button>
        <button
          onClick={() => setMobileTab('CONVERSACION')}
          className={`flex-1 py-2 text-center font-bold rounded-lg transition min-h-[44px] ${
            mobileTab === 'CONVERSACION' ? 'bg-purple-600 text-white' : 'text-slate-400'
          }`}
        >
          Conversación
        </button>
        <button
          onClick={() => setMobileTab('EXPEDIENTE')}
          className={`flex-1 py-2 text-center font-bold rounded-lg transition min-h-[44px] ${
            mobileTab === 'EXPEDIENTE' ? 'bg-purple-600 text-white' : 'text-slate-400'
          }`}
        >
          Expediente 360°
        </button>
      </div>

      {/* 2. ÁREA PRINCIPAL: 3 COLUMNAS RESPONSIVAS */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* COLUMNA 1: DIRECTORIO DE CHATS */}
        <div
          className={`w-full md:w-80 lg:w-96 border-r border-slate-800 bg-slate-900/40 flex flex-col ${
            mobileTab === 'CHATS' ? 'flex' : 'hidden md:flex'
          }`}
        >
          {/* Buscador de Contactos */}
          <div className="p-3 border-b border-slate-800 space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar cliente, proveedor o +58..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition min-h-[40px]"
              />
            </div>

            {/* Pestañas de Filtro Rápido */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px] scrollbar-none">
              {(['TODOS', 'CLIENTES', 'PROVEEDORES', 'DUAL', 'CON_PAGO'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap transition cursor-pointer min-h-[32px] ${
                    activeCategoryFilter === cat
                      ? 'bg-purple-600 text-white shadow'
                      : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat === 'TODOS'
                    ? 'Todos'
                    : cat === 'CLIENTES'
                    ? 'Clientes'
                    : cat === 'PROVEEDORES'
                    ? 'BRM'
                    : cat === 'DUAL'
                    ? 'Rol Dual'
                    : 'En Mora'}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de Conversaciones */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50">
            {filteredContacts.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs italic">
                No hay contactos registrados que coincidan con la búsqueda.
              </div>
            ) : (
              filteredContacts.map((contact, index) => {
                const isSelected = selectedContactPhone === contact.telefonoE164;
                return (
                  <div
                    key={contact.telefonoE164 ? `contact-${contact.telefonoE164}-${contact.entityId || index}` : `contact-idx-${index}`}
                    onClick={() => {
                      setSelectedContactPhone(contact.telefonoE164);
                      setMobileTab('CONVERSACION');
                      setErrorMessage(null);
                    }}
                    className={`p-3 transition cursor-pointer flex items-start gap-3 min-h-[64px] ${
                      isSelected
                        ? 'bg-slate-800/80 border-l-4 border-purple-500'
                        : 'hover:bg-slate-800/30'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-2xl bg-purple-950/60 border border-purple-500/30 flex items-center justify-center text-purple-300 font-bold text-xs shrink-0 mt-0.5">
                      {contact.entityRole === 'PROVEEDOR' ? (
                        <Building2 className="w-4 h-4 text-emerald-400" />
                      ) : contact.entityRole === 'DUAL' ? (
                        <Zap className="w-4 h-4 text-cyan-400" />
                      ) : contact.entityRole === 'LEAD' ? (
                        <MessageSquare className="w-4 h-4 text-amber-400" />
                      ) : (
                        <User className="w-4 h-4 text-purple-400" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-white text-xs truncate">
                          {contact.nombreDisplay}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {contact.ultimoMensaje && (
                            <span className="text-[10px] font-mono text-slate-400">
                              {formatChatTime(contact.ultimoMensaje.timestamp)}
                            </span>
                          )}
                          {contact.estadoSolvencia === 'EN_MORA' && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 shrink-0 font-bold">
                              ${contact.deudaTotalUSD?.toFixed(0)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Vista previa del último mensaje en tiempo real */}
                      {contact.ultimoMensaje ? (
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1 gap-1">
                          <p className="truncate flex items-center gap-1 text-[11px] text-slate-300">
                            {contact.ultimoMensaje.direccion === 'SALIENTE' && (
                              <CheckCheck className="w-3.5 h-3.5 text-purple-400 shrink-0 inline" />
                            )}
                            {contact.ultimoMensaje.hasComprobantePago && (
                              <Receipt className="w-3.5 h-3.5 text-emerald-400 shrink-0 inline" />
                            )}
                            <span className="truncate">
                              {contact.ultimoMensaje.texto || (contact.ultimoMensaje.tipoMensaje === 'IMAGEN' ? '📷 Imagen / Comprobante' : '')}
                            </span>
                          </p>
                          {contact.mensajesNoLeidos && contact.mensajesNoLeidos > 0 ? (
                            <span className="px-1.5 py-0.2 rounded-full bg-emerald-500 text-slate-950 font-bold text-[9px] shrink-0">
                              {contact.mensajesNoLeidos}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                          <span className="font-mono text-[10px] truncate">{contact.telefonoE164}</span>
                          <span
                            className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded ${
                              contact.entityRole === 'DUAL'
                                ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                                : contact.entityRole === 'PROVEEDOR'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : contact.entityRole === 'LEAD'
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {contact.entityRole}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLUMNA 2: CONVERSACIÓN ESPEJO WHATSAPP */}
        <div
          className={`flex-1 flex flex-col bg-slate-950 ${
            mobileTab === 'CONVERSACION' ? 'flex' : 'hidden md:flex'
          }`}
        >
          {selectedContact ? (
            <>
              {/* Encabezado del Chat Seleccionado */}
              <div className="p-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-950 border border-purple-500/30 flex items-center justify-center text-purple-300 text-xs font-bold">
                    {selectedContact.nombreDisplay.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white flex items-center gap-2">
                      <span>{selectedContact.nombreDisplay}</span>
                      <span className="text-[10px] font-mono font-normal text-slate-400">
                        {selectedContact.telefonoE164.replace(/\D/g, '').length >= 14
                          ? `(WhatsApp ID *${selectedContact.telefonoE164.replace(/\D/g, '').slice(-4)})`
                          : selectedContact.telefonoE164}
                      </span>
                    </h3>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Línea activa: {activeLine?.nombre}
                      </span>
                      {selectedContact.estadoSolvencia === 'EN_MORA' && (
                        <span className="text-rose-400 font-bold">
                          • Saldo Pendiente: ${selectedContact.deudaTotalUSD?.toFixed(2)} USD
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Botón Plantillas Inteligentes */}
                  <button
                    onClick={() => setShowTemplatesModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/70 hover:bg-purple-900/80 text-purple-300 border border-purple-700 text-xs font-semibold transition min-h-[38px] cursor-pointer"
                    title="Insertar Plantilla Oficial de Cobranza o Facturación"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span className="hidden sm:inline">Plantillas</span>
                  </button>

                  {/* Botón wa.me directo */}
                  <a
                    href={WhatsAppCloneService.generateWaMeLink(selectedContact.telefonoE164, messageInput)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 transition min-h-[38px] min-w-[38px] flex items-center justify-center cursor-pointer"
                    title="Abrir directamente en aplicación WhatsApp (wa.me)"
                  >
                    <ExternalLink className="w-4 h-4 text-emerald-400" />
                  </a>

                  {/* Botón Ver Expediente 360 en móvil */}
                  <button
                    onClick={() => setMobileTab('EXPEDIENTE')}
                    className="md:hidden p-2 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 min-h-[38px]"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Burbujas de Conversación */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                    <MessageSquare className="w-12 h-12 text-slate-700 mb-2" />
                    <p className="text-xs font-semibold text-slate-400">
                      No hay mensajes previos en este hilo de conversación.
                    </p>
                    <p className="text-[11px] text-slate-500 max-w-sm mt-1">
                      Escriba un mensaje o inserte una Plantilla Inteligente de Cobranza/Facturación para iniciar el contacto.
                    </p>
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const isOutgoing = msg.direccion === 'SALIENTE';
                    return (
                      <div
                        key={msg.id ? `msg-${msg.id}` : `msg-${msg.timestamp || Date.now()}-${index}`}
                        className={`flex flex-col ${isOutgoing ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[85%] sm:max-w-[70%] rounded-2xl p-3 shadow-md relative ${
                            isOutgoing
                              ? 'bg-purple-700 text-white rounded-tr-none'
                              : 'bg-slate-900 text-slate-200 border border-slate-800 rounded-tl-none'
                          }`}
                        >
                          {/* Adjunto de Imagen / Comprobante */}
                          {msg.mediaUrl && (
                            <div className="mb-2 rounded-xl overflow-hidden border border-slate-700 bg-slate-950">
                              <img
                                src={msg.mediaUrl}
                                alt="Evidencia de Pago"
                                className="w-full max-h-60 object-contain"
                              />
                              {/* Botón Disparo Directo a OCR */}
                              <div className="p-2 bg-slate-900 flex items-center justify-between gap-2 border-t border-slate-800">
                                <span className="text-[10px] text-slate-400 font-mono">
                                  Evidencia de Pago Recibida
                                </span>
                                <button
                                  onClick={() => {
                                    if (onAnalyzeReceiptOCR && msg.mediaUrl) {
                                      onAnalyzeReceiptOCR(msg.mediaUrl, selectedContact);
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 shadow transition cursor-pointer min-h-[32px]"
                                >
                                  <Sparkles className="w-3 h-3" />
                                  <span>🔍 Analizar con OCR</span>
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Texto del Mensaje */}
                          <p className="text-xs whitespace-pre-wrap leading-relaxed font-sans">
                            {msg.texto}
                          </p>

                          {/* Pie de Mensaje: Hora y Ticks de Entrega */}
                          <div
                            className={`flex items-center justify-end gap-1 text-[9px] font-mono mt-1 ${
                              isOutgoing ? 'text-purple-200' : 'text-slate-500'
                            }`}
                          >
                            <span>
                              {new Date(msg.timestamp).toLocaleTimeString('es-VE', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {isOutgoing && (
                              <span>
                                {msg.estado === 'LEIDO' ? (
                                  <CheckCheck className="w-3 h-3 text-cyan-300" />
                                ) : msg.estado === 'ENTREGADO' ? (
                                  <CheckCheck className="w-3 h-3 text-purple-300" />
                                ) : (
                                  <Check className="w-3 h-3 text-purple-300" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Banner de Advertencia si la línea no está conectada */}
              {activeLine?.estado !== 'CONECTADO' && (
                <div className="px-3 py-2 bg-amber-950/40 border-t border-amber-500/30 flex items-center justify-between text-xs text-amber-300">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Línea <strong>{activeLine?.nombre || 'de WhatsApp'}</strong> no vinculada. Vincule WhatsApp para enviar mensajes en vivo.</span>
                  </div>
                  <button
                    onClick={() => handleOpenQrModal(false)}
                    className="underline hover:text-white font-bold cursor-pointer shrink-0 ml-2"
                  >
                    Vincular QR
                  </button>
                </div>
              )}

              {/* Banner de Error temporal */}
              {errorMessage && (
                <div className="px-3 py-2 bg-rose-950/60 border-t border-rose-500/40 flex items-center justify-between text-xs text-rose-300">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                  <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white ml-2 text-sm">✕</button>
                </div>
              )}

              {/* Barra Inferior de Entrada y Envío */}
              <div className="p-3 border-t border-slate-800 bg-slate-900/80 flex items-center gap-2">
                {/* Botón Adjuntar */}
                <label className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center transition">
                  <Paperclip className="w-4 h-4" />
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>

                {/* Input de Mensaje */}
                <input
                  type="text"
                  placeholder="Escriba un mensaje (Presione Enter para enviar)..."
                  value={messageInput}
                  onChange={(e) => {
                    setMessageInput(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition min-h-[44px]"
                />

                {/* Botón Enviar */}
                <button
                  onClick={() => handleSendMessage()}
                  disabled={!messageInput.trim() || isSending}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-950/50 transition cursor-pointer min-h-[44px] flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Enviar</span>
                </button>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
              <MessageSquare className="w-16 h-16 text-slate-800 mb-3" />
              <h3 className="text-sm font-bold text-slate-400">Seleccione un chat</h3>
              <p className="text-xs text-slate-500 max-w-xs mt-1">
                Elija un cliente o proveedor del directorio para iniciar la conversación sincronizada.
              </p>
            </div>
          )}
        </div>

        {/* COLUMNA 3: EXPEDIENTE 360° Y CRUCE DE CUENTAS */}
        <div
          className={`w-full md:w-80 lg:w-88 border-l border-slate-800 bg-slate-900/60 p-4 overflow-y-auto space-y-4 ${
            mobileTab === 'EXPEDIENTE' ? 'flex flex-col' : 'hidden lg:flex flex-col'
          }`}
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-purple-400" />
              <span>Expediente 360° ERP</span>
            </h3>
            {selectedContact?.estadoSolvencia && (
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                  selectedContact.estadoSolvencia === 'EN_MORA'
                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                    : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                }`}
              >
                {selectedContact.estadoSolvencia}
              </span>
            )}
          </div>

          {selectedContact ? (
            <>
              {/* Banner de Acción para Prospectos LEAD */}
              {selectedContact.entityRole === 'LEAD' && (
                <div className="p-3.5 bg-amber-950/40 border border-amber-500/40 rounded-2xl space-y-2.5">
                  <div className="flex items-center gap-2 text-amber-300">
                    <UserPlus className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-xs font-bold">Prospecto No Registrado</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Este número interactúa por WhatsApp pero no está registrado en la agenda del ERP.
                  </p>
                  <div className="pt-1 flex flex-col gap-2">
                    <button
                      onClick={handleOpenAddLeadModal}
                      className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px]"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>➕ Agregar a Agenda CRM</span>
                    </button>
                    <button
                      onClick={() => setShowDeleteChatConfirm(true)}
                      className="w-full py-2 px-3 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px]"
                    >
                      <Trash2 className="w-4 h-4 text-rose-400" />
                      <span>🗑️ Eliminar Chat e Historial</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Tarjetas de Saldos y Límite de Crédito */}
              <div className="space-y-2">
                <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800">
                  <span className="text-[10px] font-mono uppercase text-slate-400 block font-bold">
                    Deuda Total en Facturas
                  </span>
                  <span className="text-xl font-black font-mono text-rose-400 tabular-nums">
                    ${(selectedContact.deudaTotalUSD || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 block mt-0.5">
                    Bs. {((selectedContact.deudaTotalUSD || 0) * (bcvRate || 1)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">Límite Crédito</span>
                    <strong className="text-white">
                      ${(selectedContact.limiteCreditoUSD || 0).toLocaleString()}
                    </strong>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">Rol Directivo</span>
                    <strong className="text-purple-300">{selectedContact.entityRole}</strong>
                  </div>
                </div>

                {/* Rol Dual: Compensación de Cuentas */}
                {selectedContact.entityRole === 'DUAL' && (
                  <div className="p-2.5 bg-cyan-950/30 rounded-xl border border-cyan-800/40 text-xs">
                    <span className="text-[10px] font-bold text-cyan-300 block mb-1">
                      ⚡ Compensación Rol Dual (Cruce)
                    </span>
                    <div className="flex justify-between text-slate-300 font-mono text-[11px]">
                      <span>Por Pagar:</span>
                      <span>${(selectedContact.cuentasPorPagarUSD || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-cyan-400 font-bold font-mono text-[11px] pt-1 border-t border-cyan-900/50 mt-1">
                      <span>Saldo Neto:</span>
                      <span>${(selectedContact.saldoNetoCompensadoUSD || 0).toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Lista de Facturas Pendientes */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-300 block">
                  Facturas Pendientes ({selectedContactInvoices.length})
                </span>

                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {selectedContactInvoices.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No hay facturas pendientes.</p>
                  ) : (
                    selectedContactInvoices.map((inv, index) => (
                      <div
                        key={inv.id ? `inv-${inv.id}` : `inv-idx-${index}`}
                        className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <strong className="text-white block font-mono">
                            {inv.invoiceNumber || inv.id}
                          </strong>
                          <span className="text-[10px] text-slate-400">
                            Vence: {inv.dueDate || 'Inmediato'}
                          </span>
                        </div>
                        <div className="text-right font-mono">
                          <span className="text-rose-400 font-bold block">
                            ${Number(inv.saldoPendienteUSD !== undefined ? inv.saldoPendienteUSD : inv.totalUSD).toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {inv.paymentStatus}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Botón Pre-Conciliar Pago */}
              <button
                onClick={() => {
                  if (onNavigateToFinance) {
                    onNavigateToFinance();
                  }
                }}
                className="w-full mt-2 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 transition flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
              >
                <DollarSign className="w-4 h-4" />
                <span>Pre-Conciliar Pago en Finanzas</span>
              </button>
            </>
          ) : (
            <p className="text-xs text-slate-500 italic text-center py-6">
              Seleccione un contacto para ver su expediente crediticio y facturas activas.
            </p>
          )}
        </div>
      </div>

      {/* MODAL 1: Vinculación QR (Sandbox & Local Safe) */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <QrCode className="w-4 h-4 text-emerald-400" />
                <span>Vincular WhatsApp por QR</span>
              </h3>
              <button
                onClick={() => setShowQrModal(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Abra WhatsApp en su teléfono &gt; Dispositivos vinculados &gt; Vincular un dispositivo.
            </p>

            {activeLine?.estado === 'CONECTADO' && activeLine.numeroTelefono ? (
              <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-emerald-300">Línea Conectada en Vivo</h4>
                  <p className="text-xs text-slate-200 mt-1 font-mono font-bold">{activeLine.numeroTelefono}</p>
                </div>

                {errorMessage && (
                  <div className="p-2 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-300 text-left">
                    {errorMessage}
                  </div>
                )}

                <button
                  onClick={handleDisconnectLine}
                  disabled={isDisconnecting}
                  className="w-full py-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-bold transition cursor-pointer min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isDisconnecting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-rose-400" />
                      <span>Desvinculando y cerrando sesión...</span>
                    </>
                  ) : (
                    <span>Desvincular y Cerrar Sesión</span>
                  )}
                </button>
              </div>
            ) : (
              <>
                {errorMessage && (
                  <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-300 text-left">
                    {errorMessage}
                  </div>
                )}

                {activeLine?.estado === 'QR_EXPIRADO' ? (
                  <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-center space-y-3">
                    <p className="text-xs text-amber-300 font-semibold">
                      El código QR expiró por inactividad para proteger la pasarela de WhatsApp.
                    </p>
                    <button
                      onClick={() => handleOpenQrModal(true)}
                      disabled={isGeneratingQr}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer min-h-[44px] flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 text-white ${isGeneratingQr ? 'animate-spin' : ''}`} />
                      <span>Generar Nuevo Código QR</span>
                    </button>
                  </div>
                ) : (
                  <div className="bg-white p-3 rounded-2xl mx-auto w-56 h-56 flex flex-col items-center justify-center border-4 border-emerald-600 shadow-2xl relative">
                    {isGeneratingQr ? (
                      <div className="flex flex-col items-center gap-2 text-emerald-700">
                        <RefreshCw className="w-8 h-8 animate-spin" />
                        <span className="text-[10px] font-semibold">Generando QR auténtico...</span>
                      </div>
                    ) : (qrDataUri || activeLine?.qrCodeDataUri) ? (
                      <img
                        src={qrDataUri || activeLine?.qrCodeDataUri}
                        alt="Código QR WhatsApp Auténtico"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-600">
                        <QrCode className="w-16 h-16 animate-pulse text-emerald-600" />
                        <span className="text-[10px] font-medium">Obteniendo apretón de manos QR...</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>Apretón de manos Noise Protocol autenticado con Baileys</span>
                </div>

                <div className="space-y-2 pt-1">
                  <button
                    onClick={() => handleOpenQrModal(true)}
                    disabled={isGeneratingQr}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition cursor-pointer min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isGeneratingQr ? 'animate-spin' : ''}`} />
                    <span>Refrescar Código QR</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: Selector de Plantillas Inteligentes */}
      {showTemplatesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-xl w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>Plantillas Oficiales de Cobranza y CRM</span>
              </h3>
              <button
                onClick={() => setShowTemplatesModal(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Seleccione una plantilla. Las variables se autocompletarán con los datos del contacto seleccionado.
            </p>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {templates.map((tpl, index) => (
                <div
                  key={tpl.id ? `tpl-${tpl.id}` : `tpl-idx-${index}`}
                  onClick={() => handleSelectTemplate(tpl)}
                  className="p-3 bg-slate-950 hover:bg-slate-800/60 rounded-xl border border-slate-800 cursor-pointer transition space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <strong className="text-xs text-purple-300">{tpl.nombre}</strong>
                    <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400">
                      {tpl.categoria}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-2">{tpl.textoPlantilla}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Alta Rápida de Lead en Agenda CRM */}
      {showAddLeadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-emerald-400" />
                <span>Agregar Prospecto a Agenda CRM / ERP</span>
              </h3>
              <button
                onClick={() => setShowAddLeadModal(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Vincule este número de WhatsApp con un registro oficial en el directorio de clientes y proveedores del ERP.
            </p>

            {leadModalError && (
              <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-300">
                {leadModalError}
              </div>
            )}

            <form onSubmit={handleSaveLeadAsClient} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Nombre Completo o Razón Social *
                </label>
                <input
                  type="text"
                  required
                  value={newLeadForm.name}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, name: e.target.value })}
                  placeholder="Ej. Inversiones El Llano C.A. o Juan Pérez"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500 min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    RIF o Cédula *
                  </label>
                  <input
                    type="text"
                    required
                    value={newLeadForm.rifCedula}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, rifCedula: e.target.value.toUpperCase() })}
                    placeholder="V-12345678 o J-12345678-0"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500 min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Rol Comercial
                  </label>
                  <select
                    value={newLeadForm.role}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, role: e.target.value as DualEntityRole })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:border-emerald-500 min-h-[44px]"
                  >
                    <option value="CLIENTE">Cliente (Cuentas por Cobrar)</option>
                    <option value="PROVEEDOR">Proveedor (BRM / Pagos)</option>
                    <option value="DUAL">Dual (Cliente y Proveedor)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Teléfono Vinculado (E.164)
                </label>
                <input
                  type="text"
                  disabled
                  value={selectedContactPhone}
                  className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-400 font-mono cursor-not-allowed min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Ciudad / Estado
                  </label>
                  <input
                    type="text"
                    value={newLeadForm.city}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, city: e.target.value })}
                    placeholder="San Fernando de Apure"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:border-emerald-500 min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Límite de Crédito ($ USD)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newLeadForm.creditLimitUSD}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, creditLimitUSD: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:border-emerald-500 min-h-[44px]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddLeadModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer min-h-[44px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingLead}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer shadow-lg shadow-emerald-900/30 min-h-[44px] flex items-center gap-2 disabled:opacity-50"
                >
                  {isSavingLead ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Registrando...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Guardar en Agenda CRM</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Confirmación de Eliminación de Chat e Historial */}
      {showDeleteChatConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
          <div className="bg-slate-900 border border-rose-900/50 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-rose-400 flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-500" />
                <span>Eliminar Chat e Historial</span>
              </h3>
              <button
                onClick={() => setShowDeleteChatConfirm(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              ¿Está seguro de que desea eliminar permanentemente la conversación con{' '}
              <strong className="text-white">{selectedContact?.nombreDisplay}</strong> ({selectedContactPhone})?
            </p>
            <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl text-[11px] text-rose-300 leading-relaxed">
              Esta acción purgará los mensajes tanto en la base de datos de Cloud Firestore como en el historial del dispositivo WhatsApp vinculado. No se puede deshacer.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowDeleteChatConfirm(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer min-h-[44px]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteChat}
                disabled={isDeletingChat}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer shadow-lg shadow-rose-900/30 min-h-[44px] flex items-center gap-2 disabled:opacity-50"
              >
                {isDeletingChat ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Eliminando...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Sí, Eliminar Definitivamente</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
