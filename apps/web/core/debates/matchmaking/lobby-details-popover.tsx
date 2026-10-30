'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import Link from 'next/link';

import { Text } from '~/design-system/text';
import { useElevatedPopoverPortal } from '~/design-system/use-elevated-popover-portal';

import type { DebateLobbySummary } from '../api';
import { EditLobbyButton, EditLobbyDialog, canEditLobby } from '../lobbies/edit-lobby-dialog';
import { useDebateLobby } from '../lobbies/hooks';
import { markLobbyEntry } from '../lobbies/lobby-analytics';
import { lobbyDateLabel, notYetOpenLabel } from '../lobbies/lobby-format';
import { usePreOpenHosts } from '../lobbies/lobby-host-lobbies';
import { LobbyHandoffScope } from '../lobbies/lobby-popup';
import { LobbyClaimListNames, LobbyGoing, LobbyHostedBy } from '../lobbies/lobby-pre-open-details';
import { debateRoomPath } from '../rooms/room-routes';
import { hubAnalyticsAttributes } from './hub-analytics';
import { hubPillClassName } from './hub-pill-button';

/**
 * A lobby's name that opens its details (GEO-3463): its full name, when it opens, who hosts it, who
 * is going and the claim lists it starts with, with Open lobby page and the caller's RSVP. Drawn by
 * the Requests timeline's lobby rows (GEO-3519) and the side panel's next-lobby strip.
 *
 * A host gets Edit (GEO-3540). The popover closes first and the dialog is drawn beside it, since one
 * inside a popover closes with it.
 */
export function LobbyDetailsPopover({
  lobby,
  now,
  rsvp,
  open,
  onOpenChange,
  className,
  children,
}: {
  lobby: DebateLobbySummary;
  now: number;
  /** The caller's RSVP, so one press backs both copies of it. */
  rsvp: React.ReactNode;
  /**
   * Held by the caller, when given: the Requests timeline keeps the details open across an RSVP
   * inside them, which swaps the row they hang from (GEO-3519).
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  /** What the trigger shows: the lobby's name. */
  children: React.ReactNode;
}) {
  const portal = useElevatedPopoverPortal();
  // Uncontrolled unless the caller holds it, so Edit can close the details either way.
  const [ownOpen, setOwnOpen] = React.useState(false);
  const isOpen = open ?? ownOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      setOwnOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange]
  );
  // Pinned to the lobby it began on: the caller can hand this popover another lobby mid-edit.
  const [editingId, setEditingId] = React.useState<string | null>(null);

  return (
    <>
      <Popover.Root open={isOpen} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={`${lobby.name}, lobby details`}
            {...hubAnalyticsAttributes('Lobby details', 'open_lobby_details')}
            className={className}
          >
            {children}
          </button>
        </Popover.Trigger>
        {portal ? (
          <Popover.Portal container={portal}>
            <Popover.Content
              side="bottom"
              align="start"
              sideOffset={8}
              collisionPadding={16}
              aria-label="Lobby details"
              className="z-100 flex w-[368px] max-w-[calc(100vw-32px)] flex-col gap-3 rounded-xl border border-grey-02 bg-white p-3.5 shadow-lg"
            >
              <LobbyHandoffScope onOpenChange={setOpen}>
                <LobbyDetails lobby={lobby} now={now} rsvp={rsvp} onEdit={() => setEditingId(lobby.lobby_id)} />
              </LobbyHandoffScope>
            </Popover.Content>
          </Popover.Portal>
        ) : null}
      </Popover.Root>
      {editingId ? <EditFromDetails key={editingId} lobbyId={editingId} onClose={() => setEditingId(null)} /> : null}
    </>
  );
}

/** The edit dialog over the lobby's live view. Mounted only while editing, so its read runs only then. */
function EditFromDetails({ lobbyId, onClose }: { lobbyId: string; onClose: () => void }) {
  const { data: view } = useDebateLobby(lobbyId);
  return view ? <EditLobbyDialog lobby={view} onClose={onClose} /> : null;
}

/** Short beside Going in the details' footer. */
const LOBBY_DETAILS_EDIT = 'Edit';

/**
 * The lobby's own read for what the list row leaves out: hosts, who is going, claim lists. Asked for
 * only while the details are open, and drawn from the list row until it lands.
 *
 * The count is the list row's, which the gateway patches live; the view is read again each time the
 * details open, since a held one is fresh for 30s whatever happened since. An RSVP elsewhere, which
 * reaches this viewer as that patch alone, refetches it here for the names. Card broadcasts are
 * coalesced, so one RSVP cleared and another set leave the count where it was: reopening is what
 * catches that, and a block or a name change.
 */
function LobbyDetails({
  lobby,
  now,
  rsvp,
  onEdit,
}: {
  lobby: DebateLobbySummary;
  now: number;
  rsvp: React.ReactNode;
  onEdit: () => void;
}) {
  const { data: view, refetch } = useDebateLobby(lobby.lobby_id);
  // Only over a view already held: with none, the query's own first read is out already.
  const staleAtOpening = React.useRef(view !== undefined);
  React.useEffect(() => {
    if (!staleAtOpening.current) return;
    staleAtOpening.current = false;
    void refetch();
  }, [refetch]);
  const goingCount = lobby.reminder_count;
  const readAtCount = React.useRef(goingCount);
  React.useEffect(() => {
    if (readAtCount.current === goingCount) return;
    readAtCount.current = goingCount;
    void refetch();
  }, [goingCount, refetch]);
  const hosts = usePreOpenHosts(view ?? lobby);
  const date = lobbyDateLabel(lobby.starts_at);

  return (
    <>
      <div className="flex flex-col gap-0.5">
        <Text as="p" variant="metadataMedium">
          {view?.name ?? lobby.name}
        </Text>
        {date ? (
          <Text as="p" variant="breadcrumb" color="grey-04">
            {date} · {notYetOpenLabel(lobby, now)}
          </Text>
        ) : null}
      </div>
      <LobbyHostedBy hosts={hosts} />
      <LobbyGoing
        going={view?.going}
        count={goingCount}
        hostOf={view && canEditLobby(view) ? lobby.lobby_id : undefined}
      />
      <LobbyClaimListNames lists={view?.claim_lists} />
      <div className="flex items-center justify-between gap-2 border-t border-divider pt-3">
        <Link
          href={debateRoomPath(lobby.lobby_id)}
          onClick={() => markLobbyEntry(lobby.lobby_id, 'side_panel')}
          {...hubAnalyticsAttributes('Lobby details open page', 'open_lobby')}
          className={hubPillClassName('secondary')}
        >
          Open lobby page
        </Link>
        <div className="flex items-center gap-2">
          {view ? <EditLobbyButton lobby={view} label={LOBBY_DETAILS_EDIT} onOpen={onEdit} /> : null}
          {rsvp}
        </div>
      </div>
    </>
  );
}
