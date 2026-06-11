import type { Entity } from '~/core/types';

export function entityHasScopedContent(entity: Entity | null | undefined): boolean {
  if (!entity) return false;
  return entity.values.some(v => !v.isDeleted) || entity.relations.some(r => !r.isDeleted);
}

export function deriveSpaceIdFromUnscopedEntity(
  unscopedEntity: Entity | null | undefined,
  fallbackSpaceId: string
): string {
  const valueSpaceId = unscopedEntity?.values.find(v => !v.isDeleted)?.spaceId;
  const relationSpaceId = unscopedEntity?.relations.find(r => !r.isDeleted)?.spaceId;
  return valueSpaceId ?? relationSpaceId ?? fallbackSpaceId;
}

export function resolveSidePanelEntityScope(args: {
  requestedSpaceId: string;
  unscopedEntity: Entity | null | undefined;
  requestedScopedEntity: Entity | null | undefined;
}): { effectiveSpaceId: string } {
  const scopedHasContent = entityHasScopedContent(args.requestedScopedEntity);
  const derivedSpaceId = deriveSpaceIdFromUnscopedEntity(args.unscopedEntity, args.requestedSpaceId);

  return {
    effectiveSpaceId: scopedHasContent ? args.requestedSpaceId : derivedSpaceId,
  };
}
