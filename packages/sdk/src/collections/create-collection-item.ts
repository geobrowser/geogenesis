import { INITIAL_COLLECTION_ITEM_INDEX_VALUE } from '../../constants';
import { createGeoId } from '../id';
import { SYSTEM_IDS } from '../system-ids';

interface CreateCollectionItemArgs {
  spaceId: string; // 0x...
  collectionId: string; // uuid
  entityId: string; // uuid
}

type CreateCollectionItemTypeOp = {
  type: 'SET_TRIPLE';
  triple: {
    attribute: typeof SYSTEM_IDS.TYPES;
    entity: string;
    value: {
      type: 'ENTITY';
      value: typeof SYSTEM_IDS.COLLECTION_ITEM_TYPE;
    };
  };
};

type CreateCollectionItemCollectionReferenceOp = {
  type: 'SET_TRIPLE';
  triple: {
    attribute: typeof SYSTEM_IDS.COLLECTION_ITEM_COLLECTION_ID_REFERENCE_ATTRIBUTE;
    entity: string;
    value: {
      type: 'ENTITY';
      value: string;
    };
  };
};

type CreateCollectionItemEntityReferenceOp = {
  type: 'SET_TRIPLE';
  triple: {
    attribute: typeof SYSTEM_IDS.COLLECTION_ITEM_ENTITY_REFERENCE;
    entity: string;
    value: {
      type: 'ENTITY';
      value: string;
    };
  };
};

interface CreateCollectionItemIndexOp {
  type: 'SET_TRIPLE';
  triple: {
    attribute: typeof SYSTEM_IDS.COLLECTION_ITEM_INDEX;
    entity: string;
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
      type: 'SET_TRIPLE',
      triple: {
        attribute: SYSTEM_IDS.TYPES,
        entity: newEntityId,
        value: {
          type: 'ENTITY',
          value: SYSTEM_IDS.COLLECTION_ITEM_TYPE,
        },
      }
    },
    // Entity value for the collection itself
    {
      type: 'SET_TRIPLE',
      triple: {
        attribute: SYSTEM_IDS.COLLECTION_ITEM_COLLECTION_ID_REFERENCE_ATTRIBUTE,
        entity: newEntityId,
        value: {
          type: 'ENTITY',
          value: args.collectionId,
        },
      }
    },
    // Entity value for the entity referenced by this collection item
    {
      type: 'SET_TRIPLE',
      triple: {
        attribute: SYSTEM_IDS.COLLECTION_ITEM_ENTITY_REFERENCE,
        entity: newEntityId,
        value: {
          type: 'ENTITY',
          value: args.entityId,
        },
      }
    },
    {
      type: 'SET_TRIPLE',
      triple: {
        attribute: SYSTEM_IDS.COLLECTION_ITEM_INDEX,
        entity: newEntityId,
        value: {
          type: 'TEXT',
          value: INITIAL_COLLECTION_ITEM_INDEX_VALUE,
        }
      },
    },
  ] as const;
}
