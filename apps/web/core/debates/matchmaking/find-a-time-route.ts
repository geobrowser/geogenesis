/** Where Find a time came from, so "Back to Debates" can put the viewer back there with the hub open. */
export const FIND_A_TIME_FROM_PARAM = 'from';
export const FIND_A_TIME_PATH = '/matchmaking/calendar';

/** Find a time's link, from the hub on `pathname`. */
export function findATimeHref(pathname: string | null): string {
  if (!pathname || pathname === FIND_A_TIME_PATH) return FIND_A_TIME_PATH;
  return `${FIND_A_TIME_PATH}?${new URLSearchParams({ [FIND_A_TIME_FROM_PARAM]: pathname }).toString()}`;
}
