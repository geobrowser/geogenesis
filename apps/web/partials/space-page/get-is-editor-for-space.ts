import { cache } from 'react';

import { Subgraph } from '~/core/io';

export const getIsEditorForSpace = cache(async (spaceId: string, connectedAddress?: string): Promise<boolean> => {
  const space = await Subgraph.fetchSpace({ id: spaceId });

  if (!space) {
    throw new Error("Space doesn't exist");
  }

  // @HACK to get around incorrect checksum addresses in substream
  return connectedAddress ? space.editors.map(e => e.toLowerCase()).includes(connectedAddress?.toLowerCase()) : false;
});
