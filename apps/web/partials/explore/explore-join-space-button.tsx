'use client';

import { useIsMembershipPending } from '~/core/hooks/use-pending-memberships';
import { useRequestToBeMember } from '~/core/hooks/use-request-to-be-member';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSignInPrompt } from '~/core/state/sign-in-prompt-store';

import { Pending } from '~/design-system/pending';

type ExploreJoinSpaceButtonProps = {
  spaceId: string;
  hasRequestedSpaceMembership: boolean;
  /**
   * Render style.
   * - 'text' (default): inline text CTA ("Join space")
   * - 'button': chip-styled button
   * - 'compact': small pill next to the space name on explore cards ("Join")
   */
  variant?: 'text' | 'button' | 'compact';
  /** CTA label for the idle state. Defaults to 'Join space'; compact use passes 'Join'. */
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

  const onClick = () => {
    if (!smartAccount) {
      openSignInPrompt('join');
      return;
    }
    requestToBeMember();
  };

  return (
    <Pending isPending={status === 'pending'} position="end">
      {showPendingLabel ? (
        <span className="text-smallButton text-grey-04">Membership pending</span>
      ) : variant === 'button' ? (
        <button
          type="button"
          className="flex h-6 items-center rounded border border-grey-02 px-2 text-metadata text-grey-04 shadow-button transition-colors duration-150 focus-within:border-text hover:border-text"
          disabled={status !== 'idle'}
          onClick={onClick}
        >
          {label}
        </button>
      ) : variant === 'compact' ? (
        <button
          type="button"
          className="box-border inline-flex shrink-0 items-center justify-center rounded-full border border-grey-02 px-[6px] py-[2px] text-[14px] leading-none text-[#151515] transition-colors duration-150 hover:border-grey-04"
          disabled={status !== 'idle'}
          onClick={onClick}
        >
          {label}
        </button>
      ) : (
        <button
          type="button"
          className="text-smallButton text-grey-04 transition-colors duration-75 hover:text-text"
          disabled={status !== 'idle'}
          onClick={onClick}
        >
          {label}
        </button>
      )}
    </Pending>
  );
}
