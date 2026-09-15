import { DEFAULT_EXPLORE_TYPE_IDS, EXPLORE_ENTITY_TYPES, EXPLORE_ENTITY_TYPE_IDS } from './explore-constants';

export const EXPLORE_TYPE_FILTER_STORAGE_KEY = 'exploreSelectedTypeIds';

const allowedTypeByNormalizedId = new Map(EXPLORE_ENTITY_TYPES.map(type => [normalizeId(type.id), type.id]));

function normalizeId(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

/**
 * Every type there is. Distinct from `DEFAULT_EXPLORE_TYPE_IDS`, and the distinction matters more
 * than it looks: these two were one function until GEO-2790, and collapsing them again would be a
 * quiet bug. The client omits the `typeIds` param *precisely when every type is selected*, so the
 * server reading a missing param as "the default three" would hand back three types to the reader
 * who had just ticked all twelve.
 */
function allExploreTypeIds(): string[] {
  return [...EXPLORE_ENTITY_TYPE_IDS];
}

/**
 * A selection, put back into the order the menu declares.
 *
 * Order is not cosmetic here. The feed keys its query on the joined ids and compares selections by
 * length, so the same three types in two orders would look like two different selections and refetch
 * for a change nobody made. Both callers below build a set and then need it ordered, so the rule
 * lives once rather than being spelled out at each of them.
 */
function inCanonicalOrder(selected: ReadonlySet<string>): string[] {
  return EXPLORE_ENTITY_TYPE_IDS.filter(id => selected.has(id));
}

export function sanitizeExploreTypeIds(ids: readonly unknown[]): string[] {
  const selected = new Set<string>();

  for (const id of ids) {
    if (typeof id !== 'string') continue;
    const canonical = allowedTypeByNormalizedId.get(normalizeId(id));
    if (canonical) selected.add(canonical);
  }

  return inCanonicalOrder(selected);
}

/**
 * What the dropdown opens with. Nothing stored, or something unreadable, means the default.
 *
 * Only a deliberate toggle writes this key, so "nothing stored" is the same population as "has
 * never touched the filter" — which is why a reader who once chose their own types keeps them, and
 * only someone who never expressed a preference is given the new one. A default is a guess about
 * what someone wants before they say; a stored selection is them having said.
 */
export function parseStoredExploreTypeIds(raw: string | null): string[] {
  if (raw === null) return [...DEFAULT_EXPLORE_TYPE_IDS];

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? sanitizeExploreTypeIds(parsed) : [...DEFAULT_EXPLORE_TYPE_IDS];
  } catch {
    return [...DEFAULT_EXPLORE_TYPE_IDS];
  }
}

/**
 * Missing query params preserve the historical all-types API behavior; an empty value means none.
 *
 * Deliberately *not* the new default. The client drops the param when every type is selected, so
 * this is the "all twelve" path, not the "hasn't chosen yet" one — see `allExploreTypeIds`.
 */
export function parseExploreTypeIdsParam(raw: string | null): string[] {
  if (raw === null) return allExploreTypeIds();
  if (raw === '') return [];
  return sanitizeExploreTypeIds(raw.split(','));
}

export function toggleExploreTypeId(selectedTypeIds: readonly string[], typeId: string): string[] {
  const selected = new Set(sanitizeExploreTypeIds(selectedTypeIds));
  const canonicalTypeId = allowedTypeByNormalizedId.get(normalizeId(typeId));
  if (!canonicalTypeId) return [...selected];

  if (selected.has(canonicalTypeId)) selected.delete(canonicalTypeId);
  else selected.add(canonicalTypeId);

  return inCanonicalOrder(selected);
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
  const selected = new Set(selectedTypeIds.map(normalizeId));
  return entity.types.some(type => selected.has(normalizeId(type.id)));
}
