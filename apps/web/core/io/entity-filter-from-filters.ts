import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import type { Filter } from '~/core/blocks/data/filters';
import type { DataType } from '~/core/types';

/**
 * Translate a table's active `Filter[]` into an `EntityFilter` suitable for
 * passing as `backlinks.some.fromEntity` (or any other nested entity filter)
 * on the GraphQL API. Each filter becomes one clause; multiple filters on
 * the same column OR together (same-column-multi-value); multiple columns
 * AND together.
 *
 * Translation strategy per filter kind, picking the most index-friendly
 * shape the schema supports:
 *   - Types           → `typeIds: { overlaps: [...] }` (GIN index on array)
 *   - Space           → `spaceIds: { overlaps: [...] }` (same)
 *   - Relation        → `relations: { some: { typeId, toEntityId } }`
 *   - Primitive value → `values: { some: { propertyId, <field>: { is } } }`
 */
export function buildEntityFilter(filters: Filter[]): Record<string, unknown> | undefined {
  if (!filters.length) return undefined;

  const byColumn = new Map<string, Filter[]>();
  for (const f of filters) {
    const bucket = byColumn.get(f.columnId);
    if (bucket) bucket.push(f);
    else byColumn.set(f.columnId, [f]);
  }

  const clauses: Record<string, unknown>[] = [];
  for (const [, group] of byColumn) {
    const clause = columnClause(group);
    if (clause) clauses.push(clause);
  }

  if (clauses.length === 0) return undefined;
  if (clauses.length === 1) return clauses[0];
  return { and: clauses };
}

function columnClause(group: Filter[]): Record<string, unknown> | undefined {
  const { columnId, valueType, isBacklink } = group[0];
  const values = group.map(f => f.value);

  if (columnId === SystemIds.TYPES_PROPERTY) {
    return { typeIds: { overlaps: values } };
  }

  if (columnId === SystemIds.SPACE_FILTER) {
    return { spaceIds: { overlaps: values } };
  }

  if (valueType === 'RELATION') {
    // "Entity has a (forward|backward) relation of this type pointing at one
    // of these target ids."
    const connection = isBacklink ? 'backlinks' : 'relations';
    const relationIdField = isBacklink ? 'fromEntityId' : 'toEntityId';
    const oneOf = (value: string) => ({
      [connection]: {
        some: {
          typeId: { is: columnId },
          [relationIdField]: { is: value },
        },
      },
    });
    if (values.length === 1) return oneOf(values[0]);
    return { or: values.map(oneOf) };
  }

  const field = primitiveFieldForDataType(valueType);
  if (!field) return undefined;

  const oneOf = (value: string) => ({
    values: {
      some: {
        propertyId: { is: columnId },
        [field]: { is: coerceValueForDataType(value, valueType) },
      },
    },
  });
  if (values.length === 1) return oneOf(values[0]);
  return { or: values.map(oneOf) };
}

function primitiveFieldForDataType(dt: DataType | 'RELATION'): string | undefined {
  switch (dt) {
    case 'TEXT':
      return 'text';
    case 'INTEGER':
      return 'integer';
    case 'FLOAT':
      return 'float';
    case 'DECIMAL':
      return 'decimal';
    case 'BOOLEAN':
      return 'boolean';
    case 'DATE':
      return 'date';
    case 'DATETIME':
      return 'datetime';
    case 'TIME':
      return 'time';
    case 'POINT':
      return 'point';
    case 'SCHEDULE':
      return 'schedule';
    case 'BYTES':
      return 'bytes';
    default:
      return undefined;
  }
}

function coerceValueForDataType(raw: string, dt: DataType | 'RELATION'): unknown {
  switch (dt) {
    case 'INTEGER':
    case 'FLOAT':
      return Number(raw);
    case 'BOOLEAN':
      return raw === 'true';
    // DECIMAL stays as a string to preserve precision; dates and everything
    // else pass through unchanged.
    default:
      return raw;
  }
}