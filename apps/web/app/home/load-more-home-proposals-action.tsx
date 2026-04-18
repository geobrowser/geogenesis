'use server';

import {
  type GovernanceHomeReviewCategory,
  type GovernanceHomeStatusFilter,
} from './fetch-active-proposals-in-editor-spaces';
import { PendingProposalsPage } from './pending-proposals-page';

export async function loadMoreHomeProposalsAction(
  connectedSpaceId: string,
  connectedAddress: string | undefined,
  proposalType: 'membership' | 'content' | undefined,
  page: number = 0,
  governanceFilters?: {
    spaceId: string;
    category: GovernanceHomeReviewCategory;
    status: GovernanceHomeStatusFilter;
  }
) {
  const nextPage = page + 1;
  const { node, hasMore } = await PendingProposalsPage({
    connectedSpaceId,
    connectedAddress,
    proposalType,
    page: nextPage,
    governanceFilters,
  });
  return [node, nextPage, hasMore] as const;
}
