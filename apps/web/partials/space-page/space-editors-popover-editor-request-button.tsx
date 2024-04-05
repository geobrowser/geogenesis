'use client';

import { useRequestToBeMember } from './use-request-to-be-member';

interface Props {
  spaceId: string;
}

export function SpaceEditorsPopoverEditorRequestButton({ spaceId }: Props) {
  // @TODO: Needs correct contract address
  const { requestMembership } = useRequestToBeMember(spaceId);

  const onClick = () => {
    requestMembership?.();
  };

  return <button onClick={onClick}>Request to be an editor</button>;
}
