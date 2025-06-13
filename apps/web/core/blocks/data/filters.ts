import { Schema } from '@effect/schema';
import { SystemIds } from '@graphprotocol/grc-20';
import { Effect, Either } from 'effect';

import { getSpace } from '~/core/io/v2/queries';
import { queryClient } from '~/core/query-client';
import { E } from '~/core/sync/orm';
import { store } from '~/core/sync/use-sync-engine';
import { OmitStrict } from '~/core/types';
import type { RelationValueType } from '~/core/types';
import { FilterableValueType } from '~/core/value-types';

import { Source } from './source';

export type Filter = {
  columnId: string;
  columnName: string | null;
  valueType: FilterableValueType;
  value: string;
  valueName: string | null;
  relationValueTypes?: RelationValueType[];
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
const AttributeFilter = Schema.Struct({
  attribute: Schema.String,
  is: Schema.String,
});

type AttributeFilter = Schema.Schema.Type<typeof AttributeFilter>;

const Property = Schema.Union(AttributeFilter);

const FilterString = Schema.Struct({
  where: Schema.Struct({
    spaces: Schema.optional(Schema.Array(Schema.String)),
    AND: Schema.optional(Schema.Array(Property)),
    OR: Schema.optional(Schema.Array(Property)),
  }),
});

export type FilterString = Schema.Schema.Type<typeof FilterString>;

export function toGeoFilterState(filters: OmitStrict<Filter, 'valueName'>[], source: Source): string {
  let filter: FilterString | null = null;

  switch (source.type) {
    case 'RELATIONS':
      filter = {
        where: {
          AND: filters
            .filter(f => f.columnId !== SystemIds.SPACE_FILTER)
            .map(f => {
              return {
                attribute: f.columnId,
                is: f.value,
              };
            }),
        },
      };
      break;
    case 'SPACES':
      filter = {
        where: {
          spaces: filters.filter(f => f.columnId === SystemIds.SPACE_FILTER).map(f => f.value),
          AND: filters
            .filter(f => f.columnId !== SystemIds.SPACE_FILTER)
            .map(f => {
              return {
                attribute: f.columnId,
                is: f.value,
              };
            }),
        },
      };
      break;
    case 'COLLECTION':
    case 'GEO':
      filter = {
        where: {
          AND: filters
            .filter(f => f.columnId !== SystemIds.SPACE_FILTER)
            .map(f => {
              return {
                attribute: f.columnId,
                is: f.value,
              };
            }),
        },
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

export async function fromGeoFilterState(filterString: string | null): Promise<Filter[]> {
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
        spaces: value.where.spaces,
        AND: value.where.AND ?? [],
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

  const maybeFromFilter = filtersFromString.AND.find(f => f.attribute === SystemIds.RELATION_FROM_PROPERTY);
  const unresolvedEntityFilter = maybeFromFilter ? getResolvedEntity(maybeFromFilter.is) : null;

  const unresolvedAttributeFilters = Promise.all(
    filtersFromString.AND.filter(f => f.attribute !== SystemIds.RELATION_FROM_PROPERTY).map(async filter => {
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
  if (entityFilter) filters.push(entityFilter);

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

async function getResolvedFilter(filter: AttributeFilter): Promise<Filter> {
  // @TODO(migration): Fetch property
  const maybeAttributeEntity = await E.findOne({ store, cache: queryClient, id: filter.attribute });

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

  // @TODO: Can get property name here
  // @TODO(migration): Get real property data type
  return {
    columnId: filter.attribute,
    columnName: maybeAttributeEntity?.name ?? null,
    value: filter.is,
    valueName: null,
    // valueType: VALUE_TYPES[(valueType ?? SystemIds.TEXT) as ValueTypeId] ?? SystemIds.TEXT,
    valueType: 'TEXT',
  };
}
