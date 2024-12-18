import { createGeoId } from '../id.js';
import type { Op } from '../types.js';
import { ActionType, Edit, Entity, Op as OpBinary, OpType, Relation, Triple } from './gen/src/proto/ipfs_pb.js';

interface CreateEditProposalArgs {
  name: string;
  ops: Op[];
  author: string;
}

export function createEditProposal({ name, ops, author }: CreateEditProposalArgs): Uint8Array {
  return new Edit({
    type: ActionType.ADD_EDIT,
    version: '1.0.0',
    id: createGeoId(),
    name,
    ops: opsToBinary(ops),
    authors: [author],
  }).toBinary();
}

function opsToBinary(ops: Op[]): OpBinary[] {
  return ops.map(o => {
    switch (o.type) {
      case 'CREATE_RELATION':
        return new OpBinary({
          type: OpType.CREATE_RELATION,
          relation: Relation.fromJson(o.relation),
        });
      case 'DELETE_RELATION':
        return new OpBinary({
          type: OpType.DELETE_RELATION,
          relation: Relation.fromJson({
            id: o.relation.id,
          }),
        });
      case 'SET_BATCH_TRIPLE':
        return new OpBinary({
          type: OpType.SET_TRIPLE_BATCH,
          entity: Entity.fromJson(o.entity),
          triples: o.triples.map(t => Triple.fromJson(t)),
        });
      case 'DELETE_ENTITY':
        return new OpBinary({
          type: OpType.DELETE_ENTITY,
          entity: Entity.fromJson({
            id: o.entity.id,
          }),
        });
      case 'SET_TRIPLE':
        return new OpBinary({
          type: OpType.SET_TRIPLE,
          triple: Triple.fromJson(o.triple), // janky but works
        });
      case 'DELETE_TRIPLE':
        return new OpBinary({
          type: OpType.DELETE_TRIPLE,
          triple: Triple.fromJson(o.triple), // janky but works
        });
    }
  });
}
