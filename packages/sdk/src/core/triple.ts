import type { DeleteTripleOp, SetTripleOp, Value } from '../types.js';

interface CreateTripleArgs {
  attributeId: string;
  entityId: string;
  value: Value;
}

export function make(args: CreateTripleArgs): SetTripleOp {
  return {
    type: 'SET_TRIPLE',
    triple: {
      attribute: args.attributeId,
      entity: args.entityId,
      value: args.value,
    },
  };
}

interface DeleteTripleArgs {
  attributeId: string;
  entityId: string;
}

export function remove(args: DeleteTripleArgs): DeleteTripleOp {
  return {
    type: 'DELETE_TRIPLE',
    triple: {
      attribute: args.attributeId,
      entity: args.entityId,
    },
  };
}
