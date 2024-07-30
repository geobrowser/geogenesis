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

    if (
      triple.attribute_id === 'c43b537bcff742718822717fdf2c9c01' ||
      triple.attribute_id === 'c1f4cb6fece44c3ca447ab005b756972' ||
      triple.attribute_id === 'c167ef23fb2a40449ed945123ce7d2a9'
    ) {
      console.log('found relation triple', triple);
    }

    if (!triple.value_type) {
      console.log('invalid triple', {
        triple,
        op: JSON.stringify(op, null, 2),
        proposalId: edit.proposalId,
      });
    }

    return {
      createdById: edit.createdById,
      op: op.type,
      triple,
    };
  });
}
