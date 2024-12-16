import { Schema } from '@effect/schema';
import { SYSTEM_IDS } from '@geogenesis/sdk';
import { Either } from 'effect';

import { mergeEntityAsync } from '../database/entities';
import { useWriteOps } from '../database/write';
import { EntityId } from '../io/schema';
import { Source } from '../state/editor/types';
import { FilterableValueType } from '../value-types';

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
export function createFilterStringFromFilters(
  filters: {
    columnId: string;
    valueType: FilterableValueType;
    value: string;
  }[]
): string {
  const test = {
    where: {
      spaces: [],
      order: {
        by: SYSTEM_IDS.NAME,
        direction: 'ASC',
      },
      AND: {
        [SYSTEM_IDS.TYPES]: {
          is: SYSTEM_IDS.SCHEMA_TYPE,
        },
      },
    },
  };

  return JSON.stringify(test);
}

const Property = Schema.Struct({
  attribute: Schema.String,
  is: Schema.String,
});

const FilterString = Schema.Struct({
  where: Schema.Struct({
    spaces: Schema.NullOr(Schema.Array(Schema.String)),
    // Nested and?
    AND: Schema.NullOr(Schema.Array(Property)),
    OR: Schema.NullOr(Schema.Array(Property)),
  }),
});

export async function createFiltersFromFilterStringAndSource(
  filterString: string | null,
  source: Source
): Promise<
  {
    columnId: string;
    valueType: FilterableValueType;
    value: string;
    valueName: string | null;
  }[]
> {
  const filters: {
    columnId: string;
    valueType: FilterableValueType;
    value: string;
    valueName: string | null;
  }[] = [];

  // @TODO designs
  // Order, view, includes on relations
  // Need to support nested AND/OR/NOT
  // Move spaces to individual filter space: x
  const test = {
    where: {
      spaces: ['2iwSTMNvoXqD6o6BE3Qhqn'],

      AND: [
        {
          attribute: SYSTEM_IDS.TYPES,
          is: SYSTEM_IDS.SCHEMA_TYPE,
        },
        {
          attribute: SYSTEM_IDS.TYPES,
          is: SYSTEM_IDS.PERSON_TYPE,
        },
      ],
    },
  };

  // (cats OR dogs) AND pets
  // cats OR dogs AND pets is a different result
  const test2 = {
    where: {
      AND: [
        {
          OR: [
            {
              attribute: 'type',
              is: 'cats',
            },
            {
              attribute: 'type',
              is: 'dogs',
            },
          ],
        },
        {
          AND: {
            attribute: 'type',
            is: 'pets',
          },
        },
      ],
    },
  };

  const filter = JSON.stringify(test);

  if (!filter) {
    return [];
  }

  // handle errors
  // use effect/schema?
  const where = JSON.parse(filter);
  const decoded = Schema.decodeUnknownEither(FilterString)(where);

  Either.match(decoded, {
    onLeft: error => {
      console.log('error', error);
    },
    onRight: value => {
      console.log(value.where.AND);
      console.log('value', value);
    },
  });

  // if (filterString) {
  //   const typeRegex = /typeIds_contains_nocase:\s*\[(.*?)\]/;
  //   const typeMatch = filterString.match(typeRegex);
  //   const typeValue = typeMatch ? typeMatch[1] : null;

  //   if (typeValue) {
  //     // @TODO: fix json parsing requirements. Why do we need this?
  //     const parsedTypeValue = JSON.parse(typeValue);
  //     const maybeType = await mergeEntityAsync(EntityId(parsedTypeValue));

  //     if (maybeType) {
  //       filters.push({
  //         columnId: SYSTEM_IDS.TYPES,
  //         valueType: 'RELATION',
  //         value: parsedTypeValue,
  //         valueName: maybeType.name,
  //       });
  //     }
  //   }

  //   // Parse a name query from the filter
  //   const nameRegex = /name_starts_with_nocase\s*:\s*"([^"]*)"/;
  //   const nameMatch = filterString.match(nameRegex);
  //   const nameValue = nameMatch ? nameMatch[1] : null;

  //   if (nameValue) {
  //     filters.push({
  //       columnId: SYSTEM_IDS.NAME,
  //       valueType: 'TEXT',
  //       value: nameValue,
  //       valueName: null,
  //     });
  //   }

  //   // Parse all entity relationship queries from the filter
  //   const entityValueRegex = /entityOf_\s*:\s*{\s*attribute\s*:\s*"([^"]*)"\s*,\s*entityValue\s*:\s*"([^"]*)"\s*}/g;

  //   for (const match of filterString.matchAll(entityValueRegex)) {
  //     const attribute = match[1];
  //     const entityValue = match[2];

  //     if (attribute && entityValue) {
  //       console.log('value', entityValue);
  //       const maybeEntity = await mergeEntityAsync(EntityId(entityValue));

  //       if (maybeEntity) {
  //         filters.push({
  //           columnId: attribute,
  //           valueType: 'RELATION',
  //           value: entityValue,
  //           valueName: maybeEntity.name,
  //         });
  //       }
  //     }
  //   }

  //   // Parse all string queries from the filter
  //   const stringValueRegex =
  //     /entityOf_\s*:\s*{\s*attribute\s*:\s*"([^"]*)"\s*,\s*stringValue_starts_with_nocase\s*:\s*"([^"]*)"\s*}/g;

  //   for (const match of filterString.matchAll(stringValueRegex)) {
  //     const attribute = match[1];
  //     const stringValue = match[2];

  //     if (attribute && stringValue) {
  //       filters.push({
  //         columnId: attribute,
  //         valueType: 'TEXT',
  //         value: stringValue,
  //         valueName: null,
  //       });
  //     }
  //   }
  // }

  if (source.type === 'SPACES') {
    for (const spaceId of source.value) {
      filters.push({
        columnId: SYSTEM_IDS.SPACE_FILTER,
        valueType: 'TEXT',
        value: spaceId,
        valueName: null,
      });
    }
  }

  return filters;
}

export function createGraphQLStringFromFiltersV2(
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
        // value is just the stringValue of the triple
        return `triples: { some: { attributeId: { equalTo: "${filter.columnId}" }, stringValue: { equalToInsensitive: "${filter.value}"} } }`;
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
