import { SYSTEM_IDS } from '@geogenesis/sdk';
import { INITIAL_RELATION_INDEX_VALUE } from '@geogenesis/sdk/constants';

import { StoreRelation } from '~/core/database/types';
import { EntityId } from '~/core/io/schema';

type BlockTypeId = typeof SYSTEM_IDS.TEXT_BLOCK | typeof SYSTEM_IDS.IMAGE_TYPE | typeof SYSTEM_IDS.DATA_BLOCK;

export function getRelationForBlockType(
  fromBlockEntityId: string,
  blockTypeId: BlockTypeId,
  spaceId: string
): StoreRelation {
  return {
    space: spaceId,
    index: INITIAL_RELATION_INDEX_VALUE,
    typeOf: {
      id: EntityId(SYSTEM_IDS.TYPES_ATTRIBUTE),
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
