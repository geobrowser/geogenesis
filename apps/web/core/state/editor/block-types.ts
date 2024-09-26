import { SYSTEM_IDS } from '@geobrowser/gdk';
import { INITIAL_COLLECTION_ITEM_INDEX_VALUE } from '@geobrowser/gdk/constants';

import { StoreRelation } from '~/core/database/types';
import { EntityId } from '~/core/io/schema';

type BlockTypeId = typeof SYSTEM_IDS.TEXT_BLOCK | typeof SYSTEM_IDS.IMAGE_BLOCK | typeof SYSTEM_IDS.TABLE_BLOCK;

export function getRelationForBlockType(fromBlockEntityId: string, blockTypeId: BlockTypeId): StoreRelation {
  return {
    index: INITIAL_COLLECTION_ITEM_INDEX_VALUE,
    typeOf: {
      id: EntityId(SYSTEM_IDS.TYPES),
      name: 'Types',
    },
    toEntity: {
      id: EntityId(blockTypeId),
      renderableType: 'RELATION',
      name: null,
      value: blockTypeId,
    },
    fromEntity: {
      id: EntityId(fromBlockEntityId),
      name: null,
    },
  };
}
