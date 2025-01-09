import { Op, Value } from '@geogenesis/sdk';

interface CreateArgs {
  entity: string;
  attribute: string;
  value: Value;
}

export function create({ entity, attribute, value }: CreateArgs): Op {
  return {
    type: 'SET_TRIPLE',
    triple: {
      attribute,
      entity,
      value,
    },
  };
}
