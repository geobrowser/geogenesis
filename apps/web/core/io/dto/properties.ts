import { SystemIds } from '@graphprotocol/grc-20';

import { GEO_LOCATION } from '~/core/constants';
import { Property } from '~/core/v2.types';

import { RemoteProperty } from '../v2/v2.schema';

export function PropertyDto(queryResult: RemoteProperty): Property {
  return {
    id: queryResult.id,
    name: queryResult.name,
    dataType: queryResult.dataType,
    relationValueTypes: [...queryResult.relationValueTypes],
    renderableType: queryResult.renderableType,
    renderableTypeStrict: getStrictRenderableType(queryResult.renderableType),
  };
}

function getStrictRenderableType(renderableType: RemoteProperty['renderableType']) {
  switch (renderableType) {
    case SystemIds.IMAGE:
      return 'IMAGE';
    case SystemIds.URL:
      return 'URL';
    case GEO_LOCATION:
      return 'GEO_LOCATION';
    default:
      return undefined;
  }
}
