import { SYSTEM_IDS } from '@geogenesis/ids';

import { Space, Triple, TripleWithDateValue, TripleWithStringValue, TripleWithUrlValue, Value } from '~/core/types';

export const makeStubTriple = (name: string, entityId?: string): Triple => {
  return {
    id: name,
    entityId: entityId ?? name,
    entityName: name,
    attributeId: 'name',
    attributeName: 'Name',
    value: {
      type: 'string',
      value: name,
      id: `s~${name}`,
    },
    space: 's',
  };
};

export const makeStubTripleWithAttributeAndValue = (
  entityName: string,
  entityId: string,
  attribute: { id: string; name: string },
  value: Value
): Triple => {
  return {
    id: entityId,
    entityId: entityId,
    entityName,
    attributeId: attribute.id,
    attributeName: attribute.name,
    value,
    space: 's',
  };
};

export const makeStubTripleWithType = (typeId: string): Triple => {
  return {
    id: `id~${typeId}`,
    entityId: `entityId~${typeId}`,
    entityName: `entityName~${typeId}`,
    attributeId: SYSTEM_IDS.TYPES,
    attributeName: 'Types',
    value: {
      type: 'entity',
      name: `valueName~${typeId}`,
      id: typeId,
    },
    space: 's',
  };
};

export const makeStubTextAttribute = (name: string): Triple => {
  return {
    id: name,
    entityId: name,
    entityName: name,
    attributeId: SYSTEM_IDS.ATTRIBUTE,
    attributeName: 'Types',
    value: {
      type: 'entity',
      name: 'Text',
      id: SYSTEM_IDS.TEXT,
    },
    space: 's',
  };
};

export const makeStubRelationAttribute = (name: string): Triple => {
  return {
    id: name,
    entityId: name,
    entityName: name,
    attributeId: SYSTEM_IDS.ATTRIBUTE,
    attributeName: 'Types',
    value: {
      type: 'entity',
      name: 'Text',
      id: SYSTEM_IDS.RELATION,
    },
    space: 's',
  };
};

export const makeStubTripleWithStringValue = (value: string): TripleWithStringValue => {
  return {
    id: `id~${value}`,
    entityId: `entityId~${value}`,
    entityName: `entityName~${value}`,
    attributeId: `attributeId~${value}`,
    attributeName: `attributeName~${value}`,
    value: {
      type: 'string',
      value,
      id: `s~${value}`,
    },
    space: `space~${value}`,
  };
};

export const makeStubTripleWithDateValue = (value: string): TripleWithDateValue => {
  return {
    id: `id~${value}`,
    entityId: `entityId~${value}`,
    entityName: `entityName~${value}`,
    attributeId: `attributeId~${value}`,
    attributeName: `attributeName~${value}`,
    value: {
      type: 'date',
      value,
      id: `d~${value}`,
    },
    space: `space~${value}`,
  };
};

export const makeStubTripleWithUrlValue = (value: string): TripleWithUrlValue => {
  return {
    id: `id~${value}`,
    entityId: `entityId~${value}`,
    entityName: `entityName~${value}`,
    attributeId: `attributeId~${value}`,
    attributeName: `attributeName~${value}`,
    value: {
      type: 'url',
      value,
      id: `u~${value}`,
    },
    space: `space~${value}`,
  };
};

export const makeStubSpace = (spaceId: string): Space => {
  return {
    id: spaceId,
    isRootSpace: false,
    editors: [],
    members: [],
    spaceConfig: null,
    createdAtBlock: '36472399',
    mainVotingPluginAddress: null,
    memberAccessPluginAddress: '',
    spacePluginAddress: '',
  };
};
