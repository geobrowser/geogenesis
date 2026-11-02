import { type UseQueryResult, useQueries } from '@tanstack/react-query';

import * as React from 'react';

import { uuidToHex } from '~/core/id/normalize';
import { type EntityScores, entityScoresQueryKey, fetchEntityScores } from '~/core/profile/use-entity-scores';

/**
 * What the Matches sorts need about each claim that geo-chat's match rows do not carry (GEO-3463):
 * the ranking score Explore orders by ("Best") and when the claim was created ("Newest").
 *
 * Read with the profile's score lookup (`useEntityScores`'s request and cache entries), but not
 * through that hook: it asks once for a whole list it holds, keyed on all of it, so a list that
 * grows a page at a time would ask about every claim again on each page. Here each page-sized run of
 * ids is its own entry, the way `useClaimEntitiesByIds` batches.
 */
export type ClaimOrderFacts = { rankingScore: number | null; createdAtMs: number | null };

const NO_FACTS = new Map<string, ClaimOrderFacts>();

/** No score and no creation time: what a claim the graph has nothing on is ordered by. */
const UNKNOWN_FACTS: ClaimOrderFacts = { rankingScore: null, createdAtMs: null };

/** The size of geo-chat's claim pages, so a list that pages asks once per page. */
export const CLAIM_ORDER_FACTS_CHUNK = 20;

function factsFrom(found: EntityScores, id: string): ClaimOrderFacts {
  const rankingScore = found.rankings.get(id) ?? null;
  const createdAtMs = found.createdAt.get(id) ?? null;
  return rankingScore === null && createdAtMs === null ? UNKNOWN_FACTS : { rankingScore, createdAtMs };
}

/**
 * Order facts for the claims in hand, keyed dashless. Every id asked about gets an entry once its
 * request lands, `UNKNOWN_FACTS` for one the graph has nothing on, so `facts.has(id)` says whether
 * a claim can be placed in a sorted list yet.
 *
 * Asked in runs of {@link CLAIM_ORDER_FACTS_CHUNK} in the order the ids arrive, so a list that grows
 * a page at a time asks about the new page rather than about every claim again.
 *
 * `failed` once a run has no answer to give (its request failed and nothing is cached for it). Its
 * claims could go anywhere in a sorted list, so rather than leave them at the end under a Sort that
 * says otherwise, the caller drops back to the source's order for the list until it is answered.
 */
export function useClaimOrderFacts(claimEntityIds: string[], enabled = true) {
  // By content rather than by array: the merge below is rebuilt with the runs, and the sorted lists
  // memo on what it hands back, so a fresh array of the same ids must not re-sort them.
  const signature = [...new Set(claimEntityIds.map(uuidToHex))].join(',');
  const chunks = React.useMemo(() => {
    const ids = signature ? signature.split(',') : [];
    const runs: string[][] = [];
    for (let start = 0; start < ids.length; start += CLAIM_ORDER_FACTS_CHUNK) {
      runs.push(ids.slice(start, start + CLAIM_ORDER_FACTS_CHUNK).sort());
    }
    return runs;
  }, [signature]);

  // The last run grows as rows arrive, which changes its key. Its claims already listed keep the
  // answer they had while the new key is asked, or they fell back to arrival order and jumped back.
  const lastFacts = React.useRef<ReadonlyMap<string, ClaimOrderFacts>>(NO_FACTS);
  const combine = React.useCallback(
    (results: UseQueryResult<EntityScores>[]) => {
      const facts = new Map<string, ClaimOrderFacts>();
      results.forEach((result, index) => {
        const ids = chunks[index] ?? [];
        if (result.data) {
          for (const id of ids) facts.set(id, factsFrom(result.data, id));
        } else if (!result.isError) {
          for (const id of ids) {
            const held = lastFacts.current.get(id);
            if (held) facts.set(id, held);
          }
        }
      });
      return {
        facts: facts.size > 0 ? facts : NO_FACTS,
        isLoading: results.some(result => result.isLoading),
        failed: results.some(result => result.isError && result.data === undefined),
      };
    },
    [chunks]
  );
  const result = useQueries({
    queries: chunks.map(ids => ({
      queryKey: entityScoresQueryKey(ids),
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchEntityScores(ids, signal),
      enabled,
      staleTime: 5 * 60_000,
    })),
    combine,
  });
  React.useEffect(() => {
    lastFacts.current = result.facts;
  }, [result.facts]);
  return result;
}

/**
 * Explore's "Best" order applied to a list in hand: ranking score descending, unscored last, ties
 * kept in the order they arrived — the same rule `entities_ranked_for_feed` orders Explore by.
 */
export function compareByRanking(left: ClaimOrderFacts | undefined, right: ClaimOrderFacts | undefined) {
  const l = left?.rankingScore ?? null;
  const r = right?.rankingScore ?? null;
  if (l === r) return 0;
  if (l === null) return 1;
  if (r === null) return -1;
  return r - l;
}

/** Newest first, claims with no known creation time last. */
export function compareByNewest(left: ClaimOrderFacts | undefined, right: ClaimOrderFacts | undefined) {
  const l = left?.createdAtMs ?? null;
  const r = right?.createdAtMs ?? null;
  if (l === r) return 0;
  if (l === null) return 1;
  if (r === null) return -1;
  return r - l;
}
