import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { equals } from '~/core/id/normalize';

import { getTopRankedSpaceId } from './space-ranking';

type SpaceScopedEntity = {
  spaces?: string[];
  values?: Array<{ isDeleted?: boolean; property: { id: string }; spaceId: string; value: unknown }>;
};

/**
 * The space an entity actually lives in.
 *
 * `entity.spaces` can't answer it on its own: it is ordered by a fixed space ranking and counts
 * every space holding *any* value or even an inbound relation, so `spaces[0]` is a space that
 * merely mentions the entity whenever that space outranks its own — a Podcasts claim cited from
 * Root or Crypto resolves to those. Prefer the spaces where the entity is actually named, which is
 * how the entity side panel scopes the same entity.
 */
export function entityHomeSpaceId(entity: SpaceScopedEntity): string | null {
  const namedSpaceIds = new Set<string>();

  for (const value of entity.values ?? []) {
    if (
      value.isDeleted !== true &&
      equals(value.property.id, SystemIds.NAME_PROPERTY) &&
      typeof value.value === 'string' &&
      value.value.trim().length > 0
    ) {
      namedSpaceIds.add(value.spaceId);
    }
  }

  return getTopRankedSpaceId([...namedSpaceIds]) ?? getTopRankedSpaceId(entity.spaces ?? []) ?? null;
}

/**
 * The space to read and write an entity's space-scoped state in — responses, their counts, the
 * "Is factual" flag that decides the response kind, geo-chat's claim row and readiness.
 *
 * Callers hand in the space they are rendering from, which for a data block row is the row's
 * pinned target space or, failing that, the block's own space. A collection item added without a
 * target space pins nothing, so a claim collected into a curated page resolved to the page's space
 * — a space the claim holds nothing in. Everything keyed on it then read empty: 0% agreement, and
 * a geo-chat lookup for a space it has never indexed.
 *
 * So the requested space wins whenever the entity is actually in it, which is every ordinary row
 * and every entity page; otherwise the entity's own space answers instead. An entity that hasn't
 * hydrated yet resolves to the requested space — callers gate their own requests on loading, and
 * guessing before `spaces` is known would key them on a space we may be about to leave.
 */
export function resolveEntitySpaceId(entity: SpaceScopedEntity | null | undefined, requestedSpaceId: string): string {
  const spaces = entity?.spaces ?? [];
  if (!entity || spaces.length === 0) return requestedSpaceId;
  if (spaces.some(spaceId => equals(spaceId, requestedSpaceId))) return requestedSpaceId;

  return entityHomeSpaceId(entity) ?? requestedSpaceId;
}
