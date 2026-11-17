import { uuidToHex } from '~/core/id/normalize';

/** The standalone debates app. Shared debate links open there rather than on geobrowser.io (GEO-3695). */
export const DEBATES_APP_ORIGIN = 'https://debates.geobrowser.io';

/**
 * A debate's link in the debates app: its Explore feed with this debate on top. The id is written
 * in the compact form the app's own links use.
 */
export function debatesAppDebateUrl(debateId: string): string {
  return `${DEBATES_APP_ORIGIN}/debate/${uuidToHex(debateId)}`;
}
