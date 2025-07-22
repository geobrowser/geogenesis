import { SystemIds } from '@graphprotocol/grc-20';

import { ValueType as TripleValueType, ValueTypeId } from './types';

export const VALUE_TYPE_IDS: Record<TripleValueType, ValueTypeId> = {
  TEXT: SystemIds.TEXT,
  TIME: SystemIds.TIME,
  URL: SystemIds.URL,
  CHECKBOX: SystemIds.CHECKBOX,
  NUMBER: SystemIds.NUMBER,
  POINT: SystemIds.POINT,
};

export type FilterableValueType = TripleValueType | 'RELATION' | 'IMAGE';

export const VALUE_TYPES: Record<ValueTypeId, FilterableValueType> = {
  [SystemIds.CHECKBOX]: 'CHECKBOX',
  [SystemIds.TIME]: 'TIME',
  [SystemIds.IMAGE]: 'IMAGE',
  [SystemIds.NUMBER]: 'NUMBER',
  [SystemIds.RELATION]: 'RELATION',
  [SystemIds.TEXT]: 'TEXT',
  [SystemIds.URL]: 'URL',
};

export const VALUE_TYPE_NAMES: Record<ValueTypeId, string> = {
  [SystemIds.CHECKBOX]: 'Checkbox',
  [SystemIds.TIME]: 'Date',
  [SystemIds.IMAGE]: 'Image',
  [SystemIds.NUMBER]: 'Number',
  [SystemIds.RELATION]: 'Relation',
  [SystemIds.TEXT]: 'Text',
  [SystemIds.URL]: 'Web URL',
};
