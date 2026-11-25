import { ID } from '~/core/id';

/**
 * A claim list's order by vote count, frozen once the counts are in (GEO-3876).
 *
 * `key` names the set of claims the order was made for, so a refetch of the same claims (after the
 * viewer votes, or on focus) keeps the rows where they are, and a new set of claims orders afresh.
 */
export type FrozenClaimOrder = {
  key: string;
  rankByHex: ReadonlyMap<string, number>;
};

/** One key per set of claims and leading-group size, in any seed order. */
export function claimOrderKey(seeds: readonly { id: string }[], leadingCount: number): string {
  const hexes = seeds.map(seed => ID.uuidToHex(seed.id)).sort();
  return `${leadingCount}|${hexes.join(',')}`;
}

/**
 * Orders claims by total votes (Agree + Disagree), most first. Claims with no votes come after the
 * voted ones. Ties, and the claims with no votes, keep their place in `seeds`, which is Best order.
 *
 * The first `leadingCount` seeds (the recent Debate agenda claims, GEO-3873) are ordered among
 * themselves and stay ahead of the rest.
 */
export function orderClaimsByVotes<Seed extends { id: string }>({
  seeds,
  leadingCount,
  voteTotalFor,
}: {
  seeds: readonly Seed[];
  leadingCount: number;
  /** The claim's total vote count, by hex id: the number its row shows. */
  voteTotalFor: (hex: string) => number;
}): Seed[] {
  const lead = Math.min(Math.max(leadingCount, 0), seeds.length);
  const byVotes = (group: readonly Seed[]) =>
    group
      .map((seed, index) => ({ seed, index, votes: Math.max(voteTotalFor(ID.uuidToHex(seed.id)), 0) }))
      .sort((a, b) => b.votes - a.votes || a.index - b.index)
      .map(entry => entry.seed);
  return [...byVotes(seeds.slice(0, lead)), ...byVotes(seeds.slice(lead))];
}

/** Freezes an order made by `orderClaimsByVotes` for `key`. */
export function freezeClaimOrder(key: string, ordered: readonly { id: string }[]): FrozenClaimOrder {
  const rankByHex = new Map<string, number>();
  ordered.forEach((seed, index) => {
    const hex = ID.uuidToHex(seed.id);
    if (!rankByHex.has(hex)) rankByHex.set(hex, index);
  });
  return { key, rankByHex };
}

/**
 * Lays `seeds` out in a frozen order. A claim the frozen order doesn't know (one that arrived
 * while its votes are still loading) goes after the known claims of its group, in seed order.
 */
export function applyFrozenClaimOrder<Seed extends { id: string }>({
  seeds,
  leadingCount,
  frozen,
}: {
  seeds: readonly Seed[];
  leadingCount: number;
  frozen: FrozenClaimOrder;
}): Seed[] {
  const lead = Math.min(Math.max(leadingCount, 0), seeds.length);
  const byRank = (group: readonly Seed[]) =>
    group
      .map((seed, index) => ({
        seed,
        index,
        rank: frozen.rankByHex.get(ID.uuidToHex(seed.id)) ?? Number.POSITIVE_INFINITY,
      }))
      .sort((a, b) => (a.rank === b.rank ? a.index - b.index : a.rank < b.rank ? -1 : 1))
      .map(entry => entry.seed);
  return [...byRank(seeds.slice(0, lead)), ...byRank(seeds.slice(lead))];
}
