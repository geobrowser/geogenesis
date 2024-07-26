import { Op, Value } from '@geogenesis/sdk';

import { Triple } from '~/core/types';

interface CreateArgs {
  entityId: string;
  attributeId: string;
  value: Value;
}

export function create({ entityId, attributeId, value }: CreateArgs): Op {
  return {
    type: 'SET_TRIPLE',
    triple: {
      attributeId,
      entityId,
      value,
    },
  };
}
