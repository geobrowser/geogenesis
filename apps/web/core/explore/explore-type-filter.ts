import { DEFAULT_EXPLORE_TYPE_IDS, EXPLORE_ENTITY_TYPES } from './explore-constants';

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
  return EXPLORE_ENTITY_TYPES.map(type => type.id);
}

export function sanitizeExploreTypeIds(ids: readonly unknown[]): string[] {
  const selected = new Set<string>();

  for (const id of ids) {
    if (typeof id !== 'string') continue;
    const canonical = allowedTypeByNormalizedId.get(normalizeId(id));
    if (canonical) selected.add(canonical);
  }

  return EXPLORE_ENTITY_TYPES.map(type => type.id).filter(id => selected.has(id));
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

  return EXPLORE_ENTITY_TYPES.map(type => type.id).filter(id => selected.has(id));
}

export function exploreTypeFilterLabel(selectedCount: number): string {
  return `${selectedCount} ${selectedCount === 1 ? 'type' : 'types'}`;
}
