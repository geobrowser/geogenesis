import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { graphql } from '~/core/io/graphql-client';
import { getEntityNames } from '~/core/io/queries';
import { decodeRelationFacet, relationFacetByFilterDocument } from '~/core/io/relation-facet';
import { normId } from '~/core/utils/norm-id';

import { type ExploreTime, buildExploreTopicFacetFilter } from './explore-feed-filter';

export type ExploreTopicFacet = { id: string; name: string | null; count: number };

const MAX_CANDIDATES = 100;

/**
 * The Explore topic dropdown's counts, made to agree with the feed.
 *
 * Candidates come from the fast (approximate) tag aggregate; each candidate's exact count comes from
 * gaia's `topicFeedTypeCounts`, over the same ranking table the feed pages through.
 *
 * Exact for Best/New at `time: 'all'`. Known divergences:
 *  - Top and time-filtered feeds: `topicFeedTypeCounts` has no time range, and Top is not table-served.
 *  - No type selected: the feed takes the plain Best walk, which these counts don't describe.
 *  - An entity with two selected types is counted once per type (safe for disjoint Debate/Claim).
 */
export async function fetchExploreTopicFacets({
  spaceIds,
  selectedTopicIds,
  typeIds,
  requireDebateTagOnClaims = true,
  signal,
}: {
  spaceIds: string[];
  selectedTopicIds: readonly string[];
  typeIds: readonly string[];
  requireDebateTagOnClaims?: boolean;
  signal?: AbortSignal;
}): Promise<ExploreTopicFacet[]> {
  if (spaceIds.length === 0 || typeIds.length === 0) return [];

  const candidateCounts = await Effect.runPromise(
    graphql({
      query: relationFacetByFilterDocument,
      decoder: decodeRelationFacet,
      variables: {
        filter: buildExploreTopicFacetFilter({
          spaceIds,
          time: 'all',
          typeIds,
          topicIds: selectedTopicIds,
          requireDebateTagOnClaims,
        }),
        groupBy: ['TO_ENTITY_ID'],
      },
      signal,
    })
  );

  const selected = selectedTopicIds.map(normId);
  const selectedSet = new Set(selected);
  const topByCount = [...candidateCounts]
    .sort((a, b) => b.count - a.count)
    .map(count => normId(count.id))
    .filter(id => !selectedSet.has(id))
    .slice(0, Math.max(0, MAX_CANDIDATES - selected.length));

  const candidates = [...new Set([...selected, ...topByCount])];
  if (candidates.length === 0) return [];

  const counts = await fetchExactCounts({
    candidates,
    selectedTopicIds: selected,
    typeIds,
    spaceIds,
    requireDebateTagOnClaims,
    signal,
  });

  const names = await fetchTopicNames(candidates, signal);
  return candidates
    .map(id => ({ id, name: names.get(id) ?? null, count: counts.get(id) ?? 0 }))
    .sort((a, b) => b.count - a.count || (a.name ?? a.id).localeCompare(b.name ?? b.id));
}

type TopicTypeCountRow = { typeId?: string | null; entityCount?: number | string | null };
type AliasedCountsResult = Record<string, TopicTypeCountRow[] | null>;

async function fetchExactCounts({
  candidates,
  selectedTopicIds,
  typeIds,
  spaceIds,
  requireDebateTagOnClaims,
  signal,
}: {
  candidates: string[];
  selectedTopicIds: readonly string[];
  typeIds: readonly string[];
  spaceIds: string[];
  requireDebateTagOnClaims: boolean;
  signal?: AbortSignal;
}): Promise<Map<string, number>> {
  const aliasOf = (index: number) => `c${index}`;
  const topicVarOf = (index: number) => `t${index}`;
  const topicVarDeclarations = candidates.map((_, index) => `$${topicVarOf(index)}: [UUID!]`).join(', ');
  const body = candidates
    .map(
      (_, index) =>
        `  ${aliasOf(index)}: topicFeedTypeCounts(topicIds: $${topicVarOf(index)}, typeIds: $typeIds, spaceIds: $spaceIds, debateTaggedClaims: $debateTaggedClaims, matchAll: true) { typeId entityCount }`
    )
    .join('\n');

  const document = parse(
    `query ExploreTopicFacetCounts($typeIds: [UUID!], $spaceIds: [UUID!], $debateTaggedClaims: Boolean, ${topicVarDeclarations}) {\n${body}\n}`
  ) as TypedDocumentNode<AliasedCountsResult, Record<string, unknown>>;

  const topicVariables = Object.fromEntries(
    candidates.map((candidate, index) => [topicVarOf(index), [...selectedTopicIds, candidate]])
  );

  const data = await Effect.runPromise(
    graphql({
      query: document,
      decoder: (result: AliasedCountsResult) => result,
      variables: { typeIds: [...typeIds], spaceIds, debateTaggedClaims: requireDebateTagOnClaims, ...topicVariables },
      signal,
    })
  );

  const counts = new Map<string, number>();
  candidates.forEach((candidate, index) => {
    const rows = data[aliasOf(index)] ?? [];
    const total = rows.reduce((sum, row) => sum + (Number(row?.entityCount) || 0), 0);
    counts.set(candidate, total);
  });
  return counts;
}

async function fetchTopicNames(ids: string[], signal?: AbortSignal): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map();
  const rows = await Effect.runPromise(getEntityNames(ids, signal));
  return new Map(rows.map(row => [normId(row.id), row.name]));
}

export type { ExploreTime };
