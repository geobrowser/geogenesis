'use server';

import { GovernanceProposalsList } from './governance-proposals-list';

export async function loadMoreProposalsAction(spaceId: string, page: number = 0) {
  const nextPage = page + 1;
  const { node, hasMore } = await GovernanceProposalsList({ spaceId, page: nextPage });
  return [node, nextPage, hasMore] as const;
}
