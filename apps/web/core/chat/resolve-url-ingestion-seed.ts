import type { IngestionLink } from '~/core/chat/ingestion-link';
import type { ClassifyUrlResponse } from '~/core/chat/inject-types';
import type { AssistantSeed } from '~/core/state/chat-store';

/**
 * Classifies a URL and returns the assistant seed for either the inject job
 * path or the chat-driven ingestion fallback. `spaceId`, when given, is the space the import writes
 * into instead of the route's (see `AssistantSeed`).
 */
export async function resolveUrlIngestionSeed(
  normalizedUrl: string,
  logTag: string,
  link?: IngestionLink,
  spaceId?: string
): Promise<AssistantSeed> {
  const seedTarget = { ...(link ? { link } : {}), ...(spaceId ? { spaceId } : {}) };
  let classification: ClassifyUrlResponse = { route: 'chat' };
  try {
    const res = await fetch('/api/chat/classify-url', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: normalizedUrl }),
    });
    if (res.ok) {
      classification = (await res.json()) as ClassifyUrlResponse;
    } else {
      console.warn(`[${logTag}] classify-url returned`, res.status);
    }
  } catch (err) {
    console.warn(`[${logTag}] classify-url failed; falling back to chat flow`, err);
  }

  if (classification.route === 'inject') {
    try {
      const res = await fetch('/api/chat/inject', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalizedUrl, type: classification.type }),
      });
      if (res.ok || res.status === 202) {
        const body = (await res.json()) as { jobId: string };
        if (body.jobId) {
          return {
            mode: 'inject',
            url: normalizedUrl,
            jobId: body.jobId,
            injectType: classification.type,
            ...seedTarget,
          };
        }
      } else {
        console.warn(`[${logTag}] inject submit returned`, res.status);
      }
    } catch (err) {
      console.warn(`[${logTag}] inject submit failed; falling back to chat flow`, err);
    }
  }

  return { mode: 'ingestion', url: normalizedUrl, ...seedTarget };
}
