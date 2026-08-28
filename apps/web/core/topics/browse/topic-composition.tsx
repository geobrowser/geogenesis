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

import { EPISODE_TYPE_ID, NEWS_STORY_TYPE_ID, POST_TYPE_ID, TWEET_TYPE_ID } from '../ontology';

/**
 * What a topic is made of, counted rather than sampled.
 *
 * `relationsConnection` carries `totalCount`, and it answers with a filter on it — measured at
 * ~0.35s for a topic with 376 links. That is the difference between a real breakdown and a
 * proportion of whatever the first page happened to hold, which is why this is a query of its own
 * rather than something derived from the sections below.
 *
 * One request: each bucket is an aliased count over the same relation, narrowed by the type of the
 * entity doing the pointing.
 */
const TOPIC_COMPOSITION_SOURCE = /* GraphQL */ `
  query TopicComposition(
    $topicsPropertyId: UUID!
    $topicId: UUID!
    $claim: [UUID!]
    $episode: [UUID!]
    $news: [UUID!]
    $tweet: [UUID!]
    $post: [UUID!]
    $debate: [UUID!]
    $debateClaimsPropertyId: UUID!
  ) {
    total: relationsConnection(filter: { typeId: { is: $topicsPropertyId }, toEntityId: { is: $topicId } }) {
      totalCount
    }
    claims: relationsConnection(
      filter: {
        typeId: { is: $topicsPropertyId }
        toEntityId: { is: $topicId }
        fromEntity: { typeIds: { overlaps: $claim } }
      }
    ) {
      totalCount
    }
    episodes: relationsConnection(
      filter: {
        typeId: { is: $topicsPropertyId }
        toEntityId: { is: $topicId }
        fromEntity: { typeIds: { overlaps: $episode } }
      }
    ) {
      totalCount
    }
    news: relationsConnection(
      filter: {
        typeId: { is: $topicsPropertyId }
        toEntityId: { is: $topicId }
        fromEntity: { typeIds: { overlaps: $news } }
      }
    ) {
      totalCount
    }
    tweets: relationsConnection(
      filter: {
        typeId: { is: $topicsPropertyId }
        toEntityId: { is: $topicId }
        fromEntity: { typeIds: { overlaps: $tweet } }
      }
    ) {
      totalCount
    }
    posts: relationsConnection(
      filter: {
        typeId: { is: $topicsPropertyId }
        toEntityId: { is: $topicId }
        fromEntity: { typeIds: { overlaps: $post } }
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

export function useTopicComposition(topicId: string) {
  const { data, isLoading } = useQuery({
    queryKey: ['topic', 'composition', ID.uuidToHex(topicId)],
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: topicCompositionDocument,
          decoder: (response: CompositionResponse) => ({
            total: response.total?.totalCount ?? 0,
            claims: response.claims?.totalCount ?? 0,
            episodes: response.episodes?.totalCount ?? 0,
            news: response.news?.totalCount ?? 0,
            tweets: response.tweets?.totalCount ?? 0,
            posts: response.posts?.totalCount ?? 0,
            debates: response.debates?.totalCount ?? 0,
          }),
          variables: {
            topicsPropertyId: ID.uuidToHex(TOPICS_PROPERTY_ID),
            topicId: ID.uuidToHex(topicId),
            claim: [ID.uuidToHex(CLAIM_TYPE_ID)],
            episode: [ID.uuidToHex(EPISODE_TYPE_ID)],
            news: [ID.uuidToHex(NEWS_STORY_TYPE_ID)],
            tweet: [ID.uuidToHex(TWEET_TYPE_ID)],
            post: [ID.uuidToHex(POST_TYPE_ID)],
            debate: [ID.uuidToHex(DEBATE_TYPE_ID)],
            debateClaimsPropertyId: ID.uuidToHex(DEBATE_CLAIMS_PROPERTY_ID),
          },
          signal,
        })
      ),
    staleTime: 60_000,
  });

  return { counts: data ?? null, isLoading };
}

/**
 * One strip saying what this topic holds, before any of it is shown.
 *
 * Orientation rather than navigation — the section order below is fixed, so this doesn't decide
 * anything. What it does is answer "is this a podcast topic or a news topic" without scrolling,
 * which matters because the mix changes completely between topics: measured, one is 227 claims to
 * 73 episodes and another is 150 episodes to 56 news stories.
 */
export function TopicComposition({ topicId }: { topicId: string }) {
  const { counts, isLoading } = useTopicComposition(topicId);

  const buckets = React.useMemo<Bucket[]>(() => {
    if (!counts) return [];

    // Ordered as the page is — debates, then claims, then the kinds that make up Coverage — so the
    // strip reads as a map of what is below it rather than an unrelated ranking.
    const named: Bucket[] = [
      { key: 'debates', label: 'debates', count: counts.debates, className: 'bg-purple' },
      { key: 'claims', label: 'claims', count: counts.claims, className: 'bg-green' },
      { key: 'episodes', label: 'episodes', count: counts.episodes, className: 'bg-ctaPrimary' },
      { key: 'news', label: 'news stories', count: counts.news, className: 'bg-orange' },
      { key: 'tweets', label: 'posts', count: counts.tweets + counts.posts, className: 'bg-red-01' },
    ].filter(bucket => bucket.count > 0);

    // Everything the named buckets don't cover — articles, official documents, papers, datasets and
    // the rest of the tail. Counted as a remainder rather than queried type by type: the tail is
    // long and each type in it is worth one or two links on a given topic.
    //
    // Debates are excluded from the subtraction because they are not `Topics` relations and so were
    // never part of `total`. Counting them here would eat into the remainder and shrink a bar that
    // has nothing to do with them.
    const remainder =
      counts.total - named.filter(b => b.key !== 'debates').reduce((sum, bucket) => sum + bucket.count, 0);
    if (remainder > 0) {
      named.push({ key: 'other', label: 'other', count: remainder, className: 'bg-grey-03' });
    }
    return named;
  }, [counts]);

  // For the same reason: the bar is divided by everything it draws, and debates are additional to
  // the `Topics` relations `total` counts rather than a slice of them.
  const denominator = (counts?.total ?? 0) + (counts?.debates ?? 0);

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
