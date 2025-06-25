import { Property } from '~/core/v2.types';

import { RemoteProperty } from '../v2/v2.schema';

export function PropertyDto(queryResult: RemoteProperty): Property {
  return {
    id: queryResult.id,
    name: queryResult.entity.name,
    dataType: queryResult.dataType,
    relationValueTypes: [...queryResult.relationValueTypes],
    renderableType: queryResult.renderableType
      ? (queryResult.renderableType as Property['renderableType'])
      : queryResult.dataType,
  };
}
