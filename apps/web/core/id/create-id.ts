import { IdUtils } from '@graphprotocol/grc-20';

export function createEntityId(): string {
  return IdUtils.generate();
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
