import type { ExploreFeedItem } from './explore-card-item';
import { readLastGoodPublicFeed } from './last-good-public-feed';

/**
 * The public page's lead stills, for the Explore document to preload (GEO-3280).
 *
 * The card paints them from the feed response, which a cold load has only once the bundle has
 * hydrated, about 1.8s in. The stills are the page's largest paint, so the document names them
 * itself, from the last good public page: the same page the CDN is serving give or take a minute.
 *
 * Older than the CDN would serve its own copy and the page may lead with someone else, so it is
 * not used. A missed guess costs one or two images nobody shows; it never delays the page, because
 * the read is bounded and its answer streams in behind the shell.
 */

/** `s-maxage` plus `stale-while-revalidate` on the public page: past this the CDN has a newer one. */
export const LEAD_POSTER_PRELOAD_MAX_AGE_MS = 11 * 60 * 1000;

type PublicFeedBody = { items?: readonly ExploreFeedItem[]; reserve?: readonly ExploreFeedItem[] };

/**
 * The stills the server attached to the debate a first visit opens on, slot order, exactly as the
 * card's `<img>`s spell them. The server attaches them to that one debate only, which may sit in the
 * reserve when the browser will move it up.
 */
export function leadPosterUrls(body: PublicFeedBody): string[] {
  const rows = [...(Array.isArray(body.items) ? body.items : []), ...(Array.isArray(body.reserve) ? body.reserve : [])];
  const posters = rows.find(row => row?.debatePosters)?.debatePosters;
  return posters ? [posters.slot1, posters.slot2].filter((src): src is string => typeof src === 'string') : [];
}

/** The lead stills of a recent public page, or none: no page kept, too old, or the read failed. */
export async function readLeadPosterUrls(): Promise<string[]> {
  const kept = await readLastGoodPublicFeed<PublicFeedBody>();
  if (!kept || Date.now() - kept.asOfMs > LEAD_POSTER_PRELOAD_MAX_AGE_MS) return [];
  return leadPosterUrls(kept.body);
}
