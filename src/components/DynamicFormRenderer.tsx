/**
 * Puro Apure ERP - Dynamic UI Renderer
 * Renderiza dinámicamente campos de formulario adicionales basados en el JSON almacenado en system_schemas
 */

import React, { useEffect, useState } from 'react';
import { SchemaService, RESERVED_DYNAMIC_FIELD_KEYS } from '../services/schemaService';
import { DynamicSchemaField, SchemaTargetModule } from '../types/schema';
import { Sparkles, HelpCircle } from 'lucide-react';

interface DynamicFormRendererProps {
  module: SchemaTargetModule;
  values: Record<string, any>;
  onChange: (fieldName: string, value: any) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
}

export const DynamicFormRenderer: React.FC<DynamicFormRendererProps> = ({
  module,
  values,
  onChange,
  errors = {},
  disabled = false,
}) => {
  const [fields, setFields] = useState<DynamicSchemaField[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = SchemaService.subscribeSchemas((list) => {
      setFields(list);
      setLoading(false);
    }, module);

    return () => unsub();
  }, [module]);

  if (loading) {
    return (
      <div className="py-2 flex items-center gap-2 text-xs text-slate-400 font-mono animate-pulse">
        <Sparkles className="w-3.5 h-3.5 text-purple-400" />
        <span>Cargando campos dinámicos para {module}...</span>
      </div>
    );
  }

  if (fields.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 pt-3 border-t border-purple-900/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold text-purple-300">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span>Campos Dinámicos Inyectados ({module})</span>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-950/70 border border-purple-800 text-purple-300">
          Dynamic Schema Engine
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields
          .filter((f) => !RESERVED_DYNAMIC_FIELD_KEYS.has(f.fieldName))
          .map((field) => {
            const hasProp = Object.prototype.hasOwnProperty.call(values, field.fieldName);
            const val = hasProp && values[field.fieldName] !== undefined ? values[field.fieldName] : (field.defaultValue || '');
            const errorMsg = errors[field.fieldName];

            const handleFieldChange = (rawVal: any) => {
              if (RESERVED_DYNAMIC_FIELD_KEYS.has(field.fieldName)) return;
              onChange(field.fieldName, rawVal);
            };

            return (
              <div key={field.id} className="space-y-1">
                <label className="text-xs text-slate-300 font-medium flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    {field.fieldLabel}
                    {field.required && <span className="text-red-400 font-bold">*</span>}
                  </span>
                  {field.description && (
                    <span className="text-slate-500 hover:text-slate-300 cursor-help" title={field.description}>
                      <HelpCircle className="w-3 h-3" />
                    </span>
                  )}
                </label>

                {/* RENDERIZADO POR TIPO */}
                {field.fieldType === 'TEXTO' && (
                  <input
                    type="text"
                    disabled={disabled}
                    value={val}
                    placeholder={field.description || `Ingrese ${field.fieldLabel.toLowerCase()}`}
                    onChange={(e) => handleFieldChange(e.target.value)}
                    className="w-full bg-slate-950 border border-purple-900/50 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-white outline-none transition disabled:opacity-50"
                  />
                )}

                {field.fieldType === 'NUMERO' && (
                  <input
                    type="number"
                    disabled={disabled}
                    value={val}
                    placeholder="0.00"
                    onChange={(e) => handleFieldChange(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-purple-900/50 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none transition disabled:opacity-50"
                  />
                )}

                {field.fieldType === 'SELECTOR' && (
                  <select
                    disabled={disabled}
                    value={val}
                    onChange={(e) => handleFieldChange(e.target.value)}
                    className="w-full bg-slate-950 border border-purple-900/50 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-white outline-none transition disabled:opacity-50"
                  >
                  <option value="">-- Seleccionar --</option>
                  {(field.options || '')
                    .split(',')
                    .map((opt) => opt.trim())
                    .filter(Boolean)
                    .map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                </select>
              )}

              {field.fieldType === 'BOOLEANO' && (
                <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={Boolean(val)}
                    onChange={(e) => onChange(field.fieldName, e.target.checked)}
                    className="w-4 h-4 rounded text-purple-600 bg-slate-950 border-purple-800 focus:ring-purple-500"
                  />
                  <span className="text-xs text-slate-300">
                    {Boolean(val) ? 'Activo / Sí' : 'Inactivo / No'}
                  </span>
                </label>
              )}

              {errorMsg && (
                <p className="text-[10px] text-red-400 font-mono">{errorMsg}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
