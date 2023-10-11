'use client';

import { useInterimSpaceMembershipRequest } from './use-interim-space-membership-request';

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
