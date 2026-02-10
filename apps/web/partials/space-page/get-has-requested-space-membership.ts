import { Effect } from 'effect';
import { cache } from 'react';

import { fetchProfile } from '~/core/io/subgraph';
import { fetchProposedMembers } from '~/core/io/subgraph/fetch-proposed-members';

export const getHasRequestedSpaceMembership = cache(
  async (spaceId: string, connectedAddress?: string): Promise<boolean> => {
    if (!connectedAddress) return false;

    const [proposedMemberSpaceIds, profile] = await Promise.all([
      fetchProposedMembers({ id: spaceId }),
      Effect.runPromise(fetchProfile(connectedAddress)),
    ]);

    if (!profile?.spaceId) return false;

    return proposedMemberSpaceIds
      .map(id => id.toLowerCase())
      .includes(profile.spaceId.toLowerCase());
  }
);
