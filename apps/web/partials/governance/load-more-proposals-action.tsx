'use server';

import type { GovernanceProposalCategory, GovernanceProposalStatusFilter } from './governance-proposal-query';
import { GovernanceProposalsList } from './governance-proposals-list';

export async function loadMoreProposalsAction(
  spaceId: string,
  page: number = 0,
  category: GovernanceProposalCategory = 'all',
  status: GovernanceProposalStatusFilter = 'pending'
) {
  const nextPage = page + 1;
  const { node, hasMore } = await GovernanceProposalsList({ spaceId, page: nextPage, category, status });
  return [node, nextPage, hasMore] as const;
}
