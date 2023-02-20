import { createRoomContext } from '@liveblocks/react';
import { useEffect } from 'react';
import { client } from './entity-presence-client';

export const EntityPresenceContext = createRoomContext<{ address: `0x${string}` | undefined }>(client);

interface Props {
  children: React.ReactNode;
  entityId: string;
  address: `0x${string}` | undefined;
}

export function EntityPresenceProvider({ children, entityId, address }: Props) {
  return (
    <EntityPresenceContext.RoomProvider id={entityId} initialPresence={{ address }}>
      {children}
    </EntityPresenceContext.RoomProvider>
  );
}
