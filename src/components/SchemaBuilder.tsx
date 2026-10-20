/**
 * Puro Apure ERP - SchemaBuilder (Constructor de Esquemas Dinámicos)
 * Accesible exclusivamente por el Superadministrador para inyectar campos y módulos sin recompilación
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { SchemaService } from '../services/schemaService';
import { DynamicSchemaField, SchemaFieldType, SchemaTargetModule } from '../types/schema';
import {
  Layers,
  PlusCircle,
  Trash2,
  Eye,
  CheckCircle2,
  ShieldAlert,
  Sparkles,
  Filter,
  Code2,
  FileCode,
  HelpCircle,
  RefreshCw,
} from 'lucide-react';

export const SchemaBuilder: React.FC = () => {
  const { isSuperAdmin, userProfile } = useAuth();
  const [schemas, setSchemas] = useState<DynamicSchemaField[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterModule, setFilterModule] = useState<string>('TODOS');
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Form State
  const [targetModule, setTargetModule] = useState<SchemaTargetModule>('INVENTARIO');
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldName, setFieldName] = useState('');
  const [fieldType, setFieldType] = useState<SchemaFieldType>('TEXTO');
  const [options, setOptions] = useState('');
  const [defaultValue, setDefaultValue] = useState('');
  const [required, setRequired] = useState(false);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Preview State
  const [previewValue, setPreviewValue] = useState<any>('');

  useEffect(() => {
    const unsub = SchemaService.subscribeSchemas((list) => {
      setSchemas(list);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Auto-generate identifier slug from label
  const handleLabelChange = (text: string) => {
    setFieldLabel(text);
    if (!fieldName || fieldName === slugify(fieldLabel)) {
      setFieldName(slugify(text));
    }
  };

  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[\s\W-]+/g, '_')
      .replace(/^_+|_+$/g, '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldLabel.trim()) {
      notify('Debe ingresar una etiqueta para el campo.', 'error');
      return;
    }

    const cleanSlug = fieldName.trim() || slugify(fieldLabel);
    if (!cleanSlug) {
      notify('Debe definir un identificador de campo válido.', 'error');
      return;
    }

    if (SchemaService.isReservedFieldName(cleanSlug)) {
      notify(`El identificador "${cleanSlug}" es una palabra reservada o vector de prototipo prohibido.`, 'error');
      return;
    }

    if (fieldType === 'SELECTOR' && !options.trim()) {
      notify('Para campos de tipo SELECTOR debe especificar las opciones separadas por comas.', 'error');
      return;
    }

    setIsSubmitting(true);
    const newField: DynamicSchemaField = {
      id: `schema_${targetModule.toLowerCase()}_${cleanSlug}_${Date.now()}`,
      targetModule,
      fieldName: cleanSlug,
      fieldLabel: fieldLabel.trim(),
      fieldType,
      options: fieldType === 'SELECTOR' ? options.trim() : undefined,
      defaultValue: defaultValue.trim() || undefined,
      required,
      description: description.trim() || undefined,
      createdAt: new Date().toISOString(),
      createdBy: userProfile?.uid || 'superadmin',
    };

    try {
      const ok = await SchemaService.saveSchemaField(newField);
      setIsSubmitting(false);

      if (ok) {
        notify(`Campo dinámico "${newField.fieldLabel}" inyectado en ${targetModule} con éxito.`);
        // Reset form
        setFieldLabel('');
        setFieldName('');
        setOptions('');
        setDefaultValue('');
        setDescription('');
        setRequired(false);
        setPreviewValue('');
      } else {
        notify('Error al persistir el esquema.', 'error');
      }
    } catch (err: any) {
      setIsSubmitting(false);
      notify(err.message || 'Error al validar o guardar el esquema dinámico.', 'error');
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (confirm(`¿Confirma eliminar el campo dinámico "${label}"? No se solicitarán datos adicionales a los usuarios en ese módulo.`)) {
      await SchemaService.deleteSchemaField(id);
      notify(`Campo dinámico "${label}" eliminado del motor.`);
    }
  };

  // Access Guard
  if (!isSuperAdmin) {
    return (
      <div className="min-h-[500px] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-purple-500/30 rounded-3xl p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-purple-950/80 border border-purple-500/40 text-purple-400 mx-auto flex items-center justify-center">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-white tracking-tight">
            Acceso Exclusivo de Superadministrador
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            El <strong>SchemaBuilder (Constructor de Esquemas Dinámicos)</strong> permite alterar la arquitectura de datos del ERP en tiempo real y requiere el rol superior <code className="font-mono text-purple-400">SUPERADMIN</code>.
          </p>
        </div>
      </div>
    );
  }

  const filteredSchemas = schemas.filter(
    (s) => filterModule === 'TODOS' || s.targetModule === filterModule
  );

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-5 right-5 z-50 animate-fadeIn">
          <div
            className={`px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-semibold border ${
              notification.type === 'success'
                ? 'bg-purple-950 border-purple-500 text-purple-200'
                : 'bg-red-950 border-red-500 text-red-200'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{notification.text}</span>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-purple-950/80 border border-purple-700/60 flex items-center justify-center text-purple-400">
              <Layers className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Constructor de Esquemas Dinámicos (Dynamic Schema Engine)
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-purple-950 text-purple-300 border border-purple-700">
              SuperAdmin Spec
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Inyecte nuevos módulos y campos de datos en las interfaces del ERP en caliente sin requerir recompilación de código fuente.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-2xl font-mono text-xs text-slate-300">
          <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
          <span>Esquemas Activos: <strong>{schemas.length}</strong></span>
        </div>
      </div>

      {/* Main Grid: Form + Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ==================================================== */}
        {/* FORMULARIO DE INYECCIÓN DE ESQUEMA */}
        {/* ==================================================== */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-purple-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                Definir Nuevo Campo Dinámico
              </h3>
            </div>
            <span className="text-[10px] font-mono bg-purple-950 text-purple-300 px-2 py-0.5 rounded">
              Colección: system_schemas
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Módulo Destino */}
              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-semibold">
                  Módulo de la Plataforma Destino
                </label>
                <select
                  value={targetModule}
                  onChange={(e) => setTargetModule(e.target.value as SchemaTargetModule)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                >
                  <option value="INVENTARIO">Inventario & Insumos</option>
                  <option value="TRAZABILIDAD">Trazabilidad Biológica (Lotes)</option>
                  <option value="FINANZAS">Finanzas & Facturación</option>
                  <option value="GENERAL">General (Todas las Secciones)</option>
                </select>
                <p className="text-[10px] text-slate-500">Sección donde se insertará automáticamente el campo.</p>
              </div>

              {/* Tipo de Dato */}
              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-semibold">
                  Tipo de Dato
                </label>
                <select
                  value={fieldType}
                  onChange={(e) => setFieldType(e.target.value as SchemaFieldType)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500 font-mono"
                >
                  <option value="TEXTO">Texto (String)</option>
                  <option value="NUMERO">Número (Float / Int)</option>
                  <option value="SELECTOR">Selector (Dropdown Options)</option>
                  <option value="BOOLEANO">Booleano (Sí / No Toggle)</option>
                </select>
                <p className="text-[10px] text-slate-500">Control de interfaz que se renderizará.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Etiqueta del Campo */}
              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-semibold">
                  Etiqueta Visible (Label)
                </label>
                <input
                  type="text"
                  required
                  value={fieldLabel}
                  placeholder="Ej. Temperatura de Almacén (°C)"
                  onChange={(e) => handleLabelChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                />
              </div>

              {/* Nombre Interno / Slug */}
              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-semibold flex items-center justify-between">
                  <span>Identificador JSON (Key)</span>
                  <span className="text-[10px] text-slate-500 font-mono">auto-generado</span>
                </label>
                <input
                  type="text"
                  required
                  value={fieldName}
                  placeholder="temperatura_almacen"
                  onChange={(e) => setFieldName(slugify(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-purple-300 font-mono outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {/* Opciones si es SELECTOR */}
            {fieldType === 'SELECTOR' && (
              <div className="space-y-1 p-3 bg-purple-950/20 border border-purple-900/40 rounded-2xl animate-fadeIn">
                <label className="text-xs text-purple-300 font-semibold">
                  Opciones del Selector (separadas por comas)
                </label>
                <input
                  type="text"
                  required
                  value={options}
                  placeholder="Opción 1, Opción 2, Opción 3"
                  onChange={(e) => setOptions(e.target.value)}
                  className="w-full bg-slate-950 border border-purple-700 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
                <p className="text-[10px] text-slate-400">
                  Ejemplo: <code>Galpón A, Galpón B, Silo Central</code>
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Valor por Defecto */}
              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-semibold">
                  Valor Inicial por Defecto
                </label>
                <input
                  type="text"
                  value={defaultValue}
                  placeholder="Opcional"
                  onChange={(e) => setDefaultValue(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                />
              </div>

              {/* Obligatoriedad */}
              <div className="space-y-1 flex flex-col justify-end">
                <label className="flex items-center gap-2 p-2 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={required}
                    onChange={(e) => setRequired(e.target.checked)}
                    className="w-4 h-4 rounded text-purple-600 bg-slate-900 border-slate-700 focus:ring-purple-500"
                  />
                  <span className="text-xs text-slate-300 font-medium">
                    Campo Obligatorio (Required)
                  </span>
                </label>
              </div>
            </div>

            {/* Descripción / Ayuda */}
            <div className="space-y-1">
              <label className="text-xs text-slate-300 font-semibold">
                Descripción / Tooltip de Instrucción para Operarios
              </label>
              <input
                type="text"
                value={description}
                placeholder="Instrucción de captura en campo..."
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none focus:border-purple-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-2xl transition shadow-lg shadow-purple-950 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{isSubmitting ? 'Inyectando Esquema en Firestore...' : 'Guardar e Inyectar en Interfaces'}</span>
            </button>
          </form>
        </div>

        {/* ==================================================== */}
        {/* PREVIEW INTERACTIVO EN TIEMPO REAL */}
        {/* ==================================================== */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                  Vista Previa en Vivo (Live Renderer)
                </h3>
              </div>
              <span className="text-[10px] font-mono bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded">
                Simulación UI
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Así es como los operarios del módulo <strong>{targetModule}</strong> verán este campo adicional en sus formularios sin necesidad de recompilación:
            </p>

            <div className="p-4 bg-slate-950 border border-purple-800/40 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-200 flex items-center gap-1">
                  <span>{fieldLabel || 'Título del Campo'}</span>
                  {required && <span className="text-red-400 font-bold">*</span>}
                </label>
                {description && (
                  <span className="text-slate-500 cursor-help" title={description}>
                    <HelpCircle className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>

              {fieldType === 'TEXTO' && (
                <input
                  type="text"
                  value={previewValue}
                  placeholder={defaultValue || 'Texto de ejemplo...'}
                  onChange={(e) => setPreviewValue(e.target.value)}
                  className="w-full bg-slate-900 border border-purple-700/60 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              )}

              {fieldType === 'NUMERO' && (
                <input
                  type="number"
                  value={previewValue}
                  placeholder={defaultValue || '0.00'}
                  onChange={(e) => setPreviewValue(e.target.value)}
                  className="w-full bg-slate-900 border border-purple-700/60 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none"
                />
              )}

              {fieldType === 'SELECTOR' && (
                <select
                  value={previewValue}
                  onChange={(e) => setPreviewValue(e.target.value)}
                  className="w-full bg-slate-900 border border-purple-700/60 rounded-xl px-3 py-2 text-xs text-white outline-none"
                >
                  <option value="">-- Seleccionar --</option>
                  {(options || 'Opción A, Opción B, Opción C')
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

              {fieldType === 'BOOLEANO' && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={Boolean(previewValue)}
                    onChange={(e) => setPreviewValue(e.target.checked)}
                    className="w-4 h-4 rounded text-purple-600 bg-slate-900 border-purple-700 focus:ring-purple-500"
                  />
                  <span className="text-xs text-slate-300">
                    {previewValue ? 'Habilitado (true)' : 'Deshabilitado (false)'}
                  </span>
                </label>
              )}

              <div className="pt-2 text-[10px] text-slate-500 font-mono flex items-center justify-between border-t border-slate-900">
                <span>Key: {fieldName || 'campo_id'}</span>
                <span>Tipo: {fieldType}</span>
              </div>
            </div>
          </div>

          <div className="p-3 bg-purple-950/20 border border-purple-900/40 rounded-2xl text-[11px] text-purple-300 flex items-start gap-2">
            <Sparkles className="w-4 h-4 shrink-0 text-purple-400 mt-0.5" />
            <span>
              La inyección se realiza de forma síncrona en la capa React y se replica automáticamente en el almacenamiento IndexedDB para soporte 100% Offline-First.
            </span>
          </div>
        </div>
      </div>

      {/* ==================================================== */}
      {/* LISTADO DE ESQUEMAS ACTIVOS CON FILTROS */}
      {/* ==================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-purple-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              Catálogo de Campos Dinámicos en Producción
            </h3>
          </div>

          {/* Filtros de Módulo */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
            {['TODOS', 'INVENTARIO', 'TRAZABILIDAD', 'FINANZAS', 'GENERAL'].map((mod) => (
              <button
                key={mod}
                onClick={() => setFilterModule(mod)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-mono transition ${
                  filterModule === mod
                    ? 'bg-purple-600 text-white font-bold'
                    : 'bg-slate-950 text-slate-400 hover:bg-slate-800'
                }`}
              >
                {mod}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 font-mono text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
            <span>Sincronizando esquemas de Cloud Firestore...</span>
          </div>
        ) : filteredSchemas.length === 0 ? (
          <div className="py-12 text-center text-slate-500 font-mono text-xs italic">
            No se han registrado campos dinámicos para el módulo seleccionado.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSchemas.map((schema) => (
              <div
                key={schema.id}
                className="p-4 bg-slate-950 border border-slate-800 hover:border-purple-800/60 rounded-2xl space-y-2 transition flex flex-col justify-between"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 font-bold uppercase">
                      {schema.targetModule}
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                      {schema.fieldType}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                    {schema.fieldLabel}
                    {schema.required && (
                      <span className="text-red-400 font-bold text-xs" title="Obligatorio">*</span>
                    )}
                  </h4>

                  <div className="text-[11px] font-mono text-purple-400/80">
                    key: <code>{schema.fieldName}</code>
                  </div>

                  {schema.description && (
                    <p className="text-xs text-slate-400 leading-snug">
                      {schema.description}
                    </p>
                  )}

                  {schema.fieldType === 'SELECTOR' && schema.options && (
                    <div className="text-[10px] text-slate-400 bg-slate-900 p-2 rounded-xl border border-slate-800">
                      <span className="font-semibold text-slate-300">Opciones: </span>
                      {schema.options}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-900 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <span>Creado: {schema.createdAt.split('T')[0]}</span>
                  <button
                    onClick={() => handleDelete(schema.id, schema.fieldLabel)}
                    className="p-1.5 rounded-lg bg-red-950/60 hover:bg-red-900 text-red-300 transition"
                    title="Eliminar campo dinámico"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
