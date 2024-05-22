import { v4, validate, version } from 'uuid';

import { OmitStrict, Triple } from '../types';

export function createEntityId() {
  return v4();
}

export function getAppTripleId(triple: Pick<Triple, 'entityId' | 'attributeId'>, spaceId: string) {
  return `${spaceId}:${triple.entityId}:${triple.attributeId}`;
}

/**
 * Triple id encoding should match between client and network.
 * As a future improvement, we could try to run the same code between assemblyscript/typescript.
 */
export function createTripleId(triple: Pick<Triple, 'attributeId' | 'space' | 'entityId'>): string {
  return `${triple.space}:${triple.entityId}:${triple.attributeId}`;
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
