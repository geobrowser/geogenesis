import { normId } from '~/core/utils/norm-id';

import type { ParticipantPositionsByClaim } from '../participant-positions';

export type ClaimDisagreement = {
  claimId: string;
  spaceId: string;
  responseKind: 'stance' | 'veracity';
  viewerPosition: boolean;
  personPosition: boolean;
};

/**
 * Distinct claims on which the viewer and each other person hold opposite positions.
 *
 * A response is scoped by both space and kind: agreeing with a claim in one space is not the
 * opposite of disputing its veracity somewhere else. A claim still counts only once when the pair
 * opposes each other on more than one comparable response.
 */
export function disagreementCountsByProfile(
  positionsByClaim: ParticipantPositionsByClaim,
  viewerProfileSpaceId: string | null
): Map<string, number> {
  return new Map(
    [...disagreementsByProfile(positionsByClaim, viewerProfileSpaceId)].map(([profileId, disagreements]) => [
      profileId,
      disagreements.length,
    ])
  );
}

/** The claim details behind each count, in the graph's most-recent-response-first order. */
export function disagreementsByProfile(
  positionsByClaim: ParticipantPositionsByClaim,
  viewerProfileSpaceId: string | null
): Map<string, ClaimDisagreement[]> {
  const disagreements = new Map<string, ClaimDisagreement[]>();
  if (!viewerProfileSpaceId) return disagreements;

  const viewerId = normId(viewerProfileSpaceId);
  const seenClaimsByProfile = new Map<string, Set<string>>();

  for (const rows of positionsByClaim.values()) {
    const viewerPositions = new Map<string, boolean>();
    for (const row of rows) {
      if (normId(row.profileSpaceId) !== viewerId) continue;
      viewerPositions.set(positionContext(row.spaceId, row.responseKind), row.position);
    }
    if (viewerPositions.size === 0) continue;

    for (const row of rows) {
      const profileId = normId(row.profileSpaceId);
      if (profileId === viewerId) continue;

      const viewerPosition = viewerPositions.get(positionContext(row.spaceId, row.responseKind));
      if (viewerPosition === undefined || viewerPosition === row.position) continue;

      // The same claim can oppose on both stance and veracity, or in more than one space. The
      // count is claims, not response rows, and the dropdown should mirror that one-to-one.
      const claimId = normId(row.claimId);
      const seenClaims = seenClaimsByProfile.get(profileId) ?? new Set<string>();
      if (seenClaims.has(claimId)) continue;
      seenClaims.add(claimId);
      seenClaimsByProfile.set(profileId, seenClaims);

      const existing = disagreements.get(profileId) ?? [];
      existing.push({
        claimId: row.claimId,
        spaceId: row.spaceId,
        responseKind: row.responseKind,
        viewerPosition,
        personPosition: row.position,
      });
      disagreements.set(profileId, existing);
    }
  }

  return disagreements;
}

function positionContext(spaceId: string, responseKind: string): string {
  return `${normId(spaceId)}|${responseKind}`;
}
