import { Value } from '~/core/v2.types';

import { RemoteValue } from '../v2/v2.schema';

export function ValueDto(remoteValue: RemoteValue): Value {
  return {
    spaceId: remoteValue.spaceId,
    property: {
      id: remoteValue.property.id,
      name: remoteValue.property.entity.name ?? null,
      dataType: remoteValue.property.dataType,
      relationValueTypes: [...remoteValue.property.relationValueTypes],
    },
    value: remoteValue.value,
  };
}
