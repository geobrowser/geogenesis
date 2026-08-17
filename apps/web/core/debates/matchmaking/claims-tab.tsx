'use client';

import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { useInfiniteScrollSentinel } from '~/core/hooks/use-infinite-scroll-sentinel';
import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';
import { useQueryEntities } from '~/core/sync/use-store';
import { validateEntityId } from '~/core/utils/utils';

import { Input } from '~/design-system/input';
import { Text } from '~/design-system/text';

import type { MatchmakingClaim, MatchmakingClaimsFilter, MatchmakingClaimsQuery, MatchmakingTopic } from '../api';
import { isClaimSpaceAllowed } from '../claim-space-allowlist';
import { useClaimSpaceAllowlist } from '../use-claim-space-allowlist';
import { useMatchmakingClaims } from './hooks';
import { HubFilterMenu, type HubFilterOption } from './hub-filter-menu';
import { HubCardList } from './hub-motion';
import { HubQueryState } from './hub-states';
import { MatchmakingClaimCard } from './matchmaking-claim-card';
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

  const query = React.useMemo<MatchmakingClaimsQuery>(
    () => ({ search: debouncedSearch || null, spaceId, filter }),
    [debouncedSearch, spaceId, filter]
  );

  const claimsQuery = useMatchmakingClaims(query, true);
  const pages = React.useMemo(() => claimsQuery.data?.pages ?? [], [claimsQuery.data]);
  const facets = pages[0]?.facets;

  const { allowlist: spaceAllowlist } = useClaimSpaceAllowlist();
  const serverClaims = React.useMemo(
    () => pages.flatMap(page => page.claims).filter(entry => isClaimSpaceAllowed(entry.claim.space_id, spaceAllowlist)),
    [pages, spaceAllowlist]
  );

  // The space menu offers only what the list can actually show, so picking an option never lands
  // the viewer on an empty list they can't explain.
  const facetSpaceIds = React.useMemo(
    () => (facets?.space_ids ?? []).filter(id => isClaimSpaceAllowed(id, spaceAllowlist)),
    [facets?.space_ids, spaceAllowlist]
  );

  // The server re-sorts on every readiness change, so hold the order the user is looking at until
  // they ask for a different list.
  const claims = useStableListOrder(
    serverClaims,
    entry => `${entry.claim.space_id}:${entry.claim.claim_entity_id}`,
    `${debouncedSearch}|${spaceId ?? ''}|${filter}`
  );

  // Only real entity ids can be looked up in the KG; the graph 400s the whole batch on a single
  // malformed id, so drop any that aren't valid.
  const claimEntityIds = React.useMemo(
    () => [...new Set(claims.map(entry => entry.claim.claim_entity_id).filter(validateEntityId))],
    [claims]
  );
  const { entities: claimEntities } = useQueryEntities({
    where: { id: { in: claimEntityIds } },
    enabled: claimEntityIds.length > 0,
    placeholderData: keepPreviousData,
  });

  const topicsByClaimId = React.useMemo(() => {
    const map = new Map<string, MatchmakingTopic[]>();
    for (const entity of claimEntities) {
      const topics = entity.relations
        .filter(relation => relation.type.id === TOPICS_PROPERTY_ID && relation.isDeleted !== true)
        .map(relation => ({ id: relation.toEntity.id, name: relation.toEntity.name ?? null }));
      if (topics.length > 0) map.set(entity.id, topics);
    }
    return map;
  }, [claimEntities]);

  const facetTopics = React.useMemo(() => {
    const seen = new Map<string, MatchmakingTopic>();
    for (const topics of topicsByClaimId.values()) {
      for (const topic of topics) {
        if (!seen.has(topic.id)) seen.set(topic.id, topic);
      }
    }
    return [...seen.values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }, [topicsByClaimId]);

  const hasFilters = Boolean(debouncedSearch || spaceId || topicId || filter !== 'all');

  const sentinelRef = useInfiniteScrollSentinel({
    hasNextPage: claimsQuery.hasNextPage,
    isFetchingNextPage: claimsQuery.isFetchingNextPage,
    fetchNextPage: claimsQuery.fetchNextPage,
  });

  const visibleClaims = React.useMemo(
    () =>
      topicId
        ? claims.filter(entry => topicsByClaimId.get(entry.claim.claim_entity_id)?.some(topic => topic.id === topicId))
        : claims,
    [claims, topicsByClaimId, topicId]
  );

  // The claims you've already taken a side on lead, since those are the ones that can become
  // debates. The split is dropped when a filter already narrows to one of the two groups, where a
  // heading over the whole list would say nothing.
  const showSections = filter === 'all';
  const myClaims = React.useMemo(
    () => (showSections ? visibleClaims.filter(entry => entry.viewer_response !== null) : []),
    [showSections, visibleClaims]
  );
  const otherClaims = React.useMemo(
    () => (showSections ? visibleClaims.filter(entry => entry.viewer_response === null) : visibleClaims),
    [showSections, visibleClaims]
  );

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
        isLoading={claimsQuery.isLoading}
        error={claimsQuery.error}
        onRetry={() => void claimsQuery.refetch()}
        isEmpty={visibleClaims.length === 0}
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
        <>
          {myClaims.length > 0 ? <ClaimSection label="My positions" claims={myClaims} /> : null}
          {otherClaims.length > 0 ? (
            <ClaimSection label={showSections && myClaims.length > 0 ? 'All claims' : null} claims={otherClaims} />
          ) : null}
        </>
      </HubQueryState>

      {/* Pages arrive as the viewer reaches the end of the list rather than on a button. Outside
          the empty state deliberately: the space allowlist and the topic filter both run over the
          loaded pages, so a page can arrive with nothing to show — and with the sentinel rendered
          only alongside results, the list would stop at the first such page and report "no claims"
          while the corpus still had matches in it. The sentinel only exists while there is a page
          left, so it can't sit in view asking for one that isn't there. */}
      {claimsQuery.hasNextPage ? <div ref={sentinelRef} data-testid="claims-scroll-sentinel" className="h-px" /> : null}
    </div>
  );
}

function ClaimSection({ label, claims }: { label: string | null; claims: MatchmakingClaim[] }) {
  return (
    <section className="flex flex-col gap-2 not-first:mt-4">
      {label ? (
        <Text as="h3" variant="footnote" color="grey-04">
          {label}
        </Text>
      ) : null}
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
    </section>
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
 * result set; names and thumbnails are resolved locally from the knowledge graph.
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
  const { spacesById } = useSpacesByIds(facetSpaceIds);

  const spaceOptions = React.useMemo<HubFilterOption<string>[]>(
    () => [
      { value: '', label: 'Any space', showImage: false },
      ...facetSpaceIds.map(id => ({
        value: id,
        label: spacesById.get(id)?.entity?.name ?? 'Space',
        image: spacesById.get(id)?.entity?.image ?? null,
      })),
    ],
    [facetSpaceIds, spacesById]
  );

  const topicOptions = React.useMemo<HubFilterOption<string>[]>(
    () => [
      { value: '', label: 'Any topic' },
      ...(facetTopics ?? []).map(topic => ({ value: topic.id, label: topic.name ?? 'Topic' })),
    ],
    [facetTopics]
  );

  const spaceLabel = spaceId ? (spacesById.get(spaceId)?.entity?.name ?? 'Space') : 'Any space';
  const topicLabel = topicId ? (facetTopics?.find(topic => topic.id === topicId)?.name ?? 'Topic') : 'Any topic';

  return (
    <div className={cx('flex flex-wrap items-center gap-2', className)}>
      {leading}
      <HubFilterMenu
        label={spaceLabel}
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
