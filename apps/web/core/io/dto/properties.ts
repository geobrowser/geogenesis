import { SystemIds } from '@geoprotocol/geo-sdk';

import { GEO_LOCATION, PLACE, VIDEO_RENDERABLE_TYPE } from '~/core/constants';
import { DataType as AppDataType, LEGACY_DATA_TYPE_MAPPING, Property, RenderableType } from '~/core/types';
import { getDataTypeFromEntityId } from '~/core/utils/property/properties';

import { RemoteProperty } from '../schema';

export function PropertyDto(queryResult: RemoteProperty): Property {
  const mappedDataType = resolveDataType(queryResult);
  const renderableTypeId = queryResult.renderableTypeId ?? null;

  return {
    id: queryResult.id,
    name: queryResult.name,
    dataType: mappedDataType,
    // @TODO(grc-20-v2-migration): Remove legacy fields
    relationValueTypes: [],
    renderableType: renderableTypeId,
    renderableTypeStrict: getStrictRenderableType(renderableTypeId),
    format: queryResult.format ?? null,
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

export function getAppDataTypeFromRemoteDataType(dataType: string | null): AppDataType {
  const normalizedType = dataType?.toUpperCase() ?? null;

  if (normalizedType && normalizedType in LEGACY_DATA_TYPE_MAPPING) {
    return LEGACY_DATA_TYPE_MAPPING[normalizedType]!;
  }

  const validTypes: AppDataType[] = [
    'TEXT',
    'INTEGER',
    'FLOAT',
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

/** Prefers dataTypeId (UUID) over dataTypeName (string) for resolution. */
export function resolveDataType(queryResult: RemoteProperty): AppDataType {
  const result = queryResult.dataTypeId
    ? getDataTypeFromEntityId(queryResult.dataTypeId)
    : getAppDataTypeFromRemoteDataType(queryResult.dataTypeName);

  return result;
}
