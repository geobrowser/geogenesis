'use client';

import * as React from 'react';

import { CursorPager, useCursorPages } from '~/core/claims/browse/use-cursor-pages';
import { CLAIM_TYPE_ID } from '~/core/claims/ontology';

import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { TopicClaimCard } from './topic-claim-card';
import { useTopicLinkedEntities } from './use-topic-linked-entities';

const CLAIMS_PAGE_SIZE = 6;

/**
 * The claims filed under this topic, as the cards the debates hub and the claim page already draw.
 *
 * The one section on the page a reader can act on rather than read, which is why it sits directly
 * under the debates it feeds rather than among the rest of the material in Coverage.
 *
 * Claims live in whichever space filed them, and a topic aggregates across spaces — so unlike the
 * claim page, nothing here is scoped to the space in the route. Each card is scoped to its own.
 */
export function TopicClaims({ topicId, spaceId }: { topicId: string; spaceId: string }) {
  const pages = useCursorPages();
  const { entities, isLoading, isPlaceholderData, endCursor, hasNextPage } = useTopicLinkedEntities({
    topicId,
    typeIds: [CLAIM_TYPE_ID],
    first: CLAIMS_PAGE_SIZE,
    after: pages.cursor,
    rankInSpaceId: spaceId,
  });

  const claims = React.useMemo(() => entities.filter(entity => entity.name), [entities]);

  if (isLoading && claims.length === 0) {
    return <Skeleton className="h-[160px] w-full rounded-lg" />;
  }

  if (claims.length === 0 && pages.isFirstPage) return null;

  return (
    <section aria-label="Claims on this topic">
      <Text as="h2" variant="mediumTitle" color="text" className="mb-3 block">
        Claims
      </Text>
      <div className="grid grid-cols-1 gap-3 @[560px]:grid-cols-2">
        {claims.map(claim => (
          <TopicClaimCard key={claim.id} claim={claim} fallbackSpaceId={spaceId} />
        ))}
      </div>
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
