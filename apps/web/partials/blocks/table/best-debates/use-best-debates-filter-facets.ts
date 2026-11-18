'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import {
  DEBATER_PROPERTY_IDS,
  type MsRange,
  type RankingFilters,
  rankingFilterEntityClauses,
} from '~/core/blocks/ranking/best-debates-ranking-filters';
import { teamTopicFacetEntityFilter } from '~/core/blocks/ranking/best-debates-team-filters';
import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { debaterName } from '~/core/debates/debater-name';
import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TYPE_ID, TYPES_PROPERTY_ID } from '~/core/debates/ontology';
import { useDebouncedValue } from '~/core/hooks/use-debounced-value';
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { uuidToHex } from '~/core/id/normalize';
import { graphql } from '~/core/io/graphql-client';
import { getEntityNames } from '~/core/io/queries';
import { type RelationFacetCount, decodeRelationFacet, relationFacetByFilterDocument } from '~/core/io/relation-facet';
import { normId } from '~/core/utils/norm-id';

export type FilterFacetOption = { id: string; name: string | null; count: number };

export type BestDebatesFilterFacets = {
  debaters: FilterFacetOption[];
  claims: FilterFacetOption[];
  /** The counts answer a filter the viewer has moved on from, or haven't arrived. */
  pending: boolean;
};

const STALE_TIME = 60_000;
const NO_COUNTS: RelationFacetCount[] = [];
const NO_IDS: readonly string[] = [];

/**
 * The entity population a debater or claim menu counts over: every Debate the rest of the team
 * column's filters leave (search, topics, the recorded window and the other menu), and for To rank
 * not the ones the ranker has already dealt with. A dimension never narrows its own menu: the
 * debater filter is OR, so its counts answer "how many would this one add", as the hub's space menu
 * does.
 */
export function filterFacetPopulation({
  query,
  topicIds,
  filters,
  window,
  omit,
  excludeEntityIds,
}: {
  query: string;
  topicIds: readonly string[];
  filters: RankingFilters;
  window: MsRange | null;
  omit: 'debaters' | 'claim';
  excludeEntityIds: readonly string[];
}) {
  return teamTopicFacetEntityFilter({
    debateTypeId: DEBATE_TYPE_ID,
    typesPropertyId: TYPES_PROPERTY_ID,
    topicsPropertyId: TOPICS_PROPERTY_ID,
    query,
    topicIds,
    extraClauses: [
      ...rankingFilterEntityClauses({ filters, window, omit }),
      ...(excludeEntityIds.length > 0 ? [{ id: { notIn: excludeEntityIds.map(normId) } }] : []),
    ],
  });
}

function useFacetCounts(key: string, filter: Record<string, unknown>, enabled: boolean) {
  return useQuery({
    queryKey: ['best-debates', 'filter-facet', key, filter] as const,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: relationFacetByFilterDocument,
          decoder: decodeRelationFacet,
          // The facet document's filter type is the generated RelationFilter; this one is built by hand.
          variables: { filter: filter as never, groupBy: ['TO_ENTITY_ID'] },
          signal,
        })
      ),
    staleTime: STALE_TIME,
    enabled,
  });
}

/** Counted options, the picked ones kept in even at 0 (a pasted link, or other filters emptied them). */
function withPicked(counts: readonly RelationFacetCount[], picked: readonly string[]): { id: string; count: number }[] {
  const byId = new Map(counts.map(count => [normId(count.id), count.count]));
  for (const id of picked) if (!byId.has(normId(id))) byId.set(normId(id), 0);
  return [...byId].map(([id, count]) => ({ id, count }));
}

function sortOptions(options: FilterFacetOption[]): FilterFacetOption[] {
  return options.sort((a, b) => b.count - a.count || (a.name ?? '').localeCompare(b.name ?? ''));
}

/**
 * The Debaters and Claim menus' counts (GEO-3774), over the whole list rather than the rows drawn:
 * one grouped aggregate each (Supported by + Opposed by, and Claims), then the names, each batched.
 * The same server count for All, By space and To rank; To rank's population also leaves out the
 * debates in the ranker's draft and push-downs, as its list does.
 */
export function useBestDebatesFilterFacets({
  enabled,
  query,
  topicIds,
  filters,
  window,
  excludeEntityIds = NO_IDS,
}: {
  enabled: boolean;
  query: string;
  topicIds: readonly string[];
  filters: RankingFilters;
  /** The recorded window the list is read with (To rank's own 7 days when no range is picked). */
  window: MsRange | null;
  excludeEntityIds?: readonly string[];
}): BestDebatesFilterFacets {
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const pickedTopics = React.useMemo(() => [...topicIds].map(normId).sort(), [topicIds]);

  const population = (omit: 'debaters' | 'claim') =>
    filterFacetPopulation({
      query: debouncedQuery,
      topicIds: pickedTopics,
      filters,
      window,
      omit,
      excludeEntityIds,
    });
  const debaterFilter = { typeId: { in: [...DEBATER_PROPERTY_IDS] }, fromEntity: population('debaters') };
  const claimFilter = { typeId: { is: DEBATE_CLAIMS_PROPERTY_ID }, fromEntity: population('claim') };

  const debaterCounts = useFacetCounts('debaters', debaterFilter, enabled);
  const claimCounts = useFacetCounts('claims', claimFilter, enabled);

  const debaterRows = React.useMemo(
    () => withPicked(debaterCounts.data ?? NO_COUNTS, filters.debaterIds),
    [debaterCounts.data, filters.debaterIds]
  );
  const claimRows = React.useMemo(
    () => withPicked(claimCounts.data ?? NO_COUNTS, filters.claimId ? [filters.claimId] : []),
    [claimCounts.data, filters.claimId]
  );

  const debaterIds = React.useMemo(() => debaterRows.map(row => row.id), [debaterRows]);
  const { profilesBySpaceId, isLoading: profilesLoading } = useProfilesBySpaceIds(
    debaterIds,
    enabled && debaterIds.length > 0
  );

  const claimIds = React.useMemo(() => claimRows.map(row => row.id), [claimRows]);
  const claimNames = useQuery({
    queryKey: ['best-debates', 'claim-names', claimIds] as const,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const rows = await Effect.runPromise(getEntityNames(claimIds, signal));
      return new Map(rows.map(row => [uuidToHex(row.id), row.name]));
    },
    staleTime: STALE_TIME,
    enabled: enabled && claimIds.length > 0,
  });

  const debaters = React.useMemo(
    () =>
      sortOptions(
        debaterRows.map(row => {
          const profile = profilesBySpaceId.get(row.id) ?? profilesBySpaceId.get(uuidToHex(row.id));
          // An unknown person reads "Debater", never an id; a pending one is a skeleton.
          return { ...row, name: profile ? debaterName(profile.name) : profilesLoading ? null : debaterName(null) };
        })
      ),
    [debaterRows, profilesBySpaceId, profilesLoading]
  );
  const claims = React.useMemo(() => {
    const names = claimNames.data;
    return sortOptions(
      claimRows.map(row => ({
        ...row,
        name: names ? (names.get(uuidToHex(row.id)) ?? 'Untitled claim') : null,
      }))
    );
  }, [claimNames.data, claimRows]);

  if (!enabled) return { debaters: [], claims: [], pending: false };
  return {
    debaters,
    claims,
    pending:
      debaterCounts.isLoading ||
      debaterCounts.isPlaceholderData ||
      claimCounts.isLoading ||
      claimCounts.isPlaceholderData ||
      debouncedQuery !== query.trim(),
  };
}
