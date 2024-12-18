import { cache } from 'react';

import { fetchProposedEditors } from '~/core/io/subgraph/fetch-proposed-editors';

export const getHasRequestedSpaceEditorship = cache(
  async (spaceId: string, connectedAddress?: string): Promise<boolean> => {
    const proposedEditors = await fetchProposedEditors({ id: spaceId });

    // @HACK to get around incorrect checksum addresses in substream
    return connectedAddress
      ? proposedEditors.map(e => e.toLowerCase()).includes(connectedAddress?.toLowerCase())
      : false;
  }
);
