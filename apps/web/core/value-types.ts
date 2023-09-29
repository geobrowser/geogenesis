import { SYSTEM_IDS } from '@geogenesis/ids';

import { TripleValueType } from './types';


export type ValueTypeId =
  | typeof SYSTEM_IDS.TEXT
  | typeof SYSTEM_IDS.RELATION
  | typeof SYSTEM_IDS.IMAGE
  | typeof SYSTEM_IDS.DATE
  | typeof SYSTEM_IDS.WEB_URL
  | typeof SYSTEM_IDS.COLLECTION

export const valueTypeIds: Record<TripleValueType, ValueTypeId> = {
  string: SYSTEM_IDS.TEXT,
  entity: SYSTEM_IDS.RELATION,
  image: SYSTEM_IDS.IMAGE,
  date: SYSTEM_IDS.DATE,
  url: SYSTEM_IDS.WEB_URL,
  number: SYSTEM_IDS.TEXT,
  collection: SYSTEM_IDS.COLLECTION,
};

export const valueTypes: Record<ValueTypeId, TripleValueType> = {
  [SYSTEM_IDS.TEXT]: 'string',
  [SYSTEM_IDS.RELATION]: 'entity',
  [SYSTEM_IDS.COLLECTION]: 'collection',
  [SYSTEM_IDS.IMAGE]: 'image',
  [SYSTEM_IDS.DATE]: 'date',
  [SYSTEM_IDS.WEB_URL]: 'url',
};

export const valueTypeNames: Record<ValueTypeId, string> = {
  [SYSTEM_IDS.TEXT]: 'Text',
  [SYSTEM_IDS.RELATION]: 'Relation',
  [SYSTEM_IDS.COLLECTION]: 'Collection',
  [SYSTEM_IDS.IMAGE]: 'Image',
  [SYSTEM_IDS.DATE]: 'Date',
  [SYSTEM_IDS.WEB_URL]: 'Web URL',
};
