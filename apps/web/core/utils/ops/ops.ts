import { Op, Value } from '@geobrowser/gdk';

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
