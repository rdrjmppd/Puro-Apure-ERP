/**
 * Puro Apure ERP - Motor de Esquemas Dinámicos (Dynamic Schema Engine)
 * Define las entidades y metadatos para la inyección de campos sin recompilación
 */

export type SchemaFieldType = 'TEXTO' | 'NUMERO' | 'SELECTOR' | 'BOOLEANO';

export type SchemaTargetModule = 'INVENTARIO' | 'TRAZABILIDAD' | 'FINANZAS' | 'GENERAL';

export interface DynamicSchemaField {
  id: string;
  targetModule: SchemaTargetModule;
  fieldName: string;
  fieldLabel: string;
  fieldType: SchemaFieldType;
  options?: string; // Opciones separadas por coma para SELECTOR
  required?: boolean;
  defaultValue?: string;
  description?: string;
  createdAt: string;
  createdBy: string;
}
