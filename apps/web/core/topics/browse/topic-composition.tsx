'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';

import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { NEWS_STORY_TYPE_ID } from '../ontology';
import { useTopicSpaceScope } from '../use-topic-space-scope';

/**
 * What a topic is made of, counted rather than sampled.
 *
 * `relationsConnection` carries `totalCount`, and it answers with a filter on it — measured at
 * ~0.35s for a topic with 376 links. That is the difference between a real breakdown and a
 * proportion of whatever the first page happened to hold, which is why this is a query of its own
 * rather than something derived from the sections below.
 *
 * Claims and news stories are aliased counts over the same topic relation. Debates require a
 * two-hop entity count because they point to claims rather than directly to topics.
 */
const TOPIC_COMPOSITION_SOURCE = /* GraphQL */ `
  query TopicComposition(
    $topicsPropertyId: UUID!
    $topicId: UUID!
    $claim: [UUID!]
    $news: [UUID!]
    $debate: [UUID!]
    $debateClaimsPropertyId: UUID!
    $spaceIds: [UUID!]
  ) {
    claims: relationsConnection(
      filter: {
        typeId: { is: $topicsPropertyId }
        toEntityId: { is: $topicId }
        fromEntity: { typeIds: { overlaps: $claim }, spaceIds: { overlaps: $spaceIds } }
      }
    ) {
      totalCount
    }
    news: relationsConnection(
      filter: {
        typeId: { is: $topicsPropertyId }
        toEntityId: { is: $topicId }
        fromEntity: { typeIds: { overlaps: $news }, spaceIds: { overlaps: $spaceIds } }
      }
    ) {
      totalCount
    }
    # Debates are the one bucket that isn't a \`Topics\` relation, so it can't be an aliased count
    # over the same connection as the rest. A Debate carries \`Claims\` and never \`Topics\`, which
    # means the link to a topic is two hops — debate to claim, claim to topic — expressed here as a
    # nested filter on the far end of the relation.
    #
    # Asked of entities rather than relations because the count has to be of debates, not of links:
    # one debate arguing three of a topic's claims is three \`Claims\` relations and would inflate
    # the bar threefold. Measured 5 relations against 4 debates on \`AI regulation\`, so the
    # difference is real rather than theoretical.
    debates: entitiesConnection(
      filter: {
        typeIds: { overlaps: $debate }
        spaceIds: { overlaps: $spaceIds }
        relations: {
          some: {
            typeId: { is: $debateClaimsPropertyId }
            toEntity: { relations: { some: { typeId: { is: $topicsPropertyId }, toEntityId: { is: $topicId } } } }
          }
        }
      }
    ) {
      totalCount
    }
  }
`;

export const topicCompositionDocument = parse(TOPIC_COMPOSITION_SOURCE) as TypedDocumentNode<any, any>;

type CompositionResponse = Record<string, { totalCount?: number | null } | null | undefined>;

type Bucket = { key: string; label: string; count: number; className: string };

export function useTopicComposition(topicId: string, spaceIds?: string[]) {
  const { data, isLoading } = useQuery({
    queryKey: ['topic', 'composition', ID.uuidToHex(topicId), spaceIds ?? null],
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: topicCompositionDocument,
          decoder: (response: CompositionResponse) => ({
            claims: response.claims?.totalCount ?? 0,
            news: response.news?.totalCount ?? 0,
            debates: response.debates?.totalCount ?? 0,
          }),
          variables: {
            topicsPropertyId: ID.uuidToHex(TOPICS_PROPERTY_ID),
            topicId: ID.uuidToHex(topicId),
            claim: [ID.uuidToHex(CLAIM_TYPE_ID)],
            news: [ID.uuidToHex(NEWS_STORY_TYPE_ID)],
            debate: [ID.uuidToHex(DEBATE_TYPE_ID)],
            debateClaimsPropertyId: ID.uuidToHex(DEBATE_CLAIMS_PROPERTY_ID),
            spaceIds: spaceIds?.map(ID.uuidToHex),
          },
          signal,
        })
      ),
    staleTime: 60_000,
  });

  return { counts: data ?? null, isLoading };
}

/**
 * A compact summary of the three entity types that make up the Topic Explore feed.
 */
export function TopicComposition({ topicId, spaceId }: { topicId: string; spaceId: string }) {
  // Scoped exactly like the sections below it, or the strip would promise content the page can't
  // show.
  const spaceIds = useTopicSpaceScope(spaceId);
  const { counts, isLoading } = useTopicComposition(topicId, spaceIds);

  const buckets = React.useMemo<Bucket[]>(() => {
    if (!counts) return [];

    return [
      { key: 'debates', label: 'debates', count: counts.debates, className: 'bg-purple' },
      { key: 'claims', label: 'claims', count: counts.claims, className: 'bg-green' },
      { key: 'news', label: 'news stories', count: counts.news, className: 'bg-orange' },
    ].filter(bucket => bucket.count > 0);
  }, [counts]);

  const denominator = buckets.reduce((sum, bucket) => sum + bucket.count, 0);

  if (isLoading) return <Skeleton className="h-[52px] w-full rounded-lg" />;
  if (!counts || denominator === 0 || buckets.length === 0) return null;

  return (
    <section aria-label="What this topic holds">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-grey-01">
        {buckets.map(bucket => (
          <span
            key={bucket.key}
            className={bucket.className}
            style={{ width: `${(100 * bucket.count) / denominator}%` }}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {buckets.map(bucket => (
          <span key={bucket.key} className="inline-flex items-center gap-1.5">
            <span className={`size-2 shrink-0 rounded-xs ${bucket.className}`} aria-hidden />
            <Text as="span" variant="metadata" color="grey-04" className="tabular-nums">
              <span className="text-text">{bucket.count}</span> {bucket.label}
            </Text>
          </span>
        ))}
      </div>
    </section>
  );
}
