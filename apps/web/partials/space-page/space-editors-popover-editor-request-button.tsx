'use client';

import { useRequestToBeEditor } from './use-request-to-be-editor';

interface Props {
  votingContractAddress: string | null;
}

export function SpaceEditorsPopoverEditorRequestButton({ votingContractAddress }: Props) {
  const { requestToBeEditor, status } = useRequestToBeEditor(votingContractAddress);

  const text = status === 'idle' ? 'Request to be an editor' : status === 'pending' ? 'Pending...' : 'Requested';

  return (
    <button disabled={status !== 'idle'} onClick={() => requestToBeEditor()}>
      {text}
    </button>
  );
}
