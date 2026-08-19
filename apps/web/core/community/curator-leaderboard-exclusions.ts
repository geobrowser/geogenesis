import { ID } from '~/core/id';

/**
 * Personal spaces kept off the curator leaderboard.
 *
 * A hard-coded list by design: these are accounts whose activity is real but isn't the community
 * contribution the board is meant to celebrate — team, bot and test accounts that would otherwise
 * sit at the top of a public ranking. There is no on-graph flag for "don't rank me", so until
 * there is, the list lives here.
 *
 * Entries are personal space ids, in any format — they are normalized on the way into the set
 * below, so a UUID with hyphens and the bare hex form of the same space both match.
 *
 * To add someone: put their personal space id in this array with a comment saying who it is and
 * why, so the next person reading it doesn't have to guess.
 */
export const EXCLUDED_CURATOR_SPACE_IDS: string[] = ['cc0bf85a27c217d75993bc785a15b198'];

const excludedSpaceIds = new Set(EXCLUDED_CURATOR_SPACE_IDS.map(id => ID.uuidToHex(id)));

/** Whether this personal space is one the leaderboard leaves out. */
export function isExcludedCurator(spaceId: string | null | undefined): boolean {
  if (!spaceId) return false;
  return excludedSpaceIds.has(ID.uuidToHex(spaceId));
}
