'use client';

import * as React from 'react';

import { Text } from '~/design-system/text';

import {
  consumeDebateReturnDestination,
  peekDebateReturnDestination,
  rememberLobbyReturnDestination,
} from '../debate-return-navigation';
import { sameId } from '../rooms/room-presence';
import { debateRoomIdFromPath } from '../rooms/room-routes';
import { useDebateLobby, useMyDebateLobby } from './hooks';
import { hereNowLabel, lobbyHeadcount } from './lobby-format';
import { LobbyAvatarStack } from './lobby-people';

/** The lobby this tab's debate flow recorded as its way back, or null. */
function recordedLobbyId(): string | null {
  const destination = peekDebateReturnDestination();
  return destination ? debateRoomIdFromPath(destination) : null;
}

/**
 * geo-chat's lobby to return to: the one the viewer stepped out of, from any tab, or null. Undefined
 * while it is unknown (loading, or the call failed), so callers fall back to this tab.
 *
 * A lobby tab left open rejoins once the debate is over, which ends the step-out while this flow can
 * still be on its end card. So the lobby is recorded as this tab's way back as soon as geo-chat names
 * it, and stays the way back while the viewer is still on its roster; leaving it or moving on does not.
 */
function useServerLobbyReturn(): { lobbyId: string | null } | undefined {
  const mine = useMyDebateLobby();
  const steppedOutOf = mine.data?.stepped_out ? mine.data.current_lobby_id : null;
  React.useEffect(() => {
    if (steppedOutOf) rememberLobbyReturnDestination(steppedOutOf);
  }, [steppedOutOf]);

  if (mine.isError || !mine.data) return undefined;
  const current = mine.data.current_lobby_id;
  if (!current) return { lobbyId: null };
  if (mine.data.stepped_out) return { lobbyId: current };
  const recorded = recordedLobbyId();
  return { lobbyId: recorded && sameId(recorded, current) ? current : null };
}

/** The lobby this debate flow returns to; null when it did not start in one or that lobby is gone. */
export function useRecordedLobby(): string | null {
  const mine = useMyDebateLobby();
  const server = useServerLobbyReturn();
  // This tab's record, read once per mount; used only when geo-chat cannot answer.
  const [stored] = React.useState(recordedLobbyId);

  if (server) return server.lobbyId;
  return mine.isError ? stored : null;
}

/** The leave paths' `consumeDebateReturnDestination`, preferring geo-chat's lobby over this tab's. */
export function useConsumeDebateReturnDestination() {
  const lobby = useServerLobbyReturn();
  const lobbyId = lobby?.lobbyId;
  const known = lobby !== undefined;
  return React.useCallback(
    () => consumeDebateReturnDestination(known ? { lobbyId: lobbyId ?? null } : undefined),
    [known, lobbyId]
  );
}

/** Faces on the way-back row; the count beside them carries the rest. */
const BACK_AVATARS = 3;

type BackToLobbyProps = { onLeave: () => void; disabled?: boolean };

/**
 * A row for the debate's end card: leaves the debate the usual way, which returns to the lobby (and
 * so into the room). Hidden unless the debate started in a lobby that is still open.
 */
export function BackToLobbyRow(props: BackToLobbyProps) {
  const lobbyId = useRecordedLobby();
  return lobbyId ? <OpenLobbyRow lobbyId={lobbyId} {...props} /> : null;
}

function OpenLobbyRow({ lobbyId, onLeave, disabled = false }: BackToLobbyProps & { lobbyId: string }) {
  const lobby = useDebateLobby(lobbyId).data;
  // A host removed them: going back is a choice made on the lobby page, not from here.
  if (lobby?.access.status !== 'admitted' || lobby.viewer.removed) return null;

  // Faces of people in the room now; stepped-out members, the viewer among them, are debating.
  const present = lobby.members.filter(member => !member.stepped_out);

  return (
    <>
      <div aria-hidden className="h-px w-full shrink-0 bg-divider" />
      {/* The faces are a list, which a button may not hold: they sit beside it, hidden from
          assistive tech, and the button's hit area stretches over the whole row. */}
      <div
        className="relative flex w-full items-center gap-3 rounded-lg bg-text p-3 text-white transition-colors has-[button:disabled]:opacity-50 has-[button:enabled:hover]:bg-text/90 has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-ctaPrimary"
        style={{ '--avatar-group-ring': 'var(--color-text)' } as React.CSSProperties}
      >
        <div aria-hidden className="shrink-0" data-testid="back-to-lobby-faces">
          <LobbyAvatarStack people={present.slice(0, BACK_AVATARS)} total={Math.min(present.length, BACK_AVATARS)} />
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onLeave}
          className="flex min-w-0 flex-col gap-0.5 text-left outline-none after:absolute after:inset-0 after:rounded-lg disabled:cursor-default"
        >
          <Text as="span" variant="metadataMedium" color="white" className="line-clamp-2 break-words">
            Back to {lobby.name}
          </Text>
          <Text as="span" variant="footnote" color="grey-02">
            {hereNowLabel(lobbyHeadcount(lobby))}
          </Text>
        </button>
      </div>
    </>
  );
}
