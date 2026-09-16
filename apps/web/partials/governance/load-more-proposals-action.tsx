'use server';

import type { GovernanceProposalCategory, GovernanceProposalStatusFilter } from './governance-proposal-query';
import { GovernanceProposalsList } from './governance-proposals-list';

export async function loadMoreProposalsAction(
  spaceId: string,
  cursor: string,
  category: GovernanceProposalCategory = 'all',
  status: GovernanceProposalStatusFilter = 'pending'
) {
  const { node, hasMore, nextCursor } = await GovernanceProposalsList({ spaceId, cursor, category, status });
  return [node, nextCursor, hasMore] as const;
}
