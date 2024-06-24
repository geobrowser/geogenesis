import type { Op } from '../..'
import { createGeoId } from '../id'
import { ActionType, Edit, OpType, Payload, Op as OpBinary } from './gen/src/proto/ipfs_pb';

function stringToBytes(text: string) {
  return Uint8Array.from(Array.from(text).map(letter => letter.charCodeAt(0)))
}

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
    // @TODO: Encode this correctly
    authors: [stringToBytes(author)],
    version: '0.0.1',
    ops: ops.map(o => {
      return new OpBinary({
        opType: o.type === 'SET_TRIPLE' ? OpType.SET_TRIPLE : OpType.DELETE_TRIPLE,
        payload: Payload.fromJson(o.payload) // janky but works
      })
    }),
    id: createGeoId(),
    name,
  }).toBinary()
}
