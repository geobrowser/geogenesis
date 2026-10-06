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
import { hereLabel, hostsLabel, lobbyErrorMessage, lobbyScheduleLabel, remindedLabel } from './lobby-format';
import { LobbyAvatarStack } from './lobby-people';
import { OpenLobbyDialog } from './open-lobby-dialog';

/**
 * Live debate lobbies, at the top of the debates panel (GEO-3133). Signed in and `lobbyJoining`
 * only. Refetched on `debate.lobbies_changed`, which needs the panel's matchmaking scope.
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
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const lobbies = lobbiesQuery.data?.lobbies ?? [];

  return (
    <div className="px-4 pt-3">
      <section
        className="flex flex-col gap-3 rounded-lg border border-grey-02 bg-white p-3"
        aria-label="Live debate lobbies"
        data-testid="live-lobbies-card"
      >
        <div className="flex items-center justify-between gap-2">
          <Text as="h3" variant="footnoteMedium" color="text">
            Live debate lobbies
          </Text>
          {hosting ? (
            <HubPillButton analyticsLabel="Open a lobby" onClick={() => setDialogOpen(true)}>
              Open a lobby
            </HubPillButton>
          ) : null}
        </div>

        {lobbiesQuery.isLoading ? (
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
          <ul className="flex flex-col divide-y divide-grey-02">
            {lobbies.map(lobby => (
              <LobbyRow key={lobby.lobby_id} lobby={lobby} />
            ))}
          </ul>
        )}
      </section>
      {dialogOpen ? <OpenLobbyDialog onClose={() => setDialogOpen(false)} /> : null}
    </div>
  );
}

const REMINDER_FAILED = 'Could not update your reminder. Try again.';

function LobbyRow({ lobby }: { lobby: DebateLobbySummary }) {
  const reminder = useDebateLobbyReminder();
  const hosts = hostsLabel(lobby.hosts);
  const schedule = lobbyScheduleLabel(lobby);

  return (
    <li className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0" data-testid="lobby-row">
      <div className="flex items-start justify-between gap-2">
        <Link href={debateRoomPath(lobby.lobby_id)} className="min-w-0 hover:underline">
          <Text as="p" variant="metadataMedium" className="truncate">
            {lobby.name}
          </Text>
        </Link>
        {lobby.open ? (
          <Link
            href={debateRoomPath(lobby.lobby_id)}
            className={hubPillClassName(lobby.viewer_present ? 'secondary' : 'primary')}
          >
            {lobby.viewer_present ? 'Open' : 'Join'}
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

      {lobby.open ? (
        <div className="flex items-center gap-2">
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-green" />
          <Text as="span" variant="footnote" color="text">
            {hereLabel(lobby.headcount)}
            {lobby.debating_count > 0 ? ` · ${lobby.debating_count} debating` : ''}
            {lobby.viewer_present ? ' · You’re here' : ''}
          </Text>
          <LobbyAvatarStack people={lobby.avatars} total={lobby.headcount} />
        </div>
      ) : schedule ? (
        <Text as="p" variant="footnote" color="text">
          {schedule}
        </Text>
      ) : null}

      <Text as="p" variant="footnote" color="grey-04" className="truncate">
        {[hosts ? `Hosted by ${hosts}` : null, lobby.open ? null : remindedLabel(lobby.reminder_count)]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {reminder.isError ? (
        <Text as="p" variant="footnote" color="red-01">
          {lobbyErrorMessage(reminder.error, REMINDER_FAILED)}
        </Text>
      ) : null}
    </li>
  );
}
