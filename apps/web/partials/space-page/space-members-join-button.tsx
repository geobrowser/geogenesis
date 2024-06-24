'use client';

import * as React from 'react';

import { useRequestToBeMember } from './use-request-to-be-member';

interface Props {
  spaceId: string;
  votingPluginAddress: string | null;
}

export function SpaceMembersJoinButton({ votingPluginAddress }: Props) {
  const [hasRequested, setHasRequested] = React.useState(false);
  const { requestToBeMember } = useRequestToBeMember(votingPluginAddress);

  const onClick = async () => {
    await requestToBeMember();
    setHasRequested(true);
  };

  return (
    <button
      onClick={onClick}
      className="text-grey-04 transition-colors duration-75 hover:cursor-pointer hover:text-text"
    >
      {hasRequested ? 'Requested' : 'Join'}
    </button>
  );
}
