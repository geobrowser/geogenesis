import { SYSTEM_IDS, createCollectionItem } from '@geogenesis/sdk';

import { CollectionItem, Triple } from '~/core/types';

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
      attributeId: typeOp.triple.attributeId,
      attributeName: 'Types',
      entityId: typeOp.triple.entityId,
      entityName: null,
      value: {
        type: 'ENTITY',
        name: 'Collection Item',
        value: typeOp.triple.value.value,
      },
    },
    {
      space: spaceId,
      attributeId: collectionRefOp.triple.attributeId,
      attributeName: 'Collection Reference',
      entityId: collectionRefOp.triple.entityId,
      entityName: null,
      value: {
        type: 'ENTITY',
        name: null,
        value: collectionRefOp.triple.value.value,
      },
    },
    {
      space: spaceId,
      attributeId: entityRefOp.triple.attributeId,
      attributeName: 'Collection Reference',
      entityId: entityRefOp.triple.entityId,
      entityName: null,
      value: {
        type: 'ENTITY',
        name: null,
        value: entityRefOp.triple.value.value,
      },
    },
    {
      space: spaceId,
      attributeId: indexOp.triple.attributeId,
      attributeName: 'Index',
      entityId: indexOp.triple.entityId,
      entityName: null,
      value: {
        type: 'TEXT',
        value: indexOp.triple.value.value,
      },
    },
  ];
}

export function itemFromTriples(triples: Record<string, Triple[]>): CollectionItem[] {
  const items = Object.entries(triples).map(([collectionItemId, items]): CollectionItem | null => {
    const index = items.find(i => Boolean(itemIndexValue(i)))?.value.value;
    const collectionId = items.find(i => Boolean(itemCollectionIdValue(i)))?.value.value;
    const entityIdTriple = items.find(i => Boolean(itemEntityIdValue(i)));
    const entityId = entityIdTriple?.value.value;
    const entityName = entityIdTriple?.value.type === 'ENTITY' ? entityIdTriple?.value.name : null;

    if (!(index && collectionId && entityId)) {
      return null;
    }

    return {
      id: collectionItemId,
      collectionId,
      entity: {
        id: entityId,
        name: entityName,
        types: [],
      },
      index,
      value: {
        // @TODO: Image
        type: 'ENTITY',
        value: entityName,
      },
    };
  });

  return items.flatMap(c => (c ? [c] : []));
}
