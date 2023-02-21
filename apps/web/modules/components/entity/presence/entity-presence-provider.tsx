import { createRoomContext } from '@liveblocks/react';
import { useAccount } from 'wagmi';
import { client } from './entity-presence-client';

export const EntityPresenceContext = createRoomContext<{ address: `0x${string}` | undefined }>(client);

interface Props {
  children: React.ReactNode;
  entityId: string;
}

export function EntityPresenceProvider({ children, entityId }: Props) {
  const account = useAccount();

  return (
    <EntityPresenceContext.RoomProvider id={entityId} initialPresence={{ address: account.address }}>
      {children}
    </EntityPresenceContext.RoomProvider>
  );
}
