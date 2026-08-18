import { EXPLORE_ENTITY_TYPES } from './explore-constants';

export const EXPLORE_TYPE_FILTER_STORAGE_KEY = 'exploreSelectedTypeIds';

const allowedTypeByNormalizedId = new Map(EXPLORE_ENTITY_TYPES.map(type => [normalizeId(type.id), type.id]));

function normalizeId(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

function defaultExploreTypeIds(): string[] {
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

/** Missing or corrupt cache means the default: every Explore type selected. */
export function parseStoredExploreTypeIds(raw: string | null): string[] {
  if (raw === null) return defaultExploreTypeIds();

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? sanitizeExploreTypeIds(parsed) : defaultExploreTypeIds();
  } catch {
    return defaultExploreTypeIds();
  }
}

/** Missing query params preserve the historical all-types API behavior; an empty value means none. */
export function parseExploreTypeIdsParam(raw: string | null): string[] {
  if (raw === null) return defaultExploreTypeIds();
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
