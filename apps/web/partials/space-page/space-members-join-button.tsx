'use client';

import { useOnboardGuard } from '~/core/hooks/use-onboard-guard';
import { useRequestToBeMember } from '~/core/hooks/use-request-to-be-member';

import { Pending } from '~/design-system/pending';

type SpaceMembersJoinButtonProps = {
  spaceId: string;
  votingPluginAddress: string | null;
  hasRequestedSpaceMembership: boolean;
};

export function SpaceMembersJoinButton({
  votingPluginAddress,
  hasRequestedSpaceMembership,
}: SpaceMembersJoinButtonProps) {
  const { requestToBeMember, status } = useRequestToBeMember(votingPluginAddress);

  const { shouldShowElement } = useOnboardGuard();

  if (!shouldShowElement) {
    return null;
  }

  return (
    <Pending
      isPending={status === 'pending'}
      position="center"
      className="text-grey-04 transition-colors duration-75 hover:cursor-pointer hover:text-text"
    >
      {!hasRequestedSpaceMembership ? (
        <button onClick={() => requestToBeMember()} disabled={status !== 'idle'}>
          <RequestButtonText status={status} />
        </button>
      ) : (
        <span>Requested</span>
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
    case 'pending':
    case 'idle':
      return 'Join';
    case 'error':
      return 'Error';
    default:
      return null;
  }
};
