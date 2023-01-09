import { SYSTEM_IDS } from './constants';

export const valueTypeSchema = {
  [SYSTEM_IDS.TEXT]: 'string',
  [SYSTEM_IDS.RELATION]: 'entity',
};
