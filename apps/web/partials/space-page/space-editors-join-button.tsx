'use client';

import * as React from 'react';

import { useRequestToBeEditor } from './use-request-to-be-editor';

interface Props {
  spaceId: string;
  votingPluginAddress: string | null;
}

export function SpaceEditorsJoinButton({ votingPluginAddress }: Props) {
  const [hasRequested, setHasRequested] = React.useState(false);
  const { requestToBeEditor } = useRequestToBeEditor(votingPluginAddress);

  const onClick = async () => {
    await requestToBeEditor();
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
