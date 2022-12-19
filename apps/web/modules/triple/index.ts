import { OmitStrict, Triple as TripleType } from '../types';

function createTripleId(triple: OmitStrict<TripleType, 'id'>): string {
  return `${triple.space}:${triple.entityId}:${triple.attributeId}:${triple.value.id}`;
}

function withId(triple: OmitStrict<TripleType, 'id'>): TripleType {
  return {
    id: createTripleId(triple),
    entityId: triple.entityId,
    attributeId: triple.attributeId,
    attributeName: triple.attributeName,
    value: triple.value,
    space: triple.space,
    entityName: triple.entityName,
  };
}

function empty(entityId: string): TripleType {
  return {
    id: '',
    entityId: entityId,
    attributeId: '',
    attributeName: '',
    value: {
      id: '',
      type: 'string',
      value: '',
    },
    space: '',
    entityName: '',
  };
}

export const Triple = {
  withId,
  empty,
};
