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
export type DebateSort = 'new' | 'top' | 'old' | 'best';

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
 * New, Top, Old or Best.
 *
 * **Top ranks by the debate's own Score**, which debates do carry: 66 of the 68
 * in the graph have one. An earlier version of this file claimed they had none
 * and left the sort out on that basis, which was simply unchecked — the score is
 * on the debate entity, not borrowed from the claims argued inside it.
 *
 * **Best ranks by the indexer's ranking score**, the same number Explore's Best
 * orders by — `entitiesRankedForFeedConnection` returns its nodes in strictly
 * descending `rankingScore`, so reading the column directly gives that ordering
 * for a set the ranked connection cannot be asked about. Explore's diversity
 * windowing is applied afterwards, client-side, and is deliberately not applied
 * here: it exists to stop one space crowding an infinite feed, which eleven
 * debates cannot do.
 *
 * This file said Best was impossible for the *opposite* reason — that the
 * windowing was intrinsic to the ranking. It is not, and the number it ranks by
 * is one column the graph will sort by on request.
 *
 * New and Old are the relation query's order and its reverse. Reversed rather
 * than sorted on a date because these rows carry none: a debate's date lives on
 * the entity, and the relation is what this list is built from.
 */
export function sortRows<T extends { entityId: string }>(
  rows: readonly T[],
  sort: DebateSort,
  /** Both keyed by normalised id, which is what `decodeScores` hands back. */
  ranks?: { scores?: ReadonlyMap<string, number>; rankings?: ReadonlyMap<string, number> }
): T[] {
  if (sort === 'old') return [...rows].reverse();
  if (sort !== 'top' && sort !== 'best') return [...rows];

  const by = sort === 'best' ? ranks?.rankings : ranks?.scores;

  // Rows with no number sort last rather than disappearing, and ties keep the
  // order they arrived in — so a rank that has not loaded yet is the New list
  // rather than a shuffled one.
  return [...rows]
    .map((row, index) => ({ row, index, score: by?.get(normId(row.entityId)) ?? null }))
    .sort((a, b) => {
      if (a.score === b.score) return a.index - b.index;
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return b.score - a.score;
    })
    .map(entry => entry.row);
}
