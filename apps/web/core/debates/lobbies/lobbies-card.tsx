'use client';

import * as React from 'react';

import Link from 'next/link';

import { useFeatureFlag } from '~/core/state/feature-flags';

import { Text } from '~/design-system/text';

import type { DebateLobbySummary } from '../api';
import { useGeoChatAuth } from '../hooks';
import { HubPillButton, hubPillClassName } from '../matchmaking/hub-pill-button';
import { debateRoomPath } from '../rooms/room-routes';
import { useDebateLobbies, useDebateLobbyReminder } from './hooks';
import { useLobbyLineup } from './live-lobbies';
import { type LobbyEntry, markLobbyEntry } from './lobby-analytics';
import {
  debatingLabel,
  hereLabel,
  hostsLabel,
  lobbyErrorMessage,
  lobbyScheduleLabel,
  remindedLabel,
} from './lobby-format';
import { LobbyAvatarStack } from './lobby-people';
import { OpenLobbyDialog } from './open-lobby-dialog';

/**
 * Debate lobbies, under the debates panel's tabs (GEO-3133). Signed in and `lobbyJoining` only.
 * Kept current by `debate.lobbies_changed`, which needs the matchmaking scope.
 *
 * While a lobby is live or about to open, the spotlight above the tabs shows it (GEO-3268), and
 * this card lists only the rest, as "Later", so no lobby appears twice. With nothing left to list
 * it keeps just Open a lobby for hosts, and otherwise goes.
 */
export function LiveLobbiesCard() {
  const joining = useFeatureFlag('lobbyJoining');
  const { authenticated } = useGeoChatAuth();
  if (!joining || !authenticated) return null;
  return <LiveLobbiesCardBody />;
}

function LiveLobbiesCardBody() {
  const hosting = useFeatureFlag('lobbyHosting');
  const lobbiesQuery = useDebateLobbies();
  const { live, soon, later } = useLobbyLineup();
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const spotlight = live.length > 0 || soon !== null;
  // With something live, the soon lobby is only the next one in line, so it is listed here.
  const lobbies = spotlight ? (live.length > 0 && soon ? [soon, ...later] : later) : (lobbiesQuery.data?.lobbies ?? []);
  if (spotlight && lobbies.length === 0 && !hosting) return null;

  return (
    <div className="px-4 pt-3">
      <section
        className="flex flex-col gap-3 rounded-lg border border-grey-02 bg-white p-3"
        aria-label={spotlight ? 'Later debate lobbies' : 'Live debate lobbies'}
        data-testid="live-lobbies-card"
      >
        <div className="flex items-center justify-between gap-2">
          <Text as="h3" variant="footnoteMedium" color="text">
            {spotlight ? 'Later' : 'Live debate lobbies'}
          </Text>
          {hosting ? (
            <HubPillButton analyticsLabel="Open a lobby" onClick={() => setDialogOpen(true)}>
              Open a lobby
            </HubPillButton>
          ) : null}
        </div>

        {spotlight ? (
          lobbies.length === 0 ? null : (
            <LobbyRows lobbies={lobbies} />
          )
        ) : lobbiesQuery.isLoading ? (
          <Text as="p" variant="footnote" color="grey-04">
            Loading lobbies…
          </Text>
        ) : lobbiesQuery.isError ? (
          <Text as="p" variant="footnote" color="grey-04">
            Could not load lobbies.
          </Text>
        ) : lobbies.length === 0 ? (
          <Text as="p" variant="footnote" color="grey-04">
            No lobbies right now.
          </Text>
        ) : (
          <LobbyRows lobbies={lobbies} />
        )}
      </section>
      {dialogOpen ? <OpenLobbyDialog onClose={() => setDialogOpen(false)} /> : null}
    </div>
  );
}

function LobbyRows({ lobbies }: { lobbies: DebateLobbySummary[] }) {
  return (
    <ul className="flex flex-col divide-y divide-grey-02">
      {lobbies.map(lobby => (
        <LobbyRow key={lobby.lobby_id} lobby={lobby} />
      ))}
    </ul>
  );
}

const REMINDER_FAILED = 'Could not update your reminder. Try again.';

/**
 * One lobby: Live or its time, its name, who is there, and Join or Remind me. Shared by this card
 * and the Debate button's hover list; `entry` says which.
 */
export function LobbyRow({ lobby, entry = 'side_panel' }: { lobby: DebateLobbySummary; entry?: LobbyEntry }) {
  const reminder = useDebateLobbyReminder();
  const hosts = hostsLabel(lobby.hosts);
  const schedule = lobbyScheduleLabel(lobby);

  const href = debateRoomPath(lobby.lobby_id);
  const enter = () => markLobbyEntry(lobby.lobby_id, entry);
  const hostedBy = hosts ? `Hosted by ${hosts}` : null;

  return (
    <li className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0" data-testid="lobby-row">
      {lobby.open ? (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-green" />
          <Text as="span" variant="footnoteMedium" color="text">
            Live
          </Text>
        </span>
      ) : schedule ? (
        <Text as="p" variant="footnoteMedium" color="grey-04">
          {schedule}
        </Text>
      ) : null}

      <Link href={href} onClick={enter} className="min-w-0 hover:underline">
        <Text as="p" variant="metadataMedium" className="truncate">
          {lobby.name}
        </Text>
      </Link>

      <div className="flex items-center gap-2.5">
        {lobby.open ? <LobbyAvatarStack people={lobby.avatars} total={lobby.headcount} /> : null}
        <Text as="span" variant="footnote" color={lobby.open ? 'text' : 'grey-04'} className="min-w-0 flex-1 truncate">
          {lobby.open
            ? [
                hereLabel(lobby.headcount),
                lobby.debating_count > 0 ? debatingLabel(lobby.debating_count) : null,
                lobby.viewer_on_roster ? 'You’re here' : null,
              ]
                .filter(Boolean)
                .join(' · ')
            : [hostedBy, remindedLabel(lobby.reminder_count)].filter(Boolean).join(' · ')}
        </Text>
        {lobby.open ? (
          <Link
            href={href}
            onClick={enter}
            className={hubPillClassName(lobby.viewer_on_roster ? 'secondary' : 'primary')}
          >
            {lobby.viewer_on_roster ? 'Open' : 'Join'}
          </Link>
        ) : (
          <HubPillButton
            analyticsLabel={lobby.viewer_reminded ? 'Lobby reminded' : 'Lobby remind me'}
            pending={reminder.isPending}
            aria-pressed={lobby.viewer_reminded}
            onClick={() => reminder.mutate({ lobbyId: lobby.lobby_id, reminded: !lobby.viewer_reminded })}
          >
            {lobby.viewer_reminded ? 'Reminded' : 'Remind me'}
          </HubPillButton>
        )}
      </div>

      {lobby.open && hostedBy ? (
        <Text as="p" variant="footnote" color="grey-04" className="truncate">
          {hostedBy}
        </Text>
      ) : null}
      {reminder.isError ? (
        <Text as="p" variant="footnote" color="red-01">
          {lobbyErrorMessage(reminder.error, REMINDER_FAILED)}
        </Text>
      ) : null}
    </li>
  );
}
