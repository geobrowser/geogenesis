import { ID } from '~/core/id';
import { DataType, Value } from '~/core/types';

import { RemoteValue } from '../schema';
import { resolveDataType } from './properties';

/** Checks if a remote value has actual data (not just null fields). */
export function hasValueData(remoteValue: RemoteValue): boolean {
  return (
    remoteValue.text !== null ||
    remoteValue.integer !== null ||
    remoteValue.float !== null ||
    remoteValue.boolean !== null ||
    remoteValue.point !== null ||
    remoteValue.time !== null ||
    remoteValue.datetime !== null ||
    remoteValue.date !== null ||
    remoteValue.decimal !== null ||
    remoteValue.bytes !== null
  );
}

export function ValueDto(entity: { id: string; name: string | null }, remoteValue: RemoteValue): Value {
  const mappedDataType = resolveDataType(remoteValue.property);
  const value = getValueFromDataType(mappedDataType, remoteValue);

  if (value === null && mappedDataType !== 'RELATION') {
    // This can happen during GRC-20 v2 migration when values exist but weren't properly populated
    console.warn(
      'Value has no data for dataType',
      mappedDataType,
      '- entity:',
      entity.id,
      'property:',
      remoteValue.property.id
    );
  }

  const propertyId = remoteValue.property.id;
  const spaceId = remoteValue.spaceId;

  return {
    id: ID.createValueId({
      entityId: entity.id,
      propertyId: propertyId,
      spaceId: spaceId,
    }),
    entity: {
      id: entity.id,
      name: entity.name,
    },
    spaceId: spaceId,
    property: {
      id: propertyId,
      name: remoteValue.property.name ?? null,
      dataType: mappedDataType,
      // @TODO(grc-20-v2-migration): Remove legacy fields
      renderableType: null,
      relationValueTypes: [],
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
      return remoteValue.text;

    // GRC-20 v2 numeric types
    case 'INTEGER':
      return remoteValue.integer;
    case 'FLOAT':
      return remoteValue.float !== null ? String(remoteValue.float) : null;
    case 'DECIMAL':
      // Backend may return decimal values in the decimal or float field
      if (remoteValue.decimal !== null) return String(remoteValue.decimal);
      if (remoteValue.float !== null) return String(remoteValue.float);
      return null;

    // GRC-20 v2 boolean type
    case 'BOOL': {
      if (remoteValue.boolean === null) {
        return null;
      }
      return remoteValue.boolean === true ? '1' : '0';
    }

    // GRC-20 v2 temporal types
    case 'DATE':
      return remoteValue.date;
    case 'DATETIME':
      return remoteValue.datetime;
    case 'TIME':
      return remoteValue.time;

    case 'POINT':
      return remoteValue.point;

    case 'RELATION':
      // Relations are handled separately via relationsList, not valuesList
      return null;

    // Unsupported types
    case 'BYTES':
    case 'SCHEDULE':
    case 'EMBEDDING':
      return null;

    default:
      console.error('Invalid data type for value', remoteValue.property.dataTypeName);
      return null;
  }
}
