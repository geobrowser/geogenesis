'use client';

import * as React from 'react';

import cx from 'classnames';

import { useInfiniteScrollSentinel } from '~/core/hooks/use-infinite-scroll-sentinel';
import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';

import { Input } from '~/design-system/input';

import type { MatchmakingClaimsFilter, MatchmakingClaimsQuery } from '../api';
import { eligibleClaimSpaceIds, isClaimSpaceAllowed, keepSelectableSpace } from '../claim-space-allowlist';
import { useClaimSpaceAllowlist } from '../use-claim-space-allowlist';
import { isSpaceDebatePublishable, useDebatePublishableSpaces } from '../use-debate-publishable-spaces';
import { useMatchmakingClaims } from './hooks';
import { HubFilterMenu, type HubFilterOption } from './hub-filter-menu';
import { HubCardList } from './hub-motion';
import { HubQueryState } from './hub-states';
import { MatchmakingClaimCard } from './matchmaking-claim-card';
import { keepSelectableTopic } from './topic-facets';
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
  const eligibleSpaceIds = React.useMemo(
    () => eligibleClaimSpaceIds(spaceAllowlist, spaceShowsClaims),
    [spaceAllowlist, spaceShowsClaims]
  );

  // A known-empty scope is not the same as no scope. geo-chat reads "no ids" as "no filter", so
  // omitting it would fetch the unfiltered corpus — and while `serverClaims` drops every row of
  // it, the facets are not filtered, leaving a menu whose every option leads to an empty list.
  const hasNoEligibleSpaces = eligibleSpaceIds !== null && eligibleSpaceIds.length === 0;

  const query = React.useMemo<MatchmakingClaimsQuery>(
    () => ({ search: debouncedSearch || null, spaceId, spaceIds: eligibleSpaceIds, topicId, filter }),
    [debouncedSearch, spaceId, eligibleSpaceIds, topicId, filter]
  );

  // Not asked until the scope is known. Until then `spaceIds` is `null`, which geo-chat reads as
  // "no filter", so the answer is about the whole corpus — and every row of it is dropped below by
  // `spacesPending`, making the request pure waste on its own terms. What it leaves behind is not
  // waste: `keepPreviousData` serves those pages back when the scope lands and the key changes,
  // and while the rows are re-gated on the way out and the spaces are filtered on read, a topic
  // facet carries no space to gate it by. The menu spent that window offering topics from spaces
  // the list had already stopped showing.
  const claimsQuery = useMatchmakingClaims(query, !hasNoEligibleSpaces && !spacesPending);
  // Masked rather than left to `enabled`. The hook keeps previous data across a key change, so a
  // scope narrowing — to nothing, or from unknown to known — still hands back the last scope's
  // pages, and while the rows are re-gated below the facets on them are not. That is the whole
  // menu-over-an-empty-list this is meant to prevent, so it is the one place the scope is applied:
  // everything downstream reads these pages and needs no guard of its own.
  const pages = React.useMemo(
    () => (hasNoEligibleSpaces || spacesPending ? [] : (claimsQuery.data?.pages ?? [])),
    [claimsQuery.data, hasNoEligibleSpaces, spacesPending]
  );
  const facets = pages[0]?.facets;

  const serverClaims = React.useMemo(
    () => pages.flatMap(page => page.claims).filter(entry => spaceShowsClaims(entry.claim.space_id)),
    [pages, spaceShowsClaims]
  );

  // The space menu offers only what the list can actually show, so picking an option never lands
  // the viewer on an empty list they can't explain.
  const facetSpaceIds = React.useMemo(
    () => (facets?.space_ids ?? []).filter(spaceShowsClaims),
    [facets?.space_ids, spaceShowsClaims]
  );

  // The server re-sorts on every readiness change, so hold the order the user is looking at until
  // they ask for a different list.
  const claims = useStableListOrder(
    serverClaims,
    entry => `${entry.claim.space_id}:${entry.claim.claim_entity_id}`,
    `${debouncedSearch}|${spaceId ?? ''}|${topicId ?? ''}|${filter}`
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
    () =>
      [...(facets?.topic_facets ?? [])]
        .map(facet => ({ id: facet.id, name: facet.name }))
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
    [facets?.topic_facets]
  );

  // Facets ride the first page, so they are absent until it lands and while a filter change is in
  // flight. That is "not known yet", not "no topics" — see `keepSelectableTopic`.
  //
  // Placeholder pages count as in flight. They are the previous filter's answer, held back so the
  // list doesn't blink, and the rows on screen are theirs too — so the menu is not lying while
  // they show. But they are not an answer to the filter now being asked about, and a selection
  // cleared against them would be cleared on the wrong question.
  const facetsSettled = facets !== undefined && !claimsQuery.isLoading && !claimsQuery.isPlaceholderData;
  const topicsResolved = facetsSettled;

  // The same for the space itself: it can be picked while the gates are still passing everything,
  // and left selected it keeps going out on every request while its rows are dropped locally.
  React.useEffect(() => {
    setSpaceId(current => keepSelectableSpace(current, facetSpaceIds, facetsSettled));
  }, [facetSpaceIds, facetsSettled]);

  // Changing space with a topic held would otherwise leave the viewer filtered by a chip that is
  // no longer in the menu to unpick.
  React.useEffect(() => {
    setTopicId(current => keepSelectableTopic(current, facetTopics, topicsResolved));
  }, [facetTopics, topicsResolved]);

  const hasFilters = Boolean(debouncedSearch || spaceId || topicId || filter !== 'all');

  const sentinelRef = useInfiniteScrollSentinel({
    hasNextPage: !hasNoEligibleSpaces && claimsQuery.hasNextPage,
    isFetchingNextPage: claimsQuery.isFetchingNextPage,
    fetchNextPage: claimsQuery.fetchNextPage,
  });

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
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
      {!hasNoEligibleSpaces && claimsQuery.hasNextPage && !spacesPending ? (
        <div ref={sentinelRef} data-testid="claims-scroll-sentinel" className="h-px" />
      ) : null}
    </div>
  );
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
  spaceId,
  onSpaceChange,
  topicId,
  onTopicChange,
  facetSpaceIds,
  facetTopics,
  leading,
  className,
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
    <div className={cx('flex flex-wrap items-center gap-2', className)}>
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
        <HubFilterMenu
          label={topicLabel}
          options={topicOptions}
          value={topicId ?? ''}
          onChange={value => onTopicChange(value || null)}
        />
      ) : null}
    </div>
  );
}
