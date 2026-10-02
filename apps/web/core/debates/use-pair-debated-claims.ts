'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { fetchPairDebatedClaims, pairDebatedClaimsQueryKey } from '~/core/io/subgraph/fetch-pair-debated-claims';
import { normId } from '~/core/utils/norm-id';

/**
 * Claims this browser has seen a pair debate, keyed by pair.
 *
 * The graph is the record of who debated what (see `fetchPairDebatedClaims`), but a debate reaches
 * it only once it is published, about half an hour after it ends. A pair runs through several
 * debates in that time (GEO-3120: eight in 81 minutes), so without this the claim from two debates
 * ago came back in the lobby as new.
 *
 * Plain `localStorage` behind try/catch, for the reason `watched-debates` gives: a module-level
 * jotai storage atom runs on import and breaks every jsdom suite that imports the picker.
 */
const STORAGE_KEY = 'geogenesis.debates.pair-debated-claims.v1';

/** Long past the publish lag. By then the graph has it and the local copy is only weight. */
const REMEMBER_MS = 7 * 24 * 60 * 60 * 1000;

type StoredClaim = { claimId: string; at: number };
type Stored = Record<string, StoredClaim[]>;

function pairKey(spaceIdA: string, spaceIdB: string) {
  return [normId(spaceIdA), normId(spaceIdB)].sort().join(':');
}

function readStored(): Stored {
  if (typeof window === 'undefined') return {};
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Stored) : {};
  } catch {
    return {};
  }
}

export function readLocallyDebatedClaimIds(spaceIdA: string, spaceIdB: string, now = Date.now()): string[] {
  const entries = readStored()[pairKey(spaceIdA, spaceIdB)];
  if (!Array.isArray(entries)) return [];
  return entries
    .filter(entry => typeof entry?.claimId === 'string' && typeof entry.at === 'number' && now - entry.at < REMEMBER_MS)
    .map(entry => normId(entry.claimId));
}

export function recordPairDebatedClaim(spaceIdA: string, spaceIdB: string, claimId: string, now = Date.now()): void {
  if (typeof window === 'undefined') return;
  const key = pairKey(spaceIdA, spaceIdB);
  const id = normId(claimId);
  try {
    const stored = readStored();
    // Expired entries go on every write, across every pair, so the record cannot grow without bound.
    const next: Stored = {};
    for (const [existingKey, entries] of Object.entries(stored)) {
      if (!Array.isArray(entries)) continue;
      const kept = entries.filter(
        entry =>
          typeof entry?.at === 'number' &&
          now - entry.at < REMEMBER_MS &&
          !(existingKey === key && entry.claimId === id)
      );
      if (kept.length > 0) next[existingKey] = kept;
    }
    next[key] = [...(next[key] ?? []), { claimId: id, at: now }];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the graph still catches up once the debate is published.
  }
}

export type PairDebatedClaims = {
  /** Canonical (bare hex) claim ids. */
  claimIds: ReadonlySet<string>;
  /** Only the graph lookup. The local record and the source claim are known on the first render. */
  isLoading: boolean;
};

/**
 * Every claim the two participants have debated against each other, on any day (GEO-3120).
 *
 * Three sources, unioned:
 * - the published debates in the graph, for anything older than the publish lag;
 * - this browser's record, for the debates inside it;
 * - `sourceClaimId`, the debate that opened this lobby, which is also written to the record so the
 *   *next* lobby knows about it before the graph does.
 *
 * Scoped to the pair, not to either person. A claim one of them argued with somebody else is still
 * a new debate for this pair.
 *
 * A failed graph lookup reads as "nothing published", not as an error. The picker works without it,
 * and an outage here should cost the marking, not the lobby.
 */
export function usePairDebatedClaims({
  viewerSpaceId,
  opponentSpaceId,
  sourceClaimId,
}: {
  viewerSpaceId: string | null;
  opponentSpaceId: string | null;
  sourceClaimId: string | null;
}): PairDebatedClaims {
  const enabled = viewerSpaceId !== null && opponentSpaceId !== null;

  const query = useQuery({
    queryKey: enabled ? pairDebatedClaimsQueryKey(viewerSpaceId, opponentSpaceId) : ['pair-debated-claims', 'none'],
    queryFn: () => fetchPairDebatedClaims(viewerSpaceId!, opponentSpaceId!),
    enabled,
    staleTime: 60_000,
    retry: 1,
  });

  React.useEffect(() => {
    if (enabled && sourceClaimId) recordPairDebatedClaim(viewerSpaceId, opponentSpaceId, sourceClaimId);
  }, [enabled, opponentSpaceId, sourceClaimId, viewerSpaceId]);

  // Read again whenever the source claim changes, not only the pair. The picker is reused across
  // rematch sessions (a debate room keeps it mounted from one debate to the next), so the same pair
  // arrives with a new source claim, and the previous one was written by the effect above after
  // the last read. The current source claim is added directly below.
  const locallyDebated = React.useMemo(
    () => (enabled ? readLocallyDebatedClaimIds(viewerSpaceId, opponentSpaceId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sourceClaimId` is the re-read trigger
    [enabled, opponentSpaceId, viewerSpaceId, sourceClaimId]
  );

  const claimIds = React.useMemo(() => {
    const ids = new Set<string>(locallyDebated);
    for (const id of query.data ?? []) ids.add(id);
    if (sourceClaimId) ids.add(normId(sourceClaimId));
    return ids;
  }, [locallyDebated, query.data, sourceClaimId]);

  return { claimIds, isLoading: enabled && query.isLoading };
}
