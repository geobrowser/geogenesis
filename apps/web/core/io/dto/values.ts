import { Value } from '~/core/v2.types';

import { RemoteValue } from '../v2/v2.schema';

export function ValueDto(entity: { id: string; name: string | null }, remoteValue: RemoteValue): Value {
  return {
    entity: {
      id: entity.id,
      name: entity.name,
    },
    spaceId: remoteValue.spaceId,
    property: {
      id: remoteValue.property.id,
      name: remoteValue.property.entity.name ?? null,
      dataType: remoteValue.property.dataType,
      relationValueTypes: [...remoteValue.property.relationValueTypes],
    },
    value: remoteValue.value,
    options: {
      language: remoteValue.language ?? undefined,
      unit: remoteValue.unit ?? undefined,
    },
  };
}
