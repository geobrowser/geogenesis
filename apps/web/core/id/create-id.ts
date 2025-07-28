import { Id } from '@graphprotocol/grc-20';

export function createEntityId(): string {
  return Id.generate();
}

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
