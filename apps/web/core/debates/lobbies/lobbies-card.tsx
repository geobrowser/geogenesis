'use client';

import * as React from 'react';

import { useFeatureFlag } from '~/core/state/feature-flags';

import { Text } from '~/design-system/text';

import { useGeoChatAuth } from '../hooks';
import { useDebateLobbies } from './hooks';
import { useLobbyLineup } from './live-lobbies';
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
export function UpcomingLobbiesCard() {
  const joining = useFeatureFlag('lobbyJoining');
  const { authenticated } = useGeoChatAuth();
  if (!joining || !authenticated) return null;
  return <UpcomingLobbiesCardBody />;
}

function UpcomingLobbiesCardBody() {
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
