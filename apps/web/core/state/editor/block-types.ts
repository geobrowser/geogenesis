import { Position, SystemIds } from '@graphprotocol/grc-20';

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
    position: Position.generate(),
    typeOf: {
      id: EntityId(SystemIds.TYPES_PROPERTY),
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
