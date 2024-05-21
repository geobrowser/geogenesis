import { Op, Value } from '@geogenesis/sdk';

interface CreateArgs {
  entityId: string;
  attributeId: string;
  value: Value;
}

export function create({ entityId, attributeId, value }: CreateArgs): Op {
  return {
    type: 'SET_TRIPLE',
    payload: {
      attributeId,
      entityId,
      value,
    },
  };
}
