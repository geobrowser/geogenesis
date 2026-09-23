import { normId } from '~/core/utils/norm-id';

import type { ParticipantPositionsByClaim } from '../participant-positions';

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
  const counts = new Map<string, number>();
  if (!viewerProfileSpaceId) return counts;

  const viewerId = normId(viewerProfileSpaceId);

  for (const rows of positionsByClaim.values()) {
    const viewerPositions = new Map<string, boolean>();
    for (const row of rows) {
      if (normId(row.profileSpaceId) !== viewerId) continue;
      viewerPositions.set(positionContext(row.spaceId, row.responseKind), row.position);
    }
    if (viewerPositions.size === 0) continue;

    const profilesDisagreeingOnClaim = new Set<string>();
    for (const row of rows) {
      const profileId = normId(row.profileSpaceId);
      if (profileId === viewerId) continue;

      const viewerPosition = viewerPositions.get(positionContext(row.spaceId, row.responseKind));
      if (viewerPosition !== undefined && viewerPosition !== row.position) {
        profilesDisagreeingOnClaim.add(profileId);
      }
    }

    for (const profileId of profilesDisagreeingOnClaim) {
      counts.set(profileId, (counts.get(profileId) ?? 0) + 1);
    }
  }

  return counts;
}

function positionContext(spaceId: string, responseKind: string): string {
  return `${normId(spaceId)}|${responseKind}`;
}
