import { SystemIds } from '@graphprotocol/grc-20';

import { GEO_LOCATION, PDF_TYPE } from '~/core/constants';
import { DataType as AppDataType, Property } from '~/core/v2.types';

import { DataType, RemoteProperty } from '../v2/v2.schema';

export function PropertyDto(queryResult: RemoteProperty): Property {
  const mappedDataType = getAppDataTypeFromRemoteDataType(queryResult.dataType);

  return {
    id: queryResult.id,
    name: queryResult.name,
    dataType: mappedDataType,
    relationValueTypes: [...queryResult.relationValueTypes],
    renderableType: queryResult.renderableType,
    renderableTypeStrict: getStrictRenderableType(queryResult.renderableType),
    format: queryResult.format,
    unit: queryResult.unit,
    isDataTypeEditable: false, // Remote properties are not editable
  };
}

export function getStrictRenderableType(renderableType: RemoteProperty['renderableType']) {
  switch (renderableType) {
    case SystemIds.IMAGE:
      return 'IMAGE';
    case SystemIds.URL:
      return 'URL';
    case GEO_LOCATION:
      return 'GEO_LOCATION';
    case PDF_TYPE:
      return 'PDF';
    default:
      return undefined;
  }
}

export function getAppDataTypeFromRemoteDataType(dataType: DataType): AppDataType {
  switch (dataType) {
    case 'STRING':
      return 'TEXT';
    case 'BOOLEAN':
      return 'CHECKBOX';
    default:
      return dataType;
  }
}
