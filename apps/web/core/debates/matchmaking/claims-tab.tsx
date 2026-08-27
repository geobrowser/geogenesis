'use client';

import * as React from 'react';

import cx from 'classnames';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { claimResponseKind } from '~/core/claims/response-kind';
import { useInfiniteScrollSentinel } from '~/core/hooks/use-infinite-scroll-sentinel';
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
  MatchmakingTopic,
} from '../api';
import { useClaimEntitiesByIds } from '../claim-picker-page';
import { eligibleClaimSpaceIds, isClaimSpaceAllowed } from '../claim-space-allowlist';
import {
  type FeaturedClaim,
  dedupeFeaturedClaims,
  featuredClaimIdsBySpace,
  useFeaturedClaims,
} from '../featured-claims';
import { useDebateClaimsBySpaces } from '../hooks';
import { useClaimSpaceAllowlist } from '../use-claim-space-allowlist';
import { isSpaceDebatePublishable, useDebatePublishableSpaces } from '../use-debate-publishable-spaces';
import { HubFilterMenu, type HubFilterOption } from './hub-filter-menu';
import { HubCardList } from './hub-motion';
import { HubQueryState } from './hub-states';
import { MatchmakingClaimCard } from './matchmaking-claim-card';
import { keepSelectableTopic } from './topic-facets';
import { useScopedMatchmakingClaims } from './use-scoped-claims';
import { useStableListOrder } from './use-stable-list-order';

const SEARCH_DEBOUNCE_MS = 250;

/**
 * GEO-2683. `featured` is the tab's own, not one of geo-chat's: the index has no notion of the tag,
 * so picking it swaps the list's source for the knowledge graph rather than changing a query param.
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

/** Stable identity so the geo-chat lookups don't restart on every render of a non-featured list. */
const NO_FEATURED_CLAIMS: FeaturedClaim[] = [];

/**
 * Cross-space claim discovery. Search, the space and position filters, and the sort (people
 * available now → total positions → recency) run server-side. Topics are a Knowledge Graph
 * notion geo-chat doesn't model — the server returns `topics: []` and ignores `topic_id` — so
 * topic labels, the topic facet, and topic filtering are resolved here over the loaded pages.
 *
 * The set of spaces a viewer may see claims from is resolved here too, for the same reason:
 * `/matchmaking/claims` takes a single `space_id`, so a viewer-specific list of spaces has no
 * query to go into. That makes it a page-local filter — a page can come back mostly or entirely
 * disallowed — so the sentinel that asks for the next page sits outside the empty state below.
 */
export function ClaimsTab() {
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  // Featured is where the tab opens. The whole corpus is the wider net but the shallower one — a
  // curator's pick is a better first thing to put in front of someone than whatever the index
  // ranked highest, and All claims is one option below.
  const [filter, setFilter] = React.useState<ClaimsTabFilter>('featured');
  const [spaceId, setSpaceId] = React.useState<string | null>(null);
  const [topicId, setTopicId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search]);

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

  const featured = filter === 'featured';

  // Featured draws its own list, so the index isn't asked for one. The query keeps saying `all`
  // rather than going undefined: switching to Featured and back then lands on the pages already
  // cached instead of paging the corpus again from the top.
  const query = React.useMemo<Omit<MatchmakingClaimsQuery, 'spaceIds'>>(
    () => ({ search: debouncedSearch || null, spaceId, topicId, filter: featured ? 'all' : filter }),
    [debouncedSearch, featured, filter, spaceId, topicId]
  );

  const scope = React.useMemo(
    () => ({ spaceIds: eligibleSpaceIds, pending: spacesPending }),
    [eligibleSpaceIds, spacesPending]
  );

  // Every way the pages can describe a wider corpus than this tab will show is handled in there,
  // once, for both pickers — see `useScopedMatchmakingClaims`. Featured passes `unusable`: it draws
  // its own list, so there is nothing worth asking the index for, and the masking that comes with
  // it also keeps the paging sentinel off a list that has no next page.
  const claimsQuery = useScopedMatchmakingClaims(query, scope, featured);
  const { pages, facets } = claimsQuery;

  const serverClaims = React.useMemo(
    () => pages.flatMap(page => page.claims).filter(entry => spaceShowsClaims(entry.claim.space_id)),
    [pages, spaceShowsClaims]
  );

  // GEO-2683. Featured is a curator's tag in the knowledge graph, and geo-chat doesn't index it —
  // so unlike the position filter this can't be a query param, and unlike the old client-side topic
  // cut it can't run over the loaded pages either: tagged claims are a few hundred out of a corpus
  // of hundreds of thousands, so a page-local filter would page for a very long time before it
  // found one. The list comes from the graph, narrowed by the same two space gates as the paged one.
  const {
    claims: featuredCatalog,
    isLoading: featuredLoading,
    error: featuredError,
    refetch: refetchFeatured,
  } = useFeaturedClaims(featured);

  // Collapsed to one row per claim *after* the space gates, not before. A claim can be tagged in
  // several spaces, and deduplicating first would let a space the viewer can't be shown stand for a
  // claim that is featured in one they can — dropping it from the list entirely.
  const featuredAllowed = React.useMemo(
    () =>
      !featured || spacesPending
        ? NO_FEATURED_CLAIMS
        : dedupeFeaturedClaims(featuredCatalog.filter(claim => spaceShowsClaims(claim.spaceId))),
    [featured, featuredCatalog, spaceShowsClaims, spacesPending]
  );

  // Search and the space menu run over the loaded list. The server-side versions belong to
  // geo-chat's index, which knows nothing about this list.
  const featuredMatching = React.useMemo(() => {
    const needle = debouncedSearch.toLowerCase();
    return featuredAllowed.filter(
      claim =>
        (spaceId === null || ID.equals(claim.spaceId, spaceId)) &&
        (needle === '' || claim.name.toLowerCase().includes(needle))
    );
  }, [debouncedSearch, featuredAllowed, spaceId]);

  // The sides and readiness the cards draw are geo-chat's, and its only lookup for claims it hasn't
  // ranked is the per-space one — so the tagged claims are asked for by id, grouped by the space
  // they were tagged in.
  //
  // Deliberately the whole allowed set rather than what search currently matches: typing then
  // filters a list that is already loaded instead of restarting a fan-out of per-space requests on
  // every keystroke, and the gateway scopes those lookups hold stay put while it happens.
  const featuredGroups = React.useMemo(() => featuredClaimIdsBySpace(featuredAllowed), [featuredAllowed]);
  const featuredRows = useDebateClaimsBySpaces(featuredGroups);
  const featuredReadinessUnresolved = featured && (featuredRows.isLoading || featuredRows.isError);

  // Only real entity ids can be looked up in the KG; the graph 400s the whole batch on a single
  // malformed id, so drop any that aren't valid.
  //
  // The picker's narrow projection rather than `useQueryEntities`: that one defaults to nine rows
  // and slices to them. It asks in batches of a hundred and pulls six fields instead of every value
  // and relation on the entity.
  const featuredEntityIds = React.useMemo(
    () => [...new Set(featuredMatching.map(claim => claim.claimEntityId).filter(validateEntityId))],
    [featuredMatching]
  );
  const { entities: featuredEntities, isLoading: featuredEntitiesLoading } = useClaimEntitiesByIds(featuredEntityIds);

  // Featured claims in the shape the rest of the tab already speaks. geo-chat has a row for a claim
  // only once someone has taken a side on it, so everything it would carry has a graph-derived
  // fallback: a claim nobody has answered still lists, with no sides and the response kind its own
  // "Is factual" value implies.
  const featuredEntries = React.useMemo<MatchmakingClaim[]>(() => {
    if (!featured) return [];
    const rowsByClaimId = new Map(featuredRows.claims.map(row => [row.claim_entity_id, row]));
    const entitiesById = new Map(featuredEntities.map(entity => [entity.id, entity]));

    return featuredMatching.map(claim => {
      const row = rowsByClaimId.get(claim.claimEntityId);
      const entity = entitiesById.get(claim.claimEntityId);
      const responseKind = row?.response_kind ?? (entity ? claimResponseKind(entity, claim.spaceId) : 'stance');

      return {
        claim: {
          id: row?.id ?? claim.claimEntityId,
          space_id: claim.spaceId,
          claim_entity_id: claim.claimEntityId,
          claim: claim.name,
          description: claim.description,
        },
        topics: [],
        response_kind: responseKind,
        viewer_response: row?.viewer_response ?? null,
        viewer_position: row?.viewer_response?.position ?? null,
        viewer_debate_ready: row?.viewer_debate_ready ?? false,
        readiness_disabled_reason: row?.readiness_disabled_reason ?? null,
        positions: featuredPositionSummaries(row, responseKind),
        // The index's ranking score, which this list has no equivalent of and doesn't sort by.
        score: 0,
        active_debate: Boolean(row?.active_debate),
      };
    });
  }, [featured, featuredEntities, featuredMatching, featuredRows.claims]);

  // Featured claims are not in geo-chat's index, so the server's topic facet says nothing about
  // them and its `topic_id` can't narrow them. Their topics come off the entities already fetched
  // for the response kind — which is what the whole tab did before GEO-2653 moved the paged list's
  // topics server-side.
  const featuredTopicsByClaimId = React.useMemo(() => {
    const map = new Map<string, MatchmakingTopic[]>();
    if (!featured) return map;
    for (const entity of featuredEntities) {
      const topics = entity.relations
        .filter(relation => relation.type.id === TOPICS_PROPERTY_ID && relation.isDeleted !== true)
        .map(relation => ({ id: relation.toEntity.id, name: relation.toEntity.name ?? null }));
      if (topics.length > 0) map.set(entity.id, topics);
    }
    return map;
  }, [featured, featuredEntities]);

  // The space menu offers only what the list can actually show, so picking an option never lands
  // the viewer on an empty list they can't explain.
  // Featured has no server facets — its spaces are wherever the tagged claims live — and they are
  // read before its own space selection is applied, or picking one would leave that one option in
  // the menu.
  const facetSpaceIds = React.useMemo(() => {
    if (featured) return [...new Set(featuredAllowed.map(claim => claim.spaceId))];
    return (facets?.space_ids ?? []).filter(spaceShowsClaims);
  }, [facets?.space_ids, featured, featuredAllowed, spaceShowsClaims]);

  // The server re-sorts on every readiness change, so hold the order the user is looking at until
  // they ask for a different list.
  const claims = useStableListOrder(
    featured ? featuredEntries : serverClaims,
    entry => `${entry.claim.space_id}:${entry.claim.claim_entity_id}`,
    `${debouncedSearch}|${spaceId ?? ''}|${topicId ?? ''}|${filter}`
  );

  // The paged list is narrowed by the server, which has no opinion about the featured one.
  const visibleClaims = React.useMemo(
    () =>
      featured && topicId
        ? claims.filter(entry =>
            featuredTopicsByClaimId.get(entry.claim.claim_entity_id)?.some(topic => topic.id === topicId)
          )
        : claims,
    [claims, featured, featuredTopicsByClaimId, topicId]
  );

  // The topic menu, straight from the server. It describes every claim the current filters
  // allow, not the pages loaded so far — which is what the client-side version could never do:
  // it read topics off the loaded claims, so the menu grew as the viewer scrolled and a space
  // whose first page happened to carry none looked like a space with no topics (GEO-2653).
  //
  // Already narrowed by the space filter, and already ordered — by count, descending. Kept in
  // name order here so this change is about which options exist rather than how they are
  // arranged; the count order and the counts themselves belong to GEO-2654.
  const facetTopics = React.useMemo(() => {
    const source = featured
      ? [...new Map([...featuredTopicsByClaimId.values()].flat().map(topic => [topic.id, topic])).values()]
      : (facets?.topic_facets ?? []).map(facet => ({ id: facet.id, name: facet.name }));
    return source.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }, [facets?.topic_facets, featured, featuredTopicsByClaimId]);

  // Featured's menu settles with its entity lookup, which is where its topics come from — the
  // server facets it would otherwise read never arrive, since the query is never made.
  const facetsSettled = featured ? !featuredLoading && !featuredEntitiesLoading : claimsQuery.facetsSettled;

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
    setSpaceId(current => (current !== null && !spaceShowsClaims(current) ? null : current));
  }, [spaceShowsClaims, spacesPending]);

  // Changing space with a topic held would otherwise leave the viewer filtered by a chip that is
  // no longer in the menu to unpick.
  React.useEffect(() => {
    setTopicId(current => keepSelectableTopic(current, facetTopics, facetsSettled));
  }, [facetTopics, facetsSettled]);

  // Featured is not counted: it chooses which list is on screen rather than narrowing one, so an
  // empty Featured tab should say nothing is featured — not that filters are hiding things — and
  // "Clear filters" should leave the viewer on the tab they picked.
  const hasFilters = Boolean(debouncedSearch || spaceId || topicId || (!featured && filter !== 'all'));

  const sentinelRef = useInfiniteScrollSentinel({
    hasNextPage: claimsQuery.hasNextPage,
    isFetchingNextPage: claimsQuery.isFetchingNextPage,
    fetchNextPage: claimsQuery.fetchNextPage,
  });

  return (
    <div className="flex flex-col">
      <HubStickyControls>
        <Input
          withSearchIcon
          value={search}
          onChange={event => setSearch(event.currentTarget.value)}
          placeholder="Search claims"
          aria-label="Search claims"
        />

        <SpaceTopicFilters
          spaceId={spaceId}
          onSpaceChange={setSpaceId}
          topicId={topicId}
          onTopicChange={setTopicId}
          facetSpaceIds={facetSpaceIds}
          facetTopics={facetTopics}
          leading={
            <HubFilterMenu
              label={FILTER_OPTIONS.find(option => option.value === filter)?.label ?? 'All claims'}
              options={FILTER_OPTIONS}
              value={filter}
              onChange={setFilter}
            />
          }
        />
      </HubStickyControls>

      <div className="flex flex-col gap-3 px-4 py-3">
        <HubQueryState
          isLoading={spacesPending || (featured ? featuredLoading : claimsQuery.isLoading)}
          error={featured ? featuredError : claimsQuery.error}
          onRetry={() => void (featured ? refetchFeatured() : claimsQuery.refetch())}
          isEmpty={visibleClaims.length === 0}
          emptyMessage={
            featured
              ? hasFilters
                ? 'No featured claims match these filters.'
                : 'No claims have been featured yet.'
              : hasFilters
                ? 'No claims match these filters.'
                : 'No debatable claims yet.'
          }
          emptyAction={
            hasFilters
              ? {
                  label: 'Clear filters',
                  onClick: () => {
                    setSearch('');
                    if (!featured) setFilter('all');
                    setSpaceId(null);
                    setTopicId(null);
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
                // Featured rows carry `viewer_debate_ready: false` until geo-chat's per-space lookup
                // lands, and a switch drawn from that would report "not ready" on a claim the viewer
                // is in fact standing ready on. The paged rows come with readiness on them, so this
                // only ever applies to Featured.
                hideReadinessToggle={featuredReadinessUnresolved}
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
        {claimsQuery.hasNextPage ? (
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
 * The two sides of a featured claim, from geo-chat's per-space row.
 *
 * That row reports the sides as `online_choices` — who is online and available on each — where the
 * hub's index reports a total alongside them. The card draws the avatars and their overflow count
 * off `total_count`, so the online count stands in for it: it is the only count this endpoint
 * gives, and undercounting a side is better than claiming a total it never told us.
 */
function featuredPositionSummaries(
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
  spaceId: string | null;
  onSpaceChange: (spaceId: string | null) => void;
  /** Omit the topic props to hide the topic menu — requests carry no topics to facet on. */
  topicId?: string | null;
  onTopicChange?: (topicId: string | null) => void;
  facetSpaceIds: string[];
  facetTopics?: { id: string; name: string | null }[];
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
  spaceId,
  onSpaceChange,
  topicId,
  onTopicChange,
  facetSpaceIds,
  facetTopics,
  leading,
  topicAtEnd,
}: SpaceTopicFiltersProps) {
  const { labelsById, isLoading: labelsLoading } = useSpaceLabels(facetSpaceIds);

  const spaceOptions = React.useMemo<HubFilterOption<string>[]>(
    () => [
      { value: '', label: 'Any space', showImage: false },
      ...facetSpaceIds.map(id => {
        const label = spaceLabel(labelsById, id);
        return {
          value: id,
          // A settled lookup that still can't name the space really does leave "Space" as the best
          // label there is; only a name still on its way draws as a skeleton.
          label: label?.name ?? 'Space',
          image: label?.image ?? null,
          pending: !label && labelsLoading,
        };
      }),
    ],
    [facetSpaceIds, labelsById, labelsLoading]
  );

  const topicOptions = React.useMemo<HubFilterOption<string>[]>(
    () => [
      { value: '', label: 'Any topic' },
      ...(facetTopics ?? []).map(topic => ({ value: topic.id, label: topic.name ?? 'Topic' })),
    ],
    [facetTopics]
  );

  const selectedSpace = spaceId ? spaceLabel(labelsById, spaceId) : undefined;
  const selectedSpaceLabel = spaceId ? (selectedSpace?.name ?? 'Space') : 'Any space';
  const topicLabel = topicId ? (facetTopics?.find(topic => topic.id === topicId)?.name ?? 'Topic') : 'Any topic';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {leading}
      <HubFilterMenu
        label={selectedSpaceLabel}
        labelPending={Boolean(spaceId) && !selectedSpace && labelsLoading}
        options={spaceOptions}
        value={spaceId ?? ''}
        onChange={value => onSpaceChange(value || null)}
        showImages
      />
      {facetTopics && onTopicChange ? (
        // `ml-auto` on the menu itself rather than `justify-between` on the row: with three items
        // that spread all of them, which stranded the space menu in the middle instead of leaving
        // it beside the source it narrows.
        <div className={cx(topicAtEnd && 'ml-auto')}>
          <HubFilterMenu
            label={topicLabel}
            options={topicOptions}
            value={topicId ?? ''}
            onChange={value => onTopicChange(value || null)}
          />
        </div>
      ) : null}
    </div>
  );
}
