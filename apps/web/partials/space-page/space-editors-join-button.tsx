'use client';

import * as React from 'react';

import { useRequestToBeEditor } from '~/core/hooks/use-request-to-be-editor';

interface Props {
  spaceId: string;
  votingPluginAddress: string | null;
}

export function SpaceEditorsJoinButton({ votingPluginAddress }: Props) {
  const { requestToBeEditor, status } = useRequestToBeEditor(votingPluginAddress);

  const onClick = async () => {
    await requestToBeEditor();
  };

  const text = status === 'idle' ? 'Request to be an editor' : status === 'pending' ? 'Pending...' : 'Requested';

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
