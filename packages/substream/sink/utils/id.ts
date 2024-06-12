import { createGeoId } from '@geogenesis/sdk';

export function createActionId(): string {
  return createGeoId();
}

export function createVersionId({ proposalId, entityId }: { proposalId: string; entityId: string }): string {
  return `${proposalId}:${entityId}`;
}
