'use client';

import { useRequestToBeMember } from '~/core/hooks/use-request-to-be-member';

interface Props {
  votingPluginAddress: string | null;
}

export function SpaceMembersPopoverMemberRequestButton({ votingPluginAddress }: Props) {
  const { requestToBeMember, status } = useRequestToBeMember(votingPluginAddress);
  const text = status === 'idle' ? 'Request to join' : status === 'pending' ? 'Pending...' : 'Requested';

  return (
    <button disabled={status !== 'idle'} onClick={() => requestToBeMember()}>
      {text}
    </button>
  );
}
