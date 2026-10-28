'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import Link from 'next/link';

import { Text } from '~/design-system/text';
import { useElevatedPopoverPortal } from '~/design-system/use-elevated-popover-portal';

import type { DebateLobbySummary } from '../api';
import { useDebateLobby } from '../lobbies/hooks';
import { markLobbyEntry } from '../lobbies/lobby-analytics';
import { lobbyDateLabel, notYetOpenLabel } from '../lobbies/lobby-format';
import { usePreOpenHosts } from '../lobbies/lobby-host-lobbies';
import { LobbyClaimListNames, LobbyGoing, LobbyHostedBy } from '../lobbies/lobby-pre-open-details';
import { debateRoomPath } from '../rooms/room-routes';
import { hubAnalyticsAttributes } from './hub-analytics';
import { hubPillClassName } from './hub-pill-button';

/**
 * A lobby's name that opens its details (GEO-3463): its full name, when it opens, who hosts it, who
 * is going and the claim lists it starts with, with Open lobby page and the caller's RSVP. Drawn by
 * the Requests timeline's unanswered lobby rows (GEO-3519), where the side panel's next-lobby strip
 * used to draw it.
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

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
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
            <LobbyDetails lobby={lobby} now={now} rsvp={rsvp} />
          </Popover.Content>
        </Popover.Portal>
      ) : null}
    </Popover.Root>
  );
}

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
function LobbyDetails({ lobby, now, rsvp }: { lobby: DebateLobbySummary; now: number; rsvp: React.ReactNode }) {
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
      <LobbyGoing going={view?.going} count={goingCount} />
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
        {rsvp}
      </div>
    </>
  );
}
