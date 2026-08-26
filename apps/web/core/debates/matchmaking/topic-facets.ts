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
 * `isResolved` says whether `available` is the finished answer for the current filters. It is
 * passed rather than inferred from emptiness because the two callers differ: the rematch
 * picker builds its topics from the same entities its claim rows come from, so an empty menu
 * genuinely means "these claims carry no topics", while the Claims tab resolves topics in a
 * second Knowledge Graph lookup that lags the claims — and an empty menu there is usually just
 * "not back yet". Treating unresolved as "nothing matches" would throw away a selection that is
 * about to be valid again; treating "genuinely none" as unresolved would strand the viewer on
 * an empty list, which is the bug this is here to fix.
 */
export function keepSelectableTopic(
  topicId: string | null,
  available: MatchmakingTopic[],
  isResolved: boolean
): string | null {
  if (topicId === null || !isResolved) return topicId;
  return available.some(topic => topic.id === topicId) ? topicId : null;
}
