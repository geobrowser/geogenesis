import { Effect } from 'effect';
import { cache } from 'react';

import { fetchProfile } from '~/core/io/subgraph';
import { fetchProposedEditors } from '~/core/io/subgraph/fetch-proposed-editors';

export const getHasRequestedSpaceEditorship = cache(
  async (spaceId: string, connectedAddress?: string): Promise<boolean> => {
    if (!connectedAddress) return false;

    const [proposedEditorSpaceIds, profile] = await Promise.all([
      fetchProposedEditors({ id: spaceId }),
      Effect.runPromise(fetchProfile(connectedAddress)),
    ]);

    if (!profile?.spaceId) return false;

    return proposedEditorSpaceIds
      .map(id => id.toLowerCase())
      .includes(profile.spaceId.toLowerCase());
  }
);
