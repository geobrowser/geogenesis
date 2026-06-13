import { removeSourceType } from '~/core/blocks/data/source';
import { EntityId } from '~/core/io/substream-schema';
import { RANKING_BLOCK_TYPE_ID, RANKING_BLOCK_TYPE_NAME } from '~/core/ranking-block-ids';
import { getRelationForBlockType } from '~/core/state/editor/block-types';
import type { Mutator } from '~/core/sync/use-mutate';
import type { Relation } from '~/core/types';

import { isRankingBlockEntity } from './ranking-block-state';

export function ensureRankingBlockTypeRelation({
  storage,
  blockId,
  spaceId,
  relations,
}: {
  storage: Mutator;
  blockId: string;
  spaceId: string;
  relations: Relation[];
}) {
  if (isRankingBlockEntity(blockId, relations, spaceId)) {
    removeSourceType({ blockId, dataEntityRelations: relations });
    return;
  }

  storage.relations.set(
    getRelationForBlockType(EntityId(blockId), RANKING_BLOCK_TYPE_ID, spaceId, RANKING_BLOCK_TYPE_NAME)
  );
  removeSourceType({ blockId, dataEntityRelations: relations });
}
