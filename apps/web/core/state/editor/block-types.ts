import { Id, Position, SystemIds } from '@graphprotocol/grc-20';

import { EntityId } from '~/core/io/schema';
import { Relation } from '~/core/v2.types';

type BlockTypeId = typeof SystemIds.TEXT_BLOCK | typeof SystemIds.IMAGE_TYPE | typeof SystemIds.DATA_BLOCK;

export function getRelationForBlockType(
  fromBlockEntityId: string,
  blockTypeId: BlockTypeId,
  spaceId: string
): Relation {
  return {
    id: Id.generate(),
    entityId: Id.generate(),
    spaceId: spaceId,
    position: Position.generate(),
    renderableType: 'RELATION',
    type: {
      id: EntityId(SystemIds.TYPES_PROPERTY),
      name: 'Types',
    },
    toEntity: {
      id: EntityId(blockTypeId),
      name: null,
      value: blockTypeId,
    },
    fromEntity: {
      id: EntityId(fromBlockEntityId),
      name: null,
    },
  };
}
