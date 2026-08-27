import { NextResponse } from 'next/server';

import { getDebateAcceptorConfig } from '~/core/debates/server/acceptor-config';
import { listEditorSpaceIds } from '~/core/debates/server/editor-spaces';
import {
  type PublishableSpacesCacheEntry,
  PUBLISHABLE_SPACES_TTL_MS,
  isFresh,
  resolvePublishableSpaces,
} from '~/core/debates/server/publishable-spaces-cache';

/**
 * The spaces a finished debate could actually be published into.
 *
 * A debate is published by the acceptor service account into the *claim's home space*, and that
 * needs editor rights there — a member can propose but not vote and execute, so anything else
 * reverts on-chain. So the set of spaces that can host a debate is exactly the set the acceptor
 * edits, which is the same set the publish sweep uses to discover its work (`listEditorSpaceIds`).
 * One source of truth for "can this claim carry a debate", read by both ends.
 *
 * This exists because `DEBATE_ACCEPTOR_SPACE_ID` is server-only and should stay that way. The
 * client needs the *answer*, not the acceptor's identity, so the resolution happens here.
 *
 * Nothing here is sensitive: it is a list of public space ids, and it says only which spaces are
 * debatable — which is already observable by trying. No auth, so it can be cached and shared.
 */

/**
 * Dynamic on purpose. This used to carry `export const revalidate = 300`, which cached whatever the
 * handler returned — including the `{ spaceIds: null }` it returns on failure. `null` means
 * "unknown", and the client gates read unknown as "do not filter", so one upstream 503 was cached
 * as an answer and every viewer served it saw claims from spaces the acceptor cannot publish into.
 * Observed in production: a logged 503 at 15:54 and the endpoint still answering `null` when
 * sampled hours later, against an acceptor that edits six spaces perfectly well.
 *
 * Segment revalidation caches the *response*, so it cannot express "cache successes, never cache
 * failures". The TTL therefore lives in `publishable-spaces-cache`, where a failure can be handled
 * on its own terms.
 */
export const dynamic = 'force-dynamic';

let cached: PublishableSpacesCacheEntry | null = null;

export async function GET() {
  const config = getDebateAcceptorConfig();

  // `null`, not `[]`. An empty array is a real answer meaning "nothing is debatable"; a missing
  // acceptor means the question cannot be answered here, and callers must fall through to their
  // other filters rather than emptying every list. Local and preview environments run without an
  // acceptor configured, and they should still show a usable picker.
  if (!config) {
    return NextResponse.json({ spaceIds: null }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const nowMs = Date.now();
  if (isFresh(cached, nowMs)) {
    return NextResponse.json(
      { spaceIds: cached!.spaceIds },
      { headers: { 'Cache-Control': `public, max-age=${Math.floor(PUBLISHABLE_SPACES_TTL_MS / 1000)}` } }
    );
  }

  let refreshed: string[] | null = null;
  try {
    refreshed = await listEditorSpaceIds(config.spaceId);
    cached = { spaceIds: refreshed, storedAtMs: nowMs };
  } catch (error) {
    // Retries are exhausted by this point (see `listEditorSpaceIds`), so this is either a real
    // outage or a rejected query. Either way it is "unknown", never "nothing is publishable".
    console.error('[debates] could not resolve publishable spaces', error);
  }

  const { spaceIds, cacheable } = resolvePublishableSpaces({ entry: cached, refreshed, nowMs });

  return NextResponse.json(
    { spaceIds },
    {
      headers: {
        // A failure is never cached, whether it produced a stale list or a null. Only a fresh
        // successful lookup earns a max-age.
        'Cache-Control': cacheable
          ? `public, max-age=${Math.floor(PUBLISHABLE_SPACES_TTL_MS / 1000)}`
          : 'no-store',
      },
    }
  );
}
