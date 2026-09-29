import type { Property } from '~/core/types';

import type { CoercionRule } from './coerce';
import type { ImportMapping } from './mapping-types';

/** Describe validated columns, never an optimistic pre-validation model summary. */
export function summarizeMapping(mapping: Pick<ImportMapping, 'typeName' | 'columns'>, nameColumn: string): string {
  const skipped = mapping.columns.filter(column => column.kind === 'skip').length;
  return `Rows map to ${mapping.typeName}, named by ${nameColumn}. ${mapping.columns.length - skipped} additional columns mapped; ${skipped} skipped.`;
}

const COERCIONS_BY_TYPE: Readonly<Record<string, readonly CoercionRule[]>> = {
  TEXT: ['text'],
  INTEGER: ['integer', 'integer:year'],
  FLOAT: ['float'],
  DECIMAL: ['decimal'],
  BOOLEAN: ['boolean'],
  DATE: ['date', 'date:dmy', 'date:mdy'],
  DATETIME: ['datetime'],
  TIME: ['time'],
};

export function coercionMatchesDataType(rule: string, dataType: string): boolean {
  return (COERCIONS_BY_TYPE[dataType] ?? []).includes(rule as CoercionRule);
}

export function unsupportedMediaMessage(renderableType: string | null | undefined): string | null {
  if (renderableType === 'IMAGE' || renderableType === 'VIDEO') {
    return `This column needs ${renderableType.toLowerCase()} uploads, which the assistant spreadsheet importer does not support. Import the other columns and attach media separately.`;
  }
  return null;
}

/** A persisted mapping is checked again against the ontology before any writes. */
export function validateMappingProperties(
  mapping: ImportMapping,
  getProperty: (
    id: string
  ) => (Pick<Property, 'id' | 'dataType'> & Partial<Pick<Property, 'renderableTypeStrict'>>) | null | undefined
): string | null {
  const values = new Set<string>();
  for (const column of mapping.columns) {
    if (column.kind === 'skip') continue;
    const property = getProperty(column.propertyId);
    if (!property) return `The property for ${column.propertyName} is no longer available. Preview the mapping again.`;
    const mediaError = unsupportedMediaMessage(property.renderableTypeStrict);
    if (mediaError) return `${column.propertyName}: ${mediaError}`;
    if (column.kind === 'relation') {
      if (property.dataType !== 'RELATION')
        return `${column.propertyName} is not a relation property. Preview the mapping again.`;
    } else {
      if (!coercionMatchesDataType(column.coercion, property.dataType)) {
        return `${column.propertyName} expects ${property.dataType}; this mapping uses ${column.coercion}. Preview the mapping again.`;
      }
      if (values.has(property.id))
        return `Multiple columns write ${column.propertyName}. Choose one source column before importing.`;
      values.add(property.id);
    }
  }
  return null;
}
