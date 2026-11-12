import { Position } from '@geoprotocol/geo-sdk/lite';

import { normId } from '~/core/utils/norm-id';

import { type BallotRecencyKey, compareBallotRecency } from './ranking-ballot-recency';

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
 *    Which ballot is latest follows the shared rule in `ranking-ballot-recency.ts`.
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
  /** When the ballot's entity was created, in ms; 0 when unknown (then `updatedAtMs` stands in). */
  createdAtMs: number;
  /** When the entity last changed, in ms; a fallback and tie-break (`ranking-ballot-recency.ts`). */
  updatedAtMs: number;
};

/** One RANK_VOTES relation on a ballot: an entity the author placed. */
export type RankBallotItem = {
  entityId: string;
  /**
   * The vote's `to_space`: the space of the entity it ranks. The indexer drops a vote without one
   * (`detect.rs`: "RANK_VOTES relation missing to_space; skipping item"), and so does this.
   */
  toSpaceId: string | null;
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

/** A ballot head as the shared recency rule's key (`ranking-ballot-recency.ts`). */
export function ballotHeadRecencyKey(head: RankBallotHead): BallotRecencyKey {
  return { id: head.rankEntityId, createdAtMs: head.createdAtMs, updatedAtMs: head.updatedAtMs };
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
    if (!existing || compareBallotRecency(ballotHeadRecencyKey(ballot), ballotHeadRecencyKey(existing)) > 0)
      latestByAuthor.set(author, ballot);
  }

  return [...latestByAuthor.entries()]
    .filter(([author]) => eligible.has(author))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, ballot]) => ballot);
}

/**
 * A ballot's distinct entity ids in ballot order (the first vote for an entity wins), without the
 * votes the indexer skips for having no `to_space`.
 */
export function orderedBallotEntityIds(items: readonly RankBallotItem[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const sorted = [...items].sort((a, b) => Position.compare(a.position ?? null, b.position ?? null));
  for (const item of sorted) {
    if (!item.toSpaceId) continue;
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
