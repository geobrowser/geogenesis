import { IdUtils, Position, SystemIds } from '@geoprotocol/geo-sdk';

import { EntityId } from '~/core/io/substream-schema';
import { Relation } from '~/core/types';

type BlockTypeId =
  | typeof SystemIds.TEXT_BLOCK
  | typeof SystemIds.IMAGE_TYPE
  | typeof SystemIds.DATA_BLOCK
  | typeof SystemIds.VIDEO_TYPE;

const BLOCK_TYPE_NAMES: Record<BlockTypeId, string> = {
  [SystemIds.TEXT_BLOCK]: 'Text Block',
  [SystemIds.IMAGE_TYPE]: 'Image',
  [SystemIds.DATA_BLOCK]: 'Data Block',
  [SystemIds.VIDEO_TYPE]: 'Video',
};

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
      name: BLOCK_TYPE_NAMES[blockTypeId],
      value: blockTypeId,
    },
    fromEntity: {
      id: EntityId(fromBlockEntityId),
      name: null,
    },
  };
}
