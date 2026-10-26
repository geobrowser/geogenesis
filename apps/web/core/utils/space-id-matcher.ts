import { normId } from '~/core/utils/norm-id';

/**
 * A membership test over a hand-kept list of space ids, for the hard-coded exclusion lists that
 * keep particular accounts off a surface (see `curator-leaderboard-exclusions`,
 * `people-tab-exclusions`).
 *
 * Ids are normalized on both sides, so a hyphenated UUID and the bare hex form of the same space
 * match whichever way the list or the caller spells it. A missing id matches nothing.
 */
export function spaceIdMatcher(spaceIds: readonly string[]): (spaceId: string | null | undefined) => boolean {
  const normalized = new Set(spaceIds.map(normId));
  return spaceId => !!spaceId && normalized.has(normId(spaceId));
}
