'use client';

import { useRequestToBeMember } from './use-request-to-be-editor';

interface Props {
  spaceId: string;
  memberAccessPluginAddress: string | null;
}

export function SpaceMembersJoinButton({ memberAccessPluginAddress }: Props) {
  const { requestMembership } = useRequestToBeMember(memberAccessPluginAddress);

  return (
    <button
      onClick={requestMembership}
      className="text-grey-04 transition-colors duration-75 hover:cursor-pointer hover:text-text"
    >
      Join
    </button>
  );
}
