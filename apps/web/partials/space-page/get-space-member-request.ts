import { cache } from 'react';

import { Effect } from 'effect';

import { isValidUUID } from '~/core/io/rest/validation';
import { fetchProfile } from '~/core/io/subgraph';
import { type ActiveMemberRequest, fetchActiveMemberRequest } from '~/core/io/subgraph/fetch-proposed-members';

/**
 * The connected user's active ADD_MEMBER request for this space, or null. Drives
 * the members popover / join button: an open vote shows "Under vote"; a request
 * whose vote has ended but never executed (stuck / dead) lets the user re-request
 * in one click.
 */
export const getSpaceMemberRequest = cache(
  async (spaceId: string, connectedAddress?: string): Promise<ActiveMemberRequest | null> => {
    if (!connectedAddress) return null;

    const profile = await Effect.runPromise(fetchProfile(connectedAddress));
    if (!profile?.spaceId || !isValidUUID(profile.spaceId)) return null;

    return fetchActiveMemberRequest(spaceId, profile.spaceId);
  }
);
