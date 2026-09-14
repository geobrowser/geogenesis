'use client';

import * as React from 'react';

import { DebateRow, type DebateSide, type WinnerShare, relationTargets } from '~/core/claims/browse/claim-debates';
import { resolveClaimResponseKind } from '~/core/claims/browse/use-claim-response-state';
import { CursorPager } from '~/core/claims/browse/use-cursor-pages';
import { useDebateKeyframes } from '~/core/claims/browse/use-debate-keyframes';
import { keepSelectableTopics } from '~/core/debates/matchmaking/topic-facets';
import {
  DEBATE_CLAIMS_PROPERTY_ID,
  DEBATE_OPPOSED_BY_PROPERTY_ID,
  DEBATE_SUPPORTED_BY_PROPERTY_ID,
  DEBATE_TYPE_ID,
} from '~/core/debates/ontology';
import { type PersonClaimTopic, personTopics, usePersonClaims } from '~/core/debates/use-person-claims';
import { usePersonDebates } from '~/core/debates/use-person-debate-stats';
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { equals as idEquals, uuidToHex } from '~/core/id/normalize';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';
import { resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';

import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { PersonDebateFilters } from './person-debate-filters';

const DEBATES_PAGE_SIZE = 5;

/**
 * Every debate the person argued, either side.
 * Renders nothing when there are no debates, per the empty-section rule.
 */
export function PersonDebatesCollection({
  personId,
  winnerShares,
}: {
  personId: string;
  winnerShares: Map<string, WinnerShare>;
}) {
  const debatesQuery = usePersonDebates(personId);
  const debateIds = React.useMemo(() => (debatesQuery.data ?? []).map(debate => debate.debateId), [debatesQuery.data]);

  const { entities: debates, isLoading: isHydratingDebates } = useQueryEntities({
    where: { id: { in: debateIds }, types: [{ id: { equals: DEBATE_TYPE_ID } }] },
    first: Math.max(debateIds.length, 1),
    enabled: debateIds.length > 0,
  });

  const sidesByDebateId = React.useMemo(() => {
    const map = new Map<string, DebateSide[]>();
    for (const debate of debates) {
      map.set(debate.id, [
        ...relationTargets(debate.relations, DEBATE_SUPPORTED_BY_PROPERTY_ID).map(id => ({
          spaceId: id,
          position: true,
        })),
        ...relationTargets(debate.relations, DEBATE_OPPOSED_BY_PROPERTY_ID).map(id => ({
          spaceId: id,
          position: false,
        })),
      ]);
    }
    return map;
  }, [debates]);

  const claimIdByDebateId = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const debate of debates) {
      const claimId = relationTargets(debate.relations, DEBATE_CLAIMS_PROPERTY_ID)[0];
      if (claimId) map.set(debate.id, claimId);
    }
    return map;
  }, [debates]);

  // spaces OR groups, topics AND groups
  const [selectedSpaceIds, setSelectedSpaceIds] = React.useState<string[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = React.useState<string[]>([]);
  const [pageIndex, setPageIndex] = React.useState(0);

  const { topicsByClaimHex } = usePersonClaims(personId);

  const spaceByDebateId = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const debate of debates) map.set(debate.id, resolveEntitySpaceId(debate, personId));
    return map;
  }, [debates, personId]);

  const topicsByDebateId = React.useMemo(() => {
    const map = new Map<string, PersonClaimTopic[]>();
    for (const [debateId, claimId] of claimIdByDebateId) {
      const topics = topicsByClaimHex.get(uuidToHex(claimId));
      if (topics && topics.length > 0) map.set(debateId, topics);
    }
    return map;
  }, [claimIdByDebateId, topicsByClaimHex]);

  const spaceIds = React.useMemo(() => [...new Set(spaceByDebateId.values())], [spaceByDebateId]);
  const topics = React.useMemo(() => personTopics(topicsByDebateId), [topicsByDebateId]);

  const filtersSettled = !debatesQuery.isLoading && !isHydratingDebates;
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

  const visible = React.useMemo(
    () =>
      debates.filter(debate => {
        const debateSpaceId = spaceByDebateId.get(debate.id);
        if (!debateSpaceId) return false;
        if (selectedSpaceIds.length > 0 && !selectedSpaceIds.some(id => idEquals(debateSpaceId, id))) {
          return false;
        }
        if (selectedTopicIds.length > 0) {
          const debateTopics = topicsByDebateId.get(debate.id) ?? [];
          if (!selectedTopicIds.every(topicId => debateTopics.some(topic => idEquals(topic.id, topicId)))) return false;
        }
        return true;
      }),
    [debates, spaceByDebateId, topicsByDebateId, selectedSpaceIds, selectedTopicIds]
  );

  const spaceCounts = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const spaceId of spaceIds) map.set(spaceId, 0);
    for (const debate of debates) {
      const debateSpaceId = spaceByDebateId.get(debate.id);
      if (!debateSpaceId || !map.has(debateSpaceId)) continue;
      if (selectedTopicIds.length > 0) {
        const debateTopics = topicsByDebateId.get(debate.id) ?? [];
        if (!selectedTopicIds.every(topicId => debateTopics.some(topic => idEquals(topic.id, topicId)))) continue;
      }
      map.set(debateSpaceId, (map.get(debateSpaceId) ?? 0) + 1);
    }
    return map;
  }, [debates, spaceIds, spaceByDebateId, topicsByDebateId, selectedTopicIds]);

  const topicCounts = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const debate of visible) {
      for (const topic of topicsByDebateId.get(debate.id) ?? []) {
        map.set(topic.id, (map.get(topic.id) ?? 0) + 1);
      }
    }
    return map;
  }, [visible, topicsByDebateId]);

  const lastPageIndex = Math.max(0, Math.ceil(visible.length / DEBATES_PAGE_SIZE) - 1);
  const currentPageIndex = Math.min(pageIndex, lastPageIndex);
  const page = React.useMemo(
    () => visible.slice(currentPageIndex * DEBATES_PAGE_SIZE, (currentPageIndex + 1) * DEBATES_PAGE_SIZE),
    [currentPageIndex, visible]
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

  const participantSpaceIds = React.useMemo(
    () => [...new Set(page.flatMap(debate => (sidesByDebateId.get(debate.id) ?? []).map(side => side.spaceId)))],
    [page, sidesByDebateId]
  );
  const { profilesBySpaceId } = useProfilesBySpaceIds(participantSpaceIds);
  const keyframeByDebateId = useDebateKeyframes(page);

  // Hydrate this page's claims for accurate side labels.
  const pageClaimIds = React.useMemo(
    () => [...new Set(page.map(debate => claimIdByDebateId.get(debate.id)).filter((id): id is string => Boolean(id)))],
    [claimIdByDebateId, page]
  );
  const { entities: pageClaims, isLoading: arePageClaimsLoading } = useQueryEntities({
    where: { id: { in: pageClaimIds } },
    first: pageClaimIds.length || 1,
    enabled: pageClaimIds.length > 0,
  });
  const claimEntityByHex = React.useMemo(() => {
    const map = new Map<string, Entity>();
    for (const claim of pageClaims) map.set(uuidToHex(claim.id), claim);
    return map;
  }, [pageClaims]);

  // Resolve labels from the claim, even if the person denies their response.
  const responseKindByDebateId = React.useMemo(() => {
    const map = new Map<string, 'stance' | 'veracity'>();
    for (const debate of page) {
      const claimId = claimIdByDebateId.get(debate.id);
      const spaceId = spaceByDebateId.get(debate.id);
      if (!claimId || !spaceId) continue;

      const claimHex = uuidToHex(claimId);
      const claim = claimEntityByHex.get(claimHex) ?? null;
      map.set(debate.id, resolveClaimResponseKind(null, claim, spaceId));
    }
    return map;
  }, [claimEntityByHex, claimIdByDebateId, page, spaceByDebateId]);

  if (debateIds.length === 0) {
    if (debatesQuery.isLoading) return <Skeleton className="h-[120px] w-full rounded-lg" />;
    return null;
  }

  if (debates.length === 0) {
    return isHydratingDebates ? <Skeleton className="h-[120px] w-full rounded-lg" /> : null;
  }

  return (
    <section aria-label="Debates">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Text as="h2" variant="mediumTitle" color="text">
          Debates
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

      {visible.length === 0 ? (
        <Text as="p" variant="metadata" color="grey-04">
          No debates match these filters.
        </Text>
      ) : arePageClaimsLoading ? (
        <Skeleton className="h-[120px] w-full rounded-lg" />
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {page.map(debate => {
              const debateSpaceId = spaceByDebateId.get(debate.id);
              if (!debateSpaceId) return null;

              const claimId = claimIdByDebateId.get(debate.id);
              const claimTitle =
                (claimId ? claimEntityByHex.get(uuidToHex(claimId))?.name?.trim() : null) ||
                debate.name?.trim() ||
                undefined;

              return (
                <li key={debate.id}>
                  <DebateRow
                    debate={debate}
                    spaceId={debateSpaceId}
                    sides={sidesByDebateId.get(debate.id) ?? []}
                    profilesBySpaceId={profilesBySpaceId}
                    winnerShare={winnerShares.get(uuidToHex(debate.id)) ?? null}
                    keyframeUrl={keyframeByDebateId.get(debate.id) ?? null}
                    responseKind={responseKindByDebateId.get(debate.id) ?? 'stance'}
                    highlightedSpaceId={personId}
                    claimTitle={claimTitle}
                  />
                </li>
              );
            })}
          </ul>
          <CursorPager
            isFirstPage={currentPageIndex === 0}
            hasNextPage={hasNextPage}
            isLoading={false}
            onPrevious={() => setPageIndex(Math.max(0, currentPageIndex - 1))}
            onNext={() => setPageIndex(Math.min(lastPageIndex, currentPageIndex + 1))}
          />
        </>
      )}
    </section>
  );
}
