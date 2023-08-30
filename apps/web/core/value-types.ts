import { SYSTEM_IDS } from '@geogenesis/ids';

import { TripleValueType } from './types';

export type ValueType = keyof typeof valueTypes;

export const valueTypes: Record<string, TripleValueType> = {
  [SYSTEM_IDS.TEXT]: 'string',
  [SYSTEM_IDS.RELATION]: 'entity',
  [SYSTEM_IDS.IMAGE]: 'image',
  [SYSTEM_IDS.DATE]: 'date',
  [SYSTEM_IDS.WEB_URL]: 'url',
};

export const valueTypeNames: Record<string, string> = {
  [SYSTEM_IDS.TEXT]: 'Text',
  [SYSTEM_IDS.RELATION]: 'Relation',
  [SYSTEM_IDS.IMAGE]: 'Image',
  [SYSTEM_IDS.DATE]: 'Date',
  [SYSTEM_IDS.WEB_URL]: 'Web URL',
};
