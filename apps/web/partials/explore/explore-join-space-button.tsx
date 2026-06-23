'use client';

import * as React from 'react';

import { atom, useAtom } from 'jotai';

import { useRequestToBeMember } from '~/core/hooks/use-request-to-be-member';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSignInPrompt } from '~/core/state/sign-in-prompt-store';

import { Pending } from '~/design-system/pending';

type ExploreJoinSpaceButtonProps = {
  spaceId: string;
  hasRequestedSpaceMembership: boolean;
  /** Render style. 'text' (default) for inline article-card use; 'button' for the chip-styled button. */
  variant?: 'text' | 'button';
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

export function ExploreJoinSpaceButton({
  spaceId,
  hasRequestedSpaceMembership,
  variant = 'text',
}: ExploreJoinSpaceButtonProps) {
  const { requestToBeMember, status } = useRequestToBeMember({ spaceId });
  const [locallyRequested, setLocallyRequested] = useAtom(locallyRequestedSpaceIdsAtom);
  const { smartAccount } = useSmartAccount();
  const { open: openSignInPrompt } = useSignInPrompt();

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

  const showPendingLabel = hasRequestedSpaceMembership || locallyRequestedThisSpace;

  return (
    <Pending isPending={status === 'pending'} position="end">
      {showPendingLabel ? (
        <span className="text-smallButton text-grey-04">Membership pending</span>
      ) : variant === 'button' ? (
        <button
          type="button"
          className="flex h-6 items-center rounded border border-grey-02 px-2 text-metadata text-grey-04 shadow-button transition-colors duration-150 focus-within:border-text hover:border-text"
          disabled={status !== 'idle'}
          onClick={() => {
            if (!smartAccount) {
              openSignInPrompt('join');
              return;
            }
            requestToBeMember();
          }}
        >
          Join space
        </button>
      ) : (
        <button
          type="button"
          className="text-smallButton text-grey-04 transition-colors duration-75 hover:text-text"
          disabled={status !== 'idle'}
          onClick={() => {
            if (!smartAccount) {
              openSignInPrompt('join');
              return;
            }
            requestToBeMember();
          }}
        >
          Join space
        </button>
      )}
    </Pending>
  );
}
