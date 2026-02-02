import { SystemIds } from '@geoprotocol/geo-sdk';
import { Schema } from 'effect';
import { Effect, Either } from 'effect';

import { ID } from '~/core/id';
import { getProperty, getSpace } from '~/core/io/queries';
import { queryClient } from '~/core/query-client';
import { E } from '~/core/sync/orm';
import { store } from '~/core/sync/use-sync-engine';
import { OmitStrict } from '~/core/types';
import { Property } from '~/core/types';
import { FilterableValueType } from '~/core/value-types';

export type Filter = {
  columnId: string;
  columnName: string | null;
  valueType: FilterableValueType;
  value: string;
  valueName: string | null;
  relationValueTypes?: { id: string; name: string | null }[];
};

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
  spaceId: Schema.optional(
    Schema.Struct({
      in: Schema.Array(Schema.String),
    })
  ),
  filter: Schema.optional(
    Schema.Record({
      key: Schema.String,
      value: Schema.Union(
        // Property filter
        Schema.Struct({
          is: Schema.String,
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

export function toGeoFilterState(filters: OmitStrict<Filter, 'valueName'>[]): string {
  const spaces = filters.filter(f => ID.equals(f.columnId, SystemIds.SPACE_FILTER)).map(f => f.value);

  const filterMap: FilterMap = {};

  filters
    .filter(f => !ID.equals(f.columnId, SystemIds.SPACE_FILTER))
    .forEach(f => {
      if (f.columnName === 'Backlink') {
        filterMap['_relation'] = {
          fromEntity: { is: f.value },
          type: { is: f.columnId },
        };
      } else {
        filterMap[f.columnId] = { is: f.value };
      }
    });

  const filter: FilterString = {
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

export async function fromGeoFilterString(filterString: string | null): Promise<Filter[]> {
  if (!filterString) {
    return [];
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
            // Property filter
          } else if ('is' in filterValue) {
            filters.push({
              property: key,
              is: filterValue.is,
            });
          }
        });
      }

      return {
        spaces: value.spaceId?.in ?? [],
        filters,
        entity: entity as { fromEntity: string; typeOf: string } | undefined,
      };
    },
  });

  if (!filtersFromString) {
    console.log('No filters from string', filtersFromString);
    return [];
  }

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

  return filters;
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
