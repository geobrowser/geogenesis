import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import {
  type UseQueryResult,
  keepPreviousData,
  useInfiniteQuery,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';
import type { ClaimPickerEntity } from '~/core/debates/claim-picker-page';
import { useLastSettled } from '~/core/hooks/use-last-settled';
import { equals as idEquals, uuidToHex } from '~/core/id/normalize';
import { graphql } from '~/core/io/graphql-client';
import { type RelationFacetCount, decodeRelationFacet, relationFacetDocument } from '~/core/io/relation-facet';

import { type TaggedClaimSearch, useTaggedClaimSearch } from './tagged-claim-search';

/**
 * Claims carrying a curation tag — a `Tags` relation pointing at one entity — ranked, filtered and
 * paged by the server.
 *
 * GEO-2683 for `Featured`, GEO-2771 for `Debate`, GEO-2798 for this shape. The tag is what gets
 * asked for, rather than the claims and then their tags: the Debate tag is ~2,000 claims out of
 * hundreds of thousands, so a filter applied to pages of claims would page for a very long time
 * before it found one. That ratio is also why these lists do not go through geo-chat at all — the graph
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
    $first: Int!
    $after: Cursor
  ) {
    entitiesConnection(
      first: $first
      after: $after
      orderBy: [RANKING_SCORE_DESC]
      typeIds: { in: [$claimTypeId] }
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

/**
 * How long a tagged answer stays fresh — the page and both facet counts, which all describe the
 * same curated set and so have no business disagreeing about when it has gone stale. Curation moves
 * at human speed, so every caller asking for the same tag and filters shares one request for a good
 * while.
 */
const TAGGED_STALE_TIME = 5 * 60_000;

/** Topic names outlive any one filter click by a long way; they are not what goes stale here. */
const TOPIC_NAMES_STALE_TIME = 30 * 60_000;

/** Rows per request. Small enough that the first screen is not waiting on the rest of the page. */
export const TAGGED_CLAIMS_PAGE_SIZE = 50;

/** What narrows the list. Every one of these reaches the server. */
export type TaggedClaimFilters = {
  /**
   * Free text over the claim's name. Debounced by the caller.
   *
   * Answered by the app's own `/search` endpoint rather than by the graph filter below (GEO-2898):
   * it resolves to the ids of the claims that matched, and those ids narrow this filter in place of
   * the text. So search is fuzzy, stemmed and relevance-ranked, while topics and spaces keep
   * narrowing server-side over the same set — see {@link useTaggedClaimSearch}.
   *
   * It could not be answered there until GEO-2876 added `tag_ids`. Without a tag filter the tagged
   * set — a couple of thousand claims inside a corpus of hundreds of thousands; 2,189 carried the
   * Debate tag when this was measured — never reached a ranked page: of the top 100 hits for
   * "Allegations" scoped to Claim, none were tagged, and a tagged claim *named* "Allegations of an
   * affair…" came back 521st of 697 (GEO-2806). What replaced it until now matched a word at a time
   * on the graph, with no stemming, no synonyms, and rows ordered by `rankingScore` — which
   * describes the claim rather than the search (#2351).
   */
  search: string;
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
  search: '',
  topicIds: [],
  spaceIds: [],
  eligibleSpaceIds: null,
};

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
    // What the server actually returned, before the two `continue`s above. Callers that need to
    // know a *page arrived* have to count this rather than `claims`: a page of nodes that all lack
    // a name, or a placeable tag space, decodes to nothing — and a caller reading the decoded
    // length cannot tell that from no page at all. `useBoundedPaging` is the one that must, or the
    // page goes uncharged and its sentinel keeps asking for more.
    fetched: data.entitiesConnection?.nodes?.length ?? 0,
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
/**
 * The clause that says "tagged with this, in these spaces, carrying these topics, matching this
 * search" — as an `EntityFilter`.
 *
 * Exported because a space's claims feed orders the same corpus by its own `orderBy` rather than
 * going through {@link useTaggedClaims}, and counts its topic menu through
 * {@link useTaggedTopicFacet}, which applies this. A second hand-written copy of the clause would
 * be a list and a menu that disagree about what is in it — which is exactly the bug the space
 * scoping below was added to fix, one layer down.
 */
export function taggedEntityFilter(
  tagId: string,
  filters: TaggedClaimFilters,
  /**
   * The claims a text search matched, or `null` when nothing is being searched for.
   *
   * `null` and `[]` are opposite answers and only one of them narrows: nothing asked leaves the
   * list alone, nothing matched empties it. `id: { in: [] }` returns nothing, which is what a
   * search with no matches should show.
   */
  searchClaimIds: string[] | null,
  omit?: 'spaces'
) {
  // Two space filters with different jobs. The picked one narrows and is what the space facet must
  // *not* apply to itself; the eligible one is what the viewer may see at all, and applies to
  // everything. Where both exist the picked set is already a subset, so the narrower wins.
  const picked = omit === 'spaces' ? [] : filters.spaceIds;
  // `null` and `[]` are different answers and only one of them narrows nothing. Unresolved is
  // `null` — the allowlist has not come back, and a list that is briefly too wide beats a panel
  // that never fills. Resolved-and-empty is a viewer who may see no space at all, and collapsing
  // the two showed them the entire tag. `spaceId: { in: [] }` returns nothing, which is the answer.
  const spaceIds = picked.length > 0 ? picked : filters.eligibleSpaceIds;

  // The space goes on the *tag relation*, not on the entity.
  //
  // `spaceIds` on an entity is every space it appears in, which is a wider and different question
  // from where a curator tagged it — and `tagSpaceIds`, the space facet's grouping, and the space
  // the card is finally built against all speak the tag relation's. Filtering on the entity's set
  // let a claim tagged in one space be returned for a space it merely also exists in: measured on
  // the Debate tag, four claims across three spaces, two of them in spaces the facet counts as
  // holding none — so the menu and the list disagreed about the same space.
  const tagRelation: Record<string, unknown> = { typeId: { is: TAG_PROPERTY_ID }, toEntityId: { is: tagId } };
  if (spaceIds !== null) tagRelation.spaceId = { in: spaceIds };

  const and: Record<string, unknown>[] = [{ relations: { some: tagRelation } }];

  // AND, not OR (GEO-2696): one clause per topic, so a claim has to carry all of them.
  for (const topicId of filters.topicIds) {
    and.push({ relations: { some: { typeId: { is: TOPICS_PROPERTY_ID }, toEntityId: { is: topicId } } } });
  }

  // Search arrives as ids rather than as text (GEO-2898). Narrowing by id is what lets the text
  // matching happen somewhere that can stem, rank and score it while the rest of this filter — the
  // tag, the topics, the spaces — keeps being answered here, over the set it returned. The facets
  // ride the same filter, so their counts describe the search's results too.
  if (searchClaimIds !== null) {
    and.push({ id: { in: searchClaimIds } });
  }

  return { and };
}

/**
 * Which space a tagged claim's card is for.
 *
 * A claim arrives once, carrying every space it is tagged in, and a card has to be built against
 * one of them — the space a debate would be published into, and the space its sides are read from.
 * A picked space wins where the claim is tagged in one, so narrowing to a space never hides a claim
 * that is tagged in it; otherwise the first the gate allows. `null` means no space this viewer may
 * be shown, which is a claim that drops off the list rather than a card without a space.
 *
 * Shared because both surfaces have to answer it identically: the hub and the rematch picker each
 * had their own copy of this, down to the comment, differing only in how they spelled the gate and
 * which of the two id comparators they reached for.
 */
export function tagDisplaySpaceId(
  claim: TaggedClaim,
  pickedSpaceIds: string[],
  isSpaceShown: (spaceId: string) => boolean
): string | null {
  const allowed = claim.tagSpaceIds.filter(isSpaceShown);
  return allowed.find(spaceId => pickedSpaceIds.some(picked => idEquals(picked, spaceId))) ?? allowed[0] ?? null;
}

const taggedClaimsDocument = parse(TAGGED_CLAIMS_SOURCE) as TypedDocumentNode<
  TaggedClaimsQuery,
  Record<string, unknown>
>;

/**
 * Deliberately not under `'debates'`, for the same reason as the claim picker's key: that root is
 * what the gateway reconciles and refetches on every (re)connect, and these rows come from the
 * knowledge graph rather than geo-chat, so a socket event says nothing about them.
 */
/**
 * The text search behind all three queries in this module, resolved once.
 *
 * Called by each of them rather than threaded through from the caller: the key is a function of the
 * tag and the filters, which each hook already has, so all three land on one request and the list
 * and its two facets cannot narrow to different searches. Threading it instead would have meant
 * every caller wiring a search hook and passing it to three others — two surfaces doing the same
 * wiring, which is the arrangement this module exists to avoid.
 */
function useTagSearch(tagId: string, filters: TaggedClaimFilters, enabled: boolean): TaggedClaimSearch {
  return useTaggedClaimSearch({ tagId, search: filters.search, enabled });
}

/**
 * What the per-page row requests add up to.
 *
 * The first page and the ones after it mean different things to a caller, and collapsing them was a
 * regression: both surfaces hand `isLoading` to `HubQueryState`, which replaces the whole list with
 * a skeleton — so reporting a load while an *appended* page hydrated blanked the list on every
 * scroll. The first page is the list appearing; the rest is the list growing, which belongs to the
 * next-page state.
 *
 * At module scope so it has one identity for the life of the module. `useQueries` re-runs `combine`
 * whenever it changes, and a closure built per render is the churn `claims-tab` documents.
 */
function combineSearchPages(results: Array<UseQueryResult<ReturnType<typeof decodeTaggedClaimsPage>>>) {
  return {
    pages: results.map(result => result.data?.claims),
    firstPagePending: results.length > 0 && results[0]!.isLoading,
    appendedPending: results.slice(1).some(result => result.isLoading),
    error: results.find(result => result.error)?.error ?? null,
  };
}

/** Everything keyed below, for the retry that invalidates rather than refetches. */
const TAGGED_SEARCH_CLAIMS_QUERY_PREFIX = ['tagged-claims', 'search-claims'] as const;

/** One page of a search's rows. Distinct from the list key — see where it is used. */
const taggedSearchClaimsQueryKey = (tagId: string, filters: TaggedClaimFilters, ids: string[]) =>
  ['tagged-claims', 'search-claims', tagId, filters.topicIds, filters.spaceIds, filters.eligibleSpaceIds, ids] as const;

export const taggedClaimsQueryKey = (
  tagId: string,
  filters: TaggedClaimFilters,
  /**
   * Part of the identity, not just the text: the ids arrive a round trip after the text does, and a
   * key that did not name them would hand the new search the previous one's rows and never refetch.
   */
  searchClaimIds: string[] | null = null
) =>
  [
    'tagged-claims',
    'claims',
    tagId,
    filters.search,
    searchClaimIds,
    filters.topicIds,
    filters.spaceIds,
    filters.eligibleSpaceIds,
  ] as const;

const NO_TAGGED_CLAIMS: TaggedClaim[] = [];

/** What a disabled list hands back in place of `fetchNextPage`, which ignores `enabled` on its own. */
const noFetch = async () => undefined;

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
  const search = useTagSearch(tagId, filters, enabled);
  // A search's pages are the unit of paging while one is running — see `searchPages` below — so the
  // cursor query is idle then rather than paging a filter whose id set is still growing.
  const browsing = enabled && search.claimIds === null;
  /** The mirror of `browsing`: a search is answering, so the cursor query is not. */
  const searching = search.claimIds !== null;

  const query = useInfiniteQuery({
    queryKey: taggedClaimsQueryKey(tagId, filters, search.claimIds),
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
            filter: taggedEntityFilter(tagId, filters, null),
            first: TAGGED_CLAIMS_PAGE_SIZE,
            after: pageParam,
          },
          signal,
        })
      ),
    getNextPageParam: page => (page.hasNextPage ? page.endCursor : undefined),
    // Narrowing a list should narrow it, not blank it and fill it in again. Every filter mints a
    // new key, so without this the rows vanish for a round trip on each pick.
    placeholderData: keepPreviousData,
    staleTime: TAGGED_STALE_TIME,
    enabled: browsing,
  });

  /**
   * The rows for a search, a search page at a time.
   *
   * One request per page of ids rather than one over all of them, because the endpoint ranked them
   * in pages and `entitiesConnection` caps `first` — so a page is both the largest request worth
   * making and the unit the ordering below is meaningful within. Paging the list means asking the
   * search for another page, which adds a request here; the cursor query above does not run at all.
   */
  const searchPages = useQueries({
    queries: search.idPages.map(ids => ({
      // Its own key, not the list key with the ids appended. A one-page search would produce the
      // same key as the cursor query above, and the two store different shapes — an infinite
      // query's `{ pages }` against one page's `{ claims }` — so they answered each other's reads
      // with `undefined` and the list came back empty while both requests had succeeded.
      queryKey: taggedSearchClaimsQueryKey(tagId, filters, ids),
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
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
              // The ids of this page only. The tag, the topics and the spaces still narrow here, so
              // a claim the search matched but a topic filter excludes never reaches the list.
              filter: taggedEntityFilter(tagId, filters, ids),
              first: ids.length,
              after: null,
            },
            signal,
          })
        ),
      staleTime: TAGGED_STALE_TIME,
      // No `placeholderData` here, unlike every other query in this module. It is the right tool
      // and it does not reach: `useQueries` rebuilds its observers from the array each render, so a
      // per-entry placeholder has no previous entry to keep — measured, by writing the test first
      // and watching the fix not take. The rows are held below instead.
      enabled: enabled && ids.length > 0,
    })),
    combine: combineSearchPages,
  });

  const searchClaimsNow = React.useMemo(() => {
    if (search.claimIds === null) return NO_TAGGED_CLAIMS;
    const byRelevance = new Map(search.claimIds.map((id, index) => [id, index]));
    // Each page ordered by the endpoint's ranking rather than the graph's. That ordering is the
    // point of the move: the graph returns `RANKING_SCORE_DESC`, which describes the claim rather
    // than the search, so the closest match to what was typed could arrive anywhere in the page.
    //
    // A page still waiting is left out rather than skipped over, so the rows keep arriving in
    // relevance order instead of a later page jumping the queue and being overtaken.
    const claims: TaggedClaim[] = [];
    for (const page of searchPages.pages) {
      if (!page) break;
      claims.push(
        ...[...page].sort((a, b) => (byRelevance.get(a.entity.id) ?? 0) - (byRelevance.get(b.entity.id) ?? 0))
      );
    }
    return claims;
  }, [search.claimIds, searchPages.pages]);

  const cache = useQueryClient();
  const searchRefetch = search.refetch;
  const refetchSearching = React.useCallback(() => {
    void cache.invalidateQueries({ queryKey: TAGGED_SEARCH_CLAIMS_QUERY_PREFIX });
    searchRefetch();
  }, [cache, searchRefetch]);

  /**
   * Whether the row set is still incomplete — either hop of it: the ids, or the rows those ids are
   * drawn from, on any page rather than only the first.
   *
   * Any page, because a filter change re-keys every page at once: page one can come back with no
   * matching rows while page two is still out, and reading that as complete committed an empty
   * prefix and said "no matches" about a search that had them. Appending while scrolling is the
   * same state and costs nothing here — the rows already on screen are what is held, and the
   * loading flag below asks whether anything is held rather than whether anything is in flight.
   *
   * A failure is complete: there is an error state to draw, and holding rows behind it would say
   * the list is still coming.
   */
  const searchRowsSettling =
    searching &&
    search.error === null &&
    searchPages.error === null &&
    (!search.settled || searchPages.firstPagePending || searchPages.appendedPending);

  const browsedClaims = React.useMemo(
    () => query.data?.pages.flatMap(page => page.claims) ?? NO_TAGGED_CLAIMS,
    [query.data?.pages]
  );

  /**
   * What is on screen stays on screen until what replaces it arrives.
   *
   * Both lists go through one hold, which is the fix for the case a search-only hold could not
   * reach: the *first* search. Browsing seeds nothing into a hold it never passes through, so the
   * first query found nothing held and drew a skeleton over the rows the viewer was reading — the
   * same flash as an edited search, at the one moment it is most obviously a narrowing of what is
   * already there.
   *
   * Browsing is never settling here: its own query keeps its previous page through a filter change
   * (`placeholderData`), so by the time a value reaches this hold it is one worth holding.
   *
   * Reset on the tag, the coarsest thing this hold can belong to — Featured's rows held under All
   * claims would be the wrong list, where a query's rows held across the next keystroke is the
   * point.
   */
  const claimsNow = browsing ? browsedClaims : searchClaimsNow;
  const claims = useLastSettled(claimsNow, searchRowsSettling, tagId);

  /**
   * Rows the server has returned across every page held, decodable or not — see `fetched`.
   *
   * Zero while the *previous* filter's pages are being held. `keepPreviousData` is right for the
   * list — narrowing should narrow rather than blank and refill — but a count is not a list: the
   * caller has already reset its paging budget for the new filter, so handing it the old one's
   * total charges a page that belongs to a different question. The real first page then arrives at
   * an equal or smaller count and is never evaluated, leaving the budget a page out in whichever
   * direction the previous list happened to point.
   */
  const fetched = React.useMemo(
    () => (query.isPlaceholderData ? 0 : (query.data?.pages.reduce((total, page) => total + page.fetched, 0) ?? 0)),
    [query.data?.pages, query.isPlaceholderData]
  );

  return {
    // Disabled means no answer, not the last one.
    //
    // `enabled: false` only stops react-query *fetching*; it keeps handing back whatever is cached
    // under this key, which is the same trap `useClaimMatchup` documents. Here the cache outlives
    // the reason it was filled: a picker tab that is no longer showing the tag still had its ids,
    // and started a geo-chat batch about claims that are not on screen. `hasNextPage` is worse than
    // wasteful — `fetchNextPage` is a manual call and ignores `enabled`, so a sentinel reading a
    // cached `true` pages a query whose scope has not been resolved yet, from an old cursor.
    claims: enabled ? claims : NO_TAGGED_CLAIMS,
    fetched: enabled ? fetched : 0,
    // `enabled: false` leaves react-query pending, and a caller waiting on this would read that as
    // "still looking" and never show its empty state.
    //
    // While searching, the text lookup is part of the load: its ids are what the row request is
    // built from, so a caller reading "settled" before they land would show an empty list under a
    // query that is still being answered.
    // A first load, not "a request is out". Editing a search mints a new key, and `keepPreviousData`
    // holds the previous search's ids and rows through it — so reporting a load there put a skeleton
    // over rows that were on screen and readable, which is the flash the placeholder exists to
    // prevent. An error is not a load either: it releases this so the error state can be drawn.
    // A first load, which is not the same as a request being out. Asked as "is anything settling
    // with nothing to show", because that is the question a skeleton answers: a search being
    // re-asked with the previous rows still held is not a list appearing, and drawing a skeleton
    // over readable rows is the flash all of this exists to avoid.
    isLoading: enabled && (searching ? searchRowsSettling && claims.length === 0 : query.isLoading),
    error: enabled ? (searching ? (search.error ?? searchPages.error) : query.error) : null,
    // Paging follows whichever source is answering. A search's next page is another `/search`
    // offset, not a graph cursor — the cursor belongs to a query that is not running.
    hasNextPage: enabled && (searching ? search.hasNextPage : query.hasNextPage),
    fetchNextPage: enabled ? (searching ? search.fetchNextPage : query.fetchNextPage) : noFetch,
    // A page is not fetched until its rows are. Reported done when only the id lookup had returned,
    // the consumers' scroll sentinel re-armed while hydration was still out and asked for another
    // page immediately — draining a broad search into a pile of in-flight row queries instead of
    // paging as rows appear.
    isFetchingNextPage:
      enabled && (searching ? search.isFetchingNextPage || searchPages.appendedPending : query.isFetchingNextPage),
    // Whichever request failed, which is not always the one that would be refetched. While a search
    // runs the cursor query is idle, so retrying *that* asked nothing again; and where the id
    // lookup succeeded and a row page did not, retrying the id lookup returns the same ids under
    // the same key and leaves the failed page exactly as it was. So the rows are invalidated by
    // key — the approach `claims-tab` already takes for this, and for the same reason: a refetch
    // handed out of a `combine` would be a new identity on every render.
    refetch: searching ? refetchSearching : query.refetch,
  };
}

/* -------------------------------------------------------------------------------------------------
 * Facet menus (GEO-2796)
 * -----------------------------------------------------------------------------------------------*/

/*
 * Why both facets report two flags rather than one. The distinction is the whole of it, and neither
 * name means much alone.
 *
 * `settled` — there are counts to draw. What a menu asks before it stops showing skeletons. Left
 * exactly as it was before this split, because six things read it and its timing is what they are
 * built against: an idle query counts as settled, which is a brief window and a deliberate one.
 *
 * `complete` — they are counts of *everything* that matched. What a caller asks before reconciling
 * a viewer's selection against the menu, because a selection is only invalid if the thing it names
 * is genuinely absent.
 *
 * They came apart with GEO-2898. A text search resolves to ids a page at a time, and the counts are
 * over the ids in hand — so for a broad query they are real counts of a prefix. Reading that as
 * "not settled" kept the selection safe and blanked the menus for the whole search, which is how
 * this was found: the debate-again picker showed empty count chips against a search with more than
 * one page of results. Reading it as "settled" draws the counts and drops a topic whose claims sit
 * on a later page. Only two flags answer both.
 */

/*
 * Counts for one dimension of the menu come from the shared relation-facet
 * query (core/io/relation-facet.ts — grown here for GEO-2796/2798, extracted
 * once the data-table dropdowns adopted the same mechanism). Grouped over the
 * *relations* rather than the entities: a topic count is "how many distinct
 * claims point at this topic". The entity filter rides along on `fromEntity`,
 * which is what keeps the count describing the same set the list does — and
 * it is not optional: unfiltered, the group-by runs over every relation in
 * the graph (4.2M) and is the only slow path there is; filtered, both facets
 * answer in about a third of a second.
 *
 * Ids come out of the shared decode dashless, which is the spelling
 * everything else in the app speaks. That matters because these ids do not
 * stay inside the menu: they become the viewer's selection, and the
 * selection outlives the source that produced it — switching from a tagged
 * list to the opponent's tab hands the id to `carriesEveryTopic` and
 * `keepSelectableTopics`, which compare with `Set.has` against dashless
 * relation targets.
 */
export type TaggedFacetCount = RelationFacetCount;

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
  filters: TaggedClaimFilters,
  /** See {@link taggedClaimsQueryKey}: the ids are part of what was asked, not a detail of it. */
  searchClaimIds: string[] | null = null
) =>
  [
    'tagged-claims',
    'facet',
    dimension,
    tagId,
    filters.search,
    searchClaimIds,
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
  const search = useTagSearch(tagId, filters, enabled);
  const counts = useQuery({
    queryKey: taggedFacetQueryKey('topics', tagId, filters, search.claimIds),
    // The menu holds its options while the next count loads. Ticking a topic changes this query's
    // key, and an empty menu between the two reads as the options being taken away — the menu the
    // viewer is still pointing at disappearing under them.
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: relationFacetDocument,
          decoder: decodeRelationFacet,
          variables: {
            typeId: TOPICS_PROPERTY_ID,
            toEntityId: null,
            fromEntity: { typeIds: { in: [CLAIM_TYPE_ID] }, ...taggedEntityFilter(tagId, filters, search.claimIds) },
            groupBy: ['TO_ENTITY_ID'],
          },
          signal,
        })
      ),
    staleTime: TAGGED_STALE_TIME,
    // Not counted before the search it describes has answered. `isLoading` is not the test — a
    // pending query that has not begun fetching reports neither loading nor settled — and counting
    // then asked for the topics of the claims in `[]`, which is a request whose answer is always
    // "none", spent immediately before the real one.
    enabled: enabled && search.settled,
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
    staleTime: TOPIC_NAMES_STALE_TIME,
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
    // which is what the caller reconciles a selection against — hence `settled` tracking the counts
    // rather than the names, and named the same as the space facet's so the two read alike.
    isLoading: enabled && (counts.isLoading || names.isLoading),
    // Placeholder data is the *previous* filter's counts (`keepPreviousData` above), so a caller
    // reconciling its selection against them would prune against a menu the viewer has moved on
    // from. `use-scoped-claims` excludes it from the indexed path's settled flag for the same
    // reason, and these two flags meet in one condition.
    /** Whether there are counts to draw. See the note above these hooks. */
    settled: enabled ? !counts.isLoading && !counts.isPlaceholderData && !counts.error : false,
    /** Whether they are counts of everything. See the note above these hooks. */
    complete: enabled
      ? !counts.isLoading && !counts.isPlaceholderData && !counts.error && search.settled && !search.hasNextPage
      : false,
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
  const search = useTagSearch(tagId, filters, enabled);
  const query = useQuery({
    queryKey: taggedFacetQueryKey('spaces', tagId, filters, search.claimIds),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: relationFacetDocument,
          decoder: decodeRelationFacet,
          variables: {
            typeId: TAG_PROPERTY_ID,
            toEntityId: tagId,
            fromEntity: {
              typeIds: { in: [CLAIM_TYPE_ID] },
              ...taggedEntityFilter(tagId, filters, search.claimIds, 'spaces'),
            },
            groupBy: ['SPACE_ID'],
          },
          signal,
        })
      ),
    staleTime: TAGGED_STALE_TIME,
    // See the topic facet: a count over an unanswered search describes nothing.
    enabled: enabled && search.settled,
  });

  return {
    spaces: query.data ?? NO_FACET_COUNTS,
    isLoading: enabled && query.isLoading,
    // Placeholder data is the previous filter's counts; see the topic facet's note.
    /** Whether there are counts to draw. See the note above these hooks. */
    settled: enabled ? !query.isLoading && !query.isPlaceholderData && !query.error : false,
    /** Whether they are counts of everything. See the note above these hooks. */
    complete: enabled
      ? !query.isLoading && !query.isPlaceholderData && !query.error && search.settled && !search.hasNextPage
      : false,
    error: query.error,
  };
}
