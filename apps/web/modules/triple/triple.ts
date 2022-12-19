import { OmitStrict, Triple } from '../types';

function createTripleId(triple: OmitStrict<Triple, 'id'>): string {
  return `${triple.space}:${triple.entityId}:${triple.attributeId}:${triple.value.id}`;
}

export function withId(triple: OmitStrict<Triple, 'id'>): Triple {
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

export function empty(entityId: string): Triple {
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
