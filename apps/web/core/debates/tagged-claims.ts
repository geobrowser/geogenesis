import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';
import type { ClaimPickerEntity } from '~/core/debates/claim-picker-page';
import { useSearch } from '~/core/hooks/use-search';
import { uuidToHex } from '~/core/id/normalize';
import { graphql } from '~/core/io/graphql-client';

/**
 * Claims carrying a curation tag — a `Tags` relation pointing at one entity — ranked, filtered and
 * paged by the server.
 *
 * GEO-2683 for `Featured`, GEO-2771 for `Debate`, GEO-2798 for this shape. The tag is what gets
 * asked for, rather than the claims and then their tags: a tagged set is a few hundred out of three
 * hundred thousand, so a filter applied to pages of claims would page for a very long time before
 * it found one. That ratio is also why these lists do not go through geo-chat at all — the graph
 * owns tags, so it can answer *which* claims, leaving geo-chat to answer about them.
 *
 * This module used to fetch the whole tagged set and do everything else in memory: ranking, search,
 * topic and space filtering, and the facet counts. That was not a design — ranked cursors lost rows
 * (GEO-2795) and there were no grouped aggregates to count with (GEO-2796). Both landed, so the
 * server does all of it now and a page is a page.
 */
const TAGGED_CLAIMS_SOURCE = /* GraphQL */ `
  query TaggedClaims(
    $tagPropertyId: UUID!
    $tagId: UUID!
    $claimTypeId: UUID!
    $topicsPropertyId: UUID!
    $propertyIds: [UUID!]!
    $filter: EntityFilter!
    $spaceIds: UUIDFilter
    $first: Int!
    $after: Cursor
  ) {
    entitiesConnection(
      first: $first
      after: $after
      orderBy: [RANKING_SCORE_DESC]
      typeIds: { in: [$claimTypeId] }
      spaceIds: $spaceIds
      filter: $filter
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        description
        rankingScore
        spaceIds
        # The tag relations themselves, for the space the claim was tagged *in* — which is what the
        # allowlist is tested against and what groups the geo-chat lookups. A claim tagged in more
        # than one space carries one per space; the caller picks, because which of them a viewer may
        # be shown is a question only the caller can answer.
        tagRelations: relationsList(filter: { typeId: { is: $tagPropertyId }, toEntityId: { is: $tagId } }) {
          spaceId
        }
        # Everything the row is built from, so there is no second lookup per page. Same selection as
        # ClaimPickerEntities, which is why the rows decode to the shape every caller already reads.
        valuesList(first: 100, filter: { propertyId: { in: $propertyIds } }) {
          spaceId
          propertyId
          text
          boolean
        }
        relationsList(first: 100, filter: { typeId: { is: $topicsPropertyId } }) {
          toEntity {
            id
            name
          }
        }
      }
    }
  }
`;

type TaggedClaimsQuery = {
  entitiesConnection: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null } | null;
    nodes: Array<{
      id: string;
      name: string | null;
      description: string | null;
      // `BigFloat`, so it arrives as a string.
      rankingScore: string | null;
      spaceIds: string[] | null;
      tagRelations: Array<{ spaceId: string | null } | null> | null;
      valuesList: Array<{
        spaceId: string;
        propertyId: string;
        text: string | null;
        boolean: boolean | null;
      } | null> | null;
      relationsList: Array<{ toEntity: { id: string; name: string | null } | null } | null> | null;
    } | null> | null;
  } | null;
};

/** Rows per request. Small enough that the first screen is not waiting on the rest of the page. */
export const TAGGED_CLAIMS_PAGE_SIZE = 50;

/** What narrows the list. Every one of these reaches the server. */
export type TaggedClaimFilters = {
  /**
   * The claims a search matched, in the order it ranked them — or `null` when nothing is being
   * searched for.
   *
   * Ids rather than a term, because the search is the app's own (see {@link useTaggedClaimSearch}).
   * `name: { includesInsensitive }` was a substring match: "nuclear power" did not find "Nuclear
   * energy is cheap", and no amount of tuning fixes that shape. The search endpoint is fuzzy and
   * ranked, and it is what every other search box in the app uses.
   *
   * An empty array is a real answer — a search that matched nothing — and narrows to nothing.
   */
  searchResultIds: string[] | null;
  /** AND, not OR: a claim has to carry every picked topic. */
  topicIds: string[];
  /** OR: any of the picked spaces. Left out of the space facet, which must not narrow by itself. */
  spaceIds: string[];
  /**
   * Every space this viewer may be shown claims from at all — their allowlist, already cut to what
   * a debate can be published into. Applied to *everything*, the space facet included: a space the
   * viewer cannot see should not be offered, counted, or listed.
   *
   * `null` while the allowlist is unresolved, which deliberately narrows nothing.
   */
  eligibleSpaceIds: string[] | null;
};

export const NO_TAGGED_CLAIM_FILTERS: TaggedClaimFilters = {
  searchResultIds: null,
  topicIds: [],
  spaceIds: [],
  eligibleSpaceIds: null,
};

/** How many search hits are carried into the list. The connection's own ceiling on `first` is 1,000. */
export const TAGGED_SEARCH_LIMIT = 100;

/** A claim a curator has tagged, and the spaces they tagged it in. */
export type TaggedClaim = {
  /**
   * The claim in the shape the rest of the app already reads, so `claimResponseKind`,
   * `claimHomeSpaceId` and the picker's `rowFromEntity` work on these rows unchanged.
   */
  entity: ClaimPickerEntity;
  /**
   * Every space this claim carries the tag in, in the order the graph returned them.
   *
   * A list rather than one space, because which of them a viewer may be shown is the caller's
   * question: the hub tests them against the picked spaces, the picker against what a debate can be
   * published into. Collapsing here would let an arbitrary space stand for the claim and drop it
   * whenever that one happened to be the wrong one.
   */
  tagSpaceIds: string[];
  /** `null` for a claim the ranking feed has never scored. Ordered on by the server. */
  rankingScore: number | null;
};

function decodeTaggedClaimsPage(data: TaggedClaimsQuery) {
  const claims: TaggedClaim[] = [];

  for (const node of data.entitiesConnection?.nodes ?? []) {
    // A claim with no name has nothing to render.
    if (!node?.name) continue;

    const tagSpaceIds = (node.tagRelations ?? []).flatMap(relation => (relation?.spaceId ? [relation.spaceId] : []));
    // A tag with no space can be neither grouped for the geo-chat lookups nor tested against the
    // allowlist, and a claim whose every tag is like that cannot be placed at all.
    if (tagSpaceIds.length === 0) continue;

    claims.push({
      entity: {
        id: node.id,
        name: node.name,
        description: node.description,
        spaces: node.spaceIds ?? [],
        values: (node.valuesList ?? []).flatMap(value => {
          if (!value) return [];
          // Match `Entity`'s decoding: booleans land as '1' / '0', text as itself.
          const decoded = value.boolean !== null ? (value.boolean ? '1' : '0') : value.text;
          if (decoded === null) return [];
          return [{ property: { id: value.propertyId }, spaceId: value.spaceId, value: decoded }];
        }),
        relations: (node.relationsList ?? []).flatMap(relation =>
          relation?.toEntity
            ? [
                {
                  type: { id: TOPICS_PROPERTY_ID },
                  toEntity: { id: relation.toEntity.id, name: relation.toEntity.name },
                },
              ]
            : []
        ),
      },
      tagSpaceIds,
      rankingScore: node.rankingScore === null ? null : Number(node.rankingScore),
    });
  }

  return {
    claims,
    hasNextPage: data.entitiesConnection?.pageInfo?.hasNextPage ?? false,
    endCursor: data.entitiesConnection?.pageInfo?.endCursor ?? null,
  };
}

/**
 * The entity filter every one of these queries is built on: the tag, plus whatever the viewer has
 * narrowed to. Shared by the list and both facet queries so a count can never describe a different
 * set from the rows.
 *
 * `omit` leaves the space selection out, and only that.
 *
 * The two menus do not work the same way, and the difference is the product's rather than an
 * oversight. Spaces are OR: the menu says how many claims each space would give under the current
 * topic and search, so it must not already be cut to the picked spaces or every unpicked one would
 * read zero and there would be no way back to another. Topics are AND and co-occurrence
 * (GEO-2696): the menu answers "what else do the claims I have narrowed to carry", so it *is*
 * counted over the topic selection — and each picked topic comes back with its current result
 * count, which is what lets it be un-picked.
 */
function taggedEntityFilter(tagId: string, filters: TaggedClaimFilters, omit?: 'spaces') {
  const and: Record<string, unknown>[] = [
    { relations: { some: { typeId: { is: TAG_PROPERTY_ID }, toEntityId: { is: tagId } } } },
  ];

  // AND, not OR (GEO-2696): one clause per topic, so a claim has to carry all of them.
  for (const topicId of filters.topicIds) {
    and.push({ relations: { some: { typeId: { is: TOPICS_PROPERTY_ID }, toEntityId: { is: topicId } } } });
  }

  const filter: Record<string, unknown> = { and };
  // The search narrows to what it matched, and the order it matched in is applied after decoding —
  // the connection can rank by score or by id, not by an arbitrary list.
  if (filters.searchResultIds !== null) filter.id = { in: filters.searchResultIds };

  // Two space filters with different jobs. The picked one narrows and is what the space facet must
  // *not* apply to itself; the eligible one is what the viewer may see at all, and applies to
  // everything. Where both exist the picked set is already a subset, so the narrower wins.
  const picked = omit === 'spaces' ? [] : filters.spaceIds;
  const spaceIds = picked.length > 0 ? picked : (filters.eligibleSpaceIds ?? []);
  // `spaceIds` on the entity is a list, so it takes a list filter — `overlaps`, not `in`.
  if (spaceIds.length > 0) filter.spaceIds = { overlaps: spaceIds };

  return filter;
}

const taggedClaimsDocument = parse(TAGGED_CLAIMS_SOURCE) as TypedDocumentNode<TaggedClaimsQuery, Record<string, unknown>>;

/**
 * Deliberately not under `'debates'`, for the same reason as the claim picker's key: that root is
 * what the gateway reconciles and refetches on every (re)connect, and these rows come from the
 * knowledge graph rather than geo-chat, so a socket event says nothing about them.
 */
export const taggedClaimsQueryKey = (tagId: string, filters: TaggedClaimFilters) =>
  [
    'tagged-claims',
    'claims',
    tagId,
    filters.searchResultIds,
    filters.topicIds,
    filters.spaceIds,
    filters.eligibleSpaceIds,
  ] as const;

const NO_TAGGED_CLAIMS: TaggedClaim[] = [];

/**
 * One ranked, filtered page of tagged claims at a time.
 *
 * Ranked by the server, which is Explore's "Best" order — `entities_ranked_for_feed`'s own
 * `ORDER BY ranking_score DESC, entity_id DESC`, unscored claims last. Nothing is sorted here.
 *
 * Curation moves at human speed, so a page stays fresh for a good while; every caller asking for the
 * same tag and the same filters shares one request.
 */
export function useTaggedClaims(tagId: string, filters: TaggedClaimFilters, enabled: boolean) {
  const query = useInfiniteQuery({
    queryKey: taggedClaimsQueryKey(tagId, filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      Effect.runPromise(
        graphql({
          query: taggedClaimsDocument,
          decoder: decodeTaggedClaimsPage,
          variables: {
            tagPropertyId: TAG_PROPERTY_ID,
            tagId,
            claimTypeId: CLAIM_TYPE_ID,
            topicsPropertyId: TOPICS_PROPERTY_ID,
            propertyIds: [SystemIds.NAME_PROPERTY, CLAIM_IS_FACTUAL_PROPERTY_ID],
            filter: taggedEntityFilter(tagId, filters),
            spaceIds: null,
            // A search is asked for whole rather than paged: its own order is the answer, and a
            // page ordered by rank could only be re-ranked within itself. The set is bounded by
            // `TAGGED_SEARCH_LIMIT`, so "whole" is one request.
            first: filters.searchResultIds ? Math.max(filters.searchResultIds.length, 1) : TAGGED_CLAIMS_PAGE_SIZE,
            after: pageParam,
          },
          signal,
        })
      ),
    getNextPageParam: page => (page.hasNextPage ? page.endCursor : undefined),
    // Narrowing a list should narrow it, not blank it and fill it in again. Every filter mints a
    // new key, so without this the rows vanish for a round trip on each pick.
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    enabled,
  });

  const claims = React.useMemo(() => {
    const pages = query.data?.pages.flatMap(page => page.claims) ?? NO_TAGGED_CLAIMS;
    if (!filters.searchResultIds || pages.length === 0) return pages;
    // Relevance decides the order while a search is on. The whole matched set is in hand, so this
    // ranks the answer rather than reshuffling a page of it.
    const rank = new Map(filters.searchResultIds.map((id, index) => [id, index]));
    return [...pages].sort(
      (a, z) => (rank.get(a.entity.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(z.entity.id) ?? Number.MAX_SAFE_INTEGER)
    );
  }, [filters.searchResultIds, query.data?.pages]);

  return {
    claims,
    // `enabled: false` leaves react-query pending, and a caller waiting on this would read that as
    // "still looking" and never show its empty state.
    isLoading: enabled && query.isLoading,
    error: query.error,
    // A search is answered whole, so there is never a page below it.
    hasNextPage: filters.searchResultIds ? false : query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
  };
}

/* -------------------------------------------------------------------------------------------------
 * Facet menus (GEO-2796)
 * -----------------------------------------------------------------------------------------------*/

/**
 * Counts for one dimension of the menu, from the server.
 *
 * Grouped over the *relations* rather than the entities: a topic count is "how many distinct claims
 * point at this topic", which is a `distinctCount { fromEntityId }` grouped by the relation's other
 * end. The entity filter rides along on `fromEntity`, which is what keeps the count describing the
 * same set the list does.
 *
 * That filter is not optional. An unfiltered group-by runs over every relation in the graph — 4.2M
 * of them — and is the only slow path there is; with the filter applied both facets answer in about
 * a third of a second.
 */
const TAGGED_FACET_SOURCE = /* GraphQL */ `
  query TaggedClaimFacet($relationTypeId: UUID!, $toEntityId: UUID, $fromEntity: EntityFilter!, $groupBy: [RelationsGroupBy!]!) {
    relationsConnection(filter: { typeId: { is: $relationTypeId }, toEntityId: { is: $toEntityId }, fromEntity: $fromEntity }) {
      groupedAggregates(groupBy: $groupBy) {
        keys
        distinctCount {
          fromEntityId
        }
      }
    }
  }
`;

type TaggedFacetQuery = {
  relationsConnection: {
    groupedAggregates: Array<{ keys: string[] | null; distinctCount: { fromEntityId: string | null } | null } | null> | null;
  } | null;
};

export type TaggedFacetCount = { id: string; count: number };

function decodeTaggedFacet(data: TaggedFacetQuery): TaggedFacetCount[] {
  const counts: TaggedFacetCount[] = [];
  for (const group of data.relationsConnection?.groupedAggregates ?? []) {
    const id = group?.keys?.[0];
    if (!id) continue;
    counts.push({ id, count: Number(group?.distinctCount?.fromEntityId ?? 0) });
  }
  return counts;
}

const taggedFacetDocument = parse(TAGGED_FACET_SOURCE) as TypedDocumentNode<TaggedFacetQuery, Record<string, unknown>>;

/**
 * Names for the topic ids a facet came back with.
 *
 * The aggregate answers in ids, and a menu row needs a word. One request covers the whole menu and
 * is keyed on the ids, so it is fetched once and reused while the viewer narrows — topic names do
 * not change on the timescale of a filter click.
 */
const TOPIC_NAMES_SOURCE = /* GraphQL */ `
  query TaggedTopicNames($ids: [UUID!]!) {
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

export const taggedFacetQueryKey = (
  dimension: 'topics' | 'spaces',
  tagId: string,
  filters: TaggedClaimFilters
) =>
  [
    'tagged-claims',
    'facet',
    dimension,
    tagId,
    filters.searchResultIds,
    filters.topicIds,
    // The space facet does not narrow by the picked spaces, so they are not part of its identity.
    dimension === 'spaces' ? null : filters.spaceIds,
    filters.eligibleSpaceIds,
  ] as const;

const NO_FACET_COUNTS: TaggedFacetCount[] = [];
const NO_TOPIC_NAMES = new Map<string, string | null>();

/**
 * The topic menu: every topic carried by a claim that survives the current filters, the topic
 * selection included.
 *
 * Co-occurrence, since topics intersect (GEO-2696). Counted over the claims that already carry
 * every picked topic, so the menu answers "what else do these carry" and nothing it offers can lead
 * to an empty list. The picked topics come back with the current result count, which is what lets
 * them be un-picked.
 */
export function useTaggedTopicFacet(tagId: string, filters: TaggedClaimFilters, enabled: boolean) {
  const counts = useQuery({
    queryKey: taggedFacetQueryKey('topics', tagId, filters),
    // The menu holds its options while the next count loads. Ticking a topic changes this query's
    // key, and an empty menu between the two reads as the options being taken away — the menu the
    // viewer is still pointing at disappearing under them.
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: taggedFacetDocument,
          decoder: decodeTaggedFacet,
          variables: {
            relationTypeId: TOPICS_PROPERTY_ID,
            toEntityId: null,
            fromEntity: { typeIds: { in: [CLAIM_TYPE_ID] }, ...taggedEntityFilter(tagId, filters) },
            groupBy: ['TO_ENTITY_ID'],
          },
          signal,
        })
      ),
    staleTime: 5 * 60_000,
    enabled,
  });

  const ids = React.useMemo(() => (counts.data ?? NO_FACET_COUNTS).map(count => count.id), [counts.data]);

  const names = useQuery({
    queryKey: ['tagged-claims', 'topic-names', ids] as const,
    // Names outlive a filter click, so the previous set stands while the new one is fetched rather
    // than every row falling back to "Topic" for a moment.
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: topicNamesDocument,
          decoder: (data: TopicNamesQuery) => {
            const map = new Map<string, string | null>();
            // Keyed on the normalized id. `groupedAggregates` answers in dashed UUIDs and
            // `entitiesConnection` in dashless ones, so an unnormalized map never matches and every
            // row falls back to the word "Topic" — which is exactly how this shipped and was caught
            // in a browser.
            for (const node of data.entitiesConnection?.nodes ?? []) if (node) map.set(uuidToHex(node.id), node.name);
            return map;
          },
          variables: { ids },
          signal,
        })
      ),
    // Names outlive any one filter click by a long way.
    staleTime: 30 * 60_000,
    enabled: enabled && ids.length > 0,
  });

  const topics = React.useMemo(() => {
    const byId = names.data ?? NO_TOPIC_NAMES;
    return (counts.data ?? NO_FACET_COUNTS).map(count => ({
      id: count.id,
      // A name still on its way is not the same as a topic with no name; both read as `null` here
      // and the menu decides how to draw them.
      name: byId.get(uuidToHex(count.id)) ?? null,
      count: count.count,
    }));
  }, [counts.data, names.data]);

  return {
    topics,
    // The names are part of the answer: a menu of ids is not a menu. The counts alone settle first,
    // which is what the caller reconciles a selection against.
    isLoading: enabled && (counts.isLoading || names.isLoading),
    countsSettled: enabled ? !counts.isLoading && !counts.error : false,
    error: counts.error,
  };
}

/**
 * The space menu, counted the same way and narrowed by everything except the space selection.
 *
 * Grouped on the tag relation's own `SPACE_ID`, so a space is offered for the claims tagged *in* it
 * rather than for every space the claim happens to be named in.
 */
export function useTaggedSpaceFacet(tagId: string, filters: TaggedClaimFilters, enabled: boolean) {
  const query = useQuery({
    queryKey: taggedFacetQueryKey('spaces', tagId, filters),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: taggedFacetDocument,
          decoder: decodeTaggedFacet,
          variables: {
            relationTypeId: TAG_PROPERTY_ID,
            toEntityId: tagId,
            fromEntity: { typeIds: { in: [CLAIM_TYPE_ID] }, ...taggedEntityFilter(tagId, filters, 'spaces') },
            groupBy: ['SPACE_ID'],
          },
          signal,
        })
      ),
    staleTime: 5 * 60_000,
    enabled,
  });

  return {
    spaces: query.data ?? NO_FACET_COUNTS,
    isLoading: enabled && query.isLoading,
    settled: enabled ? !query.isLoading && !query.error : false,
    error: query.error,
  };
}

/* -------------------------------------------------------------------------------------------------
 * Search
 * -----------------------------------------------------------------------------------------------*/

/**
 * The claims a search matched, ranked, from the app's own search.
 *
 * `useSearch` is what every other search box here uses — fuzzy, relevance-ordered, and served by
 * the same endpoint — so a claim list searches the way the rest of the app does rather than the way
 * one filter happened to be written. What it replaced was `name: { includesInsensitive }`, a
 * substring match: "nuclear power" did not find "Nuclear energy is cheap".
 *
 * It debounces internally, so callers hand it the live term and pass the ids to
 * {@link TaggedClaimFilters}. The tag filter still applies on top, which is why this returns ids
 * rather than rows: what the viewer gets is what the search matched *and* a curator tagged.
 */
export function useTaggedClaimSearch(search: string) {
  const trimmed = search.trim();
  const { results, isLoading, onQueryChange } = useSearch({
    filterByTypes: [CLAIM_TYPE_ID],
    pageSize: TAGGED_SEARCH_LIMIT,
    enabled: trimmed !== '',
  });

  React.useEffect(() => {
    onQueryChange(search);
  }, [onQueryChange, search]);

  const ids = React.useMemo(() => results.map(result => result.id), [results]);

  return {
    /** `null` when nothing is being searched for, which narrows nothing. */
    searchResultIds: trimmed === '' ? null : ids,
    /**
     * True while the term has changed and the match has not caught up.
     *
     * Callers wait on this the way they waited on their own debounce: the list is about to change,
     * and reconciling a selection against a menu counted over the previous match would spend it.
     */
    isSearching: trimmed !== '' && isLoading,
  };
}
