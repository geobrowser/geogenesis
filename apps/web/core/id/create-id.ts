import { ID } from '@geogenesis/sdk';

import { EntityId } from '../io/schema';
import { Triple } from '../types';

export function createEntityId() {
  return EntityId(ID.make());
}

/**
 * Triple id encoding should match between client and network.
 * As a future improvement, we could try to run the same code between assemblyscript/typescript.
 */
export function createTripleId(triple: Pick<Triple, 'attributeId' | 'space' | 'entityId'>): string {
  return `${triple.space}:${triple.entityId}:${triple.attributeId}`;
}

export const BUILTIN_ENTITY_IDS = ['name', 'type', 'attribute', 'space'];
