'use client';

import * as React from 'react';

import { CursorPager, useCursorPages } from '~/core/claims/browse/use-cursor-pages';
import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { useQueryEntities } from '~/core/sync/use-store';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { useTopicLinkedEntities } from './use-topic-linked-entities';

const DEBATES_PAGE_SIZE = 5;

/**
 * How many of the topic's claims are considered when looking for debates.
 *
 * Debates are reached by asking which of the topic's claims have been argued, so the reach is
 * bounded by how many claim ids the lookup can carry. A cap rather than every claim: a topic can
 * hold hundreds, and a query listing all of them would be enormous for a section showing five rows.
 *
 * The cost of the cap is that a debate on the topic's 200th claim won't surface. Claims come back
 * newest first, so what it drops is the oldest — the least likely to be under active debate.
 */
const CLAIMS_CONSIDERED = 100;

/**
 * Debates argued on this topic's claims.
 *
 * Two hops, because that is how the graph stores it: a Debate carries `Claims` and never `Topics`,
 * so there is no relation from a debate to a topic to read. Claims for the topic come first, then
 * debates naming any of them.
 *
 * Above the claims themselves despite being scarcer — a debate is the product's own content and the
 * thing a topic page can show that a feed reader cannot.
 */
export function TopicDebates({ topicId, spaceId }: { topicId: string; spaceId: string }) {
  const pages = useCursorPages();

  const { entities: claims, isLoading: claimsLoading } = useTopicLinkedEntities({
    topicId,
    typeIds: [CLAIM_TYPE_ID],
    first: CLAIMS_CONSIDERED,
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
      relations: [{ typeOf: { id: { equals: DEBATE_CLAIMS_PROPERTY_ID } }, toEntity: { id: { in: claimIds } } }],
    },
    first: DEBATES_PAGE_SIZE,
    after: pages.cursor,
    enabled: claimIds.length > 0,
  });

  if (claimsLoading || (isLoading && debates.length === 0)) {
    return claimsLoading ? null : <Skeleton className="h-[120px] w-full rounded-lg" />;
  }

  if (debates.length === 0 && pages.isFirstPage) return null;

  return (
    <section aria-label="Debates on this topic">
      <Text as="h2" variant="smallTitle" color="text" className="mb-3 block">
        Debates
      </Text>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {debates.map(debate => (
          <li key={debate.id}>
            <Link
              href={NavUtils.toEntity(debate.spaces[0] ?? spaceId, debate.id)}
              className="flex items-center gap-3 rounded-lg border border-grey-02 bg-white p-3 transition-colors hover:border-grey-03"
            >
              <span className="grid aspect-[540/820] w-12 shrink-0 place-items-center rounded-md border border-divider bg-grey-01 text-grey-03">
                ▶
              </span>
              <Text as="span" variant="metadataMedium" color="text" className="min-w-0">
                {debate.name ?? 'Debate'}
              </Text>
            </Link>
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
