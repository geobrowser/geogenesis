import type * as S from 'zapatos/schema';

import { getTripleFromOp } from '../events/get-triple-from-op';
import { type BlockEvent, type Op, type TripleOp } from '~/sink/types';

export interface OpWithCreatedBy {
  createdById: string;
  op: TripleOp;
  triple: S.triples.Insertable;
}

export type SchemaTripleEdit = { ops: Op[]; spaceId: string; createdById: string; versonId: string };

export function mapSchemaTriples(edit: SchemaTripleEdit, block: BlockEvent): OpWithCreatedBy[] {
  const squashedOps = squashOps(edit.ops, edit.spaceId, edit.versonId);

  return squashedOps.map((op): OpWithCreatedBy => {
    const triple = getTripleFromOp(op, edit.spaceId, edit.versonId, block);

    return {
      createdById: edit.createdById,
      op: op.type,
      triple,
    };
  });
}

function squashOps(ops: Op[], spaceId: string, versionId: string): Op[] {
  if (ops === undefined) {
    console.log('invalid edit', { versionId });
    return [];
  }

  // We take the last op for each (S,E,A,V) tuple
  const squashedOps = ops.reduce((acc, op) => {
    const idForOp = `${spaceId}:${op.triple.entity}:${op.triple.attribute}:${versionId}`;
    acc.set(idForOp, op);
    return acc;
  }, new Map<string, Op>());

  return [...squashedOps.values()];
}
