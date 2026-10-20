import React, { useState, useMemo, useEffect } from 'react';
import {
  BookOpen,
  X,
  Wifi,
  WifiOff,
  Package,
  DollarSign,
  Scale,
  Bird,
  Shield,
  Clock,
  Printer,
  FileText,
  Activity,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBrand } from '../context/BrandContext';
import { MANUAL_SECTIONS, ManualSection } from '../config/manualContentConfig';

interface UserOperationalManualModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserOperationalManualModal: React.FC<UserOperationalManualModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { role } = useAuth();
  const { logoUrl } = useBrand();

  // ---------------------------------------------------------------------------
  // MOTOR DE FILTRADO ABAC / RBAC CON FALLBACK RESTRICTIVO (Fase 2)
  // Intercepta el rol del usuario y depura el diccionario antes de la UI.
  // Fallback de contingencia: Si role es indefinido, asume estrictamente 'OBRERO'.
  // ---------------------------------------------------------------------------
  const filteredSections = useMemo<ManualSection[]>(() => {
    const safeRole = role || 'OBRERO';
    return MANUAL_SECTIONS.filter((section) => section.allowedRoles.includes(safeRole));
  }, [role]);

  // Estado de selección local dinámico
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');

  // Al abrir el modal o mutar las secciones autorizadas, asegurar que la sección activa sea válida
  useEffect(() => {
    if (isOpen && filteredSections.length > 0) {
      const isCurrentAllowed = filteredSections.some((s) => s.id === selectedSectionId);
      if (!isCurrentAllowed) {
        setSelectedSectionId(filteredSections[0].id);
      }
    }
  }, [isOpen, filteredSections, selectedSectionId]);

  if (!isOpen) return null;

  // Sección activa garantizada dentro del conjunto autorizado
  const activeSection =
    filteredSections.find((s) => s.id === selectedSectionId) ||
    filteredSections[0] ||
    null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="px-2.5 py-1 rounded-xl bg-white border border-slate-200 shadow-sm shrink-0">
              <img
                src={logoUrl}
                alt="Puro Apure ERP"
                className="w-[90px] min-w-[90px] h-auto object-contain block"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = '/puro_apure_logo.png';
                }}
              />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight font-heading">
                Manual Operativo de Campo &amp; Puesta en Marcha
              </h2>
              <p className="text-xs text-slate-400 font-body">
                Puro Apure ERP • Agropecuaria Puro Apure, C.A.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body with Dynamic Left Nav & Right Detail */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Side Navigation Dinámica con map() */}
          <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-800 p-3 space-y-1 bg-slate-950/40 shrink-0 overflow-x-auto md:overflow-y-auto">
            {filteredSections.map((sec) => {
              const Icon = sec.icon;
              const isSelected = activeSection?.id === sec.id;
              return (
                <button
                  key={sec.id}
                  onClick={() => setSelectedSectionId(sec.id)}
                  className={`w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-left flex items-center gap-2 transition ${
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{sec.title}</span>
                </button>
              );
            })}
          </div>

          {/* Section Detail Panel Dinámico */}
          <div className="flex-1 p-6 overflow-y-auto space-y-4 text-xs text-slate-300">
            {activeSection ? (
              activeSection.content
            ) : (
              <div className="p-8 text-center text-slate-500 italic">
                No hay módulos disponibles para su nivel de autorización.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 flex items-center justify-between bg-slate-950/60 text-xs">
          <span className="text-slate-400 font-mono">
            Derechos de desarrollo reservados a AR Group 2026
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md transition"
          >
            Entendido / Cerrar Manual
          </button>
        </div>
      </div>
    </div>
  );
};
