import type * as S from 'zapatos/schema';

import { getTripleFromOp } from '../get-triple-from-op';
import { type BlockEvent, type Op, type TripleOp } from '~/sink/types';

export interface OpWithCreatedBy {
  createdById: string;
  op: TripleOp;
  triple: S.triples.Insertable;
}

export type SchemaTripleEdit = { ops: Op[]; spaceId: string; createdById: string; proposalId: string };

// @TODO: Do we squash actions in the new data model?
export function mapSchemaTriples(edit: SchemaTripleEdit, block: BlockEvent): OpWithCreatedBy[] {
  return edit.ops.map((op): OpWithCreatedBy => {
    const triple = getTripleFromOp(op, edit.spaceId, block);

    if (!triple.value_type) {
      console.log('invalid triple', {
        triple,
        op: JSON.stringify(op, null, 2),
        proposalId: edit.proposalId,
      });
    }

    return {
      createdById: edit.createdById,
      op: op.opType,
      triple,
    };
  });
}
