import type * as S from 'zapatos/schema';

import { getTripleFromOp } from '../events/get-triple-from-op';
import { type BlockEvent, type DeleteTripleOp, type SetTripleOp, type TripleOp } from '~/sink/types';

export interface OpWithCreatedBy {
  createdById: string;
  op: TripleOp;
  triple: S.triples.Insertable;
}

export type SchemaTripleEdit = { ops: (SetTripleOp | DeleteTripleOp)[]; createdById: string; versonId: string };

export function mapSchemaTriples(edit: SchemaTripleEdit, block: BlockEvent): OpWithCreatedBy[] {
  const squashedOps = squashOps(edit.ops, edit.versonId);

  // Validating after squashing is an intentional decision to throw away ops
  // with the _final_ state of the ops in an edit. If we validate before we
  // squash then we can end up with an op that wasn't the final op in the edit,
  // but it _was_ the final _valid_ op in an edit. For now we only take the
  // final op and validate to better represent the intended final state of
  // the set of edits.
  const validOps = validateOps(squashedOps);

  return validOps.map((op): OpWithCreatedBy => {
    const triple = getTripleFromOp(op, edit.versonId, block);

    return {
      createdById: edit.createdById,
      op: op.type,
      triple,
    };
  });
}

function squashOps(ops: (SetTripleOp | DeleteTripleOp)[], versionId: string): (SetTripleOp | DeleteTripleOp)[] {
  // We take the last op for each (S,E,A,V) tuple
  const squashedOps = ops.reduce((acc, op) => {
    const idForOp = `${op.space}:${op.triple.entity}:${op.triple.attribute}:${versionId}`;
    acc.set(idForOp, op);
    return acc;
  }, new Map<string, SetTripleOp | DeleteTripleOp>());

  return [...squashedOps.values()];
}

function validateOps(ops: (SetTripleOp | DeleteTripleOp)[]) {
  return ops.filter(o => {
    if (o.type === 'DELETE_TRIPLE') return true;

    const triple = o.triple;

    switch (triple.value.type) {
      case 'CHECKBOX':
        return triple.value.value === '0' || triple.value.value === '1';
      default:
        return true;
    }
  });
}
