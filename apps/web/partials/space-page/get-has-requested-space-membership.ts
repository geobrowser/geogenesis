import { Effect } from 'effect';
import { cache } from 'react';

import { fetchProfile } from '~/core/io/subgraph';
import { hasActiveMemberProposal } from '~/core/io/subgraph/fetch-proposed-members';

export const getHasRequestedSpaceMembership = cache(
  async (spaceId: string, connectedAddress?: string): Promise<boolean> => {
    if (!connectedAddress) return false;

    const profile = await Effect.runPromise(fetchProfile(connectedAddress));
    if (!profile?.spaceId) return false;

    return hasActiveMemberProposal(spaceId, profile.spaceId);
  }
);
