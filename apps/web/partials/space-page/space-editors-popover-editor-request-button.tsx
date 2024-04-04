'use client';

import { useInterimSpaceMembershipRequest } from './use-request-to-be-editor';

interface Props {
  spaceId: string;
}

export function SpaceEditorsPopoverEditorRequestButton({ spaceId }: Props) {
  const { requestMembership } = useInterimSpaceMembershipRequest(spaceId);

  const onClick = () => {
    requestMembership?.();
  };

  return <button onClick={onClick}>Request to be an editor</button>;
}
