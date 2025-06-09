import { Value } from '~/core/v2.types';

import { RemoteValue } from '../v2/v2.schema';

export function ValueDto(value: RemoteValue): Value {
  return {
    spaceId: value.spaceId,
    property: {
      id: value.property.id,
      name: value.property.entity.name ?? null,
      dataType: value.property.dataType,
      relationValueTypes: [...value.property.relationValueTypes],
    },
    value: value.value,
  };
}
