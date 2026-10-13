'use client';

import type * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { NavUtils } from '~/core/utils/utils';

import { Text } from '~/design-system/text';

import { type DebateLobbySummary, GeoChatRequestError } from '../api';
import { HubPillButton, hubPillClassName } from '../matchmaking/hub-pill-button';
import { debateRoomPath } from '../rooms/room-routes';
import { useDebateLobbyReminder } from './hooks';
import { markLobbyEntry } from './lobby-analytics';
import { lobbyErrorMessage, nextLobbyTimeLabel, personName } from './lobby-format';
import { nextLobbyByHost, useListedLobbies } from './lobby-host-lobbies';
import type { LobbyPageView } from './lobby-view';

export const LOBBY_STATE_COPY = {
  unavailable: 'Lobbies aren’t available right now',
  banned: 'You can’t join this lobby',
  bannedFrom: (name: string) => `A host has blocked you from ${name}.`,
  ended: 'This lobby has ended',
  closed: 'This lobby has closed',
  findDebate: 'Find a debate',
  nextLobby: (host: string, name: string, time: string) => `${host}’s next lobby: ${name}, ${time}.`,
  emptyTitle: 'Nobody’s here right now.',
  emptyDetail: 'You’re the first one here. Share the link, or come back for the next lobby.',
  whoIsFree: 'See who’s free this week',
} as const;

const REMINDER_FAILED = 'Could not update your reminder. Try again.';

/** The centered card every full-page lobby state sits in; `className` sets its width and spacing. */
export function LobbyCardFrame({
  className,
  after,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  /** Below the card, e.g. a host's lists once the lobby has ended. */
  after?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100dvh-2.75rem)] flex-col items-center justify-center gap-4 px-4 py-8">
      <div {...props} className={cx('flex w-full flex-col rounded-xl border border-grey-02 bg-white', className)}>
        {children}
      </div>
      {after}
    </div>
  );
}

/** A full-page state: a titled card with its actions. */
export function LobbyStateCard({
  title,
  children,
  actions,
  after,
}: {
  title: string;
  children?: React.ReactNode;
  actions: React.ReactNode;
  after?: React.ReactNode;
}) {
  return (
    <LobbyCardFrame role="status" className="max-w-md gap-2.5 p-5" data-testid="lobby-state-card" after={after}>
      <Text as="h1" variant="smallTitle">
        {title}
      </Text>
      {children}
      <div className="mt-1.5 flex flex-wrap gap-2">{actions}</div>
    </LobbyCardFrame>
  );
}

export function FindDebateLink({ primary = false }: { primary?: boolean }) {
  return (
    <Link href={NavUtils.toExplore()} className={hubPillClassName(primary ? 'primary' : 'secondary')}>
      {LOBBY_STATE_COPY.findDebate}
    </Link>
  );
}

/** `/debate/{id}` when the room is a lobby and `lobbyJoining` is off. */
export function LobbiesUnavailable() {
  return <LobbyStateCard title={LOBBY_STATE_COPY.unavailable} actions={<FindDebateLink primary />} />;
}

export function LobbyBannedCard({ name }: { name: string }) {
  return (
    <LobbyStateCard title={LOBBY_STATE_COPY.banned} actions={<FindDebateLink primary />}>
      <Text as="p" variant="metadata" color="grey-04">
        {LOBBY_STATE_COPY.bannedFrom(name)}
      </Text>
    </LobbyStateCard>
  );
}

/** Ended or closed empty, with the creator's next lobby when the lobbies list has one. */
export function LobbyClosedCard({
  lobby,
  ended,
  after,
}: {
  lobby: Pick<LobbyPageView, 'lobby_id' | 'created_by'>;
  ended: boolean;
  after?: React.ReactNode;
}) {
  const next = nextLobbyByHost(useListedLobbies(), lobby.created_by, lobby.lobby_id);
  const time = next ? nextLobbyTimeLabel(next.lobby) : null;
  const reminder = useDebateLobbyReminder();

  return (
    <LobbyStateCard
      title={ended ? LOBBY_STATE_COPY.ended : LOBBY_STATE_COPY.closed}
      actions={
        <>
          {next ? <NextLobbyAction lobby={next.lobby} reminder={reminder} primary /> : null}
          <FindDebateLink primary={!next} />
        </>
      }
      after={after}
    >
      {next && time ? (
        <Text as="p" variant="metadata" color="grey-04">
          {LOBBY_STATE_COPY.nextLobby(personName(next.host), next.lobby.name, time)}
        </Text>
      ) : null}
      <ReminderError reminder={reminder} />
    </LobbyStateCard>
  );
}

/** Remind me on a lobby still to open; Join on one already open. */
function NextLobbyAction({
  lobby,
  reminder,
  primary = false,
}: {
  lobby: DebateLobbySummary;
  reminder: LobbyReminder;
  primary?: boolean;
}) {
  if (lobby.open) {
    return (
      <Link
        href={debateRoomPath(lobby.lobby_id)}
        onClick={() => markLobbyEntry(lobby.lobby_id, 'other_lobby')}
        className={hubPillClassName(primary ? 'primary' : 'secondary')}
      >
        Join
      </Link>
    );
  }
  const reminded = lobby.viewer_reminded;
  return (
    <HubPillButton
      variant={primary && !reminded ? 'primary' : 'secondary'}
      analyticsLabel={reminded ? 'Lobby next reminded' : 'Lobby next remind me'}
      aria-pressed={reminded}
      pending={reminder.isPending}
      onClick={() => reminder.mutate({ lobbyId: lobby.lobby_id, reminded: !reminded })}
    >
      {reminded ? 'Reminded' : 'Remind me'}
    </HubPillButton>
  );
}

type LobbyReminder = ReturnType<typeof useDebateLobbyReminder>;

const isAlreadyOpen = (error: unknown) => error instanceof GeoChatRequestError && error.code === 'lobby_already_open';

function ReminderError({ reminder }: { reminder: LobbyReminder }) {
  // The lobby opened since the list was read; the refetched row swaps the button to Join.
  if (!reminder.isError || isAlreadyOpen(reminder.error)) return null;
  return (
    <Text as="p" variant="footnote" color="red-01">
      {lobbyErrorMessage(reminder.error, REMINDER_FAILED)}
    </Text>
  );
}

/**
 * Nobody else is in the lobby. Copy link is in the header; this adds the creator's next lobby and
 * a way to the People tab.
 */
export function LobbyEmptyRoom({
  lobby,
  signedIn,
}: {
  lobby: Pick<LobbyPageView, 'lobby_id' | 'created_by'>;
  signedIn: boolean;
}) {
  const next = nextLobbyByHost(useListedLobbies(), lobby.created_by, lobby.lobby_id);

  return (
    <div
      className="mx-auto flex w-full max-w-md flex-col items-center gap-3 py-10 text-center"
      data-testid="lobby-empty-room"
    >
      <Text as="p" variant="smallTitle">
        {LOBBY_STATE_COPY.emptyTitle}
      </Text>
      <Text as="p" variant="metadata" color="grey-04">
        {LOBBY_STATE_COPY.emptyDetail}
      </Text>
      {next ? <NextLobbyCard lobby={next.lobby} /> : null}
      {/* The People tab is signed in only. */}
      {signedIn ? (
        <Link
          href={NavUtils.toDebatesPanel({ tab: 'people', pathname: debateRoomPath(lobby.lobby_id) })}
          className={hubPillClassName('secondary', 'mt-1')}
        >
          {LOBBY_STATE_COPY.whoIsFree}
        </Link>
      ) : null}
    </div>
  );
}

function NextLobbyCard({ lobby }: { lobby: DebateLobbySummary }) {
  const time = nextLobbyTimeLabel(lobby);
  const reminder = useDebateLobbyReminder();
  return (
    <div className="mt-3 flex w-full flex-col gap-1">
      <div className="flex w-full items-center gap-3 rounded-xl border border-grey-02 p-3 text-left">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Text as="p" variant="footnoteMedium" color="grey-04">
            {time ? `Next lobby · ${time}` : 'Next lobby'}
          </Text>
          <Text as="p" variant="metadataMedium" className="truncate">
            {lobby.name}
          </Text>
        </div>
        <NextLobbyAction lobby={lobby} reminder={reminder} />
      </div>
      <ReminderError reminder={reminder} />
    </div>
  );
}
