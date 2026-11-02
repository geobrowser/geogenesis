import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';
import { normId } from '~/core/utils/norm-id';

import { NEWS_STORY_TYPE_ID } from '../ontology';

/** How much is attached to a topic, as a card reports it. */
export type TopicConnectionCounts = {
  claims: number;
  news: number;
  /** Debates that directly name the topic. */
  debates: number;
  /** What the list is ordered by: everything the card names, added up. */
  total: number;
};

export const EMPTY_TOPIC_CONNECTION_COUNTS: TopicConnectionCounts = { claims: 0, news: 0, debates: 0, total: 0 };

/**
 * Asked of entities rather than of relations, for all three buckets.
 *
 * Count entities so duplicate Topics relations across spaces count only once. Claims, news and
 * debates all carry Topics directly and use the same one-hop predicate.
 *
 * Unscoped to spaces, unlike the composition strip. A topic gathers across the whole graph, and
 * this count is asked on a claim page that is scoped to one space — narrowing to the spaces a
 * viewer happens to be in would make a topic's size depend on who is reading it, and would reorder
 * the tab under anyone whose space allowlist resolved a beat after the counts did.
 *
 * One request per batch of topics, and in practice one batch: each topic contributes three aliased
 * counts over the same connections, and the list is split at {@link TOPIC_COUNT_BATCH_SIZE}. Claims
 * on testnet carry at most 7 topics, so a claim's whole Topics tab is normally a single request.
 * Five topics measured ~0.75s against testnet, against five round trips for the same work.
 */
function buildCountsSource(topicCount: number): string {
  const declarations = [
    '$topicsPropertyId: UUID!',
    '$claimTypeIds: [UUID!]',
    '$newsTypeIds: [UUID!]',
    '$debateTypeIds: [UUID!]',
    ...Array.from({ length: topicCount }, (_, index) => `$topic${index}: UUID!`),
  ].join(', ');

  const buckets = Array.from({ length: topicCount }, (_, index) => {
    const topic = `$topic${index}`;

    const namesTopic = `relations: { some: { typeId: { is: $topicsPropertyId }, toEntityId: { is: ${topic} } } }`;

    return /* GraphQL */ `
      claims${index}: entitiesConnection(filter: { typeIds: { overlaps: $claimTypeIds }, ${namesTopic} }) {
        totalCount
      }
      news${index}: entitiesConnection(filter: { typeIds: { overlaps: $newsTypeIds }, ${namesTopic} }) {
        totalCount
      }
      debates${index}: entitiesConnection(
        filter: {
          typeIds: { overlaps: $debateTypeIds }
          ${namesTopic}
        }
      ) {
        totalCount
      }
    `;
  }).join('\n');

  return /* GraphQL */ `query TopicConnectionCounts(${declarations}) {\n${buckets}\n}`;
}

/**
 * Parsed documents by topic count.
 *
 * The document is shaped by *how many* topics are being counted and by nothing else — the ids
 * themselves are variables — so a claim page with three topics reuses the same parsed document as
 * every other three-topic claim, rather than re-parsing a string per render.
 */
const documentsByTopicCount = new Map<number, TypedDocumentNode<any, any>>();

export function topicConnectionCountsDocument(topicCount: number): TypedDocumentNode<any, any> {
  const cached = documentsByTopicCount.get(topicCount);
  if (cached) return cached;

  const document = parse(buildCountsSource(topicCount)) as TypedDocumentNode<any, any>;
  documentsByTopicCount.set(topicCount, document);
  return document;
}

type CountsResponse = Record<string, { totalCount?: number | null } | null | undefined>;

/** Decodes the aliased buckets back onto the ids that produced them, keyed by normalized id. */
export function decodeTopicConnectionCounts(
  response: CountsResponse,
  topicIds: readonly string[]
): Record<string, TopicConnectionCounts> {
  const out: Record<string, TopicConnectionCounts> = {};

  topicIds.forEach((id, index) => {
    const claims = response[`claims${index}`]?.totalCount ?? 0;
    const news = response[`news${index}`]?.totalCount ?? 0;
    const debates = response[`debates${index}`]?.totalCount ?? 0;
    out[normId(id)] = { claims, news, debates, total: claims + news + debates };
  });

  return out;
}

/**
 * Topics per request.
 *
 * Each one contributes three aliased counts, so the request
 * grows with the list. Claims measured on testnet carry at most 7 topics and three at the 95th
 * percentile, which means this is one request in practice — the chunking is what stops a
 * topic-heavy claim from becoming one unbounded query, and what keeps a chunk that fails from
 * costing every other topic its numbers.
 *
 * The same shape `useClaimExploreRows` and `fetchExploreRowsByIds` use, for the same reason.
 */
export const TOPIC_COUNT_BATCH_SIZE = 10;

/**
 * Topic ids as request-sized batches: deduped, normalized, and sorted.
 *
 * Sorted so the same set of topics asked in a different order is the same cache entry rather than
 * a second request — which matters here, because the tab re-asks in count order once the counts
 * have landed.
 */
export function topicCountBatches(topicIds: readonly string[]): string[][] {
  const ids = [...new Set(topicIds.map(normId))].sort();
  const batches: string[][] = [];
  for (let start = 0; start < ids.length; start += TOPIC_COUNT_BATCH_SIZE) {
    batches.push(ids.slice(start, start + TOPIC_COUNT_BATCH_SIZE));
  }
  return batches;
}

/** One batch of `topicCountBatches`, answered. Shared by the hook and the server's seed. */
export function fetchTopicConnectionCountsBatch(ids: string[], signal?: AbortSignal) {
  return Effect.runPromise(
    graphql({
      query: topicConnectionCountsDocument(ids.length),
      decoder: (response: CountsResponse) => decodeTopicConnectionCounts(response, ids),
      variables: {
        topicsPropertyId: ID.uuidToHex(TOPICS_PROPERTY_ID),
        claimTypeIds: [ID.uuidToHex(CLAIM_TYPE_ID)],
        newsTypeIds: [ID.uuidToHex(NEWS_STORY_TYPE_ID)],
        debateTypeIds: [ID.uuidToHex(DEBATE_TYPE_ID)],
        ...Object.fromEntries(ids.map((id, index) => [`topic${index}`, ID.uuidToHex(id)])),
      },
      signal,
    })
  );
}

export const topicConnectionCountsQueryKey = (ids: string[]) => ['topic', 'connection-counts', ids] as const;
