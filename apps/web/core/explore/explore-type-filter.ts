import { normId } from '~/core/utils/norm-id';

import { DEFAULT_EXPLORE_TYPE_IDS, EXPLORE_ENTITY_TYPES, EXPLORE_ENTITY_TYPE_IDS } from './explore-constants';

const allowedTypeByNormalizedId = new Map(EXPLORE_ENTITY_TYPES.map(type => [normId(type.id), type.id]));

/**
 * Keeps only Explore's types, in `EXPLORE_ENTITY_TYPES` order.
 *
 * Order is not cosmetic here. The feed keys its query on the joined ids, so the same types in two
 * orders would look like two different selections and refetch for a change nobody made.
 */
export function sanitizeExploreTypeIds(ids: readonly unknown[]): string[] {
  const selected = new Set<string>();

  for (const id of ids) {
    if (typeof id !== 'string') continue;
    const canonical = allowedTypeByNormalizedId.get(normId(id));
    if (canonical) selected.add(canonical);
  }

  return EXPLORE_ENTITY_TYPE_IDS.filter(id => selected.has(id));
}

/**
 * A missing parameter means Explore's own types; an empty value means none.
 *
 * Explore has no types menu, so its client never sends this — the server decides what the feed
 * holds. A parameter is still honoured, narrowed to `EXPLORE_ENTITY_TYPES`, so an older client or a
 * kept link keeps working without being able to ask for a type Explore no longer serves.
 */
export function parseExploreTypeIdsParam(raw: string | null): string[] {
  if (raw === null) return [...DEFAULT_EXPLORE_TYPE_IDS];
  if (raw === '') return [];
  return sanitizeExploreTypeIds(raw.split(','));
}

export function exploreTypeFilterLabel(selectedCount: number): string {
  return `${selectedCount} ${selectedCount === 1 ? 'type' : 'types'}`;
}

/**
 * Does this entity carry at least one of the selected types?
 *
 * Client-side counterpart to the server's `typeIds` argument, which Best no longer sends
 * (GEO-2793). `entities_ranked_for_feed` abandons its ranked index walk the moment `type_ids` is
 * present and sorts all ~48.9M rows of `entity_ranking_scores` instead: 43ms without the argument,
 * 5.8s with the twelve Explore types, and a statement timeout with a single rare one. The rows come
 * back ranked either way, so the whitelist is cheap to apply here and ruinous to apply there.
 *
 * An empty selection means "no restriction", matching the server reading a missing argument the
 * same way. An entity with no types is dropped when a selection is active, which is also what the
 * server did — its predicate is an EXISTS on a TYPES relation, so an untyped entity never matched.
 *
 * Measured before relying on it: of a 66-row Best window, 64 carry a whitelisted type — 97%, against
 * the 22 a page serves. Both the unscoped `types` field and the in-space TYPES relations agree on
 * all 64, so the fact that a card's types are space-scoped does not narrow this in practice.
 */
export function entityMatchesExploreTypeIds(
  entity: { types: readonly { id: string }[] },
  selectedTypeIds: readonly string[]
): boolean {
  if (selectedTypeIds.length === 0) return true;
  const selected = new Set(selectedTypeIds.map(normId));
  return entity.types.some(type => selected.has(normId(type.id)));
}
