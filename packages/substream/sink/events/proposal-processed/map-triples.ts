import type * as S from 'zapatos/schema';

import { getTripleFromOp } from '../get-triple-from-op';
import { type BlockEvent, type Op, type TripleOp } from '~/sink/types';

export interface OpWithCreatedBy {
  createdById: string;
  op: TripleOp;
  triple: S.triples.Insertable;
}

export type SchemaTripleEdit = { ops: Op[]; spaceId: string; createdById: string; versonId: string };

export function mapSchemaTriples(edit: SchemaTripleEdit, block: BlockEvent): OpWithCreatedBy[] {
  const squashedOps = squashOps(edit.ops, edit.spaceId);

  return squashedOps.map((op): OpWithCreatedBy => {
    const triple = getTripleFromOp(op, edit.spaceId, edit.versonId, block);

    return {
      createdById: edit.createdById,
      op: op.type,
      triple,
    };
  });
}

function squashOps(ops: Op[], spaceId: string): Op[] {
  // We take the last op for each (S,E,A) tuple
  const squashedOps = ops.reduce((acc, op) => {
    const idForOp = `${spaceId}:${op.triple.entity}:${op.triple.attribute}`;
    acc.set(idForOp, op);
    return acc;
  }, new Map<string, Op>());

  return [...squashedOps.values()];
}
