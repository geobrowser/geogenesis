'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';

import { claimResponseKind } from '~/core/claims/response-kind';
import { FEATURED_TAG_ID } from '~/core/constants';
import { DEBATE_TAG_ID } from '~/core/debates/ontology';
import { useInfiniteScrollSentinel } from '~/core/hooks/use-infinite-scroll-sentinel';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { ID } from '~/core/id';
import { responsePositionLabel } from '~/core/responses/entity-response';
import { validateEntityId } from '~/core/utils/utils';

import { Input } from '~/design-system/input';

import type {
  DebateClaim,
  DebateClaimPositionSummary,
  MatchmakingClaim,
  MatchmakingClaimsFilter,
  MatchmakingClaimsQuery,
} from '../api';
import { eligibleClaimSpaceIds, isClaimSpaceAllowed } from '../claim-space-allowlist';
import { useDebateActivity, useDebateClaimsBySpaces, useGeoChatAuth } from '../hooks';
import {
  type TaggedClaim,
  type TaggedClaimFilters,
  useTaggedClaims,
  useTaggedSpaceFacet,
  useTaggedTopicFacet,
} from '../tagged-claims';
import { useClaimSpaceAllowlist } from '../use-claim-space-allowlist';
import { isSpaceDebatePublishable, useDebatePublishableSpaces } from '../use-debate-publishable-spaces';
import { useDebateRequests } from './hooks';
import { HubFilterMenu, type HubFilterOption, HubMultiFilterMenu } from './hub-filter-menu';
import { HubCardList } from './hub-motion';
import { HubQueryState } from './hub-states';
import { MatchmakingClaimCard } from './matchmaking-claim-card';
import { OutboundRequestCard } from './outbound-request-card';
import {
  keepSelectableTopics,
  keepSelectedVisible,
  orderFacetOptions,
  toggleId,
} from './topic-facets';
import { useDebouncedSearch } from './use-debounced-search';
import { useDebouncedSelection } from './use-debounced-selection';
import { useScopedMatchmakingClaims } from './use-scoped-claims';
import { useStableListOrder } from './use-stable-list-order';

/**
 * `featured` and `all` are the tab's own, not geo-chat's: the index has no notion of either tag, so
 * picking one swaps the list's *source* for the knowledge graph rather than changing a query param.
 * GEO-2683 did that for `featured`; GEO-2771 did it for `all`.
 *
 * `mine` and `debate_now` stay geo-chat's. Both are viewer-relative and scored on who is available
 * and who this viewer is already pair-blocked with, which is not in the graph at any price.
 */
type ClaimsTabFilter = MatchmakingClaimsFilter | 'featured';

// Featured leads: it is where the tab opens, and an option the menu opens on should be the one at
// the top of it.
const FILTER_OPTIONS: HubFilterOption<ClaimsTabFilter>[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'all', label: 'All claims' },
  { value: 'mine', label: 'My positions' },
  { value: 'debate_now', label: 'Debate now' },
];

/**
 * The two viewer-relative filters leave the menu signed out.
 *
 * "My positions" is the viewer's own list, so it could only ever come back empty. "Debate now" is
 * viewer-relative in a less obvious way — geo-chat scores it on who is available to debate *you*,
 * excluding anyone you are already pair-blocked with — so with no viewer it is not a stricter
 * "all claims" but a question with no subject.
 *
 * Featured and All claims describe the corpus rather than the viewer, and both still answer.
 */
const SIGNED_OUT_HIDDEN_FILTERS: ClaimsTabFilter[] = ['mine', 'debate_now'];

/**
 * The two filters the graph answers, and the tag each one asks for.
 *
 * Absent from this map means geo-chat's index answers instead — which is the whole of the branching
 * in this file, so it is stated once here rather than tested per call site.
 */
const TAG_FOR_FILTER: Partial<Record<ClaimsTabFilter, string>> = {
  featured: FEATURED_TAG_ID,
  all: DEBATE_TAG_ID,
};

/** What an empty list means, which differs by where the list came from. */
const NOTHING_HERE: Record<ClaimsTabFilter, string> = {
  featured: 'No claims have been featured yet.',
  all: 'No claims have been tagged for debate yet.',
  mine: 'You haven’t taken a position on any claims yet.',
  debate_now: 'Nobody is ready to debate you on a claim right now.',
};

function filterOptionsFor(authenticated: boolean) {
  return authenticated
    ? FILTER_OPTIONS
    : FILTER_OPTIONS.filter(option => !SIGNED_OUT_HIDDEN_FILTERS.includes(option.value));
}

/** Stable identity so the geo-chat lookups don't restart on every render of a geo-chat list. */


/**
 * Key prefixes for the two lookups behind the graph-sourced list, so "Try again" can reach them.
 *
 * Written out rather than derived, because both are keyed per batch — by id chunk and by space —
 * and the retry has to cover every batch rather than the one that happened to fail. Kept in step
 * with `claimPickerEntitiesQueryKey` and `debateQueryKeys.claims`.
 */
const CLAIM_ENTITIES_QUERY_PREFIX = ['claim-picker', 'entities'] as const;
const DEBATE_CLAIMS_QUERY_PREFIX = ['debates', 'claims'] as const;

/**
 * Cross-space claim discovery. Search, the space, topic and position filters, and the sort (people
 * available now → total positions → recency) all run server-side, and the response carries a facet
 * for each filter dimension describing the whole filtered corpus rather than the pages walked so
 * far (GEO-2659). The viewer's eligible spaces go out as `space_ids` and the picked topics as
 * `topic_ids`, so neither is a page-local filter any more and the list is whatever the index says.
 *
 * The server still returns `topics: []` on every row, which is not the contradiction it looks
 * like: the rows are filtered, and the topic answer rides in the facet beside them. Only Featured
 * resolves topics itself, because its list comes from the knowledge graph and the index has never
 * seen it.
 */
export function ClaimsTab() {
  const queryClient = useQueryClient();
  const { authenticated, accountKey } = useGeoChatAuth();
  // A signed-out viewer gets Privy rather than a dead pill, the same hook and for the same reason
  // the claim page and the entity vote arrows use it. Passed as `undefined` when signed in so the
  // card keeps publishing directly.
  const promptSignIn = usePrivySignIn();
  const onRequireSignIn = authenticated ? undefined : promptSignIn;

  // The account's open request, from the same two sources the Matches tab reads it from — the
  // requests lookup, or the activity payload where that has not landed. Gated on being signed in:
  // a signed-out visitor has no request to have sent.
  const requestsQuery = useDebateRequests(authenticated);
  const { data: activity } = useDebateActivity(authenticated);
  const outbound = requestsQuery.data?.outbound ?? activity?.outbound_request ?? null;
  const filterOptions = React.useMemo(() => filterOptionsFor(authenticated), [authenticated]);

  const [search, setSearch] = React.useState('');
  const { value: debouncedSearch, pending: searchSettling } = useDebouncedSearch(search);
  // Featured is where the tab opens. The whole corpus is the wider net but the shallower one — a
  // curator's pick is a better first thing to put in front of someone than whatever the index
  // ranked highest, and All claims is one option below.
  const [selectedFilter, setFilter] = React.useState<ClaimsTabFilter>('featured');
  // Signing out with a viewer-relative filter selected would otherwise leave the tab querying it
  // anonymously and showing a trigger value that is no longer in the menu. Derived rather than
  // reset through an effect so the query, the menu label, the ordering key and the empty state all
  // read the same value on the very first render after the session goes away.
  const filter = !authenticated && SIGNED_OUT_HIDDEN_FILTERS.includes(selectedFilter) ? 'featured' : selectedFilter;
  const [spaceIds, setSpaceIds] = React.useState<string[]>([]);
  const [topicIds, setTopicIds] = React.useState<string[]>([]);

  const { allowlist: spaceAllowlist, isLoading: allowlistLoading } = useClaimSpaceAllowlist();

  // Until the allowlist settles there is no telling an allowed space from one the viewer has
  // nothing to do with, so the tab waits instead of showing the unfiltered set and trimming it
  // under the viewer a moment later — which put spaces in the menu that then vanished, and offered
  // picks that were never the viewer's to make.
  //
  // Only while it is genuinely still resolving. A lookup that settled without an answer leaves
  // this false and falls through to the unfiltered list: a list that is too wide beats a panel
  // that never fills.
  const allowlistPending = spaceAllowlist === null && allowlistLoading;

  // GEO-2649. Two independent questions, and a claim has to pass both: the allowlist above asks
  // whether this *viewer* may see the space, and this asks whether a debate there could ever be
  // published — the acceptor has to be an editor of it, or the debate fails on-chain at the end.
  // Offering a claim that cannot carry a debate is offering a dead end.
  //
  // Same "wait rather than trim under the viewer" rule, for the same reason: `null` means unknown
  // and deliberately does not filter, so without this the tab would list the unfiltered set and
  // pull claims out of it a moment later.
  const { publishableSpaceIds, isLoading: publishableLoading } = useDebatePublishableSpaces();
  const publishablePending = publishableSpaceIds === null && publishableLoading;
  const spacesPending = allowlistPending || publishablePending;

  const spaceShowsClaims = React.useCallback(
    (candidateSpaceId: string) =>
      isClaimSpaceAllowed(candidateSpaceId, spaceAllowlist) &&
      isSpaceDebatePublishable(candidateSpaceId, publishableSpaceIds),
    [publishableSpaceIds, spaceAllowlist]
  );

  // Scopes the query — and so the facets it returns — to the spaces this viewer can actually be
  // shown claims from. Without it the topic facet describes every space geo-chat knows, and a
  // topic living only outside this set is offered over a list the gates below then empty.
  //
  // The allowlist can settle without an answer, which deliberately does not filter — a list that
  // is too wide beats a panel that never fills. That is a reason to stop narrowing by *it*, not a
  // reason to stop narrowing: the publishable set is a different question, and when it has an
  // answer it still bounds which spaces can be shown. Falling through to it keeps the facets over
  // the same spaces the rows are drawn from, rather than over everything geo-chat knows.
  const candidateSpaceIds = spaceAllowlist ?? publishableSpaceIds;
  const eligibleSpaceIds = React.useMemo(
    () => eligibleClaimSpaceIds(candidateSpaceIds, spaceShowsClaims),
    [candidateSpaceIds, spaceShowsClaims]
  );

  // Which tag this filter reads, and whether it reads one at all.
  //
  // `claimsTagId` is always a real tag so the graph query has a stable key per filter — switching
  // Featured to All and back lands on each one's own cached catalog rather than refetching. Whether
  // that catalog is *used* is `graphSourced`, which is also what holds the index query off.
  const claimsTagId = TAG_FOR_FILTER[filter] ?? DEBATE_TAG_ID;
  const graphSourced = TAG_FOR_FILTER[filter] !== undefined;

  // A graph-sourced filter draws its own list, so the index isn't asked for one. The query keeps
  // saying `all` rather than going undefined: switching to one of those and back then lands on the
  // pages already cached instead of paging the corpus again from the top.
  // Debounced like the search box, and for the same reason: the menu stays open across ticks, so
  // picking three topics in a row fires three requests and throws two away. The menu still
  // reflects each tick instantly; only the request waits.
  const { value: debouncedTopicIds, pending: topicsSettling } = useDebouncedSelection(topicIds);
  const { value: debouncedSpaceIds, pending: spacesSettling } = useDebouncedSelection(spaceIds);

  const query = React.useMemo<Omit<MatchmakingClaimsQuery, 'spaceIds' | 'spaceId'>>(
    () => ({
      search: debouncedSearch || null,
      topicIds: debouncedTopicIds,
      // Narrowed to what geo-chat understands: `featured` and `all` are this tab's own sources, and
      // the query is disabled for both anyway.
      filter: graphSourced ? 'all' : (filter as MatchmakingClaimsFilter),
    }),
    [debouncedSearch, debouncedTopicIds, graphSourced, filter]
  );

  const scope = React.useMemo(
    () => ({ spaceIds: eligibleSpaceIds, pending: spacesPending }),
    [eligibleSpaceIds, spacesPending]
  );

  // Every way the pages can describe a wider corpus than this tab will show is handled in there,
  // once, for both pickers — see `useScopedMatchmakingClaims`. Featured passes `unusable`: it draws
  // its own list, so there is nothing worth asking the index for, and the masking that comes with
  // it also keeps the paging sentinel off a list that has no next page.
  const claimsQuery = useScopedMatchmakingClaims(query, scope, debouncedSpaceIds, graphSourced);
  const { pages, facets } = claimsQuery;

  // The debounce is part of the staleness, not separate from it. For those milliseconds no request
  // has been made yet, so React Query is idle and `countsPending` is false on its own — while the
  // menu already shows the new selection against the previous selection's counts. That is the
  // state the flag exists to cover, so the settling window has to be folded in.
  //
  // The source gate covers the selections and the query, and deliberately not the search.
  //
  // Featured builds both menus from the live space and topic selections over a list it already
  // holds, so those are right on the same render as the tick and there is nothing to wait for. The
  // debounce still runs there, feeding a query Featured never makes, so ungated it would drop
  // skeletons over numbers that were already correct.
  //
  // Search is the exception, because Featured filters by `debouncedSearch` like every other source
  // does — see `taggedSearched`. Its counts really do describe the pre-typing query for as long
  // as the box is unsettled, so that window has to cover the counts wherever they came from.
  const countsPending =
    searchSettling || (!graphSourced && (claimsQuery.countsPending || topicsSettling || spacesSettling));

  const serverClaims = React.useMemo(
    () => pages.flatMap(page => page.claims).filter(entry => spaceShowsClaims(entry.claim.space_id)),
    [pages, spaceShowsClaims]
  );

  // Both graph-sourced lists, from one hook and one tag apiece.
  //
  // A curation tag lives in the knowledge graph and geo-chat indexes neither of them — so unlike the
  // position filter this can't be a query param, and unlike the old client-side topic cut it can't
  // run over the loaded pages either: tagged claims are a few hundred out of a corpus of hundreds of
  // thousands, so a page-local filter would page for a very long time before it found one.
  //
  // GEO-2771 moved `all` here from the index for the same reason it was always true of `featured`,
  // and for one more: the graph already knows which claims are meant for debating, so replicating
  // that into geo-chat only to filter on it is a trip with nothing at the end of it. What geo-chat
  // still answers is everything *about* these claims — see the row lookup below.
  //
  // The list comes from the graph: one ranked, filtered page at a time (GEO-2798). Search, topics
  // and spaces are all applied by the server, so what arrives is what the viewer asked for and the
  // page is the whole of it.
  //
  // `eligibleSpaceIds` above goes out with it, so the rows *and* both facet menus describe the same
  // set. Without that a topic living only in a space the viewer cannot see is still offered, and
  // picking it returns rows the client then removes — an option that can only produce an empty list
  // (GEO-2653). It is the same list geo-chat's own query is scoped by, for the same reason.
  const taggedFilters = React.useMemo<TaggedClaimFilters>(
    () => ({
      search: debouncedSearch,
      topicIds: debouncedTopicIds,
      spaceIds,
      eligibleSpaceIds,
    }),
    [debouncedSearch, debouncedTopicIds, eligibleSpaceIds, spaceIds]
  );

  // Held while the space gates are still resolving: they pass everything until they land, so asking
  // now would fetch and cache a page scoped to every space and then narrow it under the viewer.
  const taggedEnabled = graphSourced && !spacesPending;
  const {
    claims: taggedClaims,
    isLoading: taggedLoading,
    error: taggedError,
    hasNextPage: taggedHasNextPage,
    fetchNextPage: fetchNextTaggedPage,
    isFetchingNextPage: taggedFetchingNextPage,
    refetch: refetchTagged,
  } = useTaggedClaims(claimsTagId, taggedFilters, taggedEnabled);

  const topicFacet = useTaggedTopicFacet(claimsTagId, taggedFilters, taggedEnabled);
  const spaceFacet = useTaggedSpaceFacet(claimsTagId, taggedFilters, taggedEnabled);

  // Which space a claim's card is for.
  //
  // A claim arrives once, carrying every space it is tagged in, and the card has to be built
  // against one of them — the space a debate would be published into, and the space its sides are
  // read from. A picked space wins where the claim is tagged in one, so filtering to a space never
  // hides a claim that is tagged in it; otherwise the first the gates allow.
  const displaySpaceFor = React.useCallback(
    (claim: TaggedClaim) => {
      const allowed = claim.tagSpaceIds.filter(spaceShowsClaims);
      return allowed.find(id => spaceIds.some(picked => ID.equals(picked, id))) ?? allowed[0] ?? null;
    },
    [spaceIds, spaceShowsClaims]
  );

  // The page, paired with the space each row is drawn for. A claim whose every tagged space is one
  // the viewer cannot be shown drops out here — the server filter already narrows to the eligible
  // set, so this only catches the publishability gate, which it does not model.
  const taggedPage = React.useMemo(() => {
    if (!graphSourced) return [];
    return taggedClaims.flatMap(claim => {
      const spaceId = displaySpaceFor(claim);
      return spaceId ? [{ claim, spaceId }] : [];
    });
  }, [displaySpaceFor, graphSourced, taggedClaims]);

  // geo-chat, for the rows on screen rather than the whole tag.
  //
  // What it still answers is what only it knows: who is standing ready to argue each side, whether
  // this viewer is, and whether a debate is already running. The sides themselves come from the
  // graph. Scoped to the loaded page, so this is a handful of requests bounded by the spaces those
  // rows live in rather than a fan-out over every space the tag reaches — which is what made the
  // list flicker as batches landed one by one, and what let a stale answer sit under a key the
  // signed-in fetch would read.
  //
  // Nothing is asked for until the viewer is known — signed out, *or* signed in with the account
  // not yet resolved. `fetchDebateClaims` sends `auth: 'optional'` when it has no account, so a
  // request in that window succeeds and comes back with every viewer field null; the rows still
  // carry the public ones, so the card drew its avatars while reporting no response from the viewer.
  const taggedGroups = React.useMemo(() => {
    if (!authenticated || !accountKey) return [];
    const bySpace = new Map<string, string[]>();
    for (const { claim, spaceId } of taggedPage) {
      if (!validateEntityId(claim.entity.id)) continue;
      const existing = bySpace.get(spaceId);
      if (existing) existing.push(claim.entity.id);
      else bySpace.set(spaceId, [claim.entity.id]);
    }
    return [...bySpace.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([spaceId, claimIds]) => ({ spaceId, claimIds }));
  }, [accountKey, authenticated, taggedPage]);
  const taggedRows = useDebateClaimsBySpaces(taggedGroups);

  // The page in the shape the rest of the tab already speaks. geo-chat has a row for a claim only
  // once someone has taken a side on it, so everything it would carry has a graph-derived fallback:
  // a claim nobody has answered still lists, with no sides and the response kind its own
  // "Is factual" value implies.
  const taggedEntries = React.useMemo<MatchmakingClaim[]>(() => {
    if (!graphSourced) return [];
    // Keyed by space *and* claim. The row lookup asks geo-chat per space, so a claim tagged in two
    // of them comes back twice — once per space, each with that space's sides, readiness and live
    // debate. Keyed on the claim alone the map keeps whichever arrived last, and would draw one
    // space's answers onto another space's card and publish into the second.
    const rowsBySpaceAndClaim = new Map(
      taggedRows.claims.map(row => [`${ID.uuidToHex(row.space_id)}:${ID.uuidToHex(row.claim_entity_id)}`, row])
    );

    return taggedPage.map(({ claim, spaceId }) => {
      const row = rowsBySpaceAndClaim.get(`${ID.uuidToHex(spaceId)}:${ID.uuidToHex(claim.entity.id)}`);
      const responseKind = row?.response_kind ?? claimResponseKind(claim.entity, spaceId);

      return {
        claim: {
          id: row?.id ?? claim.entity.id,
          space_id: spaceId,
          claim_entity_id: claim.entity.id,
          claim: claim.entity.name ?? '',
          description: claim.entity.description,
        },
        topics: [],
        response_kind: responseKind,
        viewer_response: row?.viewer_response ?? null,
        viewer_position: row?.viewer_response?.position ?? null,
        viewer_debate_ready: row?.viewer_debate_ready ?? false,
        readiness_disabled_reason: row?.readiness_disabled_reason ?? null,
        positions: taggedPositionSummaries(row, responseKind),
        // The index's ranking score, which this list is ordered by on the server and doesn't re-sort.
        score: 0,
        active_debate: Boolean(row?.active_debate),
      };
    });
  }, [graphSourced, taggedPage, taggedRows.claims]);

  // Whether a card may be answered at all.
  //
  // Two things have to have landed before a press means what it looks like it means, and the card
  // says so itself: the vocabulary, or the pills publish a stance response against a claim that
  // wants Verify/Dispute; and the viewer's own side, or the side they already hold is drawn
  // unselected and pressing it republishes instead of clearing.
  //
  // The vocabulary now arrives *with the claim* — the page carries its "Is factual" value — so only
  // the side is outstanding, and that rides on this space's geo-chat row. Settled rather than
  // answered: a claim with no row genuinely has no side recorded, and a signed-out viewer never
  // runs the query at all, so it settles immediately and correctly reports the side they lack.
  const taggedAnswersReady = !graphSourced || !taggedRows.isLoading;

  // The space menu, from the server's own count over the tag — narrowed by the search and the
  // topics, never by the space selection, which is what lets a picked space be un-picked and what
  // makes a count answer "how many of what I have chosen so far are in here".
  //
  // Filtered by the publishability gate on the way out: the server knows the viewer's allowlist,
  // because it was sent, but not which spaces can carry a published debate.
  const facetSpaces = React.useMemo(() => {
    const source = graphSourced
      ? spaceFacet.spaces.filter(space => spaceShowsClaims(space.id)).map(space => ({ ...space, name: null }))
      : (facets?.space_facets ?? []).filter(facet => spaceShowsClaims(facet.id));
    return orderFacetOptions(keepSelectedVisible(source, spaceIds), spaceIds);
  }, [facets?.space_facets, graphSourced, spaceFacet.spaces, spaceIds, spaceShowsClaims]);

  // The server re-sorts on every readiness change, so hold the order the user is looking at until
  // they ask for a different list.
  const claims = useStableListOrder(
    graphSourced ? taggedEntries : serverClaims,
    entry => `${entry.claim.space_id}:${entry.claim.claim_entity_id}`,
    `${debouncedSearch}|${spaceIds.join(',')}|${topicIds.join(',')}|${filter}`
  );

  // Nothing left to filter here: both lists are narrowed by their server now.
  const visibleClaims = claims;

  // The topic menu, from the server's count over the tag. It describes every claim the current
  // filters allow rather than the pages loaded so far — which is what a client-side version could
  // never do: it read topics off the loaded claims, so the menu grew as the viewer scrolled and a
  // space whose first page happened to carry none looked like a space with no topics (GEO-2653).
  //
  // Co-occurrence, since topics intersect (GEO-2696): counted over the claims that already carry
  // every picked topic, so the menu answers "what else do these claims carry" and the picked ones
  // come back with the current result count, which is what lets them be un-picked.
  const facetTopics = React.useMemo(() => {
    const source = graphSourced ? topicFacet.topics : (facets?.topic_facets ?? []);
    return orderFacetOptions(source, topicIds);
  }, [facets?.topic_facets, graphSourced, topicFacet.topics, topicIds]);

  // Settled when the *counts* have answered, which is what a selection is reconciled against — the
  // names arrive separately and a topic does not stop existing while its label is in flight.
  //
  // A failed lookup is not a settled one: an error leaves the menu empty while `isLoading` goes
  // false, and the reconciliation below reads a settled, empty menu as "these topics no longer
  // exist" and drops the viewer's selection. Held unsettled instead, so an outage costs the list
  // rather than the selection. `spacesPending` for the same reason at the other end: the query is
  // not made at all while the gates resolve.
  const facetsSettled = graphSourced
    ? !spacesPending && topicFacet.countsSettled && spaceFacet.settled
    : claimsQuery.facetsSettled;

  // The space is let go on the condition that actually means "not yours to pick" — the gates
  // stopped admitting it — rather than on its absence from the facet.
  //
  // Absence means something else here. `space_facets` is narrowed by the *topic* selection, the
  // mirror of the topic facet being narrowed by the space one: each dimension is counted without
  // narrowing itself, which is what makes a facet count answer "how many of what I have chosen so
  // far are in here". So a space drops out of it whenever the current combination is empty — a
  // topic with nothing in that space, or a search that matches nothing there. That is a reason to
  // show an empty list, not to revise an input the viewer chose. Clearing on it would discard the
  // space the moment a topic or a search emptied the pair, silently and without their asking.
  //
  // The topic goes the other way for the same reason, not despite it: it is the narrower of the
  // two, and a topic the space no longer carries is genuinely gone from the menu that offered it.
  // Held while the lookups are still out: until they land the gates pass everything, so a space
  // cleared against them would be cleared on nothing.
  React.useEffect(() => {
    if (spacesPending) return;
    setSpaceIds(current => {
      const kept = current.filter(spaceShowsClaims);
      return kept.length === current.length ? current : kept;
    });
  }, [spaceShowsClaims, spacesPending]);

  // Changing space with a topic held would otherwise leave the viewer filtered by a chip that is
  // no longer in the menu to unpick.
  //
  // Only against a facet that answers the selection in hand, which `topicsSettling` is the missing
  // half of. `facetTopics` is rebuilt whenever `topicIds` changes, so without this the effect
  // re-runs on its own output while the query is still debounced on the previous selection and
  // `facetsSettled` is still true from it — reconciling repeatedly against one stale answer and
  // draining the whole selection in a single tick, rather than one pick per server response.
  React.useEffect(() => {
    setTopicIds(current => keepSelectableTopics(current, facetTopics, facetsSettled && !topicsSettling));
  }, [facetTopics, facetsSettled, topicsSettling]);

  // Featured is not counted: it chooses which list is on screen rather than narrowing one, so an
  // empty Featured tab should say nothing is featured — not that filters are hiding things — and
  // "Clear filters" should leave the viewer on the tab they picked.
  // Two questions, and they had one answer.
  //
  // What the viewer has *narrowed* by decides what an empty list means: with nothing narrowing it,
  // the list is empty because there is nothing there, and saying "no claims match these filters" of
  // an untouched My positions blames filters the viewer never set.
  //
  // What "Clear filters" should undo is wider, and does include the position filter — resetting to
  // All claims is exactly what a viewer stuck on an empty My positions wants.
  const hasNarrowingFilters = Boolean(debouncedSearch || spaceIds.length || topicIds.length);
  const hasFilters = hasNarrowingFilters || (!graphSourced && filter !== 'all');

  // Both lists page now, so the sentinel follows whichever one is on screen (GEO-2798). The tagged
  // lists used to arrive whole, which is why this was the index's alone.
  const sentinelRef = useInfiniteScrollSentinel({
    hasNextPage: graphSourced ? taggedHasNextPage : claimsQuery.hasNextPage,
    isFetchingNextPage: graphSourced ? taggedFetchingNextPage : claimsQuery.isFetchingNextPage,
    fetchNextPage: graphSourced ? fetchNextTaggedPage : claimsQuery.fetchNextPage,
  });

  return (
    <div className="flex flex-col">
      <HubStickyControls>
        {/* Pinned above the filters, the way the Matches tab pins it. A request sent from here used
            to vanish the moment it was sent — the card that sent it looks exactly as it did before,
            and the only evidence was on another tab. It rides inside the sticky block rather than
            above it because two stickies would both claim `top-0` and overlap, and this one is
            conditional so the filters could not be offset by a known height. */}
        {outbound ? <OutboundRequestCard request={outbound} /> : null}

        <Input
          withSearchIcon
          value={search}
          onChange={event => setSearch(event.currentTarget.value)}
          placeholder="Search claims"
          aria-label="Search claims"
        />

        <SpaceTopicFilters
          spaceIds={spaceIds}
          onSpaceToggle={id => setSpaceIds(current => toggleId(current, id))}
          onSpacesClear={() => setSpaceIds([])}
          topicIds={topicIds}
          onTopicToggle={id => setTopicIds(current => toggleId(current, id))}
          onTopicsClear={() => setTopicIds([])}
          facetSpaces={facetSpaces}
          facetTopics={facetTopics}
          countsPending={countsPending}
          leading={
            <HubFilterMenu
              label={filterOptions.find(option => option.value === filter)?.label ?? 'All claims'}
              options={filterOptions}
              value={filter}
              onChange={setFilter}
            />
          }
        />
      </HubStickyControls>

      <div className="flex flex-col gap-3 px-4 py-3">
        <HubQueryState
          isLoading={spacesPending || (graphSourced ? taggedLoading : claimsQuery.isLoading)}
          // The catalog only. It is the list — without it there is nothing to show, and an error is
          // the honest answer.
          //
          // The two lookups behind it are metadata, and their failure is deliberately *not* fatal.
          // `taggedRows` fans out one request per space in batches of fifty, so across a few hundred
          // tagged claims a single failing batch would blank a list that renders perfectly well
          // without it — which is exactly what it did the first time this was tried, in a browser.
          // The rows come from the catalog; the entity is optional in `taggedEntries`.
          //
          // Their consequences are handled where they land instead, and both are pinned by tests:
          // `facetsSettled` refuses to reconcile against a menu those lookups never filled, so the
          // viewer's topic selection is not spent, and `taggedKindResolvedFor` keeps a card
          // unpressable until its vocabulary and the viewer's own side have actually arrived. A
          // short list beats a blank one; a wrong publish beats neither, and is what those guard.
          error={graphSourced ? taggedError : claimsQuery.error}
          // Retries whatever failed, not just the catalog. The error above can come from either of
          // the two lookups behind the list, and neither is keyed on the catalog — so refetching
          // only that left the failed dependency untouched and the error state exactly where it
          // was. Invalidated by key rather than through a `refetch` handed back by those hooks:
          // both combine their results, and a fresh closure in a `combine` would be a new identity
          // on every render, which is the one thing those hooks document that they must not be.
          onRetry={() =>
            void (graphSourced
              ? Promise.all([
                  refetchTagged(),
                  queryClient.invalidateQueries({ queryKey: CLAIM_ENTITIES_QUERY_PREFIX }),
                  queryClient.invalidateQueries({ queryKey: DEBATE_CLAIMS_QUERY_PREFIX }),
                ])
              : claimsQuery.refetch())
          }
          isEmpty={visibleClaims.length === 0}
          signInAction={
            onRequireSignIn
              ? { label: 'Sign in', message: 'Sign in to browse claims to debate.', onClick: onRequireSignIn }
              : undefined
          }
          // What an empty list means depends on where it came from, and the two graph-sourced
          // filters mean different things by it: Featured says a curator has tagged nothing, All
          // says nothing carries the Debate tag. Both are statements about curation, not about the
          // viewer's filters, so they only show when no filter is narrowing anything.
          emptyMessage={
            hasNarrowingFilters
              ? filter === 'featured'
                ? 'No featured claims match these filters.'
                : 'No claims match these filters.'
              : NOTHING_HERE[filter]
          }
          emptyAction={
            hasFilters
              ? {
                  label: 'Clear filters',
                  onClick: () => {
                    setSearch('');
                    if (!graphSourced) setFilter('all');
                    setSpaceIds([]);
                    setTopicIds([]);
                  },
                }
              : undefined
          }
        >
          {/* One list, in the server's order. Splitting out the claims you'd already answered
            re-ranked the tab by something the Position filter in the dropdown already covers, and
            it moved a card between two sections the moment you took a side. */}
          <HubCardList>
            {visibleClaims.map(entry => (
              <MatchmakingClaimCard
                key={`${entry.claim.space_id}:${entry.claim.claim_entity_id}`}
                claim={entry.claim}
                positions={entry.positions}
                readiness={entry}
                activeDebate={entry.active_debate}
                // The paged list is geo-chat's own, so every row carries its kind already; only the
                // tagged list has to wait for one.
                answersReady={taggedAnswersReady}
                onRequireSignIn={onRequireSignIn}
              />
            ))}
          </HubCardList>
        </HubQueryState>

        {/* Pages arrive as the viewer reaches the end of the list rather than on a button. Outside
          the empty state deliberately: the space allowlist and the topic filter both run over the
          loaded pages, so a page can arrive with nothing to show — and with the sentinel rendered
          only alongside results, the list would stop at the first such page and report "no claims"
          while the corpus still had matches in it. The sentinel only exists while there is a page
          left, so it can't sit in view asking for one that isn't there.

          Not while the allowlist is pending, though: the tab is showing a four-row skeleton then,
          so the sentinel sits in view under it and pages the corpus on the strength of a loading
          state being visible — reading "the viewer reached the end" off a list that isn't there. */}
        {(graphSourced ? taggedHasNextPage : claimsQuery.hasNextPage) ? (
          <div ref={sentinelRef} data-testid="claims-scroll-sentinel" className="h-px" />
        ) : null}
      </div>
    </div>
  );
}

/**
 * The controls a tab pins above its list. Both hub surfaces page forever, so leaving search and
 * the filters at the top of the document meant scrolling back to the start to change either.
 *
 * Deliberately thin: the panel is narrow and short, so every pinned pixel is a claim the viewer
 * can't see. The tab row above it is already fixed — it sits outside the panel's scroll container
 * — so this is the only piece that needed pinning here.
 */
export function HubStickyControls({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-grey-02 bg-white px-4 py-3">{children}</div>
  );
}

/**
 * The two sides of a tagged claim, from geo-chat's per-space row.
 *
 * That row reports the sides as `online_choices` — who is online and available on each — where the
 * hub's index reports a total alongside them. The card draws the avatars and their overflow count
 * off `total_count`, so the online count stands in for it: it is the only count this endpoint
 * gives, and undercounting a side is better than claiming a total it never told us.
 */
function taggedPositionSummaries(
  row: DebateClaim | undefined,
  responseKind: 'stance' | 'veracity'
): DebateClaimPositionSummary[] {
  return [true, false].map(position => {
    const choice = row?.online_choices.find(candidate => candidate.position === position);

    return {
      position,
      // A server-supplied label wins, so an authoritative Verify/Dispute survives.
      position_label: choice?.position_label ?? responsePositionLabel(responseKind, position),
      total_count: choice?.participant_count ?? 0,
      available_now_count: choice?.participant_count ?? 0,
      // These are `online_choices`, so the count already *is* the present population — the same
      // number, but it has to be set explicitly. `present_count` is what the avatar stack and its
      // `+N` read (GEO-2691), and leaving it unset would fall back to the length of the capped
      // preview and silently drop the overflow: 5 people behind 2 faces would render no "+3".
      present_count: choice?.participant_count ?? 0,
      participants: choice?.participants ?? [],
    };
  });
}

type SpaceTopicFiltersProps = {
  spaceIds: string[];
  onSpaceToggle: (spaceId: string) => void;
  onSpacesClear: () => void;
  /** Omit the topic props to hide the topic menu — requests carry no topics to facet on. */
  topicIds?: string[];
  onTopicToggle?: (topicId: string) => void;
  onTopicsClear?: () => void;
  /** Ordered as they should be shown, and carrying the counts the rows display. */
  facetSpaces: { id: string; count: number }[];
  facetTopics?: { id: string; name: string | null; count: number }[];
  /**
   * Both menus' counts describe a filter the viewer has moved on from. Passed straight through to
   * {@link HubMultiFilterMenu}, which holds the old numbers for a grace period before replacing
   * them with skeletons rather than blanking them on the spot — see the prop there.
   */
  countsPending?: boolean;
  /** Rendered before the space filter — the Claims tab puts its position filter here. */
  leading?: React.ReactNode;
  /**
   * Pushes the topic menu to the far end of the row, leaving the source and space menus together on
   * the left. For a surface with width to spare: the rematch picker is a full page, where a row of
   * menus huddled at one edge leaves an obvious gap. The side panel is narrow enough that they fill
   * the row anyway, and pushing one out there would only separate it from the others.
   */
  topicAtEnd?: boolean;
};

/**
 * Space and topic options come from the backend's facets so they stay in sync with the sorted
 * result set; names and thumbnails come from {@link useSpaceLabels}, which answers off the browse
 * sidebar's already-loaded rows before falling back to the knowledge graph — the facets are
 * narrowed to the viewer's own spaces, which is exactly what the sidebar is holding.
 */
export function SpaceTopicFilters({
  spaceIds,
  onSpaceToggle,
  onSpacesClear,
  topicIds,
  onTopicToggle,
  onTopicsClear,
  facetSpaces,
  facetTopics,
  countsPending,
  leading,
  topicAtEnd,
}: SpaceTopicFiltersProps) {
  const facetSpaceIds = React.useMemo(() => facetSpaces.map(space => space.id), [facetSpaces]);
  const { labelsById, isLoading: labelsLoading } = useSpaceLabels(facetSpaceIds);

  const spaceOptions = React.useMemo<HubFilterOption<string>[]>(
    () =>
      facetSpaces.map(space => {
        const label = spaceLabel(labelsById, space.id);
        return {
          value: space.id,
          // A settled lookup that still can't name the space really does leave "Space" as the best
          // label there is; only a name still on its way draws as a skeleton.
          label: label?.name ?? 'Space',
          image: label?.image ?? null,
          pending: !label && labelsLoading,
          count: space.count,
        };
      }),
    [facetSpaces, labelsById, labelsLoading]
  );

  const topicOptions = React.useMemo<HubFilterOption<string>[]>(
    () => (facetTopics ?? []).map(topic => ({ value: topic.id, label: topic.name ?? 'Topic', count: topic.count })),
    [facetTopics]
  );

  const onlySpace = spaceIds.length === 1 ? spaceLabel(labelsById, spaceIds[0]) : undefined;
  const spaceMenuLabel = pickerLabel(
    spaceIds.length,
    'Any space',
    () => onlySpace?.name ?? 'Space',
    count => `${count} spaces`
  );
  const topicMenuLabel = pickerLabel(
    topicIds?.length ?? 0,
    'Any topic',
    () => facetTopics?.find(topic => topic.id === topicIds?.[0])?.name ?? 'Topic',
    count => `${count} topics`
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {leading}
      <HubMultiFilterMenu
        label={spaceMenuLabel}
        labelPending={spaceIds.length === 1 && !onlySpace && labelsLoading}
        options={spaceOptions}
        values={spaceIds}
        onToggle={onSpaceToggle}
        onClear={onSpacesClear}
        clearLabel="Any space"
        countsPending={countsPending}
        showImages
      />
      {facetTopics && topicIds && onTopicToggle && onTopicsClear ? (
        // `ml-auto` on the menu itself rather than `justify-between` on the row: with three items
        // that spread all of them, which stranded the space menu in the middle instead of leaving
        // it beside the source it narrows.
        <div className={cx(topicAtEnd && 'ml-auto')}>
          <HubMultiFilterMenu
            label={topicMenuLabel}
            options={topicOptions}
            values={topicIds}
            onToggle={onTopicToggle}
            onClear={onTopicsClear}
            clearLabel="Any topic"
            countsPending={countsPending}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * What the trigger pill says. One selection reads as its own name — the useful case, and the one
 * the viewer is most often in — while several collapse to a count, because two names rarely fit
 * and a truncated pair reads as one bad name.
 */
function pickerLabel(count: number, empty: string, single: () => string, many: (count: number) => string) {
  if (count === 0) return empty;
  return count === 1 ? single() : many(count);
}
