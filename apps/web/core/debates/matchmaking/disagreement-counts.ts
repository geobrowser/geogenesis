import { normId } from '~/core/utils/norm-id';

import type { ParticipantPosition, ParticipantPositionsByClaim } from '../participant-positions';

export type ClaimMatch = {
  claimId: string;
  spaceId: string;
  /**
   * Taken from the row rather than written out. It was its own `'stance' | 'veracity'` literal, and
   * a claim only ever asks one question now — so the two spellings had already diverged by the time
   * they met here.
   */
  responseKind: ParticipantPosition['responseKind'];
  viewerPosition: boolean;
  personPosition: boolean;
};

export type MatchingClaimsAnalysis = {
  /** Distinct matching claims per person, used for row order and the claim dropdown. */
  byProfile: Map<string, ClaimMatch[]>;
  /** Distinct matching claims per person and space, used by the Active in breakdown. */
  countsByProfileAndSpace: Map<string, Map<string, number>>;
};

/**
 * Claims on which the viewer and each other person hold comparable, opposite positions.
 *
 * A response is scoped by both space and kind: agreeing with a claim in one space is not the
 * opposite of disagreeing with it somewhere else. Kind is a single value today — every claim asks
 * whether you agree — but it stays in the key because it is half of what makes two responses
 * comparable, and dropping it would silently pair responses to different questions if a second
 * kind ever returns. The person-level list counts a claim once;
 * the space breakdown counts it once in every space where the pair actually opposes each other.
 * Both projections are built in one pass so the People tab cannot drift between two definitions
 * of a match or scan the same graph result twice.
 */
export function analyzeMatchingClaims(
  positionsByClaim: ParticipantPositionsByClaim,
  viewerProfileSpaceId: string | null
): MatchingClaimsAnalysis {
  const byProfile = new Map<string, ClaimMatch[]>();
  const countsByProfileAndSpace = new Map<string, Map<string, number>>();
  if (!viewerProfileSpaceId) return { byProfile, countsByProfileAndSpace };

  const viewerId = normId(viewerProfileSpaceId);
  const seenClaimsByProfile = new Map<string, Set<string>>();
  const seenClaimsByProfileAndSpace = new Map<string, Set<string>>();

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

      const claimId = normId(row.claimId);
      const spaceId = normId(row.spaceId);

      const seenForProfile = seenClaimsByProfile.get(profileId) ?? new Set<string>();
      if (!seenForProfile.has(claimId)) {
        seenForProfile.add(claimId);
        seenClaimsByProfile.set(profileId, seenForProfile);

        const matches = byProfile.get(profileId) ?? [];
        matches.push({
          claimId: row.claimId,
          spaceId: row.spaceId,
          responseKind: row.responseKind,
          viewerPosition,
          personPosition: row.position,
        });
        byProfile.set(profileId, matches);
      }

      const profileSpaceKey = `${profileId}|${spaceId}`;
      const seenForProfileSpace = seenClaimsByProfileAndSpace.get(profileSpaceKey) ?? new Set<string>();
      if (seenForProfileSpace.has(claimId)) continue;
      seenForProfileSpace.add(claimId);
      seenClaimsByProfileAndSpace.set(profileSpaceKey, seenForProfileSpace);

      const bySpace = countsByProfileAndSpace.get(profileId) ?? new Map<string, number>();
      bySpace.set(spaceId, (bySpace.get(spaceId) ?? 0) + 1);
      countsByProfileAndSpace.set(profileId, bySpace);
    }
  }

  return { byProfile, countsByProfileAndSpace };
}

function positionContext(spaceId: string, responseKind: string): string {
  return `${normId(spaceId)}|${responseKind}`;
}
