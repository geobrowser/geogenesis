import { Position } from '@geoprotocol/geo-sdk/lite';

import { normId } from '~/core/utils/norm-id';

/**
 * Who ranked what on a ranking block, worked out from the ballots themselves (GEO-3686).
 *
 * The web can't read the indexer's `ranks.*` tables, and the RANK_POSITION relations it projects
 * carry only an order and a rounded score. So this re-derives, from the graph, the same set of
 * ballots the indexer counts, using the same rules in the same order
 * (`ranking-indexer/src/recompute.rs`):
 *
 * 1. **Latest ballot per person** (`dedup.rs`): one ballot per (block, personal space). The
 *    superseded ones don't count, even when the latest one is empty.
 * 2. **Members and editors only** (`eligibility.rs`): the author's personal space must be a member
 *    or an editor of the block's space.
 *
 * A debate's ranker count is then the number of those ballots that hold it, keyed by entity alone
 * (the average-mode scoring the Best debates block uses keys scores by entity, not by space).
 *
 * Everything here is pure; the reads live in `fetch-block-rankers.ts` and the hook in
 * `use-block-rankers.ts`.
 */

/** One Rank entity submitted to the block, without its items. */
export type RankBallotHead = {
  rankEntityId: string;
  /** The personal space the ballot was published in: its author. */
  authorSpaceId: string;
  /** When the ballot's entity was created, in ms. */
  createdAtMs: number;
  /** When the entity last changed, in ms; only a tie-break (see `compareBallotRecency`). */
  updatedAtMs: number;
};

/** One RANK_VOTES relation on a ballot: an entity the author placed. */
export type RankBallotItem = {
  entityId: string;
  /** Fractional-index position of the vote; null sorts last. */
  position: string | null;
};

export type RankBallot = RankBallotHead & { items: RankBallotItem[] };

/** A person whose counting ballot holds a given entity, and where they placed it. */
export type BlockRankerPlacement = {
  /** The ranker's personal space id, normalized (lowercase hex, no dashes). */
  spaceId: string;
  rankEntityId: string;
  /** 1-based place on the ranker's ballot. */
  place: number;
  /** How many entities that ballot holds. */
  ballotSize: number;
};

export type BlockRankersSummary = {
  /** Normalized entity id -> rankers whose counting ballot holds it, best place first. */
  rankersByEntityId: Map<string, BlockRankerPlacement[]>;
  /** The ballots that count, one per person, in author order. */
  countingBallots: Array<{ rankEntityId: string; spaceId: string; ballotSize: number }>;
};

/**
 * Positive when `a` is the later ballot.
 *
 * The indexer orders by `(updated_at_block, update_index)` of the edits that wrote the ballot's
 * votes. The graph's `updatedAt` is not that: it moves whenever anything touches the entity,
 * including the indexer's own `Aggregated rankings` provenance relation pointing at it, so it can
 * make a superseded ballot look newest. Creation order is what the two agree on in practice: the
 * web edits a ballot in place until it mints a new one, and never edits the older one again.
 * `updatedAt` and the entity id only break exact ties, so the choice is deterministic.
 *
 * Times, not block numbers: testnet's block numbers restarted at a chain reset, so on live data a
 * ballot from August carries a higher `createdAtBlock` than one from November.
 */
export function compareBallotRecency(a: RankBallotHead, b: RankBallotHead): number {
  return (
    a.createdAtMs - b.createdAtMs ||
    a.updatedAtMs - b.updatedAtMs ||
    normId(a.rankEntityId).localeCompare(normId(b.rankEntityId))
  );
}

/**
 * The ballots that count toward the block: the latest per author, then only authors in
 * `eligibleSpaceIds` (the block space's members and editors). Dedup runs first, as in the indexer,
 * so a non-counting newer ballot can never let an older one through.
 */
export function selectCountingBallots<T extends RankBallotHead>(
  ballots: readonly T[],
  eligibleSpaceIds: ReadonlySet<string> | readonly string[]
): T[] {
  const eligible = new Set([...eligibleSpaceIds].map(normId));

  const latestByAuthor = new Map<string, T>();
  for (const ballot of ballots) {
    const author = normId(ballot.authorSpaceId);
    const existing = latestByAuthor.get(author);
    if (!existing || compareBallotRecency(ballot, existing) > 0) latestByAuthor.set(author, ballot);
  }

  return [...latestByAuthor.entries()]
    .filter(([author]) => eligible.has(author))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, ballot]) => ballot);
}

/** A ballot's distinct entity ids in ballot order (the first vote for an entity wins). */
export function orderedBallotEntityIds(items: readonly RankBallotItem[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const sorted = [...items].sort((a, b) => Position.compare(a.position ?? null, b.position ?? null));
  for (const item of sorted) {
    const id = normId(item.entityId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return ordered;
}

/**
 * For every entity on a counting ballot, who placed it and where. `ballots` is every ballot
 * submitted to the block (any author, any age); this applies the indexer's dedup and eligibility
 * itself.
 */
export function summarizeBlockRankers(
  ballots: readonly RankBallot[],
  eligibleSpaceIds: ReadonlySet<string> | readonly string[]
): BlockRankersSummary {
  const rankersByEntityId = new Map<string, BlockRankerPlacement[]>();
  const countingBallots: BlockRankersSummary['countingBallots'] = [];

  for (const ballot of selectCountingBallots(ballots, eligibleSpaceIds)) {
    const spaceId = normId(ballot.authorSpaceId);
    const entityIds = orderedBallotEntityIds(ballot.items);
    countingBallots.push({ rankEntityId: ballot.rankEntityId, spaceId, ballotSize: entityIds.length });

    entityIds.forEach((entityId, index) => {
      const placement: BlockRankerPlacement = {
        spaceId,
        rankEntityId: ballot.rankEntityId,
        place: index + 1,
        ballotSize: entityIds.length,
      };
      const existing = rankersByEntityId.get(entityId);
      if (existing) existing.push(placement);
      else rankersByEntityId.set(entityId, [placement]);
    });
  }

  for (const placements of rankersByEntityId.values()) {
    placements.sort((a, b) => a.place - b.place || a.spaceId.localeCompare(b.spaceId));
  }

  return { rankersByEntityId, countingBallots };
}
