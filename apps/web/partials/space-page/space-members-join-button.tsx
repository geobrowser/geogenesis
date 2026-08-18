'use client';

import * as React from 'react';

import { useIsMembershipPending } from '~/core/hooks/use-pending-memberships';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useRequestToBeMember } from '~/core/hooks/use-request-to-be-member';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { type ActiveMemberRequest } from '~/core/io/subgraph/fetch-proposed-members';
import { useEnqueuePendingAction } from '~/core/state/pending-actions';
import { useDeferredJoin } from '~/core/state/pending-join-intents';
import { useSignInPrompt } from '~/core/state/sign-in-prompt-store';

import { Pending } from '~/design-system/pending';

import { UnderVote } from './request-status-label';

type SpaceMembersJoinButtonProps = {
  spaceId: string;
  memberRequest: ActiveMemberRequest | null;
};

export function SpaceMembersJoinButton({ spaceId, memberRequest }: SpaceMembersJoinButtonProps) {
  const { requestToBeMember, requestToBeMemberAsync, status } = useRequestToBeMember({ spaceId });
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const { open: openSignInPrompt } = useSignInPrompt();
  const enqueuePendingAction = useEnqueuePendingAction();
  const [optimisticRequested, setOptimisticRequested] = React.useState(false);
  // Durable + optimistic pending state so a request made anywhere (and surviving
  // refresh) reflects here without waiting on this page's SSR memberRequest.
  const isPending = useIsMembershipPending(spaceId);

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

  // A still-listed request whose vote has ended is busted: executed requests drop
  // off the list, so this one can no longer execute and the vote can't be revived.
  const isStuck = Boolean(memberRequest?.isVotingEnded);

  // Open vote, or just submitted (before the indexer catches up) — show the live
  // vote. A stuck request never counts as under vote, so the Join button can
  // reappear.
  const showUnderVote =
    status === 'success' || optimisticRequested || (!isStuck && (memberRequest != null || isPending));

  return (
    <>
      <div className="h-4 w-px bg-divider" />

      <Pending
        isPending={status === 'pending'}
        position="center"
        className="text-grey-04 transition-colors duration-75 hover:cursor-pointer hover:text-text"
      >
        {showUnderVote ? (
          <span>
            <UnderVote />
          </span>
        ) : (
          <button
            onClick={handleJoin}
            disabled={status !== 'idle'}
            title={isStuck ? "Your previous request can't be completed and needs to be sent again." : undefined}
          >
            <RequestButtonText status={status} isStuck={isStuck} />
          </button>
        )}
      </Pending>
    </>
  );
}

type RequestButtonTextProps = {
  status: 'error' | 'idle' | 'pending' | 'success';
  isStuck: boolean;
};

const RequestButtonText = ({ status, isStuck }: RequestButtonTextProps) => {
  if (status === 'error') return 'Error';
  if (isStuck) return 'Must request again';
  return 'Join';
};
