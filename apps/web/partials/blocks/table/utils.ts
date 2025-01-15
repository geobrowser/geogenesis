import { SYSTEM_IDS } from '@geogenesis/sdk';

import { PropertySchema, RenderableProperty, ValueTypeId } from '~/core/types';

export function columnName(columnId: string, columns: PropertySchema[]): string {
  const column = columns.find(c => c.id === columnId);

  if (!column) {
    return '';
  }

  return column.name ?? '';
}

export function columnValueType(columnId: string, columns: PropertySchema[]): ValueTypeId {
  const column = columns.find(c => c.id === columnId);

  if (!column) {
    return SYSTEM_IDS.TEXT;
  }

  return column.valueType ?? SYSTEM_IDS.TEXT;
}

interface MakePlaceholderFromValueTypeArgs {
  valueType: ValueTypeId;
  attributeId: string;
  attributeName: string;
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
