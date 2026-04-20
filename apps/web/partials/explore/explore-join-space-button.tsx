'use client';

import { atom, useAtom } from 'jotai';
import * as React from 'react';

import { useOnboardGuard } from '~/core/hooks/use-onboard-guard';
import { useRequestToBeMember } from '~/core/hooks/use-request-to-be-member';

import { Pending } from '~/design-system/pending';

type ExploreJoinSpaceButtonProps = {
  spaceId: string;
  hasRequestedSpaceMembership: boolean;
};

function normId(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

/**
 * Space IDs the user has requested membership for in this session. Shared across all
 * explore cards so every card for the same space flips to "Membership pending" after
 * one click — no need to refetch the feed.
 */
const locallyRequestedSpaceIdsAtom = atom<Set<string>>(new Set<string>());

export function ExploreJoinSpaceButton({ spaceId, hasRequestedSpaceMembership }: ExploreJoinSpaceButtonProps) {
  const { requestToBeMember, status } = useRequestToBeMember({ spaceId });
  const { shouldShowElement } = useOnboardGuard();
  const [locallyRequested, setLocallyRequested] = useAtom(locallyRequestedSpaceIdsAtom);

  const normalizedId = normId(spaceId);
  const locallyRequestedThisSpace = locallyRequested.has(normalizedId);

  React.useEffect(() => {
    if (status === 'success' && !locallyRequestedThisSpace) {
      setLocallyRequested(prev => {
        const next = new Set(prev);
        next.add(normalizedId);
        return next;
      });
    }
  }, [status, normalizedId, locallyRequestedThisSpace, setLocallyRequested]);

  if (!shouldShowElement) {
    return null;
  }

  const showPendingLabel = hasRequestedSpaceMembership || locallyRequestedThisSpace;

  return (
    <Pending isPending={status === 'pending'} position="end">
      {showPendingLabel ? (
        <span className="text-smallButton text-grey-04">Membership pending</span>
      ) : (
        <button
          type="button"
          className="text-smallButton text-grey-04 transition-colors duration-75 hover:text-text"
          disabled={status !== 'idle'}
          onClick={() => requestToBeMember()}
        >
          Join space
        </button>
      )}
    </Pending>
  );
}
