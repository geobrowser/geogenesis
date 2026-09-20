import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { MatchmakingTopic } from '~/core/debates/api';
import type { ClaimPickerEntity } from '~/core/debates/claim-picker-page';
import { normId } from '~/core/utils/norm-id';

/**
 * A topic and the space its relation was written in, which is how the graph records it: the same
 * claim can carry different topics in different spaces. `null` where the projection did not select
 * the space — unknown rather than unscoped.
 */
type SpacedTopic = MatchmakingTopic & { spaceId: string | null };

/**
 * The topics each claim entity carries, keyed by claim id.
 *
 * The graph is the only source for these. geo-chat fills `topics: []` on every matchmaking and
 * rematch row it sends and answers about topics in a facet beside them where it answers at all, so
 * a list built from its rows resolves them from the entity or not at all — reading that empty array
 * the other way round is what emptied the list in GEO-2714.
 *
 * A claim carrying none is left out rather than mapped to an empty array, so {@link topicsFor} and
 * {@link carriesEveryTopic} both read "none" the same way whether the claim was looked up or not.
 *
 * Keyed canonically, and read back through {@link topicsFor} rather than `get`. The keys are graph
 * entity ids — bare hex — while every caller looks these up by the `claim_entity_id` on a geo-chat
 * row, which is a UUID and may carry hyphens. A raw `get` across that boundary silently answers
 * "no topics", which is not an absence anyone can see: the claim just quietly loses its topic
 * labels, drops out of the facet, and disappears from the list the moment a topic is picked.
 */
export function claimTopicsById(
  entities: Iterable<Pick<ClaimPickerEntity, 'id' | 'relations'>>
): Map<string, SpacedTopic[]> {
  const map = new Map<string, SpacedTopic[]>();

  for (const entity of entities) {
    const topics = entity.relations
      .filter(relation => relation.type.id === TOPICS_PROPERTY_ID && relation.isDeleted !== true)
      .map(relation => ({
        id: relation.toEntity.id,
        name: relation.toEntity.name ?? null,
        spaceId: relation.spaceId ?? null,
      }));
    if (topics.length === 0) continue;

    // Merged rather than overwritten. Callers hand this several projections of the same pool, and a
    // claim in two of them arrived twice — where the last one won, whatever it knew. In the rematch
    // picker the tagged catalog comes last and does not select relation spaces, so a Debate-tagged
    // claim also reached by id lost its spaces to a projection that never asked for them, and the
    // per-space filter below went back to keeping everything.
    const merged = [...(map.get(normId(entity.id)) ?? []), ...topics];
    map.set(normId(entity.id), preferKnownSpaces(merged));
  }

  return map;
}

/**
 * One entry per topic-and-space, and — where any projection knew the spaces — only the ones that
 * did.
 *
 * An unknown space is kept when it is all there is, because it cannot be compared to anything and
 * dropping it would empty a source's facet. But once *some* projection has reported real spaces for
 * a claim, an unknown-space copy of the same topic is not extra information, it is the same topic
 * seen by a query that did not ask — and keeping it would slip past the space filter and undo the
 * scoping for that claim.
 */
function preferKnownSpaces(topics: SpacedTopic[]): SpacedTopic[] {
  // Per topic, not per claim. Asked of the whole claim, one space-aware relation discarded every
  // unknown-space relation beside it — so a claim whose AI topic came back with a space and whose
  // Health topic did not lost Health entirely, which is not a narrowing, it is a deletion. The rule
  // is only ever about two copies of the *same* topic.
  const known = new Set(topics.filter(topic => topic.spaceId !== null).map(topic => normId(topic.id)));
  const byIdentity = new Map<string, SpacedTopic>();
  for (const topic of topics) {
    if (topic.spaceId === null && known.has(normId(topic.id))) continue;
    byIdentity.set(`${normId(topic.id)}:${topic.spaceId === null ? '' : normId(topic.spaceId)}`, topic);
  }
  return [...byIdentity.values()];
}

/**
 * The topics recorded for a claim, whichever spelling of its id the caller holds — and, given a
 * space, only the ones assigned *in* it.
 *
 * Exists so no caller reaches into the map directly: the normalization has to happen on both sides
 * of the lookup to be worth anything, and a `get` that skipped it would fail silently.
 *
 * Topics are assigned per space, and a card is always drawn under one space. Without the filter a
 * topic assigned only somewhere else was shown on the card and put in the facet beside it, so
 * picking it filtered the card in or out on something that is not true where the debate would be
 * published — the same mistake `relatedClaimsWhere` exists to avoid on the query side.
 *
 * A topic whose space is unknown is kept rather than dropped. Not every projection selects the
 * relation's space (the tagged catalog does not), and an unknown space cannot be compared to one —
 * dropping it would empty the facet for a whole source rather than narrow it.
 */
export function topicsFor(
  topicsByClaimId: ReadonlyMap<string, SpacedTopic[]>,
  claimEntityId: string,
  spaceId?: string | null
): MatchmakingTopic[] | undefined {
  const topics = topicsByClaimId.get(normId(claimEntityId));
  if (!topics) return undefined;
  return topics
    .filter(topic => spaceId == null || topic.spaceId == null || normId(topic.spaceId) === normId(spaceId))
    .map(topic => ({ id: topic.id, name: topic.name }));
}

/**
 * Which topics the topic menu should offer, and what to do with a selection the menu no
 * longer holds.
 *
 * For the menus built from the claims on screen: the rematch picker's by-id lists, and Lobby's
 * matches list. Explore and the picker's tagged sources read a server facet instead, which
 * describes the whole filtered corpus rather than the pages a client happens to have walked
 * (GEO-2659) — the lists here are fetched whole, so their own rows are the complete answer.
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
  topicsByClaimId: ReadonlyMap<string, SpacedTopic[]>
): MatchmakingTopic[] {
  const seen = new Map<string, MatchmakingTopic>();
  for (const claimEntityId of claimEntityIds) {
    for (const topic of topicsFor(topicsByClaimId, claimEntityId) ?? []) {
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
 *
 * With more than one topic held, an empty menu is read as the newest pick not fitting rather than
 * as the whole selection expiring, and only that pick is given back. Since GEO-2696 the facet is
 * co-occurrence, so an empty one means "this combination matches nothing" — and the reachable way
 * to land there is picking a second topic before the first one's answer arrives, while the menu
 * still offers topics that don't co-occur with it. Dropping everything would discard a pick the
 * viewer had made deliberately along with the one that didn't fit. A selection that has genuinely
 * expired — the space changed under it, say — still clears: the shortened selection is asked
 * about in turn, and each round drops one until nothing is left.
 */
export function keepSelectableTopics(topicIds: string[], available: MatchmakingTopic[], isResolved: boolean): string[] {
  if (topicIds.length === 0 || !isResolved) return topicIds;
  const offered = new Set(available.map(topic => topic.id));
  const kept = topicIds.filter(id => offered.has(id));
  if (kept.length === topicIds.length) return topicIds;
  // `toggleId` appends, so the last id is the most recent pick.
  return kept.length === 0 && topicIds.length > 1 ? topicIds.slice(0, -1) : kept;
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
  // Selected options hold the order they were picked in, not their count order. Pinning them to the
  // top isn't enough on its own: their counts change with every tick, so ordering them by count
  // reshuffled the ones already chosen each time another was added — the rows least expected to
  // move, since they're the ones being worked with.
  const pickedAt = new Map(selected.map((id, index) => [id, index]));
  return [...options].sort((a, b) => {
    const aPicked = pickedAt.get(a.id);
    const bPicked = pickedAt.get(b.id);
    if (aPicked !== undefined && bPicked !== undefined) return aPicked - bPicked;
    if (aPicked !== undefined) return -1;
    if (bPicked !== undefined) return 1;
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
  // Compared canonically: a space id reaches the menu in whichever spelling its rows carried, so
  // unticking could otherwise add a second spelling of a space that was already picked instead of
  // removing it.
  const key = normId(id);
  return selected.some(entry => normId(entry) === key)
    ? selected.filter(entry => normId(entry) !== key)
    : [...selected, id];
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

/**
 * Counts how many of `values` fall into each bucket, as facet options.
 *
 * Bucketed canonically while keeping the first real spelling seen, the same way the picker's
 * gateway scopes are. These entries are built from row ids, and a row carries whichever spelling
 * its source used — so the same space reached through a geo-chat row and a graph-built one counted
 * as two, and the menu offered one space twice with its rows split between them.
 */
export function countBy(
  entries: { id: string; name: string | null }[]
): { id: string; name: string | null; count: number }[] {
  const counts = new Map<string, { id: string; name: string | null; count: number }>();
  for (const entry of entries) {
    const key = normId(entry.id);
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      // A later entry can be the one that carries the name.
      if (existing.name === null && entry.name !== null) existing.name = entry.name;
    } else {
      counts.set(key, { id: entry.id, name: entry.name, count: 1 });
    }
  }
  return [...counts.values()];
}

/**
 * Facet options with any *selected* id that has fallen out of them added back at zero.
 *
 * The two halves of this look contradictory and aren't. An unselected option with nothing behind it
 * has no business in the menu — picking it could only ever produce an empty list. A *selected* one
 * has the opposite problem: a space facet is narrowed by the topic and the search, so a space the
 * viewer picked can drop out of it the moment those leave the combination empty. Gone from the
 * menu, its checkbox goes with it — and the trigger still counts it, so the viewer is told they
 * have two spaces picked while only one row is checked, with no way to remove the other short of
 * clearing them all.
 *
 * So: absent options stay absent, and absent *selections* come back at zero, where they can be
 * unticked. A count of zero is honest here — it says what the list would hold, which is why the
 * viewer wants it gone.
 */
export function keepSelectedVisible<T extends { id: string; name: string | null; count: number }>(
  options: T[],
  selected: string[]
): (T | { id: string; name: string | null; count: number })[] {
  // Canonically, because an option's id comes from a row and a selection comes from whatever the
  // menu offered when it was picked — two spellings of one space would put it back at zero *beside*
  // its real entry, which is the duplicate this exists to prevent.
  const present = new Set(options.map(option => normId(option.id)));
  const missing = selected.filter(id => !present.has(normId(id))).map(id => ({ id, name: null, count: 0 }));
  return missing.length === 0 ? options : [...options, ...missing];
}

/**
 * Whether a claim survives the topic filter.
 *
 * Intersection, not union: two topics narrow the list rather than widening it, because drilling
 * into a subject is what the filter is for, and the union of two topics is a bigger pile than
 * either alone. geo-chat's `topic_ids` means the same thing (GEO-2696), and this is how claims it
 * has never seen — the picker's pinned rows, and the hub's featured list — are held to the same
 * rule. Two halves of one menu disagreeing about what a second topic does would be worse than
 * either answer.
 */
export function carriesEveryTopic(topics: { id: string }[] | undefined, selected: string[]): boolean {
  if (selected.length === 0) return true;
  const carried = new Set((topics ?? []).map(topic => topic.id));
  return selected.every(id => carried.has(id));
}
