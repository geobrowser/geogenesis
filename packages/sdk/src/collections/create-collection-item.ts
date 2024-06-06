import { INITIAL_COLLECTION_ITEM_INDEX_VALUE } from '../../constants';
import { createGeoId } from '../id';
import { SYSTEM_IDS } from '../system-ids';

interface CreateCollectionItemArgs {
  spaceId: string; // 0x...
  collectionId: string; // uuid
  entityId: string; // uuid
}

type CreateCollectionItemTypeOp = {
  opType: 'SET_TRIPLE';
  payload: {
    attributeId: typeof SYSTEM_IDS.TYPES;
    entityId: string;
    value: {
      type: 'ENTITY';
      value: typeof SYSTEM_IDS.COLLECTION_ITEM_TYPE;
    };
  };
};

type CreateCollectionItemCollectionReferenceOp = {
  opType: 'SET_TRIPLE';
  payload: {
    attributeId: typeof SYSTEM_IDS.COLLECTION_ITEM_COLLECTION_ID_REFERENCE_ATTRIBUTE;
    entityId: string;
    value: {
      type: 'ENTITY';
      value: string;
    };
  };
};

type CreateCollectionItemEntityReferenceOp = {
  opType: 'SET_TRIPLE';
  payload: {
    attributeId: typeof SYSTEM_IDS.COLLECTION_ITEM_ENTITY_REFERENCE;
    entityId: string;
    value: {
      type: 'ENTITY';
      value: string;
    };
  };
};

interface CreateCollectionItemIndexOp {
  opType: 'SET_TRIPLE';
  payload: {
    attributeId: typeof SYSTEM_IDS.COLLECTION_ITEM_INDEX;
    entityId: string;
    value: {
      type: 'TEXT';
      value: string;
    };
  };
};

export function createCollectionItem(
  args: CreateCollectionItemArgs
): readonly [
  CreateCollectionItemTypeOp,
  CreateCollectionItemCollectionReferenceOp,
  CreateCollectionItemEntityReferenceOp,
  CreateCollectionItemIndexOp,
] {
  const newEntityId = createGeoId();

  return [
    // Type of Collection Item
    {
      opType: 'SET_TRIPLE',
      payload: {
        attributeId: SYSTEM_IDS.TYPES,
        entityId: newEntityId,
        value: {
          type: 'ENTITY',
          value: SYSTEM_IDS.COLLECTION_ITEM_TYPE,
        },
      }
    },
    // Entity value for the collection itself
    {
      opType: 'SET_TRIPLE',
      payload: {
        attributeId: SYSTEM_IDS.COLLECTION_ITEM_COLLECTION_ID_REFERENCE_ATTRIBUTE,
        entityId: newEntityId,
        value: {
          type: 'ENTITY',
          value: args.collectionId,
        },
      }
    },
    // Entity value for the entity referenced by this collection item
    {
      opType: 'SET_TRIPLE',
      payload: {
        attributeId: SYSTEM_IDS.COLLECTION_ITEM_ENTITY_REFERENCE,
        entityId: newEntityId,
        value: {
          type: 'ENTITY',
          value: args.entityId,
        },
      }
    },
    {
      opType: 'SET_TRIPLE',
      payload: {
        attributeId: SYSTEM_IDS.COLLECTION_ITEM_INDEX,
        entityId: newEntityId,
        value: {
          type: 'TEXT',
          value: INITIAL_COLLECTION_ITEM_INDEX_VALUE,
        }
      },
    },
  ] as const;
}
