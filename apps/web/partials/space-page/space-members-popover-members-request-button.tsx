'use client';

import { useInterimSpaceMembershipRequest } from './use-request-to-be-member';

interface Props {
  spaceId: string;
}

export function SpaceMembersPopoverMemberRequestButton({ spaceId }: Props) {
  const { requestMembership } = useInterimSpaceMembershipRequest(spaceId);

  const onClick = () => {
    requestMembership?.();
  };

  return <button onClick={onClick}>Request to join</button>;
}
