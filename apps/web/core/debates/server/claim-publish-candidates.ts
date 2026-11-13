import { GeoChatRequestError } from './debate-source';
import { geoChatBaseUrl } from './geo-chat-base-url';

/** geo-chat's page size for the listing; its own ceiling is 200. */
const PAGE_SIZE = 100;

/** Most candidates one space contributes to one sweep tick, however many geo-chat has. */
export const MAX_CLAIM_PUBLISH_CANDIDATES_PER_SPACE = 1000;

export type ClaimPublishCandidate = {
  debateId: string;
  /**
   * When geo-chat last wrote the debate's claims, exactly as it sent it. Opaque: compared for
   * equality with what the sweep stored, never parsed (a JS Date would drop the microseconds and
   * the comparison would never match).
   */
  claimsGeneratedAt: string;
};

type Page = {
  debates: Array<{ debate_id: string; claims_generated_at: string }>;
  next_cursor: string | null;
};

/**
 * GEO-3635: the published debates in a space with a claims row, and when the claims were last
 * written, from geo-chat's `GET /spaces/{id}/debates/claim-publish-candidates`. Paged like
 * `listPublishCandidateDebateIds`.
 *
 * Empty for a space geo-chat does not know (`space_not_found`). Null when geo-chat answers the first
 * page with any other 404: a geo-chat deployed before the endpoint, so the late sweep has nothing to
 * go on and skips. Any other failure throws.
 */
export async function listClaimPublishCandidates(
  spaceId: string,
  maxCandidates: number = MAX_CLAIM_PUBLISH_CANDIDATES_PER_SPACE
): Promise<ClaimPublishCandidate[] | null> {
  const candidates: ClaimPublishCandidate[] = [];
  let cursor: string | null = null;
  let firstPage = true;
  while (candidates.length < maxCandidates) {
    const params = new URLSearchParams({ limit: String(Math.min(PAGE_SIZE, maxCandidates - candidates.length)) });
    if (cursor) params.set('cursor', cursor);
    const path = `/spaces/${spaceId}/debates/claim-publish-candidates?${params.toString()}`;
    const response = await fetch(`${geoChatBaseUrl()}${path}`, { cache: 'no-store' });
    if (firstPage && response.status === 404) {
      // geo-chat's own 404 for a space it has no row for (the acceptor's personal space, say):
      // nothing to publish there. Any other 404 is a geo-chat without the endpoint.
      const code = await response
        .json()
        .then((body: { error?: { code?: unknown } }) => body?.error?.code)
        .catch(() => null);
      return code === 'space_not_found' ? [] : null;
    }
    if (!response.ok) {
      throw new GeoChatRequestError(response.status, `geo-chat ${path} failed (${response.status})`);
    }
    firstPage = false;
    const page = (await response.json()) as Page;
    for (const debate of page.debates) {
      if (typeof debate.debate_id === 'string' && typeof debate.claims_generated_at === 'string') {
        candidates.push({ debateId: debate.debate_id, claimsGeneratedAt: debate.claims_generated_at });
      }
    }
    if (!page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return candidates.slice(0, maxCandidates);
}
