import { SystemIds } from '@graphprotocol/grc-20';

import { RenderableProperty, ValueTypeId } from '~/core/types';

interface MakePlaceholderFromValueTypeArgs {
  valueType: ValueTypeId;
  attributeId: string;
  attributeName: string | null;
  spaceId: string;
  entityId: string;
}

export function makePlaceholderFromValueType(args: MakePlaceholderFromValueTypeArgs): RenderableProperty {
  const { attributeId, attributeName, entityId, valueType, spaceId } = args;

  switch (valueType) {
    case SystemIds.RELATION:
      return {
        type: 'RELATION',
        attributeId,
        attributeName,
        entityId,
        entityName: null,
        spaceId,
        valueName: null,
        value: '',
        relationId: '',
        placeholder: true,
      };
    case SystemIds.TIME:
      return {
        type: 'TIME',
        attributeId,
        attributeName,
        entityId,
        entityName: null,
        spaceId,
        value: '',
        placeholder: true,
      };
    case SystemIds.URL:
      return {
        type: 'URL',
        attributeId,
        attributeName,
        entityId,
        entityName: null,
        spaceId,
        value: '',
        placeholder: true,
      };

    case SystemIds.TEXT:
    default:
      return {
        type: 'TEXT',
        attributeId,
        attributeName,
        entityId,
        entityName: null,
        spaceId,
        value: '',
        placeholder: true,
      };
  }
}
