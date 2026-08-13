/**
 * Structural validation for `/space/...` URLs, used by the middleware to reject
 * nonexistent pages with a real 404 before anything renders.
 *
 * Why this exists: `notFound()` inside the entity route does not produce a 404.
 * The layout streams (it has Suspense boundaries), so the 200 is committed
 * before the call is reached, and the not-found UI ships with a success status.
 * The observable result was that EVERY nonexistent space/entity URL — including
 * invented ones — returned `200` with a 44KB server-rendered body:
 *
 *     /space/totally-made-up-nonsense-id/also-fake-entity  ->  200
 *
 * A 404 tells a crawler to drop a URL; a 200 tells it to keep coming back. With
 * no robots.txt and `cache-control: no-store` on these routes, that made the
 * crawlable URL space unbounded and every hit a fresh serverless render — which
 * is what produced the edge-request anomaly (~76k requests/24h against ~2k real
 * pageviews, across 6,005 distinct paths, still serving pre-migration base58 and
 * 0x-address URLs long after those ID formats were retired).
 *
 * Doing this in middleware rather than in the page is deliberate: it is the only
 * place that runs before the response starts streaming, and it also skips the
 * render entirely, so an invalid URL costs a cheap check instead of a full page.
 */

/**
 * Mirrors `IdUtils.isValid` from `@geoprotocol/geo-sdk/lite`: a 32-char hex id
 * (either case) or a dashed UUID.
 *
 * Deliberately a local regex rather than an SDK import — middleware is bundled
 * for the edge and should not pull the SDK in. `space-url.test.ts` asserts this
 * stays equivalent to `IdUtils.isValid`, so the two cannot drift silently.
 */
const ID_PATTERN =
  /^(?:[0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

export function isValidId(segment: string): boolean {
  return ID_PATTERN.test(segment);
}

/**
 * Literal first segments under `/space/` that are routes rather than space ids.
 * `space-url.test.ts` asserts this matches the filesystem, so adding a route
 * without listing it here fails CI rather than 404ing in production.
 */
export const SPACE_ROOT_SEGMENTS = ['pending'] as const;

/**
 * Literal second segments under `/space/<id>/` — the space's own tabs. Anything
 * else in that position is treated as an entity id and must be a valid id.
 * Also filesystem-checked by the test.
 */
export const SPACE_TAB_SEGMENTS = [
  'activity',
  'claims',
  'community',
  'debates',
  'debug-debates',
  'governance',
  'import',
  'questions',
] as const;

/**
 * Whether a `/space/...` pathname is structurally capable of existing.
 *
 * Structural only — it says nothing about whether the space or entity is real.
 * A well-formed id for something that was deleted still renders and still
 * returns 200; fixing that needs a data lookup, which does not belong in
 * middleware. The unbounded case this closes is the malformed one, which is what
 * the crawl traffic is made of.
 *
 * @param pathname a URL path beginning `/space/`
 * @returns false when the URL can be rejected outright with a 404
 */
export function isPossibleSpacePath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);

  // ['space'] alone, or anything not under /space, is not ours to judge.
  if (segments[0] !== 'space' || segments.length < 2) return true;

  const [, first, second] = segments;

  if (first === undefined) return true;
  if ((SPACE_ROOT_SEGMENTS as readonly string[]).includes(first)) return true;
  if (!isValidId(first)) return false;

  if (second === undefined) return true;
  // Either a space tab, or an entity id. Deeper segments are tabs beneath a
  // valid entity (…/activity, …/opengraph-image-*) and are left alone.
  return (SPACE_TAB_SEGMENTS as readonly string[]).includes(second) || isValidId(second);
}
