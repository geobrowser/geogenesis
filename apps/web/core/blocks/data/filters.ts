import { SystemIds } from '@graphprotocol/grc-20';
import { Schema } from 'effect';
import { Effect, Either } from 'effect';

import { getSpace } from '~/core/io/v2/queries';
import { queryClient } from '~/core/query-client';
import { E } from '~/core/sync/orm';
import { store } from '~/core/sync/use-sync-engine';
import { OmitStrict } from '~/core/types';
import { FilterableValueType } from '~/core/value-types';

import { Source } from './source';

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

// const Property = Schema.Union(PropertyFilter);

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
        })
      ),
    })
  ),
});

export type FilterString = Schema.Schema.Type<typeof FilterString>;

export function toGeoFilterState(filters: OmitStrict<Filter, 'valueName'>[], source: Source): string {
  let filter: FilterString | null = null;

  switch (source.type) {
    case 'RELATIONS':
      filter = {
        // where: {
        //   AND: filters
        //     .filter(f => f.columnId !== SystemIds.SPACE_FILTER)
        //     .map(f => {
        //       return {
        //         attribute: f.columnId,
        //         is: f.value,
        //       };
        //     }),
        // },
      };
      break;
    case 'SPACES':
      filter = {
        // where: {
        spaceId: { in: filters.filter(f => f.columnId === SystemIds.SPACE_FILTER).map(f => f.value) },
        // filter: { spaceId: { is: source.value[0] } },
        //   AND: filters
        //     .filter(f => f.columnId !== SystemIds.SPACE_FILTER)
        //     .map(f => {
        //       return {
        //         attribute: f.columnId,
        //         is: f.value,
        //       };
        //     }),
        // },
      };
      break;
    case 'COLLECTION':
    case 'GEO':
      filter = {
        // where: {
        //   AND: filters
        //     .filter(f => f.columnId !== SystemIds.SPACE_FILTER)
        //     .map(f => {
        //       return {
        //         attribute: f.columnId,
        //         is: f.value,
        //       };
        //     }),
        // },
      };
      break;
  }

  if (filter === null) {
    console.error('[toGeoFilterState] Invalid source type', source.type);
    throw new Error(`[toGeoFilterState] Invalid source type ${source.type}`);
  }

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

  // handle errors
  const where = JSON.parse(filterString);
  const decoded = Schema.decodeUnknownEither(FilterString)(where);

  const filtersFromString = Either.match(decoded, {
    onLeft: error => {
      console.error('Error decoding filter string', error);
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
  const [maybePropertyEntity, maybeValueEntity] = await Promise.all([
    E.findOne({ store, cache: queryClient, id: filter.property }),
    E.findOne({ store, cache: queryClient, id: filter.is }),
  ]);

  // if (valueType === EntityId(SystemIds.RELATION)) {
  //   const valueEntity = await E.findOne({ store, cache: queryClient, id: filter.is });

  //   return {
  //     columnId: filter.attribute,
  //     columnName: maybeAttributeEntity?.name ?? null,
  //     value: filter.is,
  //     valueName: valueEntity?.name ?? null,
  //     valueType: 'RELATION',
  //   };
  // }

  return {
    columnId: filter.property,
    columnName: maybePropertyEntity?.name ?? null,
    value: filter.is,
    valueName: maybeValueEntity?.name ?? null,
    valueType: 'RELATION',
  };
}
