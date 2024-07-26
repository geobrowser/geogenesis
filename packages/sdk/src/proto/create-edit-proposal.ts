import type { Op } from '../..'
import { createGeoId } from '../id'
import { ActionType, Edit, OpType, Triple, Op as OpBinary } from './gen/src/proto/ipfs_pb';

interface CreateEditProposalArgs {
  name: string;
  ops: Op[],
  author: string
}

export function createEditProposal(
  { name, ops, author }: CreateEditProposalArgs
): Uint8Array {
  return new Edit({
    type: ActionType.ADD_EDIT,
    version: '1.0.0',
    id: createGeoId(),
    name,
    ops: ops.map(o => {
      return new OpBinary({
        opType: o.type === 'SET_TRIPLE' ? OpType.SET_TRIPLE : OpType.DELETE_TRIPLE,
        triple: Triple.fromJson(o.triple) // janky but works
      })
    }),
    authors: [author],
  }).toBinary()
}
