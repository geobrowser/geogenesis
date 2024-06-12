'use client';

import { useRequestToBeMember } from './use-request-to-be-member';

interface Props {
  memberContractAddress: string | null;
}

export function SpaceMembersPopoverMemberRequestButton({ memberContractAddress }: Props) {
  const { requestToBeMember: requestMembership } = useRequestToBeMember(memberContractAddress);

  const onClick = () => {
    requestMembership?.();
  };

  return <button onClick={onClick}>Request to join</button>;
}
