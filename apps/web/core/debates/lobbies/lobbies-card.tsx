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
  RSVP_FAILED,
  debatingLabel,
  goingLabel,
  hereLabel,
  hostsLabel,
  lobbyErrorMessage,
  lobbyScheduleLabel,
  rsvpLabel,
} from './lobby-format';
import { LobbyAvatarStack } from './lobby-people';
import { OpenLobbyDialog } from './open-lobby-dialog';
import { UpcomingLobbiesRow } from './upcoming-lobbies';

/**
 * Scheduled debate lobbies, under the debates panel's tabs (GEO-3133). Signed in and `lobbyJoining`
 * only. Kept current by `debate.lobbies_changed`, which needs the matchmaking scope.
 *
 * A row of date cards (GEO-3268). Live lobbies and the one opening soon belong to the spotlight
 * above the tabs, so this lists the rest and no lobby appears twice. With nothing to list it keeps
 * just Open a lobby for hosts, and otherwise goes.
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

  // With something live, the soon lobby is only the next one in line, so it is listed here.
  const lobbies = live.length > 0 && soon ? [soon, ...later] : later;

  if (lobbiesQuery.isError && !lobbiesQuery.data) {
    return (
      <Text as="p" variant="footnote" color="grey-04" className="px-4 pt-3">
        Could not load lobbies.
      </Text>
    );
  }

  return (
    <>
      <UpcomingLobbiesRow lobbies={lobbies} canHost={hosting} onOpenLobby={() => setDialogOpen(true)} />
      {dialogOpen ? <OpenLobbyDialog onClose={() => setDialogOpen(false)} /> : null}
    </>
  );
}

/**
 * One lobby: Live or its time, its name, who is there, and Join or Remind me. Shared by this card
 * and the Debate button's hover list; `entry` says which.
 */
export function LobbyRow({
  lobby,
  entry = 'side_panel',
  showLiveMark = true,
}: {
  lobby: DebateLobbySummary;
  entry?: LobbyEntry;
  /** Off where the heading already says every row is live, as the Debate button's hover list does. */
  showLiveMark?: boolean;
}) {
  const reminder = useDebateLobbyReminder();
  const hosts = hostsLabel(lobby.hosts);
  const schedule = lobbyScheduleLabel(lobby);

  const href = debateRoomPath(lobby.lobby_id);
  const enter = () => markLobbyEntry(lobby.lobby_id, entry);
  const hostedBy = hosts ? `Hosted by ${hosts}` : null;

  return (
    <li className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0" data-testid="lobby-row">
      {lobby.open ? (
        showLiveMark ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-green" />
            <Text as="span" variant="footnoteMedium" color="text">
              Live
            </Text>
          </span>
        ) : null
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
            : [hostedBy, goingLabel(lobby.reminder_count)].filter(Boolean).join(' · ')}
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
            {rsvpLabel(lobby.viewer_reminded)}
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
          {lobbyErrorMessage(reminder.error, RSVP_FAILED)}
        </Text>
      ) : null}
    </li>
  );
}
