import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { equals } from '~/core/id/normalize';

import { getTopRankedSpaceId } from './space-ranking';

type SpaceScopedEntity = {
  spaces?: string[];
  values?: Array<{ isDeleted?: boolean; property: { id: string }; spaceId: string; value: unknown }>;
};

function isLive(value: { isDeleted?: boolean }): boolean {
  return value.isDeleted !== true;
}

/**
 * The space an entity actually lives in.
 *
 * `entity.spaces` can't answer it on its own: it counts every space holding a non-hidden value or a
 * relation authored *from* the entity, and for store-derived entities it is then sorted by a fixed
 * space ranking — so `spaces[0]` is a space that merely cites the entity whenever that space
 * outranks its own, and a Podcasts claim linked from Root or Crypto resolves to those. Prefer the
 * spaces where the entity is actually named, which is how the entity side panel scopes the same
 * entity.
 *
 * Inbound relations never contribute: the store's relation index is keyed on `fromEntity.id`, so
 * `entity.relations` is outbound-only. And the ranking is the store's doing, not this list's — a
 * `ClaimPickerEntity` carries the API's raw `spaceIds`, which is why the fallback re-ranks.
 */
export function entityHomeSpaceId(entity: SpaceScopedEntity): string | null {
  const namedSpaceIds = new Set<string>();

  for (const value of entity.values ?? []) {
    if (
      isLive(value) &&
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
 * The space to read and write a claim's space-scoped state in — responses, their counts, the
 * "Is factual" flag that decides the response kind, geo-chat's claim row and readiness.
 *
 * Callers hand in the space they are rendering from, which for a data block row is the row's
 * pinned target space or, failing that, the block's own space. A collection item added without a
 * target space pins nothing, so a claim collected into a curated page resolved to the page's space
 * — a space the claim holds nothing in. Everything keyed on it then read empty: 0% agreement, and
 * a geo-chat lookup for a space it has never indexed.
 *
 * So the requested space wins whenever the entity holds live content there, which is every ordinary
 * row and every entity page; otherwise the entity's own space answers instead.
 *
 * Residency is asked of the entity's values rather than of `entity.spaces`, for two reasons.
 * `spaces` is derived before the caller's `includeDeleted` filter is applied (`store.getEntity`),
 * so two components reading one entity with different flags would place it in different spaces —
 * and the two controls on a claim row do exactly that, which would leave a reader responding in one
 * space while the Debate toggle asked geo-chat about another. And `spaces` counts relations
 * authored from the entity, so one Topics link added from the curating space would satisfy the test
 * and hand back the very space this function exists to correct.
 *
 * An entity that hasn't hydrated yet resolves to the requested space — callers gate their own
 * requests on loading, and guessing before its content is known would key them on a space we may be
 * about to leave.
 */
export function resolveEntitySpaceId(entity: SpaceScopedEntity | null | undefined, requestedSpaceId: string): string {
  if (!entity) return requestedSpaceId;

  const liveValueSpaceIds = (entity.values ?? []).filter(isLive).map(value => value.spaceId);
  // An entity carrying no values at all — a picker row decoded without them — has nothing to place
  // it, so fall back to the coarser list rather than diverting on no evidence.
  const candidates = liveValueSpaceIds.length > 0 ? liveValueSpaceIds : (entity.spaces ?? []);

  if (candidates.length === 0) return requestedSpaceId;
  if (candidates.some(spaceId => equals(spaceId, requestedSpaceId))) return requestedSpaceId;

  return entityHomeSpaceId(entity) ?? requestedSpaceId;
}
