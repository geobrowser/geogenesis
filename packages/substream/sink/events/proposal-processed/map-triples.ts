import type * as S from 'zapatos/schema';

import { getTripleFromOp } from '../get-triple-from-op';
import { type BlockEvent, type Op, type TripleOp } from '~/sink/types';

export interface OpWithCreatedBy {
  createdById: string;
  op: TripleOp;
  triple: S.triples.Insertable;
}

export type SchemaTripleEdit = Parameters<typeof mapSchemaTriples>[0];

// @TODO: Do we squash actions in the new data model?
export function mapSchemaTriples(
  edit: { ops: Op[]; spaceId: string; createdById: string },
  block: BlockEvent
): OpWithCreatedBy[] {
  return edit.ops.map((op): OpWithCreatedBy => {
    return {
      createdById: edit.createdById,
      op: op.opType,
      triple: getTripleFromOp(op, edit.spaceId, block),
    };
  });
}
