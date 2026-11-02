import { ID } from '~/core/id';

import { isGeoChatDebateId, isRemovedDebateAnswer } from '../debate-removal';
import { geoChatBaseUrl } from './geo-chat-base-url';

export { isGeoChatDebateId };

/**
 * Whether geo-chat will still serve a published Debate, asked server-side before the entity page
 * renders it (GEO-2785).
 *
 * Hiding a debate goes through geo-chat only (`POST /debates/{id}/hide`), and from then on every
 * by-id read answers `debate_not_found`. The entity page reads the graph, which knows nothing about
 * that, so without this the page kept rendering a removed debate — and in edit mode or on the feed's
 * fallback, the raw entity page with its video. Asked on the server so a removed debate's video
 * never reaches the browser at all.
 *
 * - `visible`: geo-chat served the debate.
 * - `removed`: geo-chat answered, definitively, that it has no such debate — and it is a debate
 *   geo-chat should know. The page shows the removed state.
 * - `unknown`: anything else. A timeout, a network error, a 5xx, an ingress 404 with no geo-chat
 *   error body, a 401 for a debate that is not complete. The page renders as it did before.
 *
 * Fails open on purpose. A geo-chat outage must not blank every debate page in the product, and
 * the graph's own `Hidden` flag (GEO-2809) still withholds a page on its own, independently of this.
 */
export type DebateVisibility = 'visible' | 'removed' | 'unknown';

/**
 * Long enough for a healthy by-id read (a single indexed row), short enough that an unreachable
 * geo-chat costs a debate page a small, bounded delay rather than a hung render.
 */
export const DEBATE_VISIBILITY_TIMEOUT_MS = 2_500;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function fetchDebateVisibility(
  entityId: string,
  {
    fetchImpl = fetch,
    baseUrl = geoChatBaseUrl(),
    timeoutMs = DEBATE_VISIBILITY_TIMEOUT_MS,
    revalidateSeconds,
  }: {
    fetchImpl?: FetchLike;
    baseUrl?: string;
    timeoutMs?: number;
    /**
     * For a statically revalidated caller (the share image), which an uncached fetch would force
     * dynamic. Omitted, the read is uncached: the page must reflect a removal or restore at once.
     */
    revalidateSeconds?: number;
  } = {}
): Promise<DebateVisibility> {
  // Nothing geo-chat says about an id it never minted can mean "removed".
  if (!isGeoChatDebateId(entityId)) return 'unknown';

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/debates/${ID.hexToUuid(entityId)}`, {
      // Anonymous on purpose: this decides what everyone sees, so it must not depend on who asked.
      // A completed, visible debate is readable anonymously; that is the only kind a page shows.
      ...(revalidateSeconds == null ? { cache: 'no-store' as const } : { next: { revalidate: revalidateSeconds } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return 'unknown';
  }

  if (response.ok) return 'visible';
  if (response.status !== 404) return 'unknown';

  // Only geo-chat's own answer counts. A 404 from a proxy or a misrouted base URL carries no
  // `debate_not_found` code, and reading it as "removed" would blank every debate at once.
  try {
    const body = (await response.json()) as { error?: { code?: unknown } } | null;
    const code = typeof body?.error?.code === 'string' ? body.error.code : null;
    return isRemovedDebateAnswer(entityId, response.status, code) ? 'removed' : 'unknown';
  } catch {
    return 'unknown';
  }
}
