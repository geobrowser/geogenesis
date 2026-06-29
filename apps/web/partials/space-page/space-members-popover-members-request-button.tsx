'use client';

import { useIsMembershipPending } from '~/core/hooks/use-pending-memberships';
import { useRequestToBeMember } from '~/core/hooks/use-request-to-be-member';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSignInPrompt } from '~/core/state/sign-in-prompt-store';

import { Pending } from '~/design-system/pending';

type SpaceMembersPopoverMemberRequestButtonProps = {
  spaceId: string;
  hasRequestedSpaceMembership: boolean;
};

export function SpaceMembersPopoverMemberRequestButton({
  spaceId,
  hasRequestedSpaceMembership,
}: SpaceMembersPopoverMemberRequestButtonProps) {
  const { requestToBeMember, status } = useRequestToBeMember({ spaceId });
  const { smartAccount } = useSmartAccount();
  const { open: openSignInPrompt } = useSignInPrompt();
  // Reflect a pending request made anywhere (and surviving refresh).
  const isPending = useIsMembershipPending(spaceId);
  const hasRequested = hasRequestedSpaceMembership || isPending;

  return (
    <Pending isPending={status === 'pending'} position="end">
      {!hasRequested ? (
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
        >
          <RequestButtonText status={status} />
        </button>
      ) : (
        <span className="text-smallButton text-grey-04">Requested</span>
      )}
    </Pending>
  );
}

type RequestButtonTextProps = {
  status: 'error' | 'idle' | 'pending' | 'success';
};

const RequestButtonText = ({ status }: RequestButtonTextProps) => {
  switch (status) {
    case 'success':
      return 'Requested';
    case 'idle':
    case 'pending':
      return 'Request to join';
    case 'error':
      return 'Error';
    default:
      return null;
  }
};
