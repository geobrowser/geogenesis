import { readFastPathRestricted } from '~/core/utils/contracts/read-space-membership';
import { NavUtils } from '~/core/utils/utils';

/** Query param on a space page that opens the editor's "Add someone back" prompt for that space id. */
export const ADD_BACK_PARAM = 'addBack';

/** Link an editor opens to add `personalSpaceId` to `spaceId`. */
export function addBackLink(origin: string, spaceId: string, personalSpaceId: string) {
  const url = new URL(NavUtils.toSpace(spaceId), origin);
  url.searchParams.set(ADD_BACK_PARAM, personalSpaceId);
  return url.toString();
}

/**
 * The add-back link when `personalSpaceId` can't request to join `spaceId`, else null.
 *
 * Someone on the review path only can't request membership: the contract reverts
 * `FastPathRestricted`, and only an editor's proposal can add them. Read fresh from the chain. Fails
 * open: when the read fails this returns null, and the request is sent as before.
 */
export async function readLockedOutLink(spaceId: string, personalSpaceId: string): Promise<string | null> {
  const isRestricted = await readFastPathRestricted(spaceId, personalSpaceId).catch(() => false);
  return isRestricted ? addBackLink(window.location.origin, spaceId, personalSpaceId) : null;
}
