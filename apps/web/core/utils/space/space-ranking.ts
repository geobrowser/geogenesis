// Mirrors ROOT_SPACE in ~/core/constants; kept local so this module stays
// free of imports (it is pulled into partially-mocked test environments).
const ROOT_SPACE = 'a19c345ab9866679b001d7d2138d88a1';

// Hard-coded space rankings. Replace SPACE_RANK with a dynamic source
// when true ranking is implemented.

const SPACE_RANK: Record<string, number> = {
  [ROOT_SPACE]: 0, // Root
  '784bfddae3f3976118c561bf28195b44': 1, // Geo Education
  c9f267dcb0d270718c2a3c45a64afd32: 2, // Crypto
  '41e851610e13a19441c4d980f2f2ce6b': 3, // AI
  '52c7ae149838b6d47ce0f3b2a5974546': 4, // Health
  '9b611b848b12491b9b6b43f3cf019b8b': 5, // Software
  '870e3b3068661e6280fad2ab456829bc': 6, // Technology
  d69608290513c2a91102c939b3265bd7: 7, // Industries
  b5a31f8182b042437ede0f84ee02f104: 8, // Podcasts
  '89bd89bf28ff8a0963faf92a8c905e20': 9, // World Affairs
};

const UNRANKED = Number.MAX_SAFE_INTEGER;

export function getSpaceRank(spaceId: string): number {
  return SPACE_RANK[spaceId] ?? UNRANKED;
}

/**
 * Scopes space-attributed schema data (e.g. a property's relation value type
 * relations) to a viewing space. The space's own entries win; otherwise only
 * entries from the Root space apply, since Root holds the canonical schema.
 * Entries defined in any other space never apply outside it (GEO-2168).
 */
export function scopeBySpacePrecedence<T extends { spaceId: string }>(items: T[], spaceId?: string): T[] {
  if (!spaceId || items.length === 0) return items;

  const inSpace = items.filter(item => item.spaceId === spaceId);
  if (inSpace.length > 0) return inSpace;

  return items.filter(item => item.spaceId === ROOT_SPACE);
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
