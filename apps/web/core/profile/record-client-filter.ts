import type { ExploreFeedRow } from '~/core/explore/explore-card-item';
import { normId } from '~/core/utils/norm-id';

/**
 * Filtering and sorting a list that is already whole (GEO-2918).
 *
 * The Debates tab is the one record that arrives complete: the relation query
 * takes the lot in one request, and the most argumentative account in the graph
 * has eleven. So its controls act on the array in hand, and that is the *exact*
 * answer rather than a compromise — the objection to client-side filtering
 * everywhere else is that it narrows the pages fetched so far, which is not a
 * thing this list has.
 *
 * Positions and Proposals do not use this, and should not: their lists are
 * genuinely paged, so the same code there would filter the reader's scroll
 * position.
 */
export type DebateSort = 'new' | 'oldest';

/**
 * Spaces are OR, matching every other multi-select on these tabs.
 *
 * A row is kept when the space it is *displayed in* is picked. That is the space
 * the card links to and the one the menu counted, so filtering on anything else
 * would leave rows on screen that the chosen space does not contain.
 */
export function filterRowsBySpace<T extends Pick<ExploreFeedRow, 'spaceId'>>(
  rows: readonly T[],
  spaceIds: readonly string[]
): T[] {
  if (spaceIds.length === 0) return [...rows];

  const keep = new Set(spaceIds.map(normId));

  return rows.filter(row => keep.has(normId(row.spaceId)));
}

/** The spaces present in a list, with counts, most first. */
export function spaceFacetsFromRows<T extends Pick<ExploreFeedRow, 'spaceId'>>(
  rows: readonly T[]
): { id: string; count: number }[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (!row.spaceId) continue;
    const key = normId(row.spaceId);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

/**
 * Newest or oldest, and nothing else.
 *
 * No Top: Best and Top both rank by a *claim's* score, and a debate carries
 * none. Ordering debates by their claims' scores would rank a debate by an
 * argument somebody else made in it.
 *
 * The incoming order is the relation query's, which is newest-first — so `new`
 * is the identity and `oldest` is its reverse. Reversing rather than sorting on
 * a timestamp because the rows carry none: a debate's date lives on the entity,
 * and the relation is what this list is built from.
 */
export function sortRows<T>(rows: readonly T[], sort: DebateSort): T[] {
  return sort === 'oldest' ? [...rows].reverse() : [...rows];
}
