import { readIsLockedOut } from '~/core/access/request-space-membership';
import { NavUtils } from '~/core/utils/utils';

/** Query param on a space page that opens the editor's "Add someone back" prompt for that space id. */
export const ADD_BACK_PARAM = 'addBack';

/** Link an editor opens to add `personalSpaceId` to `spaceId`. */
export function addBackLink(origin: string, spaceId: string, personalSpaceId: string) {
  const url = new URL(NavUtils.toSpace(spaceId), origin);
  url.searchParams.set(ADD_BACK_PARAM, personalSpaceId);
  return url.toString();
}

/** The add-back link when `personalSpaceId` can't request to join `spaceId` (`readIsLockedOut`), else null. */
export async function readLockedOutLink(spaceId: string, personalSpaceId: string): Promise<string | null> {
  return (await readIsLockedOut(spaceId, personalSpaceId))
    ? addBackLink(window.location.origin, spaceId, personalSpaceId)
    : null;
}
