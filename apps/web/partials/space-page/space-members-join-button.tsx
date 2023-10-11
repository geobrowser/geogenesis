'use client';

import { useInterimSpaceMembershipRequest } from './use-interim-space-membership-request';

interface Props {
  spaceId: string;
}

export function SpaceMembersJoinButton({ spaceId }: Props) {
  const { requestMembership } = useInterimSpaceMembershipRequest(spaceId);

  const onClick = () => {
    requestMembership?.();
  };

  return (
    <button
      onClick={onClick}
      className="text-grey-04 transition-colors duration-75 hover:cursor-pointer hover:text-text"
    >
      Join
    </button>
  );
}
