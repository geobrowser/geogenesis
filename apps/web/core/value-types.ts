import { SYSTEM_IDS } from '@geogenesis/sdk';

import { ValueType as TripleValueType, ValueTypeId } from './types';

export const valueTypeIds: Record<TripleValueType, ValueTypeId> = {
  TEXT: SYSTEM_IDS.TEXT,
  TIME: SYSTEM_IDS.DATE,
  URL: SYSTEM_IDS.URI,
  CHECKBOX: SYSTEM_IDS.CHECKBOX,
};

export type FilterableValueType = TripleValueType | 'RELATION';

export const valueTypes: Record<ValueTypeId, FilterableValueType> = {
  [SYSTEM_IDS.TEXT]: 'TEXT',
  [SYSTEM_IDS.RELATION]: 'RELATION',
  [SYSTEM_IDS.DATE]: 'TIME',
  [SYSTEM_IDS.URI]: 'URL',
  [SYSTEM_IDS.CHECKBOX]: 'CHECKBOX',
};

export const valueTypeNames: Record<ValueTypeId, string> = {
  [SYSTEM_IDS.TEXT]: 'Text',
  [SYSTEM_IDS.RELATION]: 'Relation',
  [SYSTEM_IDS.DATE]: 'Date',
  [SYSTEM_IDS.URI]: 'Web URL',
  [SYSTEM_IDS.CHECKBOX]: 'Checkbox',
};
