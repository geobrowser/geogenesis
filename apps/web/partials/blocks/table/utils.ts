import { SYSTEM_IDS } from '@geogenesis/sdk';

import { Column, ValueTypeId } from '~/core/types';
import { Entity } from '~/core/utils/entity';

export function columnName(columnId: string, columns: Column[]): string {
  const column = columns.find(c => c.id === columnId);

  if (!column) {
    return '';
  }

  return Entity.name(column.triples) || '';
}

export function columnValueType(columnId: string, columns: Column[]): ValueTypeId {
  const column = columns.find(c => c.id === columnId);

  if (!column) {
    return SYSTEM_IDS.TEXT;
  }

  return Entity.valueTypeId(column.triples) ?? SYSTEM_IDS.TEXT;
}
