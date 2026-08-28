'use client';

import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import { DebateRow, type DebateSide, relationTargets, useWinnerShares } from '~/core/claims/browse/claim-debates';
import { CursorPager, useCursorPages } from '~/core/claims/browse/use-cursor-pages';
import { useDebateKeyframes } from '~/core/claims/browse/use-debate-keyframes';
import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import {
  DEBATE_CLAIMS_PROPERTY_ID,
  DEBATE_OPPOSED_BY_PROPERTY_ID,
  DEBATE_SUPPORTED_BY_PROPERTY_ID,
  DEBATE_TYPE_ID,
} from '~/core/debates/ontology';
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { useQueryEntities } from '~/core/sync/use-store';

import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { useTopicSpaceScope } from '../use-topic-space-scope';
import { useTopicLinkedEntities } from './use-topic-linked-entities';

const DEBATES_PAGE_SIZE = 5;

/**
 * How many of the topic's claims are considered when looking for debates.
 *
 * Debates are found by asking which of the topic's claims have been argued, so the reach is bounded
 * by how many claim ids the lookup can carry. A cap rather than every claim: a topic can hold
 * hundreds, and a query listing all of them would be enormous for a section showing five rows.
 *
 * The claims are the Best-ranked ones, so what the cap drops is the lowest-ranked rather than an
 * arbitrary slice.
 */
const CLAIMS_CONSIDERED = 100;

/**
 * Debates argued on this topic's claims.
 *
 * Two hops, because that is how the graph stores it: a Debate carries `Claims` and never `Topics`,
 * so there is no relation from a debate to a topic to read. Claims for the topic come first, then
 * debates naming any of them.
 *
 * The rows are the claim page's own — same keyframe still, same debaters and sides, same winner
 * share — imported rather than reimplemented, so the two pages cannot drift into two designs for
 * the same thing.
 */
export function TopicDebates({ topicId, spaceId }: { topicId: string; spaceId: string }) {
  const pages = useCursorPages();

  const spaceIds = useTopicSpaceScope(spaceId);
  const { entities: claims, isLoading: claimsLoading } = useTopicLinkedEntities({
    topicId,
    typeIds: [CLAIM_TYPE_ID],
    first: CLAIMS_CONSIDERED,
    rankInSpaceId: spaceId,
    spaceIds,
  });
  const claimIds = React.useMemo(() => claims.map(claim => claim.id), [claims]);

  const {
    entities: debates,
    isLoading,
    isPlaceholderData,
    endCursor,
    hasNextPage,
  } = useQueryEntities({
    where: {
      types: [{ id: { equals: DEBATE_TYPE_ID } }],
      // Scoped on both hops. The claims above are already narrowed, but a debate can be published
      // into a space of its own, so a curated claim argued in an uncurated space would otherwise
      // still surface here.
      ...(spaceIds && spaceIds.length > 0 ? { spaces: spaceIds.map(id => ({ equals: id })) } : {}),
      relations: [{ typeOf: { id: { equals: DEBATE_CLAIMS_PROPERTY_ID } }, toEntity: { id: { in: claimIds } } }],
    },
    first: DEBATES_PAGE_SIZE,
    after: pages.cursor,
    placeholderData: keepPreviousData,
    enabled: claimIds.length > 0,
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

  const participantSpaceIds = React.useMemo(
    () => [...new Set([...sidesByDebateId.values()].flat().map(side => side.spaceId))],
    [sidesByDebateId]
  );
  const { profilesBySpaceId } = useProfilesBySpaceIds(participantSpaceIds, participantSpaceIds.length > 0);

  const debateIds = React.useMemo(() => debates.map(debate => debate.id), [debates]);
  const winnerShareByDebateId = useWinnerShares(debateIds);
  const keyframeByDebateId = useDebateKeyframes(debates);

  if (claimsLoading) return null;
  if (isLoading && debates.length === 0) return <Skeleton className="h-[120px] w-full rounded-lg" />;
  if (debates.length === 0 && pages.isFirstPage) return null;

  return (
    <section aria-label="Debates on this topic">
      <Text as="h2" variant="mediumTitle" color="text" className="mb-3 block">
        Debates
      </Text>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {debates.map(debate => (
          <li key={debate.id}>
            <DebateRow
              debate={debate}
              // The debate's own space, not the topic's. A topic aggregates across spaces, so the
              // space in the route is often not one the debate was published into.
              spaceId={debate.spaces[0] ?? spaceId}
              sides={sidesByDebateId.get(debate.id) ?? []}
              profilesBySpaceId={profilesBySpaceId}
              winnerShare={winnerShareByDebateId.get(debate.id) ?? null}
              keyframeUrl={keyframeByDebateId.get(debate.id) ?? null}
              // Sides are labelled in the vocabulary of the claim being argued. A topic spans both
              // kinds, and the debate row has no claim in hand to read it from, so the common one
              // stands in: Agree/Disagree is right for everything but a factual claim.
              responseKind="stance"
            />
          </li>
        ))}
      </ul>
      <CursorPager
        isFirstPage={pages.isFirstPage}
        hasNextPage={hasNextPage}
        isLoading={isLoading || isPlaceholderData}
        onPrevious={pages.toPrevious}
        onNext={() => endCursor && pages.toNext(endCursor)}
      />
    </section>
  );
}
