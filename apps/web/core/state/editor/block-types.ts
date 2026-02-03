import { IdUtils, Position, SystemIds } from '@geoprotocol/geo-sdk';

import { VIDEO_BLOCK_TYPE } from '~/core/constants';
import { EntityId } from '~/core/io/substream-schema';
import { Relation } from '~/core/types';

type BlockTypeId =
  | typeof SystemIds.TEXT_BLOCK
  | typeof SystemIds.IMAGE_TYPE
  | typeof SystemIds.DATA_BLOCK
  | typeof VIDEO_BLOCK_TYPE;

export function getRelationForBlockType(
  fromBlockEntityId: string,
  blockTypeId: BlockTypeId,
  spaceId: string
): Relation {
  return {
    id: IdUtils.generate(),
    entityId: IdUtils.generate(),
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
