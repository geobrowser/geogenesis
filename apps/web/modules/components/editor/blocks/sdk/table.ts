import { SYSTEM_IDS } from '@geogenesis/ids';

import { Entity } from '~/modules/entity';
import { ID } from '~/modules/id';
import { Triple } from '~/modules/triple';
import { EntityValue, Entity as IEntity, Triple as ITriple, TripleValueType } from '~/modules/types';

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
export function createFilterGraphQLString(
  filters: {
    columnId: string;
    columnName: string;
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
        return `entityOf_: {attribute: "${filter.columnId}", stringValue_starts_with_no_case: "${filter.value}"}`;
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
