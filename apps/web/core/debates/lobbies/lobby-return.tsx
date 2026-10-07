'use client';

import * as React from 'react';

import { Text } from '~/design-system/text';

import { peekDebateReturnDestination } from '../debate-return-navigation';
import { debateRoomIdFromPath } from '../rooms/room-routes';
import { useDebateLobby } from './hooks';
import { requestLobbyRejoin } from './step-out';

/** The lobby this debate flow returns to, read once per mount; null when it did not start in one. */
export function useRecordedLobby(): string | null {
  const [lobbyId] = React.useState(() => {
    const destination = peekDebateReturnDestination();
    return destination ? debateRoomIdFromPath(destination) : null;
  });
  return lobbyId;
}

type BackToLobbyProps = { onLeave: () => void; disabled?: boolean };

/**
 * A row for the debate's end card: leaves the debate the usual way, which returns to the lobby, and
 * has the lobby join again on arrival. Hidden unless the debate started in a lobby that is still open.
 */
export function BackToLobbyRow(props: BackToLobbyProps) {
  const lobbyId = useRecordedLobby();
  return lobbyId ? <OpenLobbyRow lobbyId={lobbyId} {...props} /> : null;
}

function OpenLobbyRow({ lobbyId, onLeave, disabled = false }: BackToLobbyProps & { lobbyId: string }) {
  const lobby = useDebateLobby(lobbyId).data;
  // A host removed them: going back is a choice made on the lobby page, not from here.
  if (lobby?.access.status !== 'admitted' || lobby.viewer.removed) return null;

  return (
    <>
      <div aria-hidden className="h-px w-full shrink-0 bg-divider" />
      <div className="flex min-h-7 items-center justify-between gap-2.5">
        <Text as="span" variant="smallTitle" color="text">
          Lobby still open
        </Text>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            requestLobbyRejoin(lobbyId);
            onLeave();
          }}
          className="inline-flex min-h-7 shrink-0 items-center justify-center rounded-full bg-grey-01 px-3 text-metadata text-text transition-colors hover:bg-grey-02 disabled:cursor-default disabled:opacity-50"
        >
          Back to the room
        </button>
      </div>
    </>
  );
}
