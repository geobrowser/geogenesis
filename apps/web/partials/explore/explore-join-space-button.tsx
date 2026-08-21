'use client';

import * as React from 'react';

import { useIsMembershipPending } from '~/core/hooks/use-pending-memberships';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useRequestToBeMember } from '~/core/hooks/use-request-to-be-member';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useEnqueuePendingAction } from '~/core/state/pending-actions';
import { useDeferredJoin } from '~/core/state/pending-join-intents';
import { useSignInPrompt } from '~/core/state/sign-in-prompt-store';

import { Pending } from '~/design-system/pending';

type ExploreJoinSpaceButtonProps = {
  spaceId: string;
  hasRequestedSpaceMembership: boolean;
  /**
   * Render style.
   * - 'text' (default): inline text CTA ("Join space")
   * - 'button': chip-styled button
   * - 'compact' / 'pill': small rounded pill next to a space badge on explore cards ("Join")
   */
  variant?: 'text' | 'button' | 'compact' | 'pill';
  /** CTA label for the idle state. Defaults to 'Join space'; compact/pill use passes 'Join'. */
  label?: string;
};

export function ExploreJoinSpaceButton({
  spaceId,
  hasRequestedSpaceMembership,
  variant = 'text',
  label = 'Join space',
}: ExploreJoinSpaceButtonProps) {
  const { requestToBeMember, requestToBeMemberAsync, status } = useRequestToBeMember({ spaceId });
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const { open: openSignInPrompt } = useSignInPrompt();
  const enqueuePendingAction = useEnqueuePendingAction();
  const [optimisticRequested, setOptimisticRequested] = React.useState(false);

  const queueJoinRequest = React.useCallback(() => {
    // The PendingActionsRunner submits it once the space registers.
    setOptimisticRequested(true);
    enqueuePendingAction({
      id: `join:${spaceId}`,
      label: 'your membership request',
      requires: 'personalSpace',
      run: () => requestToBeMemberAsync(),
    });
  }, [enqueuePendingAction, spaceId, requestToBeMemberAsync]);

  const deferJoin = useDeferredJoin(spaceId, Boolean(smartAccount), queueJoinRequest);

  // Durable + persisted pending state so a request made anywhere (space page,
  // the "Join spaces" pills) flips every card for this space to "Membership
  // pending" without a refresh.
  const isPending = useIsMembershipPending(spaceId);
  const showPendingLabel = hasRequestedSpaceMembership || isPending || optimisticRequested;

  const canRequestLive = Boolean(smartAccount && isRegistered && personalSpaceId);

  const handleJoin = () => {
    if (canRequestLive) {
      requestToBeMember();
      return;
    }
    if (!smartAccount) {
      deferJoin();
      openSignInPrompt('join');
      return;
    }
    queueJoinRequest();
  };

  return (
    <Pending isPending={status === 'pending'} position="end">
      {showPendingLabel ? (
        <span className="text-smallButton text-grey-04">Membership pending</span>
      ) : variant === 'pill' ? (
        <button
          type="button"
          className="flex h-[18px] items-center rounded-full border border-grey-02 px-1.5 text-[14px] leading-[13px] text-text transition-colors duration-150 hover:border-text"
          disabled={status !== 'idle'}
          onClick={handleJoin}
        >
          {label}
        </button>
      ) : variant === 'button' ? (
        <button
          type="button"
          className="flex h-6 items-center rounded border border-grey-02 px-2 text-metadata text-grey-04 shadow-button transition-colors duration-150 focus-within:border-text hover:border-text"
          disabled={status !== 'idle'}
          onClick={handleJoin}
        >
          {label}
        </button>
      ) : variant === 'compact' ? (
        <button
          type="button"
          className="box-border inline-flex shrink-0 items-center justify-center rounded-full border border-grey-02 px-[6px] py-[2px] text-[14px] leading-none text-[#151515] transition-colors duration-150 hover:border-grey-04"
          disabled={status !== 'idle'}
          onClick={handleJoin}
        >
          {label}
        </button>
      ) : (
        <button
          type="button"
          className="text-smallButton text-grey-04 transition-colors duration-75 hover:text-text"
          disabled={status !== 'idle'}
          onClick={handleJoin}
        >
          {label}
        </button>
      )}
    </Pending>
  );
}
