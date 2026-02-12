'use server';

import type { GovernanceProposalType } from './governance-proposal-type-filter';
import { GovernanceProposalsList } from './governance-proposals-list';

export async function loadMoreProposalsAction(spaceId: string, page: number = 0, proposalType?: GovernanceProposalType) {
  const nextPage = page + 1;
  const { node, hasMore } = await GovernanceProposalsList({ spaceId, page: nextPage, proposalType });
  return [node, nextPage, hasMore] as const;
}
