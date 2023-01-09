import { SYSTEM_IDS } from './constants';
import { TripleValueType } from './types';

export const valueTypes: Record<string, TripleValueType> = {
  [SYSTEM_IDS.TEXT]: 'string',
  [SYSTEM_IDS.RELATION]: 'entity',
};
