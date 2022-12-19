import { v4, validate, version } from 'uuid';
import { OmitStrict, Triple } from '../types';

export function createEntityId() {
  return v4();
}

/**
 * Triple id encoding should match between client and network.
 * As a future improvement, we could try to run the same code between assemblyscript/typescript.
 */
export function createTripleId(triple: OmitStrict<Triple, 'attributeName' | 'entityName' | 'id'>): string {
  return `${triple.space}:${triple.entityId}:${triple.attributeId}:${triple.value.id}`;
}

export function createTripleWithId(triple: Triple): Triple {
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

export function createValueId() {
  return v4();
}

export const BUILTIN_ENTITY_IDS = ['name', 'type', 'attribute', 'space'];

function isValidUuid(uuid: string) {
  return validate(uuid) && version(uuid) === 4;
}

export function isValidEntityId(id: string) {
  return isValidUuid(id) || BUILTIN_ENTITY_IDS.includes(id);
}
