import { MAX_IMAGE_SIZE_BYTES } from '~/core/constants';
import { emailStillSource, renderEmailStill } from '~/core/debates/server/email-debate-still';
import { validateSpaceId } from '~/core/io/rest/validation';
import { fetchDebateKeyframe } from '~/core/io/subgraph/fetch-debate-keyframe';

export const runtime = 'nodejs';

/** A still rarely changes once published: the CDN keeps it a week. */
const FOUND_CACHE = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400';
/** The placeholder is kept briefly, so a still that appears later shows up soon. */
const PLACEHOLDER_CACHE = 'public, max-age=300, s-maxage=300';

/**
 * GET /api/email/debate-still/<debateId>: the debate's video still with a play button drawn in, for
 * the retention emails' debate rows (geo-notifications, GEO-3377). Email clients load it straight
 * from the email, so it is public and always answers with an image: the placeholder grey with the
 * button when the debate has no still or it can't be read, so the row keeps its shape.
 *
 * The still's URL comes from the graph, never from the request, and is fetched only from the IPFS
 * gateway or geo-chat; the CDN caches each debate's image, so a send costs one render per debate.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ debateId: string }> }): Promise<Response> {
  // A debate id has the same shape as a space id: 32 hex.
  const debateId = validateSpaceId((await params).debateId);
  if (!debateId) return new Response('Not found', { status: 404 });

  let source: Buffer | null = null;
  try {
    const url = emailStillSource(await fetchDebateKeyframe(debateId));
    if (url) {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      // geo-chat answers with a redirect to its object storage, which is followed: the first hop is ours.
      const length = Number(res.headers.get('content-length') ?? 0);
      if (res.ok && length <= MAX_IMAGE_SIZE_BYTES) {
        const bytes = Buffer.from(await res.arrayBuffer());
        if (bytes.length <= MAX_IMAGE_SIZE_BYTES) source = bytes;
      }
    }
  } catch {
    // Drawn as the placeholder below.
  }

  let image: Buffer;
  try {
    image = await renderEmailStill(source);
  } catch {
    // Not an image sharp can read.
    source = null;
    image = await renderEmailStill(null);
  }
  return new Response(new Uint8Array(image), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': source ? FOUND_CACHE : PLACEHOLDER_CACHE },
  });
}
