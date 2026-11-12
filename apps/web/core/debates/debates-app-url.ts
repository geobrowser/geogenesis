import { uuidToHex } from '~/core/id/normalize';

/** The standalone debates app. Shared debate links open there rather than on geobrowser.io (GEO-3695). */
export const DEBATES_APP_ORIGIN = 'https://debates.geobrowser.io';

/** The query parameter the debates app's Explore feed reads to put a debate on top. */
export const DEBATES_APP_DEBATE_PARAM = 'debate';

/**
 * A debate's link in the debates app: its Explore feed with this debate on top. The id is written
 * in the compact form the app's own links use.
 *
 * Interim (GEO-3695, Yaniv): the app's `/debate/<id>` opens the full-screen view today, so this
 * links the feed at `/explore?debate=<id>`. Once debates-react-native#46 makes `/debate/<id>` open
 * the feed, revert to `${DEBATES_APP_ORIGIN}/debate/<id>`.
 */
export function debatesAppDebateUrl(debateId: string): string {
  const url = new URL('/explore', DEBATES_APP_ORIGIN);
  url.searchParams.set(DEBATES_APP_DEBATE_PARAM, uuidToHex(debateId));
  return url.toString();
}
