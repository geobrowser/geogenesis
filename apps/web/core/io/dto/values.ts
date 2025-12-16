import { ID } from '~/core/id';
import { DataType, Value } from '~/core/v2.types';

import { RemoteValue } from '../v2/v2.schema';
import { getAppDataTypeFromRemoteDataType } from './properties';

export function ValueDto(entity: { id: string; name: string | null }, remoteValue: RemoteValue): Value {
  const mappedDataType = getAppDataTypeFromRemoteDataType(remoteValue.property.dataType);
  const value = getValueFromDataType(mappedDataType, remoteValue);

  if (value === null && mappedDataType !== 'RELATION') {
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
      dataType: mappedDataType,
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

function getValueFromDataType(dataType: DataType, remoteValue: RemoteValue): string | null {
  switch (dataType) {
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
    case 'RELATION':
      // Relations are handled separately via relationsList, not valuesList
      return null;

    default:
      console.error('Invalid data type for value', remoteValue.property.dataType);
      return null;
  }
}
