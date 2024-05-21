import { SYSTEM_IDS } from '@geogenesis/ids';

import { ValueType as TripleValueType } from './types';

export type ValueTypeId =
  | typeof SYSTEM_IDS.TEXT
  | typeof SYSTEM_IDS.RELATION
  | typeof SYSTEM_IDS.IMAGE
  | typeof SYSTEM_IDS.DATE
  | typeof SYSTEM_IDS.WEB_URL;

export const valueTypeIds: Record<TripleValueType, ValueTypeId> = {
  TEXT: SYSTEM_IDS.TEXT,
  ENTITY: SYSTEM_IDS.RELATION,
  IMAGE: SYSTEM_IDS.IMAGE,
  TIME: SYSTEM_IDS.DATE,
  URL: SYSTEM_IDS.WEB_URL,
  NUMBER: SYSTEM_IDS.TEXT,
  COLLECTION: SYSTEM_IDS.RELATION, // @TODO: Collection value type
  CHECKBOX: SYSTEM_IDS.TEXT, // @TODO: Checkbox value type
};

export const valueTypes: Record<ValueTypeId, TripleValueType> = {
  [SYSTEM_IDS.TEXT]: 'TEXT',
  [SYSTEM_IDS.RELATION]: 'ENTITY',
  [SYSTEM_IDS.IMAGE]: 'IMAGE',
  [SYSTEM_IDS.DATE]: 'TIME',
  [SYSTEM_IDS.WEB_URL]: 'URL',
};

export const valueTypeNames: Record<ValueTypeId, string> = {
  [SYSTEM_IDS.TEXT]: 'Text',
  [SYSTEM_IDS.RELATION]: 'Relation',
  [SYSTEM_IDS.IMAGE]: 'Image',
  [SYSTEM_IDS.DATE]: 'Date',
  [SYSTEM_IDS.WEB_URL]: 'Web URL',
};
