import { createGeoId } from './create-geo-id';

export function createActionId(): string {
  return createGeoId();
}

export function createVersionId({ proposalId, entityId }: { proposalId: string; entityId: string }): string {
  return `${proposalId}:${entityId}`;
}
