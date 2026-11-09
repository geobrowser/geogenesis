import type { DebateMediaResponse } from '~/core/debates/api';
import { ID } from '~/core/id';

import { isGeoChatDebateId } from '../debate-removal';
import { DEBATE_VISIBILITY_TIMEOUT_MS } from './debate-visibility';
import { geoChatBaseUrl } from './geo-chat-base-url';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * The linked debate's media readiness, read on the server beside the removal check (GEO-3604).
 *
 * In the browser it is one of the lookups the feed waits on before it shows the linked debate, and
 * it only starts after hydration. Anonymous and uncached like the removal check; null on any
 * failure, which leaves the browser to fetch it as before.
 */
export async function fetchDebatePageMedia(
  entityId: string,
  {
    fetchImpl = fetch,
    baseUrl = geoChatBaseUrl(),
    timeoutMs = DEBATE_VISIBILITY_TIMEOUT_MS,
  }: { fetchImpl?: FetchLike; baseUrl?: string; timeoutMs?: number } = {}
): Promise<DebateMediaResponse | null> {
  if (!isGeoChatDebateId(entityId)) return null;
  try {
    const response = await fetchImpl(`${baseUrl}/debates/${ID.hexToUuid(entityId)}/media`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as DebateMediaResponse | null;
    return body && Array.isArray(body.artifacts) ? body : null;
  } catch {
    return null;
  }
}
