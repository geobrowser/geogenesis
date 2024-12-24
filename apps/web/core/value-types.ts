import { SYSTEM_IDS } from '@geogenesis/sdk';

import { ValueType as TripleValueType, ValueTypeId } from './types';

export const valueTypeIds: Record<TripleValueType, ValueTypeId> = {
  TEXT: SYSTEM_IDS.TEXT,
  TIME: SYSTEM_IDS.DATE,
  URL: SYSTEM_IDS.URI,
  CHECKBOX: SYSTEM_IDS.CHECKBOX,
  NUMBER: SYSTEM_IDS.NUMBER,
};

export type FilterableValueType = TripleValueType | 'RELATION' | 'IMAGE';

export const valueTypes: Record<ValueTypeId, FilterableValueType> = {
  [SYSTEM_IDS.CHECKBOX]: 'CHECKBOX',
  [SYSTEM_IDS.DATE]: 'TIME',
  [SYSTEM_IDS.IMAGE]: 'IMAGE',
  [SYSTEM_IDS.NUMBER]: 'NUMBER',
  [SYSTEM_IDS.RELATION]: 'RELATION',
  [SYSTEM_IDS.TEXT]: 'TEXT',
  [SYSTEM_IDS.URI]: 'URL',
};

export const valueTypeNames: Record<ValueTypeId, string> = {
  [SYSTEM_IDS.CHECKBOX]: 'Checkbox',
  [SYSTEM_IDS.DATE]: 'Date',
  [SYSTEM_IDS.IMAGE]: 'Image',
  [SYSTEM_IDS.NUMBER]: 'Number',
  [SYSTEM_IDS.RELATION]: 'Relation',
  [SYSTEM_IDS.TEXT]: 'Text',
  [SYSTEM_IDS.URI]: 'Web URL',
};
