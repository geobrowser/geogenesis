import { SYSTEM_IDS } from '@geogenesis/ids';

import { createGeoId } from '../../';
import { INITIAL_COLLECTION_ITEM_INDEX_VALUE } from '../../constants';

interface CreateCollectionItemArgs {
  spaceId: string; // 0x...
  collectionId: string; // uuid
  entityId: string; // uuid (usually)
}

type CreateCollectionItemTypeAction = {
  attributeId: typeof SYSTEM_IDS.TYPES;
  entityId: string;
  type: 'createTriple';
  value: {
    type: 'entity';
    id: typeof SYSTEM_IDS.COLLECTION_ITEM_TYPE;
  };
};

type CreateCollectionItemCollectionReferenceAction = {
  attributeId: typeof SYSTEM_IDS.COLLECTION_ITEM_COLLECTION_ID_REFERENCE_ATTRIBUTE;
  entityId: string;
  type: 'createTriple';
  value: {
    type: 'entity';
    id: string;
  };
};

type CreateCollectionItemEntityReferenceAction = {
  attributeId: typeof SYSTEM_IDS.COLLECTION_ITEM_ENTITY_REFERENCE;
  entityId: string;
  type: 'createTriple';
  value: {
    type: 'entity';
    id: string;
  };
};

type CreateCollectionItemIndexAction = {
  attributeId: typeof SYSTEM_IDS.COLLECTION_ITEM_INDEX;
  entityId: string;
  type: 'createTriple';
  value: {
    type: 'string';
    id: string;
    value: string;
  };
};

export function createCollectionItem(
  args: CreateCollectionItemArgs
): readonly [
  CreateCollectionItemTypeAction,
  CreateCollectionItemCollectionReferenceAction,
  CreateCollectionItemEntityReferenceAction,
  CreateCollectionItemIndexAction,
] {
  const newEntityId = createGeoId();

  return [
    // Type of Collection Item
    {
      attributeId: SYSTEM_IDS.TYPES,
      entityId: newEntityId,
      type: 'createTriple',
      value: {
        type: 'entity',
        id: SYSTEM_IDS.COLLECTION_ITEM_TYPE,
      },
    },
    // Entity value for the collection itself
    {
      attributeId: SYSTEM_IDS.COLLECTION_ITEM_COLLECTION_ID_REFERENCE_ATTRIBUTE,
      entityId: newEntityId,
      type: 'createTriple',
      value: {
        type: 'entity',
        id: args.collectionId,
      },
    },
    // Entity value for the entity referenced by this collection item
    {
      attributeId: SYSTEM_IDS.COLLECTION_ITEM_ENTITY_REFERENCE,
      entityId: newEntityId,
      type: 'createTriple',
      value: {
        type: 'entity',
        id: args.entityId,
      },
    },
    {
      attributeId: SYSTEM_IDS.COLLECTION_ITEM_INDEX,
      entityId: newEntityId,
      type: 'createTriple',
      value: {
        type: 'string',
        id: createGeoId(),
        value: INITIAL_COLLECTION_ITEM_INDEX_VALUE,
      },
    },
  ] as const;
}
