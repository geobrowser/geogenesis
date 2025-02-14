import { SYSTEM_IDS } from '@graphprotocol/grc-20';

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
    case SYSTEM_IDS.RELATION:
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
    case SYSTEM_IDS.TIME:
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
    case SYSTEM_IDS.URL:
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

    case SYSTEM_IDS.TEXT:
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
