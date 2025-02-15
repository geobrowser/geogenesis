import { SYSTEM_IDS } from '@graphprotocol/grc-20';

import { ValueType as TripleValueType, ValueTypeId } from './types';

export const VALUE_TYPE_IDS: Record<TripleValueType, ValueTypeId> = {
  TEXT: SYSTEM_IDS.TEXT,
  TIME: SYSTEM_IDS.TIME,
  URL: SYSTEM_IDS.URL,
  CHECKBOX: SYSTEM_IDS.CHECKBOX,
  NUMBER: SYSTEM_IDS.NUMBER,
};

export type FilterableValueType = TripleValueType | 'RELATION' | 'IMAGE';

export const VALUE_TYPES: Record<ValueTypeId, FilterableValueType> = {
  [SYSTEM_IDS.CHECKBOX]: 'CHECKBOX',
  [SYSTEM_IDS.TIME]: 'TIME',
  [SYSTEM_IDS.IMAGE]: 'IMAGE',
  [SYSTEM_IDS.NUMBER]: 'NUMBER',
  [SYSTEM_IDS.RELATION]: 'RELATION',
  [SYSTEM_IDS.TEXT]: 'TEXT',
  [SYSTEM_IDS.URL]: 'URL',
};

export const VALUE_TYPE_NAMES: Record<ValueTypeId, string> = {
  [SYSTEM_IDS.CHECKBOX]: 'Checkbox',
  [SYSTEM_IDS.TIME]: 'Date',
  [SYSTEM_IDS.IMAGE]: 'Image',
  [SYSTEM_IDS.NUMBER]: 'Number',
  [SYSTEM_IDS.RELATION]: 'Relation',
  [SYSTEM_IDS.TEXT]: 'Text',
  [SYSTEM_IDS.URL]: 'Web URL',
};
