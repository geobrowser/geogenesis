import { NextResponse } from 'next/server';

import {
  type SemanticClaimSearchResponse,
  parseSemanticClaimSearchRequest,
} from '~/core/debates/semantic-claim-search-contract';
import { getGeoLensSearchConfig, searchSemanticClaims } from '~/core/debates/server/geo-lens-search';

/**
 * Semantic search over a tagged claim list, for the debates hub's search box.
 *
 * A proxy for geo-lens, and deliberately a narrow one. geo-lens answers with a key this route holds
 * and the browser must not; and it answers any relation-shaped question about the cache, while
 * the search box asks exactly one — "which claims carrying this tag (in these spaces) and these
 * topics mean these words?" The relation types, the cache, the strategy and the floor are fixed
 * here (`geo-lens-search`), so the request body can only choose the tag, spaces, topics and words,
 * and every id in it is normalized before it is trusted.
 *
 * Reachable signed out, because Featured and All claims are: the answer is over public graph data
 * and costs geo-lens an index seek plus a walk of the tag's members, which is milliseconds. The
 * same-origin check keeps it from being a free embedding service for other sites; the query cap
 * and id caps bound one request's work.
 *
 * `{ hits: null }` is a real answer meaning "not configured on this deployment": the client reads it
 * as "match the words", which is what the box did before this route existed and the only search
 * such a deployment has. A misconfiguration (URL without key) is a 503 rather than a quiet null, so
 * it is seen; like any other failure the client shows it as the list's error, with a retry.
 */
export const dynamic = 'force-dynamic';

function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin) return process.env.NODE_ENV !== 'production';
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, 'Forbidden');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Body must be JSON.');
  }
  const parsed = parseSemanticClaimSearchRequest(body);
  if (!parsed.ok) return jsonError(400, parsed.error);

  let config;
  try {
    config = getGeoLensSearchConfig();
  } catch (error) {
    console.error('[debates/semantic-search] geo-lens is misconfigured', error);
    return jsonError(503, 'Semantic search is misconfigured.');
  }
  if (!config) return NextResponse.json({ hits: null } satisfies SemanticClaimSearchResponse);

  try {
    const hits = await searchSemanticClaims(parsed.request, config);
    return NextResponse.json({ hits } satisfies SemanticClaimSearchResponse);
  } catch (error) {
    console.error('[debates/semantic-search] geo-lens query failed', error);
    return jsonError(502, 'Semantic search is unavailable.');
  }
}
