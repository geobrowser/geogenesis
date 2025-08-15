import { ID } from '~/core/id';
import { DataType, Value } from '~/core/v2.types';

import { RemoteValue } from '../v2/v2.schema';
import { getAppDataTypeFromRemoteDataType } from './properties';

export function ValueDto(entity: { id: string; name: string | null }, remoteValue: RemoteValue): Value {
  const mappedDataType = getAppDataTypeFromRemoteDataType(remoteValue.property.dataType);
  const value = getValueFromDataType(mappedDataType, remoteValue);

  // Only log if it's not a RELATION type (which is expected to return null)
  // and we have actual data that failed to parse
  if (!value && mappedDataType !== 'RELATION') {
    const hasAnyValue = remoteValue.string || remoteValue.number || remoteValue.time || 
                        remoteValue.boolean !== null || remoteValue.point;
    
    if (hasAnyValue) {
      console.warn('Could not parse value for data type:', mappedDataType, 'Property:', remoteValue.property.name);
    }
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
      // Relations are handled separately through the relations list, not as values
      return null;

    default:
      // Unknown data type - will be logged in ValueDto if there's actual data
      return null;
  }
}
