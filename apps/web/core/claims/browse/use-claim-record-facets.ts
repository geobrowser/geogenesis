'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import type { RelationFilter } from '~/core/gql/graphql';
import { graphql } from '~/core/io/graphql-client';
import { getEntityNames } from '~/core/io/queries';
import {
  decodeRelationFacet,
  relationFacetByFilterDocument,
  type RelationFacetCount,
  type RelationFacetGroupBy,
} from '~/core/io/relation-facet';
import { normId } from '~/core/utils/norm-id';

import { claimRecordFilters } from './claim-record-query';

const FACET_STALE_TIME = 60_000;
const NAME_STALE_TIME = 30 * 60_000;
const NO_FACETS: RelationFacetCount[] = [];
const NO_NAMES = new Map<string, string | null>();

export function fetchClaimRecordFacet({
  filter,
  groupBy,
  signal,
}: {
  filter: RelationFilter;
  groupBy: RelationFacetGroupBy;
  signal?: AbortSignal;
}) {
  return Effect.runPromise(
    graphql({
      query: relationFacetByFilterDocument,
      decoder: decodeRelationFacet,
      variables: { filter, groupBy: [groupBy] },
      signal,
    })
  );
}

/**
 * Complete server facets for the claim page's Related claims and Debates records.
 *
 * The row queries stay paged; counts never come from those pages. Spaces are counted over every
 * available space without applying the current space selection to themselves, while Topics are
 * counted over the already-selected spaces and topics. This is the same asymmetric facet contract
 * used by the debates panel and personal-space Positions tab: spaces are OR, topics are AND.
 */
export function useClaimRecordFacets({
  kind,
  claimId,
  allSpaceIds,
  selectedSpaceIds,
  sourceTopicIds,
  selectedTopicIds,
}: {
  kind: 'claims' | 'debates';
  claimId: string;
  allSpaceIds: string[];
  selectedSpaceIds: string[];
  sourceTopicIds: string[];
  selectedTopicIds: string[];
}) {
  const allSpaceKey = allSpaceIds.map(normId).sort().join(',');
  const selectedSpaceKey = selectedSpaceIds.map(normId).sort().join(',');
  const sourceTopicKey = sourceTopicIds.map(normId).sort().join(',');
  const selectedTopicKey = selectedTopicIds.map(normId).sort().join(',');

  const allSpaceFilters = React.useMemo(
    () =>
      claimRecordFilters({
        claimId,
        spaceIds: allSpaceIds,
        topicIds: sourceTopicIds,
        filterTopicIds: kind === 'claims' ? selectedTopicIds : [],
      }),
    // The sorted keys are the semantic identity; callers can rebuild and reorder the arrays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [claimId, kind, allSpaceKey, sourceTopicKey, selectedTopicKey]
  );
  const selectedSpaceFilters = React.useMemo(
    () =>
      claimRecordFilters({
        claimId,
        spaceIds: selectedSpaceIds,
        topicIds: sourceTopicIds,
        filterTopicIds: selectedTopicIds,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [claimId, selectedSpaceKey, sourceTopicKey, selectedTopicKey]
  );

  const claimSpacesQuery = useQuery({
    queryKey: ['claim-record', 'facets', 'claim-spaces', claimId, allSpaceKey, sourceTopicKey, selectedTopicKey],
    enabled: kind === 'claims',
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      fetchClaimRecordFacet({ filter: allSpaceFilters.claimRelations, groupBy: 'SPACE_ID', signal }),
    staleTime: FACET_STALE_TIME,
  });
  const claimTopicsQuery = useQuery({
    queryKey: [
      'claim-record',
      'facets',
      'claim-topics',
      claimId,
      selectedSpaceKey,
      sourceTopicKey,
      selectedTopicKey,
    ],
    enabled: kind === 'claims',
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      fetchClaimRecordFacet({ filter: selectedSpaceFilters.claimTopicRelations, groupBy: 'TO_ENTITY_ID', signal }),
    staleTime: FACET_STALE_TIME,
  });
  const debateSpacesQuery = useQuery({
    queryKey: ['claim-record', 'facets', 'debate-spaces', claimId, allSpaceKey, sourceTopicKey],
    enabled: kind === 'debates',
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      fetchClaimRecordFacet({ filter: allSpaceFilters.debateRelations, groupBy: 'SPACE_ID', signal }),
    staleTime: FACET_STALE_TIME,
  });

  const topicIds = React.useMemo(
    () => (claimTopicsQuery.data ?? NO_FACETS).map(facet => facet.id),
    [claimTopicsQuery.data]
  );
  const topicNamesQuery = useQuery({
    queryKey: ['claim-record', 'facet-topic-names', [...topicIds].sort().join(',')],
    enabled: kind === 'claims' && topicIds.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const rows = await Effect.runPromise(getEntityNames(topicIds, signal));
      return new Map(rows.map(row => [normId(row.id), row.name]));
    },
    staleTime: NAME_STALE_TIME,
  });

  const claimTopics = React.useMemo(() => {
    const names = topicNamesQuery.data ?? NO_NAMES;
    return (claimTopicsQuery.data ?? NO_FACETS).map(facet => ({
      ...facet,
      name: names.get(normId(facet.id)) ?? null,
    }));
  }, [claimTopicsQuery.data, topicNamesQuery.data]);

  const activeQueries =
    kind === 'claims' ? [claimSpacesQuery, claimTopicsQuery] : [debateSpacesQuery];
  const countsPending = activeQueries.some(query => query.isLoading || query.isPlaceholderData);
  const facetsSettled = activeQueries.every(query => !query.isLoading && !query.isPlaceholderData && !query.error);

  return {
    claimSpaces: claimSpacesQuery.data ?? NO_FACETS,
    claimTopics,
    debateSpaces: debateSpacesQuery.data ?? NO_FACETS,
    countsPending,
    facetsSettled,
    topicNamesPending:
      kind === 'claims' && topicIds.length > 0 && (topicNamesQuery.isLoading || topicNamesQuery.isPlaceholderData),
    isError: activeQueries.some(query => Boolean(query.error)),
  };
}
