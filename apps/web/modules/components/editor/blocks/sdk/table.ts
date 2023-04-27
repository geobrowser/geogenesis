import { SYSTEM_IDS } from '@geogenesis/ids';

import { Entity } from '~/modules/entity';
import { ID } from '~/modules/id';
import { Triple } from '~/modules/triple';
import { Column, EntityValue, Entity as IEntity, Triple as ITriple, TripleValueType } from '~/modules/types';

export function upsertName({
  blockEntity,
  name,
  api,
}: {
  blockEntity: IEntity | null;
  name: string;
  api: {
    create: (triple: ITriple) => void;
    update: (triple: ITriple, oldTriple: ITriple) => void;
  };
}) {
  if (!blockEntity) return;

  const nameTriple = Entity.nameTriple(blockEntity?.triples ?? []);

  if (!nameTriple)
    return api.create(
      Triple.withId({
        attributeId: SYSTEM_IDS.NAME,
        entityId: blockEntity.id,
        entityName: name,
        attributeName: 'Name',
        space: blockEntity.nameTripleSpace ?? '',
        value: { type: 'string', id: ID.createValueId(), value: name },
      })
    );

  api.update({ ...nameTriple, value: { ...nameTriple.value, type: 'string', value: name } }, nameTriple);
}

// @TODO: Some of the functionality in here could be re-used for all blocks
export function createBlock({
  blockEntity,
  spaceId,
  api,
  parentEntityId,
  parentName,
  rowTypeEntityId,
  rowTypeEntityName,
}: {
  blockEntity: IEntity | null;
  spaceId: string;
  parentEntityId: string;
  parentName: string;
  rowTypeEntityId: string;
  rowTypeEntityName: string;
  api: { create: (triple: ITriple) => void };
}) {
  // 1. Create parent triple
  const existingParentTypeTriple = blockEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.PARENT_ENTITY);

  const entityId = blockEntity?.id ?? ID.createEntityId();
  const entityName = blockEntity?.name ?? `Table Block ${entityId}`;

  if (!existingParentTypeTriple) {
    api.create(
      Triple.withId({
        space: spaceId,
        entityId,
        entityName,
        attributeId: SYSTEM_IDS.PARENT_ENTITY,
        attributeName: 'Parent Entity',
        value: { id: parentEntityId, type: 'entity', name: parentName },
      })
    );
  }

  // 2. Create row type triple
  const existingRowTypeTriple = blockEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.ROW_TYPE);

  if (!existingRowTypeTriple) {
    api.create(
      Triple.withId({
        space: spaceId,
        entityId: blockEntity?.id ?? ID.createEntityId(),
        entityName: blockEntity?.name ?? `Table Block ${blockEntity?.id}`,
        attributeId: SYSTEM_IDS.ROW_TYPE,
        attributeName: 'Row Type',
        value: { id: rowTypeEntityId, type: 'entity', name: rowTypeEntityName },
      })
    );
  }

  // 3. Create blocktype triple
  const blockTypeValue: EntityValue = { id: SYSTEM_IDS.TABLE_BLOCK, type: 'entity', name: 'Table Block' };
  const existingBlockTypeTriple = blockEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.TYPES);

  if (!existingBlockTypeTriple) {
    api.create(
      Triple.withId({
        space: spaceId,
        entityId: entityId,
        entityName: entityName,
        attributeId: SYSTEM_IDS.TYPES,
        attributeName: 'Types',
        value: blockTypeValue,
      })
    );
  }

  // 4. Create name triple
  const existingNameTriple = blockEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.TYPES);

  if (!existingNameTriple) {
    api.create(
      Triple.withId({
        space: spaceId,
        entityId: entityId,
        entityName: entityName,
        attributeId: SYSTEM_IDS.TYPES,
        attributeName: 'Types',
        value: { id: ID.createValueId(), type: 'string', value: entityName },
      })
    );
  }
}

/**
 * Takes the table filters and converts them to the GraphQL string used to
 * query the table using the filters. We include the typeId from the table
 * in the graphql string to make sure we're filtering by the correct type.
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
export function createGraphQLStringFromFilters(
  filters: {
    columnId: string;
    valueType: TripleValueType;
    value: string;
  }[],
  typeId: string | null
): string {
  if (!typeId) return '';
  if (filters.length === 0) return `{typeIds_contains_nocase: ["${typeId}"]}`;

  const filtersAsStrings = filters
    .map(filter => {
      if (filter.columnId === SYSTEM_IDS.NAME && filter.valueType === 'string') {
        // For the name we can just search for the name based on the indexed GeoEntity name
        return `name_starts_with_nocase: "${filter.value}"`;
      }

      if (filter.valueType === 'entity') {
        // value is the ID of the relation
        return `entityOf_: {attribute: "${filter.columnId}", entityValue: "${filter.value}"}`;
      }

      if (filter.valueType === 'string') {
        // value is just the stringValue of the triple
        return `entityOf_: {attribute: "${filter.columnId}", stringValue_starts_with_nocase: "${filter.value}"}`;
      }

      // We don't support other value types yet
      return null;
    })
    .flatMap(f => (f ? [f] : []));

  if (filtersAsStrings.length === 1) {
    return `{typeIds_contains_nocase: ["${typeId}"], ${filtersAsStrings[0]}}`;
  }

  // Wrap each filter expression in curly brackets
  const multiFilterQuery = filtersAsStrings.map(f => `{${f}}`).join(', ');

  return `{and: [{typeIds_contains_nocase: ["${typeId}"]}, ${multiFilterQuery}]}`;
}

/**
 * Takes the graphQL string representing the TableBlock filters and maps them to the
 * application/UI representation of the filters.
 *
 * Turns this:
 * ```ts
 * {
 *    and: [
 *     {
 *       typeIds_contains_nocase: ["type-id"]
 *     },
 *     {
 *       entityOf_: {attribute: "type", stringValue_starts_with_nocase: "Value 1"}
 *     },
 *     {
 *       entityOf_: {attribute: "type", entityValue: "id 1"}
 *     },
 *     {
 *       name_starts_with_nocase: "id 1"
 *     }
 *   ]
 * }
 * ```
 *
 * into this:
 *```ts
 * [
 *  {
 *     columnId: 'type',
 *     columnName: 'Type',
 *     valueType: 'string',
 *     value: 'Value 1'
 *   },
 *   {
 *     columnId: 'type',
 *     columnName: 'Type',
 *     valueType: 'entity',
 *     value: 'id 1'
 *   },
 *   {
 *     columnId: 'name',
 *     columnName: 'Name',
 *     valueType: 'string',
 *     value: 'id 1'
 *   }
 * ]
 * ```
 */
export async function createFiltersFromGraphQLString(
  graphQLString: string,
  fetchEntity: (entityId: string) => Promise<IEntity | null>
): Promise<
  {
    columnId: string;
    valueType: TripleValueType;
    value: string;
    valueName: string | null;
  }[]
> {
  const filters: {
    columnId: string;
    valueType: TripleValueType;
    value: string;
    valueName: string | null;
  }[] = [];

  // Parse a name query from the filter
  const nameRegex = /name_starts_with_nocase\s*:\s*"([^"]*)"/;
  const nameMatch = graphQLString.match(nameRegex);
  const nameValue = nameMatch ? nameMatch[1] : null;

  if (nameValue) {
    filters.push({
      columnId: SYSTEM_IDS.NAME,
      valueType: 'string',
      value: nameValue,
      valueName: null,
    });
  }

  // Parse all entity relationship queries from the filter
  const entityValueRegex = /entityOf_\s*:\s*{\s*attribute\s*:\s*"([^"]*)"\s*,\s*entityValue\s*:\s*"([^"]*)"\s*}/g;

  for (const match of graphQLString.matchAll(entityValueRegex)) {
    const attribute = match[1];
    const entityValue = match[2];

    if (attribute && entityValue) {
      const maybeEntity = await fetchEntity(entityValue);

      if (maybeEntity) {
        filters.push({
          columnId: attribute,
          valueType: 'entity',
          value: entityValue,
          valueName: maybeEntity.name,
        });
      }
    }
  }

  // Parse all string queries from the filter
  const stringValueRegex =
    /entityOf_\s*:\s*{\s*attribute\s*:\s*"([^"]*)"\s*,\s*stringValue_starts_with_nocase\s*:\s*"([^"]*)"\s*}/g;

  for (const match of graphQLString.matchAll(stringValueRegex)) {
    const attribute = match[1];
    const stringValue = match[2];

    if (attribute && stringValue) {
      filters.push({
        columnId: attribute,
        valueType: 'string',
        value: stringValue,
        valueName: null,
      });
    }
  }

  return filters;
}
