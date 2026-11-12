import { normId } from '~/core/utils/norm-id';

import { parseTimestampMs } from './ranking-rolling';

/**
 * The one rule for "which of a person's ballots on a block is the current one" (GEO-3686).
 *
 * Every surface that answers it uses this: the compose screen's "my ranking"
 * (`pickMostRecentlyCreatedRankingEntity`), `dedupeSubmissionsByAuthor`, and the ranker counts
 * (`block-rankers.ts`). Before, the three broke ties differently, so one screen could show one
 * ballot as yours while counting another.
 *
 * The order is:
 * 1. **Creation time.** Re-ranking after a rolling window mints a new Rank entity. Edits inside
 *    the window update the entity in place, which moves `updatedAt` but not `createdAt`.
 *    `updatedAt` stands in when an older entity was indexed without a `createdAt`.
 * 2. **Last update**, for two ballots created in the same second.
 * 3. **Entity id**, so the answer never depends on list order.
 *
 * The indexer orders by the block of the edit that wrote the ballot's votes. The graph's
 * `updatedAt` can't stand in for that as the main key: it also moves when the indexer rewrites
 * its own `Aggregated rankings` link to a ballot. Block numbers can't either: testnet's restarted
 * at a chain reset, so an August ballot carries a higher `createdAtBlock` than a November one.
 */
export type BallotRecencyKey = {
  id: string;
  /** Creation time in ms; 0 when unknown. */
  createdAtMs: number;
  /** Last update in ms; 0 when unknown. */
  updatedAtMs: number;
};

export { parseTimestampMs };

export function ballotRecencyKey(
  id: string,
  createdAt: string | number | null | undefined,
  updatedAt: string | number | null | undefined
): BallotRecencyKey {
  return { id, createdAtMs: parseTimestampMs(createdAt), updatedAtMs: parseTimestampMs(updatedAt) };
}

/** Positive when `a` is the later ballot; never 0 for two different ids. */
export function compareBallotRecency(a: BallotRecencyKey, b: BallotRecencyKey): number {
  return (
    (a.createdAtMs || a.updatedAtMs) - (b.createdAtMs || b.updatedAtMs) ||
    a.updatedAtMs - b.updatedAtMs ||
    normId(a.id).localeCompare(normId(b.id))
  );
}

/** The latest of `items` by `compareBallotRecency`; null for an empty list. */
export function pickLatestBallot<T>(items: readonly T[], keyOf: (item: T) => BallotRecencyKey): T | null {
  let latest: T | null = null;
  let latestKey: BallotRecencyKey | null = null;
  for (const item of items) {
    const key = keyOf(item);
    if (!latestKey || compareBallotRecency(key, latestKey) > 0) {
      latest = item;
      latestKey = key;
    }
  }
  return latest;
}
