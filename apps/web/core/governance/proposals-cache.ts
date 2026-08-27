/** Revalidate this to drop a space's cached list — after a vote, or a new proposal. */
export function governanceProposalsTag(spaceId: string) {
  return `governance-proposals:${spaceId}`;
}

export const ORDERED_PROPOSALS_CACHE_SECONDS = 300;
