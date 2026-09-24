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

/** Distinct opposing claims per person and space, for the Active in breakdown. */
export function disagreementCountsByProfileAndSpace(
  positionsByClaim: ParticipantPositionsByClaim,
  viewerProfileSpaceId: string | null
): Map<string, Map<string, number>> {
  const counts = new Map<string, Map<string, number>>();
  if (!viewerProfileSpaceId) return counts;

  const seenByProfileAndSpace = new Map<string, Set<string>>();
  for (const [profileId, rows] of opposingPositionsByProfile(positionsByClaim, viewerProfileSpaceId)) {
    for (const row of rows) {
      const spaceId = normId(row.spaceId);
      const seenKey = `${profileId}|${spaceId}`;
      const seenClaims = seenByProfileAndSpace.get(seenKey) ?? new Set<string>();
      const claimId = normId(row.claimId);
      if (seenClaims.has(claimId)) continue;
      seenClaims.add(claimId);
      seenByProfileAndSpace.set(seenKey, seenClaims);

      const bySpace = counts.get(profileId) ?? new Map<string, number>();
      bySpace.set(spaceId, (bySpace.get(spaceId) ?? 0) + 1);
      counts.set(profileId, bySpace);
    }
  }

  return counts;
}

/** The claim details behind each count, in the graph's most-recent-response-first order. */
export function disagreementsByProfile(
  positionsByClaim: ParticipantPositionsByClaim,
  viewerProfileSpaceId: string | null
): Map<string, ClaimDisagreement[]> {
  const disagreements = new Map<string, ClaimDisagreement[]>();
  const seenClaimsByProfile = new Map<string, Set<string>>();

  for (const [profileId, rows] of opposingPositionsByProfile(positionsByClaim, viewerProfileSpaceId)) {
    for (const row of rows) {
      const claimId = normId(row.claimId);
      const seenClaims = seenClaimsByProfile.get(profileId) ?? new Set<string>();
      if (seenClaims.has(claimId)) continue;
      seenClaims.add(claimId);
      seenClaimsByProfile.set(profileId, seenClaims);

      const existing = disagreements.get(profileId) ?? [];
      existing.push(row);
      disagreements.set(profileId, existing);
    }
  }

  return disagreements;
}

/** Every comparable opposing response, before a caller applies its claim/space de-duplication. */
function opposingPositionsByProfile(
  positionsByClaim: ParticipantPositionsByClaim,
  viewerProfileSpaceId: string | null
): Map<string, ClaimDisagreement[]> {
  const oppositions = new Map<string, ClaimDisagreement[]>();
  if (!viewerProfileSpaceId) return oppositions;

  const viewerId = normId(viewerProfileSpaceId);
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

      const existing = oppositions.get(profileId) ?? [];
      existing.push({
        claimId: row.claimId,
        spaceId: row.spaceId,
        responseKind: row.responseKind,
        viewerPosition,
        personPosition: row.position,
      });
      oppositions.set(profileId, existing);
    }
  }

  return oppositions;
}

function positionContext(spaceId: string, responseKind: string): string {
  return `${normId(spaceId)}|${responseKind}`;
}
