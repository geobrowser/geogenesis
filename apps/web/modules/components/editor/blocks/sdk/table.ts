import { SYSTEM_IDS } from '@geogenesis/ids';

import { Entity } from '~/modules/entity';
import { ID } from '~/modules/id';
import { Triple } from '~/modules/triple';
import { EntityValue, Entity as IEntity, Triple as ITriple } from '~/modules/types';

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

export function createFilterGraphQLString({ columnId, value, valueType }): string {
  return '';
}
