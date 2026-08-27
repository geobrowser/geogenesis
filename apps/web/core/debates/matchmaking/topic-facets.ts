import type { MatchmakingTopic } from '~/core/debates/api';

/**
 * Which topics the topic menu should offer, and what to do with a selection the menu no
 * longer holds.
 *
 * Only the rematch picker's graph-backed tabs reach for this now. Its All tab and the hub's
 * Claims tab both read geo-chat's `topic_facets`, which describes the whole filtered corpus
 * rather than the pages a client happens to have walked (GEO-2659) — but the opponent and
 * curated tabs are built from Knowledge Graph entities geo-chat has never seen, so their
 * menus are still derived from the claims on screen.
 */

/**
 * The topics carried by `claimEntityIds`, deduplicated and sorted by name.
 *
 * Callers pass the claims every *other* filter allows — space, search, whichever tab — but
 * not the topic filter itself. Narrowing by the current topic too would collapse the menu to
 * the one option already chosen and strand the viewer there.
 */
export function availableTopics(
  claimEntityIds: Iterable<string>,
  topicsByClaimId: ReadonlyMap<string, MatchmakingTopic[]>
): MatchmakingTopic[] {
  const seen = new Map<string, MatchmakingTopic>();
  for (const claimEntityId of claimEntityIds) {
    for (const topic of topicsByClaimId.get(claimEntityId) ?? []) {
      if (!seen.has(topic.id)) seen.set(topic.id, topic);
    }
  }
  return [...seen.values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
}

/**
 * The topic that should stay selected once `available` has changed under it.
 *
 * Drops a selection the menu no longer offers: changing space with a topic held would
 * otherwise leave the viewer on an empty list, filtered by a chip that is no longer in the
 * menu to unpick.
 *
 * `isResolved` says whether `available` is the finished answer for the current filters, and is
 * passed rather than inferred from emptiness because an empty menu means two different things.
 * Where the topics come from the same rows the list is drawn from, empty genuinely means "these
 * claims carry no topics". Where they ride a server facet, empty is usually "the request for
 * these filters hasn't come back", since the facets arrive with page one and are absent until it
 * lands. Treating unresolved as "nothing matches" would throw away a selection that is about to
 * be valid again; treating "genuinely none" as unresolved would strand the viewer on an empty
 * list, filtered by a chip the menu no longer offers to unpick — the bug this is here to fix.
 */
export function keepSelectableTopic(
  topicId: string | null,
  available: MatchmakingTopic[],
  isResolved: boolean
): string | null {
  if (topicId === null || !isResolved) return topicId;
  return available.some(topic => topic.id === topicId) ? topicId : null;
}

/**
 * The topics that should stay selected once `available` has changed under them.
 *
 * The multi-select form of {@link keepSelectableTopic}, and the same rule: a selection the menu no
 * longer offers is a chip the viewer cannot unpick from the menu it came from. Returns the input
 * unchanged while unresolved, and the same array when nothing is dropped, so it is safe to feed
 * straight back into state without looping.
 */
export function keepSelectableTopics(topicIds: string[], available: MatchmakingTopic[], isResolved: boolean): string[] {
  if (topicIds.length === 0 || !isResolved) return topicIds;
  const offered = new Set(available.map(topic => topic.id));
  const kept = topicIds.filter(id => offered.has(id));
  return kept.length === topicIds.length ? topicIds : kept;
}

/**
 * How a count reads in a menu row. Anything past two digits is noise in a narrow panel — the
 * viewer is choosing between "lots" and "a few", not counting — and an unbounded number widens
 * every row to fit the largest.
 */
export function formatFacetCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/**
 * Menu options in the order they should be shown: by count, descending, with anything currently
 * selected held at the top.
 *
 * Count order is what the ticket asks for, and pinning is what makes it usable. Without it, ticking
 * an option re-sorts the list under the cursor — every count changes when the filter does, so the
 * row just clicked can jump elsewhere before the next click lands. Pinned, the things being worked
 * with stay put and the ordering applies to what's left.
 */
export function orderFacetOptions<T extends { id: string; count: number }>(options: T[], selected: string[]): T[] {
  const picked = new Set(selected);
  return [...options].sort((a, b) => {
    const aPicked = picked.has(a.id);
    const bPicked = picked.has(b.id);
    if (aPicked !== bPicked) return aPicked ? -1 : 1;
    if (a.count !== b.count) return b.count - a.count;
    return a.id.localeCompare(b.id);
  });
}

/**
 * A selection with `id` added or removed.
 *
 * Appends rather than inserting in menu order: the menu is ordered by count and re-orders as the
 * filter changes, so there is no position here worth preserving — while the order things were
 * picked in is at least the viewer's own.
 */
export function toggleId(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter(entry => entry !== id) : [...selected, id];
}

/**
 * Merges a server facet with options derived from rows the server has never seen.
 *
 * The debate-again picker's All tab is geo-chat's browsed corpus *plus* this session's saved,
 * opponent and curated claims pinned in front of it. Those come from the graph, so the facet can
 * neither name nor count them.
 *
 * Where both know an option, the server's count wins: it covers the whole browsed corpus rather
 * than the page walked so far, which is the larger and more useful number. That does mean a count
 * can understate what the tab renders, by however many pinned rows carry the option — the facet
 * cannot see them. Understating only ever hides rows the viewer then finds anyway; the alternative
 * is summing two sets that overlap, which would overstate, and a count promising claims that
 * aren't there is the failure this whole surface is built to avoid.
 */
export function mergeFacetCounts(
  fromServer: { id: string; name: string | null; count: number }[],
  fromRows: { id: string; name: string | null; count: number }[]
): { id: string; name: string | null; count: number }[] {
  const merged = new Map<string, { id: string; name: string | null; count: number }>();
  for (const option of fromServer) merged.set(option.id, option);
  for (const option of fromRows) {
    const existing = merged.get(option.id);
    if (!existing) merged.set(option.id, option);
    else if (existing.name === null && option.name !== null) merged.set(option.id, { ...existing, name: option.name });
  }
  return [...merged.values()];
}

/** Counts how many of `values` fall into each bucket, as facet options. */
export function countBy(
  entries: { id: string; name: string | null }[]
): { id: string; name: string | null; count: number }[] {
  const counts = new Map<string, { id: string; name: string | null; count: number }>();
  for (const entry of entries) {
    const existing = counts.get(entry.id);
    if (existing) existing.count += 1;
    else counts.set(entry.id, { id: entry.id, name: entry.name, count: 1 });
  }
  return [...counts.values()];
}
