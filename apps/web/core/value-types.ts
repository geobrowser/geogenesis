import { SYSTEM_IDS } from '@geobrowser/gdk';

import { ValueType as TripleValueType, ValueTypeId } from './types';

export const valueTypeIds: Record<TripleValueType, ValueTypeId> = {
  TEXT: SYSTEM_IDS.TEXT,
  ENTITY: SYSTEM_IDS.RELATION,
  TIME: SYSTEM_IDS.DATE,
  URI: SYSTEM_IDS.WEB_URL,
};

export const valueTypes: Record<ValueTypeId, TripleValueType> = {
  [SYSTEM_IDS.TEXT]: 'TEXT',
  [SYSTEM_IDS.RELATION]: 'ENTITY',
  [SYSTEM_IDS.DATE]: 'TIME',
  [SYSTEM_IDS.WEB_URL]: 'URI',
};

export const valueTypeNames: Record<ValueTypeId, string> = {
  [SYSTEM_IDS.TEXT]: 'Text',
  [SYSTEM_IDS.RELATION]: 'Relation',
  [SYSTEM_IDS.DATE]: 'Date',
  [SYSTEM_IDS.WEB_URL]: 'Web URL',
};
