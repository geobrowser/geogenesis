'use client';

import * as React from 'react';

import { useRequestToBeMember } from '~/core/hooks/use-request-to-be-member';

interface Props {
  spaceId: string;
  votingPluginAddress: string | null;
}

export function SpaceMembersJoinButton({ votingPluginAddress }: Props) {
  const { requestToBeMember, status } = useRequestToBeMember(votingPluginAddress);

  const onClick = async () => {
    await requestToBeMember();
  };

  const text = status === 'idle' ? 'Request to join' : status === 'pending' ? 'Pending...' : 'Requested';

  return (
    <button
      onClick={onClick}
      disabled={status !== 'idle'}
      className="text-grey-04 transition-colors duration-75 hover:cursor-pointer hover:text-text"
    >
      {text}
    </button>
  );
}
