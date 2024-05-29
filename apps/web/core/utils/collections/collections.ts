import { SYSTEM_IDS, createCollectionItem } from '@geogenesis/sdk';

import { Triple } from '~/core/types';

export function itemIndexValue(triple?: Triple): string | null {
  if (!triple) {
    return null;
  }

  const isIndexTriple = triple.attributeId === SYSTEM_IDS.COLLECTION_ITEM_INDEX && triple.value.type === 'TEXT';

  return isIndexTriple ? triple.value.value : null;
}

export function itemCollectionIdValue(triple?: Triple): string | null {
  if (!triple) {
    return null;
  }

  const isCollectionIdValue =
    triple.attributeId === SYSTEM_IDS.COLLECTION_ITEM_COLLECTION_ID_REFERENCE_ATTRIBUTE &&
    triple.value.type === 'ENTITY';

  return isCollectionIdValue ? triple.value.value : null;
}

export function itemEntityIdValue(triple?: Triple): string | null {
  if (!triple) {
    return null;
  }

  const isCollectionIdValue =
    triple.attributeId === SYSTEM_IDS.COLLECTION_ITEM_ENTITY_REFERENCE && triple.value.type === 'ENTITY';

  return isCollectionIdValue ? triple.value.value : null;
}

interface OpsToTriplesArgs {
  entityId: string;
  collectionId: string;
  spaceId: string;
}

export function createCollectionItemTriples(args: OpsToTriplesArgs): Triple[] {
  const { collectionId, entityId, spaceId } = args;

  const [typeOp, collectionRefOp, entityRefOp, indexOp] = createCollectionItem({
    collectionId,
    entityId,
    spaceId,
  });

  return [
    {
      space: spaceId,
      attributeId: typeOp.payload.attributeId,
      attributeName: 'Types',
      entityId: typeOp.payload.entityId,
      entityName: null,
      value: {
        type: 'ENTITY',
        name: 'Collection Item',
        value: typeOp.payload.value.value,
      },
    },
    {
      space: spaceId,
      attributeId: collectionRefOp.payload.attributeId,
      attributeName: 'Collection Reference',
      entityId: collectionRefOp.payload.entityId,
      entityName: null,
      value: {
        type: 'ENTITY',
        name: null,
        value: collectionRefOp.payload.value.value,
      },
    },
    {
      space: spaceId,
      attributeId: entityRefOp.payload.attributeId,
      attributeName: 'Collection Reference',
      entityId: entityRefOp.payload.entityId,
      entityName: null,
      value: {
        type: 'ENTITY',
        name: null,
        value: entityRefOp.payload.value.value,
      },
    },
    {
      space: spaceId,
      attributeId: indexOp.payload.attributeId,
      attributeName: 'Index',
      entityId: indexOp.payload.entityId,
      entityName: null,
      value: {
        type: 'TEXT',
        value: indexOp.payload.value.value,
      },
    },
  ];
}
