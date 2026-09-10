import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';
import type { WhereCondition } from '~/core/sync/experimental_query-layer';

import type { Filter, FilterMode, ModesByColumn } from './filters';

export function filterStateToWhere(filterState: Filter[], modesByColumn: ModesByColumn = {}): WhereCondition {
  if (filterState.length === 0) return {};
  if (filterState.length === 1) return buildSingleFilterWhere(filterState[0]);

  // Group filters by property AND direction (see filterGroupKey). Each group
  // chooses its own mode; distinct groups are always combined with AND by
  // mergeWhereConditions.
  const groups = new Map<string, Filter[]>();
  for (const filter of filterState) {
    const key = filterGroupKey(filter);
    const existing = groups.get(key);
    if (existing) existing.push(filter);
    else groups.set(key, [filter]);
  }

  const groupConditions: WhereCondition[] = [];
  for (const [, filters] of groups) {
    const columnId = filters[0].columnId;
    // A backlink group has no mode entry (singleton in persisted state); if
    // several ever coexist in memory, each stays required.
    const mode: FilterMode = isBacklinkFilter(filters[0]) ? 'AND' : (modesByColumn[columnId] ?? 'AND');
    if (filters.length === 1) {
      groupConditions.push(buildSingleFilterWhere(filters[0]));
    } else if (ID.equals(columnId, SystemIds.SPACE_FILTER)) {
      // Multiple spaces are always OR, whatever the mode says: an entity lives
      // in one space, so "in A and in B" is an empty set nobody asks for.
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

/**
 * A backlink filter matches rows the value points AT, not rows carrying the
 * value. Both encodings appear in stored filters (the flag, and the legacy
 * columnName marker) — every layer must detect them identically or a filter's
 * direction silently inverts.
 */
export function isBacklinkFilter(filter: Filter): boolean {
  return Boolean(filter.isBacklink) || filter.columnName === 'Backlink';
}

/**
 * Identity of a filter's logical group. Direction is part of the key: a
 * forward filter ("rows having Subtopics → X") and a backlink filter ("rows
 * X lists via Subtopics") on the same property are DIFFERENT constraints and
 * must never share one AND/OR mode — coalescing them meant a multi-value OR
 * on the forward side silently demoted the backlink from a requirement to an
 * alternative. Distinct groups are always ANDed, so splitting yields
 * `backlink AND (v1 OR v2)` with no format change: the persisted format
 * carries at most one backlink per block (a single `_relation` entry), so a
 * backlink group is a singleton and needs no mode entry of its own.
 */
export function filterGroupKey(filter: Filter): string {
  return isBacklinkFilter(filter) ? `backlink:${filter.columnId}` : filter.columnId;
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
    if (isBacklinkFilter(filter)) {
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
