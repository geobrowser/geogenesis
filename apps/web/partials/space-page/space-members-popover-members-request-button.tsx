'use client';

import { useRequestToBeMember } from '~/core/hooks/use-request-to-be-member';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { type ActiveMemberRequest } from '~/core/io/subgraph/fetch-proposed-members';
import { useSignInPrompt } from '~/core/state/sign-in-prompt-store';

import { Pending } from '~/design-system/pending';

import { UnderVote } from './request-status-label';

type SpaceMembersPopoverMemberRequestButtonProps = {
  spaceId: string;
  memberRequest: ActiveMemberRequest | null;
};

export function SpaceMembersPopoverMemberRequestButton({
  spaceId,
  memberRequest,
}: SpaceMembersPopoverMemberRequestButtonProps) {
  const { requestToBeMember, status } = useRequestToBeMember({ spaceId });
  const { smartAccount } = useSmartAccount();
  const { open: openSignInPrompt } = useSignInPrompt();

  // A still-listed request whose vote has ended is busted: executed requests drop
  // off the list, so this one can no longer execute and the vote can't be revived.
  const isStuck = Boolean(memberRequest?.isVotingEnded);

  // Open vote, or just submitted (before the indexer catches up) — show the live
  // vote so we never flip back to "Request again".
  if (status === 'success' || (memberRequest && !isStuck)) {
    return (
      <span className="text-smallButton text-grey-04">
        <UnderVote />
      </span>
    );
  }

  return (
    <Pending isPending={status === 'pending'} position="end">
      <button
        className="text-smallButton text-grey-04 transition-colors duration-75 hover:text-text"
        disabled={status !== 'idle'}
        onClick={() => {
          if (!smartAccount) {
            openSignInPrompt('join');
            return;
          }
          requestToBeMember();
        }}
        title={isStuck ? "Your previous request can't be completed and needs to be sent again." : undefined}
      >
        <RequestButtonText status={status} isStuck={isStuck} />
      </button>
    </Pending>
  );
}

type RequestButtonTextProps = {
  status: 'error' | 'idle' | 'pending' | 'success';
  isStuck: boolean;
};

const RequestButtonText = ({ status, isStuck }: RequestButtonTextProps) => {
  if (status === 'error') return 'Error';
  if (isStuck) return 'Must request again';
  return 'Request to join';
};
