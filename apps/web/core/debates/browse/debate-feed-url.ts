import { DEBATE_TIME_PARAM } from '~/core/debates/debate-timecode';
import { ID } from '~/core/id';
import { NavUtils } from '~/core/utils/utils';

/**
 * Where the full-screen feed is mounted, which decides how its URL names the debate on screen.
 *
 * - `debate-page`: a Debate entity's own page, `/space/<space>/<debate>`. The path *is* the debate,
 *   so moving through the feed rewrites the path — the same URL the share dialog hands out.
 * - `debates-tab`: a space's `/debates` tab. The path stays put and `?debate=` names the debate,
 *   because the tab's chrome is decided from the pathname (`SpaceChromeGate`, `Main`): swapping
 *   it for an entity path would bring the space header back down over the feed.
 */
export type DebateFeedSurface = 'debate-page' | 'debates-tab';

/** The `/debates` tab's param naming the debate on screen. Read back as the feed's anchor on load. */
export const DEBATE_FEED_PARAM = 'debate';

/**
 * The debate a Debate page's URL names, or null when `pathname` is not one of this space's entity
 * paths. See `DebateEntityView` for why the page reads this rather than its route param.
 */
export function debateIdFromEntityPath(pathname: string | null, spaceId: string): string | null {
  const [root, space, entityId, ...rest] = (pathname ?? '').split('/').filter(Boolean);
  if (root !== 'space' || space == null || !ID.equals(space, spaceId) || !entityId || rest.length > 0) return null;
  return entityId;
}

/**
 * The URL to show for `debateId`, or null when the current one already names it.
 *
 * Null is load-bearing, not an optimisation: a debate link may carry `?t=` for the moment it was
 * opened at, and the player only seeks once the media is ready. Rewriting the URL for the debate it
 * already names would strip that before it is read. Once the viewer moves to another debate the
 * moment no longer applies to anything on screen, so it is dropped.
 */
export function debateFeedHref(
  location: { pathname: string; search: string },
  { surface, spaceId, debateId }: { surface: DebateFeedSurface; spaceId: string; debateId: string }
): string | null {
  const params = new URLSearchParams(location.search);
  const hexId = ID.uuidToHex(debateId);

  if (surface === 'debates-tab') {
    const current = params.get(DEBATE_FEED_PARAM);
    if (current != null && ID.equals(current, debateId)) return null;
    params.set(DEBATE_FEED_PARAM, hexId);
    params.delete(DEBATE_TIME_PARAM);
    return `${location.pathname}?${params.toString()}`;
  }

  const currentEntityId = location.pathname.split('/').filter(Boolean).at(-1);
  if (currentEntityId != null && ID.equals(currentEntityId, debateId)) return null;
  params.delete(DEBATE_TIME_PARAM);
  const query = params.toString();
  return `${NavUtils.toEntity(spaceId, hexId)}${query ? `?${query}` : ''}`;
}
