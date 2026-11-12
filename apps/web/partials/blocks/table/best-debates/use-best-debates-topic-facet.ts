'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import {
  teamTopicFacetEntityFilter,
  toRankTopicCounts,
  topicOptions,
} from '~/core/blocks/ranking/best-debates-team-filters';
import type { BestDebateRowData } from '~/core/blocks/ranking/use-best-debate-displays';
import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID, TYPES_PROPERTY_ID } from '~/core/debates/ontology';
import { useDebouncedValue } from '~/core/hooks/use-debounced-value';
import { uuidToHex } from '~/core/id/normalize';
import { graphql } from '~/core/io/graphql-client';
import { getEntityNames } from '~/core/io/queries';
import { type RelationFacetCount, decodeRelationFacet, relationFacetDocument } from '~/core/io/relation-facet';
import { normId } from '~/core/utils/norm-id';

export type TopicFacetOption = { id: string; name: string | null; count: number };

export type BestDebatesTopicFacet = {
  topics: TopicFacetOption[];
  /** The counts describe a filter the viewer has moved on from, or haven't arrived: draw skeletons. */
  pending: boolean;
};

const STALE_TIME = 60_000;
const NO_COUNTS: RelationFacetCount[] = [];
const NO_NAMES = new Map<string, string | null>();

/**
 * The team column's topic counts, over the whole list rather than the rows drawn (Preston, 12 Nov),
 * the way the Debates panel's Claims tab counts its topic menu (`useTaggedTopicFacet`):
 *
 * - **All and By space**: every Debate, the Best debates block's own filter. One grouped aggregate
 *   on the server over the Topics relations of the debates that match the search and carry every
 *   picked topic, then the topics' names.
 * - **To rank**: the To rank set is computed in the browser (the last 7 days, not in your ranking)
 *   and every debate in it is already read for its row, so the counts are taken over that whole set,
 *   narrowed the same way. Pending until every debate in it has been read.
 */
export function useBestDebatesTopicFacet({
  enabled,
  scope,
  query,
  topicIds,
  toRankIds,
  displays,
}: {
  enabled: boolean;
  scope: 'team' | 'to_rank';
  query: string;
  topicIds: readonly string[];
  toRankIds: readonly string[];
  displays: ReadonlyMap<string, BestDebateRowData> | null;
}): BestDebatesTopicFacet {
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const pickedKey = React.useMemo(() => [...topicIds].map(normId).sort(), [topicIds]);
  const server = enabled && scope === 'team';

  const counts = useQuery({
    queryKey: ['best-debates', 'topic-facet', debouncedQuery, pickedKey] as const,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: relationFacetDocument,
          decoder: decodeRelationFacet,
          variables: {
            typeId: TOPICS_PROPERTY_ID,
            toEntityId: null,
            fromEntity: teamTopicFacetEntityFilter({
              debateTypeId: DEBATE_TYPE_ID,
              typesPropertyId: TYPES_PROPERTY_ID,
              topicsPropertyId: TOPICS_PROPERTY_ID,
              query: debouncedQuery,
              topicIds: pickedKey,
            }),
            groupBy: ['TO_ENTITY_ID'],
          },
          signal,
        })
      ),
    staleTime: STALE_TIME,
    enabled: server,
  });

  const ids = React.useMemo(() => (counts.data ?? NO_COUNTS).map(count => count.id), [counts.data]);
  const names = useQuery({
    queryKey: ['best-debates', 'topic-names', ids] as const,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const rows = await Effect.runPromise(getEntityNames(ids, signal));
      return new Map(rows.map(row => [uuidToHex(row.id), row.name]));
    },
    staleTime: STALE_TIME,
    enabled: server && ids.length > 0,
  });

  const serverTopics = React.useMemo(() => {
    const byId = names.data ?? NO_NAMES;
    return (counts.data ?? NO_COUNTS)
      .map(count => ({ id: normId(count.id), name: byId.get(uuidToHex(count.id)) ?? null, count: count.count }))
      .sort((a, b) => b.count - a.count || (a.name ?? '').localeCompare(b.name ?? ''));
  }, [counts.data, names.data]);

  const local = React.useMemo(() => {
    if (!enabled || scope !== 'to_rank') return null;
    const displayOf = (id: string) => displays?.get(normId(id));
    return toRankTopicCounts(toRankIds, displayOf, { query, topicIds });
  }, [displays, enabled, query, scope, toRankIds, topicIds]);

  if (!enabled) return { topics: [], pending: false };
  if (scope === 'to_rank') {
    // While the set is still being read, the last full count is not available either: show the
    // topics present so far with skeleton counts rather than a number that will change.
    if (local) return { topics: local, pending: false };
    const partial = topicOptions(toRankIds, id => displays?.get(normId(id)));
    return { topics: partial, pending: true };
  }
  return {
    topics: serverTopics,
    pending:
      counts.isLoading ||
      counts.isPlaceholderData ||
      (ids.length > 0 && names.isLoading) ||
      debouncedQuery !== query.trim(),
  };
}
