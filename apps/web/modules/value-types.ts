import { SYSTEM_IDS } from '@geogenesis/ids';
import { TripleValueType } from './types';

type IDs = typeof SYSTEM_IDS;
type ValueTypeKeys = Pick<IDs, 'TEXT' | 'RELATION'>;
type IdsOfValueTypes = IDs[keyof ValueTypeKeys];

export const valueTypes: Record<IdsOfValueTypes, TripleValueType> = {
  [SYSTEM_IDS.TEXT]: 'string',
  [SYSTEM_IDS.RELATION]: 'entity',
};
