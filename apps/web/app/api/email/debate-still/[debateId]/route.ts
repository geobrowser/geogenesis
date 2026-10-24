import {
  emailStillPlaceholder,
  emailStillSourceUrl,
  readImageBody,
  renderEmailStill,
} from '~/core/debates/server/email-debate-still';
import { validateSpaceId } from '~/core/io/rest/validation';

export const runtime = 'nodejs';

/** A still rarely changes once published: the CDN keeps it a week. */
const FOUND_CACHE = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400';
/** The placeholder is kept briefly, so a still that appears later shows up soon. */
const PLACEHOLDER_CACHE = 'public, max-age=300, s-maxage=300';

/** Long enough for geo-chat's redirect and the image; the email's row waits on it. */
const FETCH_TIMEOUT_MS = 8000;

/**
 * GET /api/email/debate-still/<debateId>: the debate's video still with a play button drawn in, for
 * the retention emails' debate rows (geo-notifications, GEO-3377). Email clients load it straight
 * from the email, so it is public and always answers with an image: the placeholder grey with the
 * button when the debate has no still or it can't be read, so the row keeps its shape.
 *
 * Only the canonical URL is served (32 lowercase hex, no query string), so every request for a
 * debate shares one CDN entry and a cache-busting query can't make the route redo the work.
 */
export async function GET(req: Request, { params }: { params: Promise<{ debateId: string }> }): Promise<Response> {
  const { debateId } = await params;
  // A debate id has a space id's shape; only its canonical spelling is served.
  if (validateSpaceId(debateId) !== debateId || new URL(req.url).search) {
    return new Response('Not found', { status: 404 });
  }

  let image: Buffer | null = null;
  try {
    // geo-chat's durable route 302s to its object storage; the redirect is followed.
    const res = await fetch(emailStillSourceUrl(debateId), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const body = await readImageBody(res);
    // Not an image sharp can read, or too many pixels: the placeholder.
    image = body ? await renderEmailStill(body).catch(() => null) : null;
  } catch {
    // Unreachable or too slow: the placeholder.
  }

  return new Response(new Uint8Array(image ?? (await emailStillPlaceholder())), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': image ? FOUND_CACHE : PLACEHOLDER_CACHE },
  });
}
