import { SYSTEM_IDS } from '@geogenesis/sdk';

import { ValueType as TripleValueType, ValueTypeId } from './types';

export const valueTypeIds: Record<TripleValueType, ValueTypeId> = {
  TEXT: SYSTEM_IDS.TEXT,
  TIME: SYSTEM_IDS.DATE,
  URI: SYSTEM_IDS.WEB_URL,
  CHECKBOX: SYSTEM_IDS.CHECKBOX,
};

export const valueTypes: Record<ValueTypeId, TripleValueType | 'RELATION'> = {
  [SYSTEM_IDS.TEXT]: 'TEXT',
  [SYSTEM_IDS.RELATION]: 'RELATION',
  [SYSTEM_IDS.DATE]: 'TIME',
  [SYSTEM_IDS.WEB_URL]: 'URI',
  [SYSTEM_IDS.CHECKBOX]: 'CHECKBOX',
};

export const valueTypeNames: Record<ValueTypeId, string> = {
  [SYSTEM_IDS.TEXT]: 'Text',
  [SYSTEM_IDS.RELATION]: 'Relation',
  [SYSTEM_IDS.DATE]: 'Date',
  [SYSTEM_IDS.WEB_URL]: 'Web URL',
  [SYSTEM_IDS.CHECKBOX]: 'Checkbox',
};
