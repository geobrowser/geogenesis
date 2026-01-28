import { SystemIds } from '@geoprotocol/geo-sdk';

import { GEO_LOCATION, PLACE, VIDEO_RENDERABLE_TYPE } from '~/core/constants';
import { DataType as AppDataType, Property, RenderableType } from '~/core/v2.types';

import { RemoteProperty } from '../v2/v2.schema';

export function PropertyDto(queryResult: RemoteProperty): Property {
  const mappedDataType = getAppDataTypeFromRemoteDataType(queryResult.dataTypeName);

  return {
    id: queryResult.id,
    name: queryResult.name,
    dataType: mappedDataType,
    // @TODO(grc-20-v2-migration): Remove legacy fields
    relationValueTypes: [],
    renderableType: null,
    renderableTypeStrict: undefined,
    format: null,
    unit: null,
    isDataTypeEditable: false, // Remote properties are not editable
  };
}

/**
 * Maps a renderableType entity ID to a strict renderable type string.
 * Used for determining how to render properties (as images, videos, URLs, etc.)
 */
export function getStrictRenderableType(renderableType: string | null): RenderableType | undefined {
  switch (renderableType) {
    case SystemIds.IMAGE:
      return 'IMAGE';
    case VIDEO_RENDERABLE_TYPE:
      return 'VIDEO';
    case SystemIds.URL:
      return 'URL';
    case GEO_LOCATION:
      return 'GEO_LOCATION';
    case PLACE:
      return 'PLACE';
    default:
      return undefined;
  }
}

/**
 * Maps remote GRC-20 v2 data type names to app DataType.
 * GRC-20 v2 types are passed through directly (normalized to uppercase).
 */
export function getAppDataTypeFromRemoteDataType(dataType: string | null): AppDataType {
  // Normalize to uppercase for case-insensitive matching
  const normalizedType = dataType?.toUpperCase() ?? null;

  // Valid GRC-20 v2 types - pass through directly
  const validTypes: AppDataType[] = [
    'TEXT',
    'INT64',
    'FLOAT64',
    'DECIMAL',
    'BOOL',
    'DATE',
    'DATETIME',
    'TIME',
    'POINT',
    'RELATION',
    'BYTES',
    'SCHEDULE',
    'EMBEDDING',
  ];

  if (normalizedType && validTypes.includes(normalizedType as AppDataType)) {
    return normalizedType as AppDataType;
  }

  console.warn(`Unknown data type: ${dataType}, defaulting to TEXT`);
  return 'TEXT';
}
