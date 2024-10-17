import { SYSTEM_IDS } from '@geogenesis/sdk';

import { RenderableProperty, Schema, ValueTypeId } from '~/core/types';

export function columnName(columnId: string, columns: Schema[]): string {
  const column = columns.find(c => c.id === columnId);

  if (!column) {
    return '';
  }

  return column.name ?? '';
}

export function columnValueType(columnId: string, columns: Schema[]): ValueTypeId {
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
    case SYSTEM_IDS.DATE:
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
    case SYSTEM_IDS.WEB_URL:
      return {
        type: 'URI',
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
