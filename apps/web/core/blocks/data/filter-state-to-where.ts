import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';
import type { WhereCondition } from '~/core/sync/experimental_query-layer';

import type { Filter, FilterMode, ModesByColumn } from './filters';

export function filterStateToWhere(filterState: Filter[], modesByColumn: ModesByColumn = {}): WhereCondition {
  if (filterState.length === 0) return {};
  if (filterState.length === 1) return buildSingleFilterWhere(filterState[0]);

  // Group filters by property. Each group chooses its own mode; distinct
  // properties are always combined with AND by mergeWhereConditions.
  const groups = new Map<string, Filter[]>();
  for (const filter of filterState) {
    const existing = groups.get(filter.columnId);
    if (existing) existing.push(filter);
    else groups.set(filter.columnId, [filter]);
  }

  const groupConditions: WhereCondition[] = [];
  for (const [columnId, filters] of groups) {
    const mode: FilterMode = modesByColumn[columnId] ?? 'AND';
    if (filters.length === 1) {
      groupConditions.push(buildSingleFilterWhere(filters[0]));
    } else if (ID.equals(columnId, SystemIds.SPACE_FILTER) && mode === 'OR') {
      groupConditions.push(buildSpaceFiltersWhere(filters));
    } else if (mode === 'OR') {
      groupConditions.push(buildOrWhere(filters));
    } else {
      groupConditions.push(buildAndWhere(filters));
    }
  }

  if (groupConditions.length === 1) return groupConditions[0];

  // Flat merge keeps `spaces`/`types` at the top level so they get promoted
  // to fast top-level GraphQL query params instead of buried in a nested AND filter.
  return mergeWhereConditions(groupConditions);
}

function mergeWhereConditions(conditions: WhereCondition[]): WhereCondition {
  // Logical groups must be explicit children of an outer AND. In addition to
  // preserving `(A or B) and (C or D)`, this avoids sibling AND/OR keys: the
  // local matcher short-circuits on logical keys while GraphQL combines fields.
  const plainConditions: WhereCondition[] = [];
  const logicalConditions: WhereCondition[] = [];

  for (const condition of conditions) {
    if (condition.AND) {
      logicalConditions.push(...condition.AND);
    } else if (condition.OR || condition.NOT) {
      logicalConditions.push(condition);
    } else {
      plainConditions.push(condition);
    }
  }

  const mergedPlain = mergePlainConditions(plainConditions);
  const combined = [...(Object.keys(mergedPlain).length > 0 ? [mergedPlain] : []), ...logicalConditions];

  if (combined.length === 0) return {};
  if (combined.length === 1) return combined[0];
  return { AND: combined };
}

function mergePlainConditions(conditions: WhereCondition[]): WhereCondition {
  const arrayKeys = new Set(['spaces', 'types', 'values', 'relations', 'backlinks']);
  const merged: WhereCondition = {};
  const unmerged: WhereCondition[] = [];

  for (const condition of conditions) {
    const keys = Object.keys(condition) as (keyof WhereCondition)[];
    if (keys.some(key => !arrayKeys.has(key) && key in merged)) {
      unmerged.push(condition);
      continue;
    }

    for (const key of keys) {
      if (arrayKeys.has(key)) {
        const existing = (merged as any)[key] as unknown[] | undefined;
        const incoming = (condition as any)[key] as unknown[];
        (merged as any)[key] = existing ? [...existing, ...incoming] : [...incoming];
      } else {
        (merged as any)[key] = (condition as any)[key];
      }
    }
  }

  if (unmerged.length === 0) return merged;
  return { AND: [merged, ...unmerged] };
}

function buildSingleFilterWhere(filter: Filter): WhereCondition {
  if (filter.valueType === 'TEXT') {
    if (ID.equals(filter.columnId, SystemIds.NAME_PROPERTY)) {
      return { name: { contains: filter.value } };
    }
    return {
      values: [{ propertyId: { equals: filter.columnId }, value: { contains: filter.value } }],
    };
  }

  if (filter.valueType === 'RELATION') {
    if (ID.equals(filter.columnId, SystemIds.SPACE_FILTER)) {
      return { spaces: [{ equals: filter.value }] };
    }
    if (ID.equals(filter.columnId, SystemIds.TYPES_PROPERTY)) {
      if (filter.typesRelationSpaceId) {
        return {
          relations: [
            {
              typeOf: { id: { equals: SystemIds.TYPES_PROPERTY } },
              toEntity: { id: { equals: filter.value } },
              space: { equals: filter.typesRelationSpaceId },
            },
          ],
        };
      }
      return { types: [{ id: { equals: filter.value } }] };
    }
    if (filter.isBacklink || filter.columnName === 'Backlink') {
      return {
        backlinks: [{ typeOf: { id: { equals: filter.columnId } }, fromEntity: { id: { equals: filter.value } } }],
      };
    }
    return {
      relations: [{ typeOf: { id: { equals: filter.columnId } }, toEntity: { id: { equals: filter.value } } }],
    };
  }

  return {};
}

/** Multiple SPACE_FILTER values combined with OR. */
function buildSpaceFiltersWhere(filters: Filter[]): WhereCondition {
  const ids = [...new Set(filters.map(filter => filter.value).filter(Boolean))];
  if (ids.length === 0) return {};
  if (ids.length === 1) {
    return buildSingleFilterWhere({ ...filters[0], value: ids[0] });
  }
  return {
    spaces: ids.map(id => ({ equals: id })),
  };
}

function buildOrWhere(filters: Filter[]): WhereCondition {
  return { OR: filters.map(filter => buildSingleFilterWhere(filter)) };
}

function buildAndWhere(filters: Filter[]): WhereCondition {
  // Each chip remains an independent clause so one entity must satisfy all
  // selected values for this property.
  return { AND: filters.map(filter => buildSingleFilterWhere(filter)) };
}
