// Hard-coded space rankings. Replace SPACE_RANK with a dynamic source
// when true ranking is implemented.

const SPACE_RANK: Record<string, number> = {
  a19c345ab9866679b001d7d2138d88a1: 0, // Root
  '720eb279c64d56735dccd17a2a416ba2': 1, // Geo Education
  c9f267dcb0d270718c2a3c45a64afd32: 2, // Crypto
  '41e851610e13a19441c4d980f2f2ce6b': 3, // AI
  '52c7ae149838b6d47ce0f3b2a5974546': 4, // Health
};

const UNRANKED = Number.MAX_SAFE_INTEGER;

export function getSpaceRank(spaceId: string): number {
  return SPACE_RANK[spaceId] ?? UNRANKED;
}

export function getTopRankedSpaceId(spaceIds: string[]): string | null {
  if (spaceIds.length === 0) return null;

  let best = spaceIds[0];
  let bestRank = getSpaceRank(best);

  for (let i = 1; i < spaceIds.length; i++) {
    const rank = getSpaceRank(spaceIds[i]);
    if (rank < bestRank) {
      best = spaceIds[i];
      bestRank = rank;
    }
  }

  return best;
}

export function sortSpaceIdsByRank(spaceIds: string[]): string[] {
  return [...spaceIds].sort((a, b) => getSpaceRank(a) - getSpaceRank(b));
}

export function compareBySpaceRank<T>(getSpaceId: (item: T) => string) {
  return (a: T, b: T) => getSpaceRank(getSpaceId(a)) - getSpaceRank(getSpaceId(b));
}
