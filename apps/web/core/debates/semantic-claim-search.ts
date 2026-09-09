'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import type { SemanticClaimSearchRequest, SemanticClaimSearchResponse } from './semantic-claim-search-contract';
import { type SemanticClaimHit, TAGGED_STALE_TIME, type TaggedClaimFilters } from './tagged-claims';

/**
 * Semantic search for the tagged claim lists — the hub's Featured and All claims, and the same two
 * sources in the debate-again picker.
 *
 * The words typed go to geo-lens (through `/api/debates/claims/semantic-search`, which holds the
 * key), which answers with the claims that *mean* them, over the same tag, spaces and topics the
 * list is drawn from. Those ids become the list's filter, and the rows come back closest-first.
 *
 * geo-lens's answer is the answer, including an empty one. This used to fall back to matching the
 * words when geo-lens named nothing, and that fallback was the source of every complaint: the
 * words are matched as substrings, so "art" listed seventy-two claims about *part*ners, *part*ies
 * and *start*ing, none about art, while geo-lens had correctly said there were none. A search that
 * finds nothing now shows nothing, and a search that fails shows the list's error state with a
 * retry, the same as the list failing. The one thing still matched by words is a deployment with
 * no geo-lens configured at all — the route answers `hits: null` — because there the words are
 * the only search there is.
 *
 * Why the answer is resolved *before* the list is asked, rather than merged after: the facets. Both
 * menus count over the same filter the rows use, and a search that changed the rows without
 * changing the counts would offer topics that lead nowhere — GEO-2653 by another route.
 */

export type SemanticSearchMode =
  /** No search, or this list is not being asked: the filters pass through untouched. */
  | 'off'
  /** geo-lens has been asked and has not answered. */
  | 'pending'
  /** geo-lens answered; the claims it named are the list, and none is an answer too. */
  | 'answered'
  /** The request failed: the list is empty and the failure is reported for the error state. */
  | 'error'
  /** No geo-lens on this deployment: the words are matched, there being nothing else. */
  | 'unconfigured';

/** The route's answer; `null` is "not configured here". */
export async function fetchSemanticClaimHits(
  request: SemanticClaimSearchRequest,
  signal?: AbortSignal
): Promise<SemanticClaimHit[] | null> {
  const response = await fetch('/api/debates/claims/semantic-search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) throw new Error(`Semantic search failed with status ${response.status}`);
  const body = (await response.json()) as SemanticClaimSearchResponse;
  return body.hits ?? null;
}

const NO_HITS: SemanticClaimHit[] = [];

/**
 * What the search box means for the list, given where geo-lens's answer stands.
 *
 * Pure, because the edges are the part that matters: an empty answer and a failure both have to
 * produce an empty list — never the words — and only the unconfigured route may fall through.
 */
export function resolveSemanticSearch(args: {
  search: string;
  enabled: boolean;
  status: 'pending' | 'error' | 'success';
  hits: SemanticClaimHit[] | null | undefined;
}): { mode: SemanticSearchMode; hits: SemanticClaimHit[] | null } {
  if (!args.enabled || args.search === '') return { mode: 'off', hits: null };
  if (args.status === 'pending') return { mode: 'pending', hits: null };
  if (args.status === 'error') return { mode: 'error', hits: NO_HITS };
  if (args.hits === null || args.hits === undefined) return { mode: 'unconfigured', hits: null };
  return { mode: 'answered', hits: args.hits };
}

/**
 * Alongside the tagged keys, and for the same reason: these come from geo-lens by way of our own
 * route, not from geo-chat, so the gateway's reconnect refetch has no business touching them.
 */
export const semanticSearchQueryKey = (tagId: string, filters: TaggedClaimFilters) =>
  ['tagged-claims', 'semantic', tagId, filters.search, filters.topicIds, filters.eligibleSpaceIds] as const;

export type SemanticTaggedFilters = {
  /** The filters to hand the tagged hooks, with the search resolved. */
  filters: TaggedClaimFilters;
  /** geo-lens is being asked; the filters are the previous answer's until it answers. */
  pending: boolean;
  /** The failed request, for the list's error state. `null` otherwise. */
  error: unknown;
  /** Ask geo-lens again after a failure; a no-op when nothing failed. */
  refetch: () => Promise<unknown>;
  mode: SemanticSearchMode;
};

/**
 * The filters to hand the tagged hooks, with the search resolved.
 *
 * While geo-lens is being asked, the filters last *resolved* are returned instead — so the rows on
 * screen stay what they were, exactly as the debounce leaves them today, rather than blanking for a
 * round trip. `pending` says so, for the counts: the menus describe the previous search until the
 * new one lands, which is the window `countsPending` already covers for every other filter.
 *
 * The picked spaces are deliberately not part of the request. They narrow the rows and the topic
 * menu on the graph side, where `taggedEntityFilter` applies them; the space menu must not be
 * narrowed by its own selection, and it could not un-narrow an answer that was already cut.
 */
export function useSemanticTaggedFilters(
  tagId: string,
  filters: TaggedClaimFilters,
  enabled: boolean
): SemanticTaggedFilters {
  const active = enabled && filters.search !== '';
  const query = useQuery({
    queryKey: semanticSearchQueryKey(tagId, filters),
    queryFn: ({ signal }) =>
      fetchSemanticClaimHits(
        { query: filters.search, tagId, spaceIds: filters.eligibleSpaceIds, topicIds: filters.topicIds },
        signal
      ),
    enabled: active,
    // The tag's own answer stays fresh this long; a search over it has no reason to differ.
    staleTime: TAGGED_STALE_TIME,
    // A failure is shown, with a retry, rather than waited out: react-query's backoff would hold
    // the list on the previous search for seconds with nothing on screen to say why.
    retry: false,
  });

  const { mode, hits } = resolveSemanticSearch({
    search: filters.search,
    enabled,
    status: query.status,
    hits: query.data,
  });

  const resolved = React.useMemo<TaggedClaimFilters | null>(() => {
    if (mode === 'pending') return null;
    return { ...filters, semanticHits: hits };
  }, [filters, hits, mode]);

  // The last answer, for the window in which there is no current one. Before there is any, the
  // list as it stands with nothing typed: mounting with words already in the box shows the tag
  // until geo-lens answers, rather than matching the words once and swapping. Kept by value, not
  // identity: a caller re-rendering with an equal but fresh filters object would otherwise re-set
  // the held copy on every render and re-render on every set.
  const [held, setHeld] = React.useState<TaggedClaimFilters>(() => ({ ...filters, search: '', semanticHits: null }));
  React.useEffect(() => {
    if (resolved) setHeld(current => (sameTaggedFilters(current, resolved) ? current : resolved));
  }, [resolved]);

  return {
    filters: resolved ?? held,
    pending: mode === 'pending',
    error: mode === 'error' ? (query.error ?? new Error('Semantic search failed')) : null,
    refetch: query.refetch,
    mode,
  };
}

function sameIds(a: readonly string[] | null | undefined, b: readonly string[] | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
}

/** Equal by what the tagged hooks read, which is also what their query keys are built from. */
export function sameTaggedFilters(a: TaggedClaimFilters, b: TaggedClaimFilters): boolean {
  return (
    a.search === b.search &&
    sameIds(a.topicIds, b.topicIds) &&
    sameIds(a.spaceIds, b.spaceIds) &&
    sameIds(a.eligibleSpaceIds, b.eligibleSpaceIds) &&
    sameIds(a.semanticHits?.map(hit => hit.id) ?? null, b.semanticHits?.map(hit => hit.id) ?? null)
  );
}
