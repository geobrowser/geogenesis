import { cache } from 'react';

import { Effect } from 'effect';

import { isValidUUID } from '~/core/io/rest/validation';
import { fetchProfile } from '~/core/io/subgraph';
import { type ActiveEditorRequest, fetchActiveEditorRequest } from '~/core/io/subgraph/fetch-proposed-editors';

/**
 * The connected user's active ADD_EDITOR request for this space, or null. Drives
 * the editors popover: an open vote shows "Under vote"; a request whose vote has
 * ended but never executed (stuck / dead) lets the user re-apply in one click.
 */
export const getSpaceEditorRequest = cache(
  async (spaceId: string, connectedAddress?: string): Promise<ActiveEditorRequest | null> => {
    if (!connectedAddress) return null;

    const profile = await Effect.runPromise(fetchProfile(connectedAddress));
    if (!profile?.spaceId || !isValidUUID(profile.spaceId)) return null;

    return fetchActiveEditorRequest(spaceId, profile.spaceId);
  }
);
