import { SystemIds } from '@graphprotocol/grc-20';
import { INITIAL_RELATION_INDEX_VALUE } from '@graphprotocol/grc-20/constants';

import { StoreRelation } from '~/core/database/types';
import { EntityId } from '~/core/io/schema';

type BlockTypeId = typeof SystemIds.TEXT_BLOCK | typeof SystemIds.IMAGE_TYPE | typeof SystemIds.DATA_BLOCK;

export function getRelationForBlockType(
  fromBlockEntityId: string,
  blockTypeId: BlockTypeId,
  spaceId: string
): StoreRelation {
  return {
    space: spaceId,
    index: INITIAL_RELATION_INDEX_VALUE,
    typeOf: {
      id: EntityId(SystemIds.TYPES_ATTRIBUTE),
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
