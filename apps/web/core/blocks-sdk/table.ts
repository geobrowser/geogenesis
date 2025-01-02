import { Schema } from '@effect/schema';
import { SYSTEM_IDS } from '@geogenesis/sdk';
import { Either } from 'effect';

import { mergeEntityAsync } from '../database/entities';
import { useWriteOps } from '../database/write';
import { EntityId } from '../io/schema';
import { fetchSpace } from '../io/subgraph';
import { OmitStrict, ValueTypeId } from '../types';
import { FilterableValueType, valueTypes } from '../value-types';

export type Filter = {
  columnId: string;
  valueType: FilterableValueType;
  value: string;
  valueName: string | null;
};

const AttributeFilter = Schema.Struct({
  attribute: Schema.String,
  is: Schema.String,
});

type AttributeFilter = Schema.Schema.Type<typeof AttributeFilter>;

const Property = Schema.Union(AttributeFilter);

const FilterString = Schema.Struct({
  where: Schema.Struct({
    spaces: Schema.Array(Schema.String),
    AND: Schema.optional(Schema.Array(Property)),
    OR: Schema.optional(Schema.Array(Property)),
  }),
});
type FilterString = Schema.Schema.Type<typeof FilterString>;

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
      attributeId: SYSTEM_IDS.NAME,
      entityId: entityId,
      entityName: newName,
      attributeName: 'Name',
      value: { type: 'TEXT', value: newName },
    },
    spaceId
  );
}

/**
 * Takes the table filters and converts them to the GraphQL string used to
 * query the table using the filters. We include the typeId from the table
 * in the graphql string to make sure we're filtering by the correct type.
 *
 * We treat Name and Space as special filters.
 *
 * e.g. these filters
 * ```ts
 * const filters = [{
 *   columnId: 'type',
 *   value: 'd73a9e43-923e-4102-87da-5d3176ac9df2', // entity ID for 'Blockchain'
 *   valueType: 'entity',
 *  },
 *  {
 *   columnId: 'type',
 *   value: '48a331d1-a6d6-49ca-bc23-78f3378eb959', // entity ID for 'Layer 1'
 *   valueType: 'entity',
 * }]
 * ```
 *
 * would output to
 * ```ts
 * `{
 *    and: [
 *      {entityOf_: {attribute: "type", entityValue: "d73a9e43-923e-4102-87da-5d3176ac9df2"}},
 *      {entityOf_: {attribute: "type", entityValue: "48a331d1-a6d6-49ca-bc23-78f3378eb959"}},
 *      name: "Bitcoin"
 *    ]
 * }`
 * ```
 */
export function createFilterStringFromFilters(filters: OmitStrict<Filter, 'valueName'>[]): string {
  const filter: FilterString = {
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

export async function createFiltersFromFilterStringAndSource(filterString: string | null): Promise<Filter[]> {
  // How do we set source spaces? Maybe we don't need to?
  // Delete source spaces logic and ALL_OF_GEO logic.
  //     All we care about now is the data source type, either collection or query
  // Handle errors decoding

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

  const unresolvedSpaceFilters = Promise.all(
    filtersFromString.spaces.map(async spaceId => {
      const spaceName = await getSpaceName(spaceId);

      return {
        columnId: SYSTEM_IDS.SPACE_FILTER,
        valueType: 'RELATION',
        value: spaceId,
        valueName: spaceName,
      } satisfies Filter;
    })
  );

  const unresolvedAttributeFilters = Promise.all(
    filtersFromString.AND.map(async filter => {
      return await getResolvedFilter(filter);
    })
  );

  const [spaceFilters, attributeFilters] = await Promise.all([unresolvedSpaceFilters, unresolvedAttributeFilters]);

  filters.push(...spaceFilters);
  filters.push(...attributeFilters);

  return filters;
}

async function getSpaceName(spaceId: string) {
  const space = await fetchSpace({ id: spaceId });
  return space?.spaceConfig.name ?? null;
}

async function getResolvedFilter(filter: AttributeFilter) {
  const maybeAttributeEntity = await mergeEntityAsync(EntityId(filter.attribute));
  const valueType = maybeAttributeEntity.relationsOut.find(r => r.typeOf.id === SYSTEM_IDS.VALUE_TYPE)?.toEntity.id;

  if (valueType === SYSTEM_IDS.RELATION) {
    const valueEntity = await mergeEntityAsync(EntityId(filter.is));

    return {
      columnId: filter.attribute,
      value: filter.is,
      valueName: valueEntity?.name ?? null,
      valueType: 'RELATION',
    } satisfies Filter;
  }

  return {
    columnId: filter.attribute,
    value: filter.is,
    valueName: null,
    valueType: valueTypes[(valueType ?? SYSTEM_IDS.TEXT) as ValueTypeId] ?? SYSTEM_IDS.TEXT,
  } satisfies Filter;
}

export function createGraphQLStringFromFilters(
  filters: {
    columnId: string;
    valueType: FilterableValueType;
    value: string;
  }[]
): string {
  if (filters.length === 0) return '';

  const filtersAsStrings = filters
    .map(filter => {
      // Assume we can only filter by one type at a time for now
      if (filter.columnId === SYSTEM_IDS.TYPES && filter.valueType === 'RELATION') {
        return `versionTypes: { some: { type: { entityId: {equalTo: "${filter.value}" } } } }`;
      }

      // We treat Name and Space as special filters even though they are not always
      // columns on the type schema for a table. We allow users to be able to filter
      // by name and space.
      if (filter.columnId === SYSTEM_IDS.NAME && filter.valueType === 'TEXT') {
        // For the name we can just search for the name based on the indexed GeoEntity name
        return `name: { startsWithInsensitive: "${filter.value}" }`;
      }

      if (filter.columnId === SYSTEM_IDS.SPACE_FILTER && filter.valueType === 'TEXT') {
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
