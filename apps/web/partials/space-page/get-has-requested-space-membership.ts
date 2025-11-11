import { cache } from 'react';

import { fetchProposedMembers } from '~/core/io/subgraph/fetch-proposed-members';

export const getHasRequestedSpaceMembership = cache(
  async (spaceId: string, connectedAddress?: string): Promise<boolean> => {
    // const proposedMembers = await fetchProposedMembers({ id: spaceId });
    const proposedMembers: string[] = [];

    // @HACK to get around incorrect checksum addresses in substream
    return connectedAddress
      ? proposedMembers.map(e => e.toLowerCase()).includes(connectedAddress?.toLowerCase())
      : false;
  }
);
