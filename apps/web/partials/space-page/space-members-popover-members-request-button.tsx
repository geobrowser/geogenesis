'use client';

import { useRequestToBeMember } from './use-request-to-be-member';

interface Props {
  votingPluginAddress: string | null;
}

export function SpaceMembersPopoverMemberRequestButton({ votingPluginAddress }: Props) {
  const { requestToBeMember: requestMembership } = useRequestToBeMember(votingPluginAddress);

  const onClick = () => {
    requestMembership?.();
  };

  return <button onClick={onClick}>Request to join</button>;
}
