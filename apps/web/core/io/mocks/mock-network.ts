import { SystemIds } from '@graphprotocol/grc-20';

import { Triple, TripleWithDateValue, TripleWithStringValue, TripleWithUrlValue, Value } from '~/core/types';

export const makeStubTriple = (name: string, entityId?: string): Triple => {
  return {
    id: name,
    entityId: entityId ?? name,
    entityName: name,
    attributeId: SystemIds.NAME_ATTRIBUTE,
    attributeName: 'Name',
    value: {
      type: 'TEXT',
      value: name,
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

export const makeStubTripleWithStringValue = (value: string): TripleWithStringValue => {
  return {
    id: `id~${value}`,
    entityId: `entityId~${value}`,
    entityName: `entityName~${value}`,
    attributeId: `attributeId~${value}`,
    attributeName: `attributeName~${value}`,
    value: {
      type: 'TEXT',
      value,
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
      type: 'TIME',
      value,
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
      type: 'URL',
      value,
    },
    space: `space~${value}`,
  };
};
