import { SYSTEM_IDS } from '@geogenesis/ids';

import { TripleValueType } from './types';

export const valueTypes: Record<string, TripleValueType> = {
  [SYSTEM_IDS.TEXT]: 'string',
  [SYSTEM_IDS.RELATION]: 'entity',
  [SYSTEM_IDS.IMAGE]: 'image',
};

export const valueTypeNames: Record<string, string> = {
  [SYSTEM_IDS.TEXT]: 'Text',
  [SYSTEM_IDS.RELATION]: 'Relation',
  [SYSTEM_IDS.IMAGE]: 'Image',
};
