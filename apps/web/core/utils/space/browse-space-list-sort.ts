import { getSpaceRank } from './space-ranking';

export type SpaceListSortEntry = {
  id: string;
  name: string;
  /** True when the space has no entity display name (falls back to id prefix). */
  unnamed?: boolean;
};

/**
 * Ordering shared by governance home space filter and browse sidebar space lists:
 * {@link getSpaceRank} (curated map), unnamed spaces last, then name, then id.
 */
export function compareSpaceListOrderByRankNameId(a: SpaceListSortEntry, b: SpaceListSortEntry): number {
  const rankDelta = getSpaceRank(a.id) - getSpaceRank(b.id);
  if (rankDelta !== 0) return rankDelta;
  const au = !!a.unnamed;
  const bu = !!b.unnamed;
  if (au !== bu) return au ? 1 : -1;
  const nameDelta = a.name.localeCompare(b.name);
  if (nameDelta !== 0) return nameDelta;
  return a.id.localeCompare(b.id);
}

export function sortSpaceListByRankNameId<T extends SpaceListSortEntry>(rows: T[]): T[] {
  return [...rows].sort(compareSpaceListOrderByRankNameId);
}
