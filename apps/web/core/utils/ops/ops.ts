import { Id, Op, Value } from '@graphprotocol/grc-20';

interface CreateArgs {
  entity: string;
  value: Value;
}

export function create({ entity, value }: CreateArgs): Op {
  return {
    type: 'UPDATE_ENTITY',
    entity: {
      id: Id(entity),
      values: [
        {
          property: Id(value.property),
          value: value.value,
          options: value.options,
        },
      ],
    },
  };
}
