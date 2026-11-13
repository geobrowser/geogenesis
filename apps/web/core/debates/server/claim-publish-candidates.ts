import { collectGeoChatPages } from './publish-candidates';

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
  let unknownSpace = false;
  const candidates = await collectGeoChatPages<Page, ClaimPublishCandidate>({
    path: `/spaces/${spaceId}/debates/claim-publish-candidates`,
    maxItems: maxCandidates,
    items: page =>
      page.debates.flatMap(debate =>
        typeof debate.debate_id === 'string' && typeof debate.claims_generated_at === 'string'
          ? [{ debateId: debate.debate_id, claimsGeneratedAt: debate.claims_generated_at }]
          : []
      ),
    nextCursor: page => page.next_cursor,
    // geo-chat's own 404 for a space it has no row for (the acceptor's personal space, say):
    // nothing to publish there. Any other 404 is a geo-chat without the endpoint.
    isMissingEndpoint: async response => {
      const code = await response
        .json()
        .then((body: { error?: { code?: unknown } }) => body?.error?.code)
        .catch(() => null);
      unknownSpace = code === 'space_not_found';
      return true;
    },
  });
  if (candidates === null) return unknownSpace ? [] : null;
  return candidates;
}
