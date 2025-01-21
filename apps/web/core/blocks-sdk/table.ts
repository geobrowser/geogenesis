import { Schema } from '@effect/schema';
import { SYSTEM_IDS } from '@geogenesis/sdk';
import { Either } from 'effect';

import { mergeEntityAsync } from '../database/entities';
import { useWriteOps } from '../database/write';
import { EntityId } from '../io/schema';
import { fetchSpace } from '../io/subgraph';
import { Source } from '../state/editor/types';
import { OmitStrict, ValueTypeId } from '../types';
import { FilterableValueType, valueTypes } from '../value-types';

export type Filter = {
  columnId: string;
  valueType: FilterableValueType;
  value: string;
  valueName: string | null;
};

/**
 * We support two types of filters, either a filter on a set of entities,
 * or a filter on a specific entity. These each have different filter
 * semantics.
 *
 * e.g.,
 * attribute: SYSTEM_IDS.TYPES_ATTRIBUTE, is: SYSTEM_IDS.PERSON_TYPE
 * The above returns all entities that are type: Person
 *
 * entity: '1234', relationType: SYSTEM_IDS.TYPES_ATTRIBUTE
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
    entity: Schema.optional(Schema.String),
    spaces: Schema.optional(Schema.Array(Schema.String)),
    AND: Schema.optional(Schema.Array(Property)),
    OR: Schema.optional(Schema.Array(Property)),
  }),
});
export type FilterString = Schema.Schema.Type<typeof FilterString>;

export function upsertName({
  newName,
  entityId,
  spaceId,
  api,
}: {
  newName: string;
  entityId: string;
  spaceId: string;
  api: {
    upsert: ReturnType<typeof useWriteOps>['upsert'];
  };
}) {
  return api.upsert(
    {
      attributeId: SYSTEM_IDS.NAME_ATTRIBUTE,
      entityId: entityId,
      entityName: newName,
      attributeName: 'Name',
      value: { type: 'TEXT', value: newName },
    },
    spaceId
  );
}

export function createFilterStringFromFilters(filters: OmitStrict<Filter, 'valueName'>[], source: Source): string {
  let filter: FilterString | null = null;

  if (source.type === 'ENTITY') {
    filter = {
      where: {
        entity: source.value,
        AND: filters
          .filter(f => f.columnId !== SYSTEM_IDS.SPACE_FILTER && f.columnId !== SYSTEM_IDS.ENTITY_FILTER)
          .map(f => {
            return {
              attribute: f.columnId,
              is: f.value,
            };
          }),
      },
    };
  }

  if (source.type === 'SPACES') {
    filter = {
      where: {
        spaces: filters.filter(f => f.columnId === SYSTEM_IDS.SPACE_FILTER).map(f => f.value),
        AND: filters
          .filter(f => f.columnId !== SYSTEM_IDS.SPACE_FILTER)
          .map(f => {
            return {
              attribute: f.columnId,
              is: f.value,
            };
          }),
      },
    };
  }

  if (source.type === 'COLLECTION' || source.type === 'GEO') {
    filter = {
      where: {
        AND: filters
          .filter(f => f.columnId !== SYSTEM_IDS.SPACE_FILTER)
          .map(f => {
            return {
              attribute: f.columnId,
              is: f.value,
            };
          }),
      },
    };
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

export async function createFiltersFromFilterString(filterString: string | null): Promise<Filter[]> {
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
      if (value.where.entity) {
        return {
          entity: value.where.entity,
          AND: value.where.AND ?? [],
        };
      }

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
            columnId: SYSTEM_IDS.SPACE_FILTER,
            valueType: 'RELATION',
            value: spaceId,
            valueName: spaceName,
          };
        })
      )
    : [];

  const unresolvedEntityFilters = filtersFromString.entity ? getResolvedEntity(filtersFromString.entity) : null;

  const unresolvedAttributeFilters = Promise.all(
    filtersFromString.AND.map(async filter => {
      return await getResolvedFilter(filter);
    })
  );

  const [spaceFilters, attributeFilters, entityFilter] = await Promise.all([
    unresolvedSpaceFilters,
    unresolvedAttributeFilters,
    unresolvedEntityFilters,
  ]);

  filters.push(...spaceFilters);
  filters.push(...attributeFilters);
  if (entityFilter) filters.push(entityFilter);

  return filters;
}

async function getSpaceName(spaceId: string) {
  const space = await fetchSpace({ id: spaceId });
  return space?.spaceConfig.name ?? null;
}

async function getResolvedEntity(entityId: string): Promise<Filter> {
  const entity = await mergeEntityAsync(EntityId(entityId));

  if (!entity) {
    return {
      columnId: SYSTEM_IDS.ENTITY_FILTER,
      valueType: 'RELATION',
      value: entityId,
      valueName: null,
    };
  }

  return {
    columnId: SYSTEM_IDS.ENTITY_FILTER,
    valueType: 'RELATION',
    value: entityId,
    valueName: entity.name,
  };
}

async function getResolvedFilter(filter: AttributeFilter): Promise<Filter> {
  const maybeAttributeEntity = await mergeEntityAsync(EntityId(filter.attribute));
  const valueType = maybeAttributeEntity.relationsOut.find(r => r.typeOf.id === SYSTEM_IDS.VALUE_TYPE_ATTRIBUTE)
    ?.toEntity.id;

  if (valueType === SYSTEM_IDS.RELATION) {
    const valueEntity = await mergeEntityAsync(EntityId(filter.is));

    return {
      columnId: filter.attribute,
      value: filter.is,
      valueName: valueEntity?.name ?? null,
      valueType: 'RELATION',
    };
  }

  return {
    columnId: filter.attribute,
    value: filter.is,
    valueName: null,
    valueType: valueTypes[(valueType ?? SYSTEM_IDS.TEXT) as ValueTypeId] ?? SYSTEM_IDS.TEXT,
  };
}

export function createGraphQLStringFromFilters(filters: OmitStrict<Filter, 'valueName'>[]): string {
  if (filters.length === 0) return '';

  console.log('filters', filters);

  const filtersAsStrings = filters
    .map(filter => {
      // Assume we can only filter by one type at a time for now
      if (filter.columnId === SYSTEM_IDS.TYPES_ATTRIBUTE && filter.valueType === 'RELATION') {
        return `versionTypes: { some: { type: { entityId: {equalTo: "${filter.value}" } } } }`;
      }

      // We treat Name and Space as special filters even though they are not always
      // columns on the type schema for a table. We allow users to be able to filter
      // by name and space.
      if (filter.columnId === SYSTEM_IDS.NAME_ATTRIBUTE && filter.valueType === 'TEXT') {
        // For the name we can just search for the name based on the indexed GeoEntity name
        return `name: { startsWithInsensitive: "${filter.value}" }`;
      }

      if (filter.columnId === SYSTEM_IDS.SPACE_FILTER && filter.valueType === 'RELATION') {
        return `versionSpaces: {
          some: {
            spaceId: { equalTo: "${filter.value}" }
          }
        }`;
      }

      if (filter.valueType === 'TEXT') {
        // value is just the textValue of the triple
        return `triples: { some: { attributeId: { equalTo: "${filter.columnId}" }, textValue: { equalToInsensitive: "${filter.value}"} } }`;
      }

      if (filter.valueType === 'RELATION') {
        return `relationsByFromVersionId: {
                some: {
                  typeOf: { id: { equalTo: "${filter.columnId}" } }
                  toEntity: { id: { equalTo: "${filter.value}" } }
                }
              }`;
      }

      // We don't support other value types yet
      return null;
    })
    .flatMap(f => (f ? [f] : []));

  if (filtersAsStrings.length === 1) {
    return `${filtersAsStrings[0]}`;
  }

  // Wrap each filter expression in curly brackets
  const multiFilterQuery = filtersAsStrings.map(f => `{ ${f} }`).join(', ');

  return `and: [${multiFilterQuery}]`;
}
