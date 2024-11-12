import type * as Schema from 'zapatos/schema';

import type { BlockEvent } from '../types';
import { createVersionId } from '../utils/id';

export function makeVersionForStaleEntity(args: {
  entityId: string;
  editId: string;
  block: BlockEvent;
  creator: string;
  createdAt: string;
}): Schema.versions.Insertable {
  const { block, createdAt, creator, editId, entityId } = args;

  const id = createVersionId({
    entityId,
    proposalId: editId,
  });

  return {
    id,
    entity_id: entityId,
    created_at_block: block.blockNumber,
    created_at: Number(createdAt),
    created_by_id: creator,
    edit_id: editId,
  };
}
