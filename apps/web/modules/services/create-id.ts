import { v4, validate, version } from 'uuid';
import { Triple, Value } from '../types';

export function createEntityId() {
  return v4();
}

/**
 * Values are encoded into ids by adding a type prefix to the beginning
 */
function createValueId(value: Value): string {
  switch (value.type) {
    case 'entity':
      return `e~${value.value}`;
    case 'string':
      return `s~${value.value}`;
    case 'number':
      return `n~${value.value}`;
  }
}

/**
 * Triple id encoding should match between client and network.
 * As a future improvement, we could try to run the same code between assemblyscript/typescript.
 */
export function createTripleId(entityId: string, attributeId: string, value: Value): string {
  return `${entityId}:${attributeId}:${createValueId(value)}`;
}

export function createTripleWithId(entityId: string, attributeId: string, value: Value): Triple {
  return {
    id: createTripleId(entityId, attributeId, value),
    entityId,
    attributeId,
    value,
  };
}

export const BUILTIN_ENTITY_IDS = ['name', 'type'];

function isValidUuid(uuid: string) {
  return validate(uuid) && version(uuid) === 4;
}

export function isValidEntityId(id: string) {
  return isValidUuid(id) || BUILTIN_ENTITY_IDS.includes(id);
}
