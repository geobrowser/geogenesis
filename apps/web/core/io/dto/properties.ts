import { Property } from '~/core/v2.types';
import { uuidValidateV4 } from '~/core/utils/utils';

import { RemoteProperty } from '../v2/v2.schema';

export function PropertyDto(queryResult: RemoteProperty): Property {
  // If renderableType is a UUID, we'll need to fetch the entity name later
  // For now, we'll return the UUID and handle the lookup in a separate query
  const renderableType = queryResult.renderableType
    ? (queryResult.renderableType as Property['renderableType'])
    : queryResult.dataType;

  return {
    id: queryResult.id,
    name: queryResult.entity.name,
    dataType: queryResult.dataType,
    relationValueTypes: [...queryResult.relationValueTypes],
    renderableType,
  };
}
