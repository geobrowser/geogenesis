'use client';

import { useOnboardGuard } from '~/core/hooks/use-onboard-guard';
import { useRequestToBeMember } from '~/core/hooks/use-request-to-be-member';

import { Pending } from '~/design-system/pending';

type SpaceMembersPopoverMemberRequestButtonProps = {
  votingPluginAddress: string | null;
  hasRequestedSpaceMembership: boolean;
};

export function SpaceMembersPopoverMemberRequestButton({
  votingPluginAddress,
  hasRequestedSpaceMembership,
}: SpaceMembersPopoverMemberRequestButtonProps) {
  const { requestToBeMember, status } = useRequestToBeMember(votingPluginAddress);
  const { shouldShowElement } = useOnboardGuard();

  if (!shouldShowElement) {
    return null;
  }

  return (
    <Pending isPending={status === 'pending'} position="end">
      {!hasRequestedSpaceMembership ? (
        <button disabled={status !== 'idle'} onClick={() => requestToBeMember()}>
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
    case 'idle':
    case 'pending':
      return 'Request to join';
    case 'error':
      return 'Error';
    default:
      return null;
  }
};
