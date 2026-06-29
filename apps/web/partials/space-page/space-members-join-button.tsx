'use client';

import { useIsMembershipPending } from '~/core/hooks/use-pending-memberships';
import { useRequestToBeMember } from '~/core/hooks/use-request-to-be-member';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSignInPrompt } from '~/core/state/sign-in-prompt-store';

import { Pending } from '~/design-system/pending';

type SpaceMembersJoinButtonProps = {
  spaceId: string;
  hasRequestedSpaceMembership: boolean;
};

export function SpaceMembersJoinButton({ spaceId, hasRequestedSpaceMembership }: SpaceMembersJoinButtonProps) {
  const { requestToBeMember, status } = useRequestToBeMember({ spaceId });
  const { smartAccount } = useSmartAccount();
  const { open: openSignInPrompt } = useSignInPrompt();
  // OR the SSR-seeded prop with the durable + optimistic pending state so a
  // request made anywhere (and surviving refresh) shows "Requested" here too.
  const isPending = useIsMembershipPending(spaceId);
  const hasRequested = hasRequestedSpaceMembership || isPending;

  return (
    <>
      <div className="h-4 w-px bg-divider" />

      <Pending
        isPending={status === 'pending'}
        position="center"
        className="text-grey-04 transition-colors duration-75 hover:cursor-pointer hover:text-text"
      >
        {!hasRequested ? (
          <button
            onClick={() => {
              if (!smartAccount) {
                openSignInPrompt('join');
                return;
              }
              requestToBeMember();
            }}
            disabled={status !== 'idle'}
          >
            <RequestButtonText status={status} />
          </button>
        ) : (
          <span>Requested</span>
        )}
      </Pending>
    </>
  );
}

type RequestButtonTextProps = {
  status: 'error' | 'idle' | 'pending' | 'success';
};

const RequestButtonText = ({ status }: RequestButtonTextProps) => {
  switch (status) {
    case 'success':
      return 'Requested';
    case 'pending':
    case 'idle':
      return 'Join';
    case 'error':
      return 'Error';
    default:
      return null;
  }
};
