'use client';

import * as React from 'react';

import { useClaimResponseState } from '~/core/claims/browse/use-claim-response-state';
import { CursorPager } from '~/core/claims/browse/use-cursor-pages';
import type { DebateClaim } from '~/core/debates/api';
import { useDebateClaimsBySpaces } from '~/core/debates/hooks';
import { MatchmakingClaimCard } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { keepSelectableTopics } from '~/core/debates/matchmaking/topic-facets';
import { type PersonClaimEntry, personTopics, usePersonClaims } from '~/core/debates/use-person-claims';
import { useNearViewport } from '~/core/hooks/use-near-viewport';
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { equals as idEquals, uuidToHex } from '~/core/id/normalize';
import type { Entity } from '~/core/types';

import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { PersonDebateFilters } from './person-debate-filters';

const CLAIMS_PAGE_SIZE = 8;

type PersonClaimRecord = {
  entry: PersonClaimEntry;
  spaceId: string;
};

/**
 * Every claim the person holds a position on, with the Space and Topic filters that narrow it.
 */
export function PersonClaimsCollection({ personId }: { personId: string }) {
  const { entries, claimByHex, topicsByClaimHex, isLoading } = usePersonClaims(personId);

  // Multi-select, matching the debates hub side panel: spaces OR, topics AND.
  const [selectedSpaceIds, setSelectedSpaceIds] = React.useState<string[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = React.useState<string[]>([]);
  const [pageIndex, setPageIndex] = React.useState(0);

  // The spaces the person's claims live in — the filter is claim-scoped, so its options are too.
  const spaceIds = React.useMemo(() => [...new Set(entries.flatMap(entry => entry.spaceIds))], [entries]);
  const topics = React.useMemo(() => personTopics(topicsByClaimHex), [topicsByClaimHex]);

  const filtersSettled = !isLoading;
  React.useEffect(() => {
    if (!filtersSettled) return;
    setSelectedSpaceIds(current => {
      if (current.length === 0) return current;
      const kept = current.filter(id => spaceIds.some(spaceId => idEquals(spaceId, id)));
      return kept.length === current.length ? current : kept;
    });
  }, [filtersSettled, spaceIds]);
  React.useEffect(() => {
    setSelectedTopicIds(current => keepSelectableTopics(current, topics, filtersSettled));
  }, [filtersSettled, topics]);

  const filtered = React.useMemo<PersonClaimRecord[]>(
    () =>
      entries.flatMap(entry => {
        // Topics: AND — the claim has to carry every selected topic.
        if (selectedTopicIds.length > 0) {
          const claimTopics = topicsByClaimHex.get(entry.claimHex) ?? [];
          if (!selectedTopicIds.every(topicId => claimTopics.some(topic => idEquals(topic.id, topicId)))) return [];
        }

        // Spaces: OR — show the claim under the first selected space it holds a position in.
        const position =
          selectedSpaceIds.length === 0
            ? entry.positions[0]
            : entry.positions.find(candidate => selectedSpaceIds.some(id => idEquals(candidate.spaceId, id)));

        return position ? [{ entry, spaceId: position.spaceId }] : [];
      }),
    [entries, topicsByClaimHex, selectedSpaceIds, selectedTopicIds]
  );

  const spaceCounts = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const spaceId of spaceIds) map.set(spaceId, 0);
    for (const entry of entries) {
      if (selectedTopicIds.length > 0) {
        const claimTopics = topicsByClaimHex.get(entry.claimHex) ?? [];
        if (!selectedTopicIds.every(topicId => claimTopics.some(topic => idEquals(topic.id, topicId)))) continue;
      }
      for (const spaceId of new Set(entry.spaceIds)) {
        if (map.has(spaceId)) map.set(spaceId, (map.get(spaceId) ?? 0) + 1);
      }
    }
    return map;
  }, [entries, spaceIds, topicsByClaimHex, selectedTopicIds]);

  const topicCounts = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const { entry } of filtered) {
      for (const topic of topicsByClaimHex.get(entry.claimHex) ?? []) {
        map.set(topic.id, (map.get(topic.id) ?? 0) + 1);
      }
    }
    return map;
  }, [filtered, topicsByClaimHex]);

  const lastPageIndex = Math.max(0, Math.ceil(filtered.length / CLAIMS_PAGE_SIZE) - 1);
  const currentPageIndex = Math.min(pageIndex, lastPageIndex);
  const page = React.useMemo(
    () => filtered.slice(currentPageIndex * CLAIMS_PAGE_SIZE, (currentPageIndex + 1) * CLAIMS_PAGE_SIZE),
    [currentPageIndex, filtered]
  );
  const hasNextPage = currentPageIndex < lastPageIndex;

  const toggleSpace = React.useCallback((spaceId: string) => {
    setSelectedSpaceIds(prev =>
      prev.some(id => idEquals(id, spaceId)) ? prev.filter(id => !idEquals(id, spaceId)) : [...prev, spaceId]
    );
    setPageIndex(0);
  }, []);
  const toggleTopic = React.useCallback((topicId: string) => {
    setSelectedTopicIds(prev =>
      prev.some(id => idEquals(id, topicId)) ? prev.filter(id => !idEquals(id, topicId)) : [...prev, topicId]
    );
    setPageIndex(0);
  }, []);
  const clearSpaces = React.useCallback(() => {
    setSelectedSpaceIds([]);
    setPageIndex(0);
  }, []);
  const clearTopics = React.useCallback(() => {
    setSelectedTopicIds([]);
    setPageIndex(0);
  }, []);

  const debateClaimGroups = React.useMemo(() => {
    const bySpace = new Map<string, string[]>();
    for (const { entry, spaceId } of page) {
      const list = bySpace.get(spaceId) ?? [];
      list.push(entry.claimId);
      bySpace.set(spaceId, list);
    }
    return [...bySpace.entries()].map(([spaceId, claimIds]) => ({ spaceId, claimIds }));
  }, [page]);

  const rowsQuery = useDebateClaimsBySpaces(debateClaimGroups);
  const rowByClaimHex = React.useMemo(() => {
    const map = new Map<string, DebateClaim>();
    for (const row of rowsQuery.claims) map.set(uuidToHex(row.claim_entity_id), row);
    return map;
  }, [rowsQuery.claims]);

  const personSpaceIds = React.useMemo(() => [personId], [personId]);
  const { profilesBySpaceId } = useProfilesBySpaceIds(personSpaceIds);
  const personProfile = profilesBySpaceId.get(personId);

  if (isLoading && entries.length === 0) return <Skeleton className="h-[120px] w-full rounded-lg" />;
  if (entries.length === 0) return null;

  return (
    <section aria-label="Claims">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Text as="h2" variant="mediumTitle" color="text">
          Claims
        </Text>
        <PersonDebateFilters
          spaceIds={spaceIds}
          topics={topics}
          selectedSpaceIds={selectedSpaceIds}
          selectedTopicIds={selectedTopicIds}
          spaceCounts={spaceCounts}
          topicCounts={topicCounts}
          onToggleSpace={toggleSpace}
          onToggleTopic={toggleTopic}
          onClearSpaces={clearSpaces}
          onClearTopics={clearTopics}
        />
      </div>

      {filtered.length === 0 ? (
        <Text as="p" variant="metadata" color="grey-04">
          No claims match these filters.
        </Text>
      ) : (
        <>
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 @[560px]:grid-cols-2">
            {page.map(({ entry, spaceId }) => (
              <li key={entry.claimHex}>
                <PersonRecordClaimCard
                  entry={entry}
                  spaceId={spaceId}
                  entity={claimByHex.get(entry.claimHex) ?? null}
                  row={rowByClaimHex.get(entry.claimHex) ?? null}
                  personId={personId}
                  personName={personProfile?.name ?? null}
                  personAvatarUrl={personProfile?.avatarUrl ?? null}
                />
              </li>
            ))}
          </ul>
          <CursorPager
            isFirstPage={currentPageIndex === 0}
            hasNextPage={hasNextPage}
            isLoading={rowsQuery.isLoading}
            onPrevious={() => setPageIndex(Math.max(0, currentPageIndex - 1))}
            onNext={() => setPageIndex(Math.min(lastPageIndex, currentPageIndex + 1))}
          />
        </>
      )}
    </section>
  );
}

function PersonRecordClaimCard({
  entry,
  spaceId,
  entity,
  row,
  personId,
  personName,
  personAvatarUrl,
}: {
  entry: PersonClaimEntry;
  spaceId: string;
  entity: Entity | null;
  row: DebateClaim | null;
  personId: string;
  personName: string | null;
  personAvatarUrl: string | null;
}) {
  const { ref, nearViewport } = useNearViewport();
  const state = useClaimResponseState({
    claimId: entry.claimId,
    spaceId,
    row,
    entity,
    title: entity?.name ?? 'Claim',
    description: entity?.description ?? null,
    enabled: nearViewport,
  });

  // Prefer sides matching the claim's vocabulary
  const heldPositions = React.useMemo(() => {
    const heldForKind = entry.positions
      .filter(position => idEquals(position.spaceId, spaceId) && position.responseKind === state.responseKind)
      .map(position => position.position);
    const heldInSpace = entry.positions
      .filter(position => idEquals(position.spaceId, spaceId))
      .map(position => position.position);
    return [...new Set(heldForKind.length > 0 ? heldForKind : heldInSpace)];
  }, [entry.positions, spaceId, state.responseKind]);

  const recordPerson = React.useMemo(
    () => ({
      profileSpaceId: personId,
      displayName: personName,
      avatarCid: personAvatarUrl,
      heldPositions,
    }),
    [heldPositions, personAvatarUrl, personId, personName]
  );

  return (
    <MatchmakingClaimCard
      claim={state.claim}
      positions={state.positions}
      readiness={state.readiness}
      answersReady={state.isResponseKindResolved && state.isViewerResponseResolved}
      responseBlockedReason={state.responseBlockedReason}
      activeDebate={row?.active_debate ?? null}
      recordPerson={recordPerson}
      queriesEnabled={nearViewport}
      ref={ref}
    />
  );
}
