import { SYSTEM_IDS } from '@geogenesis/sdk';

import { Schema, ValueTypeId } from '~/core/types';

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
