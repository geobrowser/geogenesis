'use client';

import * as React from 'react';

import cx from 'classnames';

import { useInfiniteScrollSentinel } from '~/core/hooks/use-infinite-scroll-sentinel';
import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';

import { Input } from '~/design-system/input';

import type { MatchmakingClaimsFilter, MatchmakingClaimsQuery } from '../api';
import { eligibleClaimSpaceIds, isClaimSpaceAllowed } from '../claim-space-allowlist';
import { useClaimSpaceAllowlist } from '../use-claim-space-allowlist';
import { isSpaceDebatePublishable, useDebatePublishableSpaces } from '../use-debate-publishable-spaces';
import { HubFilterMenu, type HubFilterOption, HubMultiFilterMenu } from './hub-filter-menu';
import { HubCardList } from './hub-motion';
import { HubQueryState } from './hub-states';
import { MatchmakingClaimCard } from './matchmaking-claim-card';
import { keepSelectableTopics, orderFacetOptions, toggleId } from './topic-facets';
import { useScopedMatchmakingClaims } from './use-scoped-claims';
import { useStableListOrder } from './use-stable-list-order';

const SEARCH_DEBOUNCE_MS = 250;

const FILTER_OPTIONS: HubFilterOption<MatchmakingClaimsFilter>[] = [
  { value: 'all', label: 'All claims' },
  { value: 'mine', label: 'My positions' },
  { value: 'debate_now', label: 'Debate now' },
];

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
  const [filter, setFilter] = React.useState<MatchmakingClaimsFilter>('all');
  const [spaceIds, setSpaceIds] = React.useState<string[]>([]);
  const [topicIds, setTopicIds] = React.useState<string[]>([]);

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

  const query = React.useMemo<Omit<MatchmakingClaimsQuery, 'spaceIds' | 'spaceId'>>(
    () => ({ search: debouncedSearch || null, topicIds, filter }),
    [debouncedSearch, topicIds, filter]
  );

  const scope = React.useMemo(
    () => ({ spaceIds: eligibleSpaceIds, pending: spacesPending }),
    [eligibleSpaceIds, spacesPending]
  );

  // Every way the pages can describe a wider corpus than this tab will show is handled in there,
  // once, for both pickers — see `useScopedMatchmakingClaims`.
  const claimsQuery = useScopedMatchmakingClaims(query, scope, spaceIds);
  const { pages, facets } = claimsQuery;

  const serverClaims = React.useMemo(
    () => pages.flatMap(page => page.claims).filter(entry => spaceShowsClaims(entry.claim.space_id)),
    [pages, spaceShowsClaims]
  );

  // The space menu offers only what the list can actually show, so picking an option never lands
  // the viewer on an empty list they can't explain.
  // Ordered by count with the picked ones held at the top, so ticking one doesn't re-sort the
  // list under the cursor. Zero-count options need no decision: both facets are a `GROUP BY` over
  // the candidate set, so an option with nothing behind it is absent rather than present at zero.
  const facetSpaces = React.useMemo(
    () =>
      orderFacetOptions(
        (facets?.space_facets ?? []).filter(facet => spaceShowsClaims(facet.id)),
        spaceIds
      ),
    [facets?.space_facets, spaceIds, spaceShowsClaims]
  );

  // The server re-sorts on every readiness change, so hold the order the user is looking at until
  // they ask for a different list.
  const claims = useStableListOrder(
    serverClaims,
    entry => `${entry.claim.space_id}:${entry.claim.claim_entity_id}`,
    `${debouncedSearch}|${spaceIds.join(',')}|${topicIds.join(',')}|${filter}`
  );

  // The topic menu, straight from the server. It describes every claim the current filters
  // allow, not the pages loaded so far — which is what the client-side version could never do:
  // it read topics off the loaded claims, so the menu grew as the viewer scrolled and a space
  // whose first page happened to carry none looked like a space with no topics (GEO-2653).
  //
  // Already narrowed by the space filter, and already ordered — by count, descending. Kept in
  // name order here so this change is about which options exist rather than how they are
  // arranged; the count order and the counts themselves belong to GEO-2654.
  const facetTopics = React.useMemo(
    () => orderFacetOptions(facets?.topic_facets ?? [], topicIds),
    [facets?.topic_facets, topicIds]
  );

  const { facetsSettled } = claimsQuery;

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
  React.useEffect(() => {
    setTopicIds(current => keepSelectableTopics(current, facetTopics, facetsSettled));
  }, [facetTopics, facetsSettled]);

  const hasFilters = Boolean(debouncedSearch || spaceIds.length || topicIds.length || filter !== 'all');

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
          spaceIds={spaceIds}
          onSpaceToggle={id => setSpaceIds(current => toggleId(current, id))}
          onSpacesClear={() => setSpaceIds([])}
          topicIds={topicIds}
          onTopicToggle={id => setTopicIds(current => toggleId(current, id))}
          onTopicsClear={() => setTopicIds([])}
          facetSpaces={facetSpaces}
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
          isLoading={claimsQuery.isLoading || spacesPending}
          error={claimsQuery.error}
          onRetry={() => void claimsQuery.refetch()}
          isEmpty={claims.length === 0}
          emptyMessage={hasFilters ? 'No claims match these filters.' : 'No debatable claims yet.'}
          emptyAction={
            hasFilters
              ? {
                  label: 'Clear filters',
                  onClick: () => {
                    setSearch('');
                    setFilter('all');
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
            {claims.map(entry => (
              <MatchmakingClaimCard
                key={`${entry.claim.space_id}:${entry.claim.claim_entity_id}`}
                claim={entry.claim}
                positions={entry.positions}
                readiness={entry}
                activeDebate={entry.active_debate}
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
  /** Rendered before the space filter — the Claims tab puts its position filter here. */
  leading?: React.ReactNode;
  /** Overrides the row layout — the rematch picker spreads the two menus across its width. */
  className?: string;
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
  leading,
  className,
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
    <div className={cx('flex flex-wrap items-center gap-2', className)}>
      {leading}
      <HubMultiFilterMenu
        label={spaceMenuLabel}
        labelPending={spaceIds.length === 1 && !onlySpace && labelsLoading}
        options={spaceOptions}
        values={spaceIds}
        onToggle={onSpaceToggle}
        onClear={onSpacesClear}
        clearLabel="Any space"
        showImages
      />
      {facetTopics && topicIds && onTopicToggle && onTopicsClear ? (
        <HubMultiFilterMenu
          label={topicMenuLabel}
          options={topicOptions}
          values={topicIds}
          onToggle={onTopicToggle}
          onClear={onTopicsClear}
          clearLabel="Any topic"
        />
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
