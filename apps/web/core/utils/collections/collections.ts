import { SYSTEM_IDS, createRelationship } from '@geogenesis/sdk';

import { Triple } from '~/core/types';

export function itemIndexValue(triple?: Triple): string | null {
  if (!triple) {
    return null;
  }

  const isIndexTriple = triple.attributeId === SYSTEM_IDS.RELATION_INDEX && triple.value.type === 'TEXT';

  return isIndexTriple ? triple.value.value : null;
}

export function itemCollectionIdValue(triple?: Triple): string | null {
  if (!triple) {
    return null;
  }

  const isCollectionIdValue =
    triple.attributeId === SYSTEM_IDS.RELATION_FROM_ATTRIBUTE && triple.value.type === 'ENTITY';

  return isCollectionIdValue ? triple.value.value : null;
}

export function itemEntityIdValue(triple?: Triple): string | null {
  if (!triple) {
    return null;
  }

  const isCollectionIdValue = triple.attributeId === SYSTEM_IDS.RELATION_TO_ATTRIBUTE && triple.value.type === 'ENTITY';

  return isCollectionIdValue ? triple.value.value : null;
}

interface OpsToTriplesArgs {
  toId: string;
  fromId: string;
  spaceId: string;
  typeId: string;
}

export function createRelationshipTriples(args: OpsToTriplesArgs): Triple[] {
  const { fromId, toId, spaceId, typeId } = args;

  const [typeOp, collectionRefOp, entityRefOp, indexOp] = createRelationship({
    fromId,
    toId,
    relationTypeId: typeId,
  });

  return [
    {
      space: spaceId,
      attributeId: typeOp.triple.attribute,
      attributeName: 'Types',
      entityId: typeOp.triple.entity,
      entityName: null,
      value: {
        type: 'ENTITY',
        name: 'Collection Item',
        value: typeOp.triple.value.value,
      },
    },
    {
      space: spaceId,
      attributeId: collectionRefOp.triple.attribute,
      attributeName: 'Collection Reference',
      entityId: collectionRefOp.triple.entity,
      entityName: null,
      value: {
        type: 'ENTITY',
        name: null,
        value: collectionRefOp.triple.value.value,
      },
    },
    {
      space: spaceId,
      attributeId: entityRefOp.triple.attribute,
      attributeName: 'Collection Reference',
      entityId: entityRefOp.triple.entity,
      entityName: null,
      value: {
        type: 'ENTITY',
        name: null,
        value: entityRefOp.triple.value.value,
      },
    },
    {
      space: spaceId,
      attributeId: indexOp.triple.attribute,
      attributeName: 'Index',
      entityId: indexOp.triple.entity,
      entityName: null,
      value: {
        type: 'TEXT',
        value: indexOp.triple.value.value,
      },
    },
  ];
}
