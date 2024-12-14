'use client';

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
  const text = ['idle', 'pending'].includes(status) ? 'Request to join' : 'Requested';

  return (
    <Pending isPending={status === 'pending'} position="end">
      {!hasRequestedSpaceMembership ? (
        <button disabled={status !== 'idle'} onClick={() => requestToBeMember()}>
          {text}
        </button>
      ) : (
        <span>Requested</span>
      )}
    </Pending>
  );
}
