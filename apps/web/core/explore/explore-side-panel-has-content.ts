import type { ExploreSidePanelData } from '~/core/explore/fetch-explore-side-panel-data';
import { normId } from '~/core/utils/norm-id';

/**
 * Server-side approximation of whether {@link ExploreSidePanel} will render.
 * Omits curator-onboarding (client-only); used to avoid reserving sidebar width
 * when the panel would otherwise be empty.
 */
export function exploreSidePanelHasServerContent(data: ExploreSidePanelData): boolean {
  const pendingSet = new Set(data.pendingMembershipSpaceIds.map(normId));
  const memberOrEditorSet = new Set(data.memberOrEditorSpaceIds.map(normId));
  const hasJoinableSpace = data.featuredSpaces.some(space => {
    const normalized = normId(space.spaceId);
    return !memberOrEditorSet.has(normalized) && !pendingSet.has(normalized);
  });

  return hasJoinableSpace || data.featuredRankings.length > 0 || data.communityCalls.length > 0;
}
