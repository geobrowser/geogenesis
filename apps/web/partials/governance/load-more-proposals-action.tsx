'use server';

import { GovernanceProposalsList } from './governance-proposals-list';

export async function loadMoreProposalsAction(spaceId: string, page: number = 0) {
  return [<GovernanceProposalsList page={page + 1} spaceId={spaceId} />, page + 1] as const;
}
