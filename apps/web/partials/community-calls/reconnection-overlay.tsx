'use client';

import * as React from 'react';

import { DisconnectReason } from 'livekit-client';

import { ReconnectionStatus } from '~/core/community-calls/use-reconnection-state';

import { Button } from '~/design-system/button';

type Props = {
  status: ReconnectionStatus;
  disconnectReason: DisconnectReason | undefined;
  onRejoin: () => void;
  onLeave: () => void;
  rejoinBusy: boolean;
  rejoinError: string | null;
};

const DISCONNECT_INFO: Partial<Record<DisconnectReason, { heading: string; message: string }>> = {
  [DisconnectReason.PARTICIPANT_REMOVED]: {
    heading: 'Removed from call',
    message: 'You were removed from this call by an editor. You can try rejoining below.',
  },
  [DisconnectReason.DUPLICATE_IDENTITY]: {
    heading: 'Connected elsewhere',
    message: 'You joined this call in another window. Close the other tab and rejoin below.',
  },
  [DisconnectReason.ROOM_DELETED]: {
    heading: 'Call ended',
    message: 'This call has been closed by an editor.',
  },
};

const DEFAULT_DISCONNECT_INFO = {
  heading: 'Disconnected',
  message: "We weren't able to reconnect automatically. You can try rejoining the call below.",
};

function getDisconnectInfo(reason: DisconnectReason | undefined): { heading: string; message: string } {
  return (reason !== undefined && DISCONNECT_INFO[reason]) || DEFAULT_DISCONNECT_INFO;
}

/**
 * Full-screen overlay for unexpected connection drops — renders nothing while
 * connected. Rides LiveKit's own automatic retry while `reconnecting` (no action
 * available); once LiveKit gives up and reports `disconnected`, offers a manual
 * rejoin (fresh token + `room.connect()`) with contextual messaging based on why.
 */
export function ReconnectionOverlay({ status, disconnectReason, onRejoin, onLeave, rejoinBusy, rejoinError }: Props) {
  if (status === 'connected') return null;

  const isReconnecting = status === 'reconnecting';
  const disconnectInfo = getDisconnectInfo(disconnectReason);
  const title = isReconnecting ? 'Reconnecting' : disconnectInfo.heading;
  const isRoomDeleted = disconnectReason === DisconnectReason.ROOM_DELETED;

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-100 flex items-center justify-center bg-text/20">
      <div className="mx-4 flex w-full max-w-sm flex-col items-center gap-4 rounded-lg bg-white p-6 text-center">
        <h2 className="text-smallTitle">{title}</h2>

        {isReconnecting ? (
          <>
            <p className="text-metadata text-grey-04">
              Looks like your connection dropped. Hang tight, we’re working on getting you back in.
            </p>
            <span className="size-5 animate-spin rounded-full border-2 border-grey-02 border-t-text" />
          </>
        ) : (
          <p className="text-metadata text-grey-04">{disconnectInfo.message}</p>
        )}

        {rejoinError && <p className="text-metadata text-red-01">{rejoinError}</p>}

        {status === 'disconnected' && (
          <div className="flex w-full flex-col gap-2">
            {isRoomDeleted ? (
              <Button variant="primary" onClick={onLeave}>
                OK
              </Button>
            ) : (
              <>
                <Button variant="primary" disabled={rejoinBusy} onClick={onRejoin}>
                  {rejoinBusy ? 'Rejoining…' : 'Rejoin call'}
                </Button>
                <Button variant="secondary" onClick={onLeave}>
                  Leave call
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
