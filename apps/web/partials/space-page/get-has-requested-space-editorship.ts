import { Effect } from 'effect';

import { cache } from 'react';

import { fetchProfile } from '~/core/io/subgraph';
import { hasActiveEditorProposal } from '~/core/io/subgraph/fetch-proposed-editors';

export const getHasRequestedSpaceEditorship = cache(
  async (spaceId: string, connectedAddress?: string): Promise<boolean> => {
    if (!connectedAddress) return false;

    const profile = await Effect.runPromise(fetchProfile(connectedAddress));
    if (!profile?.spaceId) return false;

    return hasActiveEditorProposal(spaceId, profile.spaceId);
  }
);
