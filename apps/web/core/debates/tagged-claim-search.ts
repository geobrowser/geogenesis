'use client';

import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Duration, Effect } from 'effect';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { getResultsPage } from '~/core/io/queries';
import { capSearchQuery } from '~/core/io/search-query';

/**
 * How many rows one `/search` request returns. The endpoint caps a page at 100 however large a
 * `limit` is asked for — measured, not documented: `limit=200` against the Debate tag returned 100
 * of 2189 — so asking for exactly that is asking for as much as there is.
 */
export const CLAIM_SEARCH_PAGE_SIZE = 100;

/** Stable empty lists, so a disabled or unasked search is not a new array each render. */
const NO_SEARCH_IDS: string[] = [];
const NO_SEARCH_ID_PAGES: string[][] = [];

export type TaggedClaimSearch = {
  /**
   * The matching claim ids, most relevant first, accumulated across the pages fetched so far.
   *
   * `null` means no search is being asked — not "a search that matched nothing". The two decide
   * opposite things: nothing asked leaves the list alone, nothing matched empties it.
   */
  claimIds: string[] | null;
  /**
   * The same ids, still grouped by the request that returned them.
   *
   * The list hydrates a page at a time and orders each by relevance; the flat list above is for
   * the filter and the facets, which only care which claims matched. Grouped rather than flattened
   * and re-chunked, because a page boundary is where the endpoint's ranking was actually cut.
   */
  idPages: string[][];
  /**
   * Whether `claimIds` is an answer yet.
   *
   * Not the inverse of `isLoading`: a query that is pending but has not started fetching reports
   * neither, and a caller that read that as settled narrowed by an empty id list — asking the
   * server for the claims in `[]`, which answers nothing, a request before the real one.
   *
   * `true` when nothing is being searched for, because then there is nothing to wait for.
   */
  settled: boolean;
  isLoading: boolean;
  error: unknown;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  /** Ask again, for the retry behind an error state. */
  refetch: () => void;
};

const noFetch = () => {};

/**
 * Text search over a tag's claims, through the app's own `/search` endpoint (GEO-2898).
 *
 * Returns ids rather than rows, because the rows are the tagged-claims query's business and it
 * already builds them: `useTaggedClaims` feeds these ids back into its own filter, so the list, the
 * topic facet and the space facet all narrow to the search's answer without any of them learning
 * what a search is. That is also what keeps topics and spaces composing with search — they stay
 * server-side, on the same filter, over a narrowed set.
 *
 * The alternative, filtering the search page in the client, was the obvious shape and is worse: the
 * facets would have to be rebuilt from whatever rows came back, and a topic count would describe
 * the page rather than the tag.
 *
 * Replaces a word-at-a-time `name: { includesInsensitive }` filter on the graph (#2351), which had
 * no stemming, no synonyms and no relevance — it ordered by `rankingScore`, which describes the
 * claim rather than the search. `/search` could not do this until GEO-2876 added `tag_ids`: the
 * tagged set is a few hundred claims inside a corpus of hundreds of thousands, so an untagged
 * ranked page was all corpus and no tagged claim — "trump" returned five entities named "Trump",
 * where the tagged request returns five claims about him.
 */
export function useTaggedClaimSearch({
  tagId,
  search,
  enabled = true,
}: {
  tagId: string;
  /** Debounced by the caller, as the tagged-claims filters are. */
  search: string;
  enabled?: boolean;
}): TaggedClaimSearch {
  // Capped where the request is built too, but read here as well so the key cannot mint a new
  // entry for a query that produces a byte-identical request.
  const query = capSearchQuery(search.trim());
  const searching = enabled && query !== '';

  const searchQuery = useInfiniteQuery({
    queryKey: ['tagged-claims', 'search', tagId, query],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      Effect.runPromise(
        getResultsPage(
          {
            query,
            limit: CLAIM_SEARCH_PAGE_SIZE,
            offset: pageParam,
            typeIds: [CLAIM_TYPE_ID],
            tagIds: [tagId],
            // Deliberately unscoped by space, which took measuring to be sure of. `/search` has no
            // param that narrows to a *set* of spaces: `additional_space_ids` widens the canonical
            // scope rather than restricting it — the same query returns 81 matches with and without
            // it — and `scope=SPACE_SINGLE` takes one space, which for the debates allowlist would
            // be a request per space per keystroke. Passing the allowlist anyway would have implied
            // a guarantee it does not give, and put it in this key for nothing.
            //
            // It is also not needed: the default scope already includes non-canonical spaces (2186
            // tagged claims against 2172 with `include_non_canonical=false`), so a claim tagged in
            // one is findable here. The space gate stays where GEO-2789 put it and where the space
            // facet is counted — on the tag relation, in the graph filter these ids narrow.
            //
            // The cost is that a page is filled before that gate applies, so a viewer narrowed to
            // one space sees fewer than a page of their own matches at a time. Paging reaches the
            // rest, and the alternative was a request per space.
          },
          signal
        )
      ),
    /**
     * The next offset is how many rows have actually been read, not the last one plus a page.
     *
     * `useSearch` does the latter against the same endpoint, and this deliberately does not follow
     * it: that arithmetic assumes every page before the last is full, and a short page would carry
     * the offset past the rows it did not return. Full pages are the norm here — the endpoint caps
     * at 100 and answers 100 — so the two agree in practice, which is exactly when a latent
     * row-skip is worth not copying.
     *
     * `serverCount` rather than `rawCount`: it is the page's length before this layer's own
     * block-and-system-type filtering, which is what says whether the endpoint had more to give.
     */
    getNextPageParam: (lastPage, pages) => {
      const read = pages.reduce((count, page) => count + page.serverCount, 0);
      return lastPage.serverCount > 0 && read < lastPage.total ? read : undefined;
    },
    // Narrowing a list should narrow it rather than blank it and fill it in again — the same reason
    // the tagged-claims query holds its previous page.
    placeholderData: keepPreviousData,
    // Search results are not cached for long, as `useSearch` explains about the same endpoint: a
    // stale page revalidating behind the viewer is layout shift and results that do not match what
    // they typed. The tag's own rows keep their longer `TAGGED_STALE_TIME`, because curation moves
    // at human speed and text relevance does not.
    gcTime: Duration.toMillis(Duration.seconds(15)),
    enabled: searching,
  });

  const idPages = React.useMemo(() => {
    if (!searching) return NO_SEARCH_ID_PAGES;
    const pages = searchQuery.data?.pages;
    if (!pages) return NO_SEARCH_ID_PAGES;
    // One entry per entity, in the order the endpoint ranked them. Rows are grouped per entity
    // within a page, but the endpoint pages over *per-space* rows — so a claim tagged in two spaces
    // can close one page and open the next, and arrive twice across them. Deduplicated across every
    // page rather than within one, or the second copy would be hydrated and drawn twice.
    const seen = new Set<string>();
    return pages.map(page => {
      const ids: string[] = [];
      for (const result of page.results) {
        if (seen.has(result.id)) continue;
        seen.add(result.id);
        ids.push(result.id);
      }
      return ids;
    });
  }, [searching, searchQuery.data?.pages]);

  const claimIds = React.useMemo(() => {
    if (!searching) return null;
    return idPages.length === 0 ? NO_SEARCH_IDS : idPages.flat();
  }, [searching, idPages]);

  // Stable, so a caller can memoize a retry around it. A fresh closure per render is the identity
  // churn `claims-tab` documents about `combine`, and a `useCallback` that closed over one would
  // have been no better than none.
  const { refetch } = searchQuery;
  const refetchSearch = React.useCallback(() => {
    if (!searching) return;
    void refetch();
  }, [refetch, searching]);

  return {
    claimIds,
    idPages,
    settled: !searching || searchQuery.isFetched,
    // `enabled: false` leaves react-query pending, and a caller waiting on this would read that as
    // "still looking" and never show its empty state.
    isLoading: searching && searchQuery.isLoading,
    error: searching ? searchQuery.error : null,
    hasNextPage: searching && searchQuery.hasNextPage,
    fetchNextPage: searching ? () => void searchQuery.fetchNextPage() : noFetch,
    isFetchingNextPage: searching && searchQuery.isFetchingNextPage,
    refetch: refetchSearch,
  };
}
