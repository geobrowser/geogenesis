import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Effect, Either, Schema } from 'effect';

import { ID } from '~/core/id';
import { getBatchEntities, getProperties, getProperty, getSpace } from '~/core/io/queries';
import { queryClient } from '~/core/query-client';
import { E } from '~/core/sync/orm';
import { store } from '~/core/sync/use-sync-engine';
import { OmitStrict, Property } from '~/core/types';
import { FilterableValueType } from '~/core/value-types';

export type Filter = {
  columnId: string;
  columnName: string | null;
  valueType: FilterableValueType;
  value: string;
  valueName: string | null;
  isBacklink?: boolean;
  relationValueTypes?: { id: string; name: string | null }[];
  typesRelationSpaceId?: string | null;
};

export type FilterMode = 'AND' | 'OR';

/**
 * We support two types of filters, either a filter on a set of entities,
 * or a filter on a specific entity. These each have different filter
 * semantics.
 *
 * e.g.,
 * attribute: SystemIds.TYPES_PROPERTY, is: SystemIds.PERSON_TYPE
 * The above returns all entities that are type: Person
 *
 * entity: '1234', relationType: SystemIds.TYPES_PROPERTY
 * The above returns all the type relations for entity 1234
 *
 * The latter is basically a "Relations View" on an entity where the latter
 * is a query across the knowledge graph data set.
 */
const PropertyFilter = Schema.Struct({
  property: Schema.String,
  is: Schema.String,
});

type PropertyFilter = Schema.Schema.Type<typeof PropertyFilter>;

const FilterString = Schema.Struct({
  /** Legacy global mode. Read-only compatibility for existing data blocks. */
  mode: Schema.optional(Schema.Literal('AND', 'OR')),
  /** Per-property modes. Missing entries default to AND. */
  modes: Schema.optional(
    Schema.Record({
      key: Schema.String,
      value: Schema.Literal('AND', 'OR'),
    })
  ),
  spaceId: Schema.optional(
    Schema.Struct({
      in: Schema.Array(Schema.String),
    })
  ),
  filter: Schema.optional(
    Schema.Record({
      key: Schema.String,
      value: Schema.Union(
        // Property filter (single value; optional `space` for Types-in-space)
        Schema.Struct({
          is: Schema.String,
          space: Schema.optional(Schema.String),
        }),
        // Property filter (multiple values for OR)
        Schema.Struct({
          in: Schema.Array(Schema.String),
        }),
        // Entity filter
        Schema.Struct({
          fromEntity: Schema.Struct({
            is: Schema.String,
          }),
          type: Schema.Struct({
            is: Schema.String,
          }),
        }),
        // Relation type filter
        Schema.Struct({
          type: Schema.Struct({
            is: Schema.String,
          }),
        })
      ),
    })
  ),
});

export type FilterString = Schema.Schema.Type<typeof FilterString>;

const FilterMap = Schema.mutable(
  Schema.Record({
    key: Schema.String,
    value: Schema.Union(
      Schema.Struct({
        is: Schema.String,
        space: Schema.optional(Schema.String),
      }),
      Schema.Struct({
        in: Schema.mutable(Schema.Array(Schema.String)),
      }),
      Schema.Struct({
        fromEntity: Schema.Struct({
          is: Schema.String,
        }),
        type: Schema.Struct({
          is: Schema.String,
        }),
      }),
      Schema.Struct({
        type: Schema.Struct({
          is: Schema.String,
        }),
      })
    ),
  })
);

type FilterMap = Schema.Schema.Type<typeof FilterMap>;

export type ModesByColumn = Record<string, FilterMode>;

export function toGeoFilterState(
  filters: OmitStrict<Filter, 'valueName'>[],
  modesByColumn: ModesByColumn = {}
): string {
  const spaces = filters.filter(f => ID.equals(f.columnId, SystemIds.SPACE_FILTER)).map(f => f.value);

  const filterMap: FilterMap = {};

  filters
    .filter(f => !ID.equals(f.columnId, SystemIds.SPACE_FILTER))
    .forEach(f => {
      if (f.isBacklink || f.columnName === 'Backlink') {
        filterMap['_relation'] = {
          fromEntity: { is: f.value },
          type: { is: f.columnId },
        };
      } else {
        const existing = filterMap[f.columnId];
        if (existing && 'is' in existing) {
          // Convert single value to multi-value (OR)
          filterMap[f.columnId] = { in: [existing.is, f.value] };
        } else if (existing && 'in' in existing) {
          // Append to existing multi-value
          existing.in.push(f.value);
        } else if (ID.equals(f.columnId, SystemIds.TYPES_PROPERTY) && f.typesRelationSpaceId) {
          filterMap[f.columnId] = { is: f.value, space: f.typesRelationSpaceId };
        } else {
          filterMap[f.columnId] = { is: f.value };
        }
      }
    });

  const presentColumnIds = new Set(filters.map(filter => filter.columnId));
  const persistedModes: ModesByColumn = {};

  for (const [columnId, mode] of Object.entries(modesByColumn)) {
    if (mode === 'OR' && presentColumnIds.has(columnId)) {
      persistedModes[columnId] = mode;
    }
  }

  const filter: FilterString = {
    // Always emit `modes`, including when empty. Its presence distinguishes the
    // per-property format from legacy payloads whose absent global mode meant AND.
    modes: persistedModes,
    ...(spaces.length > 0 && { spaceId: { in: spaces } }),
    ...(Object.keys(filterMap).length > 0 && { filter: filterMap }),
  };

  const maybeEncoded = Schema.encodeUnknownEither(FilterString)(filter);

  return Either.match(maybeEncoded, {
    onLeft: error => {
      console.info('Error encoding filter string, defaulting to empty filter string', { filters, filter, error });
      return '';
    },
    onRight: value => {
      return JSON.stringify(value);
    },
  });
}

export type FilterStateResult = {
  filters: Filter[];
  modesByColumn: ModesByColumn;
};

function resolveModesByColumn(value: FilterString): ModesByColumn {
  if (value.modes !== undefined) {
    return { ...value.modes };
  }

  const modesByColumn: ModesByColumn = {};

  // The old global mode was applied inside every property group. Fan OR out
  // to those groups so existing blocks retain their behavior after parsing.
  if (value.mode === 'OR' && value.filter) {
    for (const [columnId, filterValue] of Object.entries(value.filter)) {
      // Keys here must match the `columnId` the parser assigns to the same
      // filter (a `_relation` entry is parsed with columnId = type.is), since
      // `modesByColumn` is a raw object lookup. A mismatch would silently
      // drop a migrated OR back to AND.
      const resolvedColumnId = columnId === '_relation' && 'type' in filterValue ? filterValue.type.is : columnId;
      modesByColumn[resolvedColumnId] = 'OR';
    }
  }

  // Multi-space is always OR in the where-builder regardless of mode, so this
  // entry is redundant for querying. It is kept so a migrated legacy payload
  // becomes self-describing on its next write instead of relying on that
  // special case.
  if ((value.spaceId?.in.length ?? 0) > 1) {
    modesByColumn[SystemIds.SPACE_FILTER] = 'OR';
  }

  return modesByColumn;
}

/**
 * Synchronously parse filter string into filters with IDs only (no display names).
 * Enough to build WHERE conditions without network calls.
 */
export function parseFiltersSync(filterString: string | null): FilterStateResult {
  if (!filterString) {
    return { filters: [], modesByColumn: {} };
  }

  let where: unknown;
  try {
    where = JSON.parse(filterString);
  } catch {
    return { filters: [], modesByColumn: {} };
  }

  const decoded = Schema.decodeUnknownEither(FilterString)(where);

  const result = Either.match(decoded, {
    onLeft: error => {
      console.warn('Skipping invalid filter format, no filter will be applied:', error);
      return null;
    },
    onRight: value => {
      const filters: Filter[] = [];

      if (value.spaceId?.in) {
        for (const spaceId of value.spaceId.in) {
          filters.push({
            columnId: SystemIds.SPACE_FILTER,
            columnName: null,
            valueType: 'RELATION',
            value: spaceId,
            valueName: null,
          });
        }
      }

      if (value.filter) {
        for (const [key, filterValue] of Object.entries(value.filter)) {
          if (key === '_relation' && 'fromEntity' in filterValue && 'type' in filterValue) {
            filters.push({
              columnId: filterValue.type.is,
              columnName: null,
              valueType: 'RELATION',
              value: filterValue.fromEntity.is,
              valueName: null,
              isBacklink: true,
            });
          } else if (key === '_relation' && 'type' in filterValue && !('fromEntity' in filterValue)) {
            filters.push({
              columnId: filterValue.type.is,
              columnName: null,
              valueType: 'RELATION',
              value: filterValue.type.is,
              valueName: null,
            });
          } else if ('in' in filterValue) {
            for (const v of filterValue.in) {
              filters.push({
                columnId: key,
                columnName: null,
                valueType: 'RELATION',
                value: v,
                valueName: null,
              });
            }
          } else if ('is' in filterValue) {
            const typed = filterValue as { is: string; space?: string };
            filters.push({
              columnId: key,
              columnName: null,
              valueType: 'RELATION',
              value: typed.is,
              valueName: null,
              ...(ID.equals(key, SystemIds.TYPES_PROPERTY) && typed.space ? { typesRelationSpaceId: typed.space } : {}),
            });
          }
        }
      }

      return {
        filters,
        modesByColumn: resolveModesByColumn(value),
      };
    },
  });

  return result ?? { filters: [], modesByColumn: {} };
}

export async function fromGeoFilterString(filterString: string | null): Promise<FilterStateResult> {
  if (!filterString) {
    return { filters: [], modesByColumn: {} };
  }

  const where = JSON.parse(filterString);
  const decoded = Schema.decodeUnknownEither(FilterString)(where);

  const filtersFromString = Either.match(decoded, {
    onLeft: error => {
      console.warn('Skipping invalid filter format, no filter will be applied:', error);
      return null;
    },
    onRight: value => {
      let entity = undefined;
      const filters: Array<{ property: string; is: string }> = [];

      if (value.filter) {
        Object.entries(value.filter).forEach(([key, filterValue]) => {
          // Entity filter
          if (key === '_relation' && 'fromEntity' in filterValue && 'type' in filterValue) {
            entity = {
              fromEntity: filterValue.fromEntity.is,
              typeOf: filterValue.type.is,
            };
            // Relation type filter
          } else if (key === '_relation' && 'type' in filterValue && !('fromEntity' in filterValue)) {
            filters.push({
              property: filterValue.type.is,
              is: filterValue.type.is,
            });
            // Property filter (multiple values for OR)
          } else if ('in' in filterValue) {
            for (const value of filterValue.in) {
              filters.push({
                property: key,
                is: value,
              });
            }
            // Property filter (single value)
          } else if ('is' in filterValue) {
            filters.push({
              property: key,
              is: filterValue.is,
            });
          }
        });
      }

      return {
        modesByColumn: resolveModesByColumn(value),
        spaces: value.spaceId?.in ?? [],
        filters,
        entity: entity as { fromEntity: string; typeOf: string } | undefined,
      };
    },
  });

  if (!filtersFromString) {
    return { filters: [], modesByColumn: {} };
  }

  const modesByColumn = filtersFromString.modesByColumn;

  const filters: Filter[] = [];

  const unresolvedSpaceFilters = filtersFromString.spaces
    ? Promise.all(
        filtersFromString.spaces.map(async (spaceId): Promise<Filter> => {
          const spaceName = await getSpaceName(spaceId);

          return {
            columnId: SystemIds.SPACE_FILTER,
            columnName: 'Space',
            valueType: 'RELATION',
            value: spaceId,
            valueName: spaceName,
          };
        })
      )
    : [];

  const unresolvedEntityFilter = filtersFromString.entity
    ? getResolvedEntityFilter(filtersFromString.entity.fromEntity, filtersFromString.entity.typeOf)
    : null;

  const unresolvedAttributeFilters = Promise.all(
    filtersFromString.filters.map(async filter => {
      return await getResolvedFilter(filter);
    })
  );

  const [spaceFilters, attributeFilters, entityFilter] = await Promise.all([
    unresolvedSpaceFilters,
    unresolvedAttributeFilters,
    unresolvedEntityFilter,
  ]);

  filters.push(...spaceFilters);

  filters.push(...attributeFilters);

  if (entityFilter) {
    filters.push(entityFilter);
  }

  return { filters, modesByColumn };
}

async function getSpaceName(spaceId: string) {
  const space = await Effect.runPromise(getSpace(spaceId));
  return space?.entity.name ?? null;
}

async function getResolvedEntityFilter(entityId: string, typeId: string): Promise<Filter> {
  const [fromEntity] = await Promise.all([
    E.findOne({ store, cache: queryClient, id: entityId }),
    E.findOne({ store, cache: queryClient, id: typeId }),
  ]);

  return {
    columnId: typeId,
    columnName: 'Backlink',
    valueType: 'RELATION',
    value: entityId,
    valueName: fromEntity?.name ?? null,
    isBacklink: true,
  };
}

async function getResolvedFilter(filter: PropertyFilter): Promise<Filter> {
  let property: Property | null = null;

  try {
    const remoteProperty = await Effect.runPromise(getProperty(filter.property));
    property = remoteProperty;
  } catch (error) {
    console.warn('Failed to fetch remote property', filter.property, error);
  }

  const valueType: FilterableValueType = property?.dataType ?? 'RELATION';

  const [maybePropertyEntity, maybeValueEntity] = await Promise.all([
    E.findOne({ store, cache: queryClient, id: filter.property }),
    valueType === 'RELATION' ? E.findOne({ store, cache: queryClient, id: filter.is }) : undefined,
  ]);

  return {
    columnId: filter.property,
    columnName: maybePropertyEntity?.name ?? null,
    value: filter.is,
    valueName: maybeValueEntity?.name ?? null,
    valueType,
  };
}

/** Batch-resolve display names for filters parsed by parseFiltersSync. */
export async function resolveFilterDisplayNames(filters: Filter[]): Promise<Filter[]> {
  if (filters.length === 0) return [];

  const spaceIds = new Set<string>();
  const propertyIds = new Set<string>();
  // Entity IDs we can determine without knowing property data types
  const knownEntityIds = new Set<string>();

  for (const f of filters) {
    if (ID.equals(f.columnId, SystemIds.SPACE_FILTER)) {
      spaceIds.add(f.value);
    } else if (f.isBacklink) {
      knownEntityIds.add(f.value);
      knownEntityIds.add(f.columnId);
    } else if (ID.equals(f.columnId, SystemIds.TYPES_PROPERTY)) {
      knownEntityIds.add(f.value);
    } else {
      propertyIds.add(f.columnId);
      knownEntityIds.add(f.columnId);
    }
  }

  // Fetch properties and spaces first so we know which filter values are entity IDs
  const [properties, spaces] = await Promise.all([
    propertyIds.size > 0 ? Effect.runPromise(getProperties([...propertyIds])) : Promise.resolve([]),
    spaceIds.size > 0 ? Promise.all([...spaceIds].map(id => Effect.runPromise(getSpace(id)))) : Promise.resolve([]),
  ]);

  const propertyMap = new Map(properties.map(p => [p.id, p]));

  // Now that we know property data types, collect value entity IDs only for RELATION filters
  const entityIds = new Set(knownEntityIds);
  for (const f of filters) {
    if (
      ID.equals(f.columnId, SystemIds.SPACE_FILTER) ||
      f.isBacklink ||
      ID.equals(f.columnId, SystemIds.TYPES_PROPERTY)
    ) {
      continue;
    }
    const property = propertyMap.get(f.columnId);
    const valueType: FilterableValueType = property?.dataType ?? 'RELATION';
    if (valueType === 'RELATION') {
      entityIds.add(f.value);
    }
  }

  const entities = entityIds.size > 0 ? await Effect.runPromise(getBatchEntities([...entityIds])) : [];

  const entityMap = new Map(entities.map(e => [e.id, e]));
  const spaceMap = new Map(spaces.filter((s): s is NonNullable<typeof s> => s !== null).map(s => [s.id, s]));

  return filters.map(f => {
    if (ID.equals(f.columnId, SystemIds.SPACE_FILTER)) {
      const space = spaceMap.get(f.value);
      return {
        ...f,
        columnName: 'Space',
        valueName: space?.entity.name ?? null,
      };
    }

    if (f.isBacklink) {
      const fromEntity = entityMap.get(f.value);
      return {
        ...f,
        columnName: 'Backlink',
        valueName: fromEntity?.name ?? null,
      };
    }

    if (ID.equals(f.columnId, SystemIds.TYPES_PROPERTY)) {
      const valueEntity = entityMap.get(f.value);
      return {
        ...f,
        columnName: 'Types',
        valueName: valueEntity?.name ?? null,
      };
    }

    const property = propertyMap.get(f.columnId);
    const valueType: FilterableValueType = property?.dataType ?? 'RELATION';
    const propertyEntity = entityMap.get(f.columnId);
    const valueEntity = valueType === 'RELATION' ? entityMap.get(f.value) : undefined;

    return {
      ...f,
      columnName: propertyEntity?.name ?? null,
      valueName: valueEntity?.name ?? null,
      valueType,
    };
  });
}
