import { NavUtils } from '~/core/utils/utils';

/** Query param on a space page that opens the editor's "Add someone back" prompt for that space id. */
export const ADD_BACK_PARAM = 'addBack';

/** Link an editor opens to add `personalSpaceId` to `spaceId`. */
export function addBackLink(origin: string, spaceId: string, personalSpaceId: string) {
  const url = new URL(NavUtils.toSpace(spaceId), origin);
  url.searchParams.set(ADD_BACK_PARAM, personalSpaceId);
  return url.toString();
}
