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
      value: Schema.Struct({
        is: Schema.String,
      }),
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
        //   spaces: filters.filter(f => f.columnId === SystemIds.SPACE_FILTER).map(f => f.value),
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

type FilterObject = {
  [key: string]: {
    is: string;
  };
};

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
      return {
        spaces: value.spaceId?.in ?? [],
        filters: Object.entries((where?.filter ?? {}) as FilterObject).map(([key, value]) => ({
          property: key,
          is: value.is,
        })),
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

  // const maybeFromFilter = filtersFromString.AND.find(f => f.attribute === SystemIds.RELATION_FROM_PROPERTY);
  // const unresolvedEntityFilter = maybeFromFilter ? getResolvedEntity(maybeFromFilter.is) : null;

  const unresolvedAttributeFilters = Promise.all(
    filtersFromString.filters.map(async filter => {
      return await getResolvedFilter(filter);
    })
  );

  const [
    spaceFilters,
    attributeFilters,
    // entityFilter
  ] = await Promise.all([
    unresolvedSpaceFilters,
    unresolvedAttributeFilters,
    // unresolvedEntityFilter,
  ]);

  filters.push(...spaceFilters);
  filters.push(...attributeFilters);
  // if (entityFilter) filters.push(entityFilter);

  return filters;
}

async function getSpaceName(spaceId: string) {
  const space = await Effect.runPromise(getSpace(spaceId));
  return space?.entity.name ?? null;
}

async function getResolvedEntity(entityId: string): Promise<Filter> {
  const entity = await E.findOne({ store, cache: queryClient, id: entityId });

  if (!entity) {
    return {
      columnId: SystemIds.RELATION_FROM_PROPERTY,
      columnName: 'From',
      valueType: 'RELATION',
      value: entityId,
      valueName: null,
    };
  }

  return {
    columnId: SystemIds.RELATION_FROM_PROPERTY,
    columnName: 'From',
    valueType: 'RELATION',
    value: entityId,
    valueName: entity.name,
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

  // @TODO(migration): Get real property data type
  return {
    columnId: filter.property,
    columnName: maybePropertyEntity?.name ?? null,
    value: filter.is,
    valueName: maybeValueEntity?.name ?? null,
    // @TODO change to dataType, add support for "text" filters
    valueType: 'RELATION',
  };
}
