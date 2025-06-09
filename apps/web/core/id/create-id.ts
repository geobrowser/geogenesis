import { Id } from '@graphprotocol/grc-20';

import { EntityId } from '../io/schema';

export function createEntityId() {
  return EntityId(Id.generate());
}

/**
 * Triple id encoding should match between client and network.
 * As a future improvement, we could try to run the same code between assemblyscript/typescript.
 */
export function createValueId({
  entityId,
  propertyId,
  spaceId,
}: {
  entityId: string;
  propertyId: string;
  spaceId: string;
}): string {
  return `${spaceId}:${entityId}:${propertyId}`;
}

export const BUILTIN_ENTITY_IDS = ['name', 'type', 'attribute', 'space'];
