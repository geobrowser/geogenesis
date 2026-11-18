import type { DebateMediaResponse } from '~/core/debates/api';
import { ID } from '~/core/id';

import { isGeoChatDebateId } from '../debate-removal';
import { DEBATE_VISIBILITY_TIMEOUT_MS } from './debate-visibility';
import { geoChatBaseUrl } from './geo-chat-base-url';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * The linked debate's media readiness, read on the server so the feed need not wait for it after
 * hydration (GEO-3604). Anonymous and uncached; null on failure, leaving the browser to fetch it.
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
