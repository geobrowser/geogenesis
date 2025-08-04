import { ID } from '~/core/id';
import { Value } from '~/core/v2.types';

import { RemoteValue } from '../v2/v2.schema';

export function ValueDto(entity: { id: string; name: string | null }, remoteValue: RemoteValue): Value {
  const value = getValueFromDataType(remoteValue);

  if (!value) {
    console.error('Could not parse valid value for remote value. Defaulting to empty string.', remoteValue);
  }

  return {
    id: ID.createValueId({
      entityId: entity.id,
      propertyId: remoteValue.property.id,
      spaceId: remoteValue.spaceId,
    }),
    entity: {
      id: entity.id,
      name: entity.name,
    },
    spaceId: remoteValue.spaceId,
    property: {
      id: remoteValue.property.id,
      name: remoteValue.property.name ?? null,
      dataType: remoteValue.property.dataType,
      renderableType: remoteValue.property.renderableType,
      relationValueTypes: [...remoteValue.property.relationValueTypes],
    },
    value: value ?? '',
    options: {
      language: remoteValue.language ?? undefined,
      unit: remoteValue.unit ?? undefined,
    },
  };
}

function getValueFromDataType(remoteValue: RemoteValue): string | null {
  switch (remoteValue.property.dataType) {
    case 'TEXT':
      return remoteValue.string;
    case 'NUMBER':
      return remoteValue.number;
    case 'TIME':
      return remoteValue.time;
    case 'CHECKBOX': {
      if (remoteValue.boolean === null) {
        return null;
      }

      return remoteValue.boolean === true ? '1' : '0';
    }
    case 'POINT':
      return remoteValue.point;

    default:
      console.error('Invalid data type for value', remoteValue.property.dataType);
      return null;
  }
}
