'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import * as Effect from 'effect/Effect';
import { parse } from 'graphql';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { uuidToHex } from '~/core/id/normalize';
import { graphql } from '~/core/io/graphql-client';
import { type RelationFacetCount, decodeRelationFacet, relationFacetDocument } from '~/core/io/relation-facet';
import { normId } from '~/core/utils/norm-id';

import { type ExploreTime, buildFeedFilter } from './fetch-explore-feed';

// Display cap only; the filter is unaffected. A picked topic is ANDed into this facet's own
// population, so its count equals the population size and it always sorts to the top — the
// keep-selected pass below is for the placeholder window, where the rows on screen are still the
// previous selection's counts.
const MAX_TOPICS = 100;

const FACET_STALE_TIME = 30_000;
const TOPIC_NAMES_STALE_TIME = 5 * 60_000;

const TOPIC_NAMES_SOURCE = /* GraphQL */ `
  query ExploreTopicNames($ids: [UUID!]!) {
    entitiesConnection(first: 1000, filter: { id: { in: $ids } }) {
      nodes {
        id
        name
      }
    }
  }
`;

type TopicNamesQuery = {
  entitiesConnection: { nodes: Array<{ id: string; name: string | null } | null> | null } | null;
};

const topicNamesDocument = parse(TOPIC_NAMES_SOURCE) as TypedDocumentNode<TopicNamesQuery, { ids: string[] }>;

const NO_COUNTS: RelationFacetCount[] = [];
const NO_NAMES = new Map<string, string | null>();

export type ExploreTopicOption = { id: string; name: string | null; count: number };

/**
 * Topics carried by entities that survive the feed's current filters, with co-occurrence counts
 * — same relation-facet pattern as `useTaggedTopicFacet`, over the Explore population.
 */
export function useExploreTopicFacet(args: {
  spaceIds: string[];
  typeIds?: readonly string[];
  time: ExploreTime;
  topicIds: string[];
  requireDebateTagOnClaims?: boolean;
  enabled: boolean;
}) {
  const { spaceIds, typeIds, time, topicIds, requireDebateTagOnClaims = true, enabled } = args;

  const spaceKey = spaceIds.join(',');
  const typeKey = typeIds ? [...typeIds].join(',') : null;
  const topicKey = topicIds.join(',');

  const fromEntity = React.useMemo(
    () =>
      buildFeedFilter({
        spaceIds,
        time,
        typeIds,
        topicIds,
        requireName: true,
        requireDebateTagOnClaims,
        includeEntityScopeInFilter: true,
      }),
    [spaceKey, typeKey, time, topicKey, requireDebateTagOnClaims]
  );

  const counts = useQuery({
    queryKey: ['explore', 'topic-facet', spaceKey, typeKey, time, topicKey, requireDebateTagOnClaims] as const,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: relationFacetDocument,
          decoder: decodeRelationFacet,
          variables: { typeId: TOPICS_PROPERTY_ID, toEntityId: null, fromEntity, groupBy: ['TO_ENTITY_ID'] },
          signal,
        })
      ),
    staleTime: FACET_STALE_TIME,
    enabled,
  });

  // The last counts that actually resolved. `placeholderData` only covers the pending state, so a
  // failed fetch for a new key (ticking a topic, changing spaces) leaves `data` undefined and the
  // menu empties — which reads as "no topics match" rather than as a request that failed.
  const [lastGoodCounts, setLastGoodCounts] = React.useState<RelationFacetCount[]>(NO_COUNTS);

  React.useEffect(() => {
    if (counts.data && !counts.isPlaceholderData) setLastGoodCounts(counts.data);
  }, [counts.data, counts.isPlaceholderData]);

  // Stale numbers beside the right topics, rather than an empty menu. Safe to show but not to act
  // on: `settled` stays false while the query is in error, so the prune pass never reconciles a
  // selection against these.
  const effectiveCounts = counts.data ?? (counts.isError ? lastGoodCounts : NO_COUNTS);

  const shownCounts = React.useMemo(() => {
    const sorted = [...effectiveCounts].sort((a, b) => b.count - a.count);
    const top = sorted.slice(0, MAX_TOPICS);
    const inTop = new Set(top.map(count => normId(count.id)));
    const selected = new Set(topicIds.map(normId));
    const extras = sorted.filter(count => selected.has(normId(count.id)) && !inTop.has(normId(count.id)));
    return extras.length === 0 ? top : [...top, ...extras];
  }, [effectiveCounts, topicIds]);

  const ids = React.useMemo(() => shownCounts.map(count => count.id), [shownCounts]);

  const names = useQuery({
    queryKey: ['explore', 'topic-names', ids] as const,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: topicNamesDocument,
          decoder: (data: TopicNamesQuery) => {
            const map = new Map<string, string | null>();
            for (const node of data.entitiesConnection?.nodes ?? []) if (node) map.set(uuidToHex(node.id), node.name);
            return map;
          },
          variables: { ids },
          signal,
        })
      ),
    staleTime: TOPIC_NAMES_STALE_TIME,
    enabled: enabled && ids.length > 0,
  });

  const topics: ExploreTopicOption[] = React.useMemo(() => {
    const byId = names.data ?? NO_NAMES;
    return shownCounts.map(count => ({
      id: count.id,
      name: byId.get(uuidToHex(count.id)) ?? null,
      count: count.count,
    }));
  }, [shownCounts, names.data]);

  return {
    topics,
    countsPending: enabled && (counts.isLoading || counts.isPlaceholderData),
    settled: enabled ? !counts.isLoading && !counts.isPlaceholderData && !counts.error : false,
  };
}
