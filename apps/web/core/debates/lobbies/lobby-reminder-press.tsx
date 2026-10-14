'use client';

import * as React from 'react';

import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { useQueuedAction } from '~/core/state/pending-actions';

import { Text } from '~/design-system/text';

import { type DebateLobbySummary, GeoChatRequestError, dashlessId } from '../api';
import { useGeoChatAuth } from '../hooks';
import { useDebateLobbies, useDebateLobbyReminder, useLobbyReminderError } from './hooks';
import { RSVP_FAILED, lobbyErrorMessage } from './lobby-format';

/** Stands in for no lobby, so the hooks below run the same either way; an open one shows no error. */
const NO_LOBBY = { lobby_id: '', open: true };

/**
 * Remind me on a lobby still to open, for anyone (GEO-3289). Signed in it sets or clears the
 * reminder. Signed out it is queued at the press and the account prompt opens; the reminder is set
 * once the new account can read its own lobby list, which is also when it can be told whether it
 * already holds one, and dropped if the lobby opened in the meantime.
 *
 * `reminded` draws a queued reminder as set, so the press shows while sign-up runs. A failure is
 * `error`, for {@link LobbyReminderError} beside the button, rather than the runner's retry toast.
 */
export function useLobbyReminderPress(lobby: Pick<DebateLobbySummary, 'lobby_id' | 'open' | 'viewer_reminded'> | null) {
  const reminder = useDebateLobbyReminder();
  const { mutate, mutateAsync, isPending } = reminder;
  const error = useLobbyReminderError(reminder, lobby ?? NO_LOBBY);
  const { authenticated } = useGeoChatAuth();
  // Read only: whatever shows this lobby already holds the list. Loaded under the signed-in account
  // is what says geo-chat knows it, which a brand-new one takes a minute or two to reach.
  const accountList = useDebateLobbies(false);
  const lobbyId = lobby ? dashlessId(lobby.lobby_id) : '';

  const queued = useQueuedAction({
    id: `lobby-reminder:${lobbyId}`,
    component: 'debate_matchmaking',
    label: 'your lobby reminder',
    requires: 'auth',
    // Decided from the lobby as the account sees it, never from the press's signed-out copy.
    liveOnly: true,
    ready: authenticated && accountList.data !== undefined && lobby !== null,
    run: async () => {
      if (!lobby || lobby.open || lobby.viewer_reminded) return;
      try {
        await mutateAsync({ lobbyId: lobby.lobby_id, reminded: true });
      } catch (error) {
        // Opened since: the list swaps in Join. Anything else is shown beside the button.
        if (error instanceof GeoChatRequestError && error.status === 409) return;
      }
    },
  });

  const signIn = usePrivySignIn();
  const { queue, cancel, isQueued } = queued;

  const press = React.useCallback(() => {
    if (!lobby) return;
    if (authenticated) {
      mutate({ lobbyId: lobby.lobby_id, reminded: !lobby.viewer_reminded });
      return;
    }
    queue();
    signIn(
      {
        component: 'debate_matchmaking',
        target_type: 'debate_lobby',
        target_id: lobbyId,
        auth_control: 'remind_lobby',
        auth_intent: 'remind_lobby',
        auth_continuation: 'queued',
      },
      // Walked away from: no reminder set on some later sign-in.
      { onCancel: cancel }
    );
  }, [authenticated, cancel, lobby, lobbyId, mutate, queue, signIn]);

  return {
    reminded: Boolean(lobby?.viewer_reminded) || isQueued,
    pending: isPending,
    error,
    press,
  };
}

/** The reminder failure under a Remind me, from {@link useLobbyReminderPress}'s `error`. */
export function LobbyReminderError({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  return (
    <Text as="p" variant="footnote" color="red-01" className={className}>
      {lobbyErrorMessage(error, RSVP_FAILED)}
    </Text>
  );
}
