'use client';

import { useIsMembershipPending } from '~/core/hooks/use-pending-memberships';
import { useRequestToBeMember } from '~/core/hooks/use-request-to-be-member';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSignInPrompt } from '~/core/state/sign-in-prompt-store';

import { Pending } from '~/design-system/pending';

type ExploreJoinSpaceButtonProps = {
  spaceId: string;
  hasRequestedSpaceMembership: boolean;
  /** Render style. 'text' (default) for inline article-card use; 'button' for the chip-styled button. */
  variant?: 'text' | 'button';
  /** CTA label for the idle state. Defaults to 'Join space'; pill use passes 'Join'. */
  label?: string;
};

export function ExploreJoinSpaceButton({
  spaceId,
  hasRequestedSpaceMembership,
  variant = 'text',
  label = 'Join space',
}: ExploreJoinSpaceButtonProps) {
  const { requestToBeMember, status } = useRequestToBeMember({ spaceId });
  const { smartAccount } = useSmartAccount();
  const { open: openSignInPrompt } = useSignInPrompt();

  // Durable + persisted pending state so a request made anywhere (space page,
  // the "Join spaces" pills) flips every card for this space to "Membership
  // pending" without a refresh.
  const isPending = useIsMembershipPending(spaceId);
  const showPendingLabel = hasRequestedSpaceMembership || isPending;

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
          {label}
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
          {label}
        </button>
      )}
    </Pending>
  );
}
