'use client';

import * as React from 'react';

import { DebateRow, type DebateSide, type WinnerShare, relationTargets } from '~/core/claims/browse/claim-debates';
import { resolveClaimResponseKind } from '~/core/claims/browse/use-claim-response-state';
import { CursorPager } from '~/core/claims/browse/use-cursor-pages';
import { useDebateKeyframes } from '~/core/claims/browse/use-debate-keyframes';
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

import { ALL_FILTER, PersonDebateFilters } from './person-debate-filters';

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

  // The claim each debate argued, read once for the Topic filter and for the side labels below.
  const claimIdByDebateId = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const debate of debates) {
      const claimId = relationTargets(debate.relations, DEBATE_CLAIMS_PROPERTY_ID)[0];
      if (claimId) map.set(debate.id, claimId);
    }
    return map;
  }, [debates]);

  // Space and Topic filters, matching the Claims collection. Space is the debate's own resolved
  // space; Topic is the argued claim's topics, reused from `usePersonClaims`' cache.
  const [selectedSpace, setSelectedSpace] = React.useState(ALL_FILTER);
  const [selectedTopic, setSelectedTopic] = React.useState(ALL_FILTER);
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

  const visible = React.useMemo(
    () =>
      debates.filter(debate => {
        const debateSpaceId = spaceByDebateId.get(debate.id);
        if (!debateSpaceId) return false;
        if (selectedSpace !== ALL_FILTER && !idEquals(debateSpaceId, selectedSpace)) {
          return false;
        }
        if (selectedTopic !== ALL_FILTER) {
          const debateTopics = topicsByDebateId.get(debate.id) ?? [];
          if (!debateTopics.some(topic => idEquals(topic.id, selectedTopic))) return false;
        }
        return true;
      }),
    [debates, spaceByDebateId, topicsByDebateId, selectedSpace, selectedTopic]
  );

  const lastPageIndex = Math.max(0, Math.ceil(visible.length / DEBATES_PAGE_SIZE) - 1);
  const currentPageIndex = Math.min(pageIndex, lastPageIndex);
  const page = React.useMemo(
    () => visible.slice(currentPageIndex * DEBATES_PAGE_SIZE, (currentPageIndex + 1) * DEBATES_PAGE_SIZE),
    [currentPageIndex, visible]
  );
  const hasNextPage = currentPageIndex < lastPageIndex;

  const selectSpace = React.useCallback((spaceId: string) => {
    setSelectedSpace(spaceId);
    setPageIndex(0);
  }, []);
  const selectTopic = React.useCallback((topicId: string) => {
    setSelectedTopic(topicId);
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
          selectedSpace={selectedSpace}
          selectedTopic={selectedTopic}
          onSelectSpace={selectSpace}
          onSelectTopic={selectTopic}
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
