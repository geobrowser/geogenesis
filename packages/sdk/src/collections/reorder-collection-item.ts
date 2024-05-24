import { SYSTEM_IDS } from '@geogenesis/ids';
import { generateKeyBetween } from 'fractional-indexing';

import { createGeoId } from '../../';

interface ReorderCollectionItemArgs {
  collectionItemId: string;
  beforeIndex?: string;
  afterIndex?: string;
}

type ReorderCollectionItemOp = {
  type: 'SET_TRIPLE';
  payload: {
    attributeId: typeof SYSTEM_IDS.COLLECTION_ITEM_INDEX;
    entityId: string;
    value: {
      type: 'TEXT';
      value: string;
    };
  };
};

export function reorderCollectionItem(args: ReorderCollectionItemArgs): ReorderCollectionItemOp {
  const newIndex = generateKeyBetween(args.beforeIndex, args.afterIndex);

  return {
    type: 'SET_TRIPLE',
    payload: {
      attributeId: SYSTEM_IDS.COLLECTION_ITEM_INDEX,
      entityId: args.collectionItemId,
      value: {
        type: 'TEXT',
        value: newIndex,
      },
    }
  };
}
