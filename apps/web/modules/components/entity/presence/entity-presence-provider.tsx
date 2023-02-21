import { createRoomContext } from '@liveblocks/react';
import { useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useAccessControl } from '~/modules/auth/use-access-control';
import { useEditable } from '~/modules/stores/use-editable';
import { client } from './entity-presence-client';

export const EntityPresenceContext = createRoomContext<{ address: `0x${string}` | undefined; isEditing: boolean }>(
  client
);

interface Props {
  children: React.ReactNode;
  entityId: string;
  spaceId: string;
}

export function EntityPresenceProvider({ children, entityId, spaceId }: Props) {
  const account = useAccount();

  return (
    <EntityPresenceContext.RoomProvider id={entityId} initialPresence={{ address: account.address, isEditing: false }}>
      <UserPresenceProvider spaceId={spaceId}>{children}</UserPresenceProvider>
    </EntityPresenceContext.RoomProvider>
  );
}

function UserPresenceProvider({ children, spaceId }: { children: React.ReactNode; spaceId: string }) {
  const { isEditor } = useAccessControl(spaceId);
  const { editable } = useEditable();
  const account = useAccount();
  const updateMyPresence = EntityPresenceContext.useUpdateMyPresence();

  useEffect(() => {
    updateMyPresence({ address: account.address, isEditing: isEditor && editable });
  }, [isEditor, editable]);

  return <div>{children}</div>;
}
