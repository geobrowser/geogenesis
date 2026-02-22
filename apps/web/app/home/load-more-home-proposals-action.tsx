'use server';

import { PendingProposalsPage } from './pending-proposals-page';

export async function loadMoreHomeProposalsAction(
  connectedSpaceId: string,
  connectedAddress: string | undefined,
  proposalType: 'membership' | 'content' | undefined,
  page: number = 0
) {
  const nextPage = page + 1;
  const { node, hasMore } = await PendingProposalsPage({
    connectedSpaceId,
    connectedAddress,
    proposalType,
    page: nextPage,
  });
  return [node, nextPage, hasMore] as const;
}
