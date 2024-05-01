import { SYSTEM_IDS } from '@geogenesis/ids';
import { generateKeyBetween } from 'fractional-indexing';

import { createGeoId } from '../../';

interface ReorderCollectionItemArgs {
  collectionItemId: string;
  beforeIndex?: string;
  afterIndex?: string;
}

type ReorderCollectionItemAction = {
  attributeId: typeof SYSTEM_IDS.COLLECTION_ITEM_INDEX;
  entityId: string;
  type: 'createTriple';
  value: {
    type: 'string';
    id: string;
    value: string;
  };
};

export function reorderCollectionItem(args: ReorderCollectionItemArgs): ReorderCollectionItemAction {
  const newIndex = generateKeyBetween(args.beforeIndex, args.afterIndex);

  return {
    attributeId: SYSTEM_IDS.COLLECTION_ITEM_INDEX,
    entityId: args.collectionItemId,
    type: 'createTriple',
    value: {
      type: 'string',
      id: createGeoId(),
      value: newIndex,
    },
  };
}
