import type { IntermediateSinkEditProposal, Op, SetTripleOp } from '../types';

export function postProcessProposalOps(proposal: IntermediateSinkEditProposal, spaceId: string) {
  return {
    ...proposal,
    ops: proposal.ops.map((op): Op => {
      switch (op.type) {
        case 'SET_TRIPLE':
          return {
            type: 'SET_TRIPLE',
            space: spaceId,
            triple: op.triple,
          } as SetTripleOp;
        case 'DELETE_TRIPLE':
          return {
            type: 'DELETE_TRIPLE',
            space: spaceId,
            triple: {
              attribute: op.triple.attribute,
              entity: op.triple.entity,
              value: {},
            },
          };
        case 'CREATE_RELATION':
          return {
            type: 'CREATE_RELATION',
            space: spaceId,
            relation: op.relation,
          };
        case 'DELETE_RELATION':
          return {
            type: 'DELETE_RELATION',
            space: spaceId,
            relation: op.relation,
          };
        case 'IMPORT_FILE':
          throw new Error('Not implemented');
      }
    }),
  };
}
