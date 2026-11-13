import { getSpaceRank } from './space-ranking';

const UNRANKED = Number.MAX_SAFE_INTEGER;

function normalize(spaceId: string): string {
  return spaceId.replace(/-/g, '').toLowerCase();
}

export function isTrustedSpace(spaceId: string, allowed: ReadonlySet<string>): boolean {
  const normalized = normalize(spaceId);
  return allowed.has(normalized) || getSpaceRank(normalized) !== UNRANKED;
}

export function trustedSpaceSet(spaceIds: readonly string[]): ReadonlySet<string> {
  return new Set(spaceIds.map(normalize));
}

export function rankBySpace<T extends { spaces: ReadonlyArray<{ spaceId: string }> }>(
  matches: readonly T[],
  currentSpaceId?: string
): T[] {
  const current = currentSpaceId ? normalize(currentSpaceId) : null;

  const rankOf = (match: T): number => {
    if (match.spaces.length === 0) return UNRANKED;
    return Math.min(
      ...match.spaces.map(space => {
        const normalized = normalize(space.spaceId);
        return current && normalized === current ? -1 : getSpaceRank(normalized);
      })
    );
  };

  return matches
    .map((match, index) => ({ match, index, rank: rankOf(match) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(entry => entry.match);
}
