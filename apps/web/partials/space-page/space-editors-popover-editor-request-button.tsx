'use client';

import { useRequestToBeEditor } from './use-request-to-be-editor';

interface Props {
  votingContractAddress: string | null;
}

export function SpaceEditorsPopoverEditorRequestButton({ votingContractAddress }: Props) {
  const { requestToBeEditor } = useRequestToBeEditor(votingContractAddress);

  const onClick = () => {
    requestToBeEditor?.();
  };

  return <button onClick={onClick}>Request to be an editor</button>;
}
