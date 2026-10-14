'use client';

import * as React from 'react';

import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { useQueuedAction } from '~/core/state/pending-actions';

import { Text } from '~/design-system/text';

import { type DebateLobbySummary, GeoChatRequestError, dashlessId } from '../api';
import { useGeoChatAuth } from '../hooks';
import { sameId } from '../rooms/room-presence';
import { useDebateLobbies, useDebateLobbyReminder, useLobbyReminderError, useLobbyReminderSaving } from './hooks';
import { RSVP_FAILED, lobbyErrorMessage } from './lobby-format';

/** Stands in for no lobby, so the hooks below run the same either way; an open one shows no error. */
const NO_LOBBY = { lobby_id: '', open: true };

/**
 * One queued reminder at a time, its lobby as the intent: a signed-out visitor signs up on their
 * first press, and a second press only moves it.
 */
const QUEUED_REMINDER_ID = 'lobby-reminder';

/**
 * The queued reminder, replayed by whichever copy is mounted when the account can carry it out.
 * Each decides from the account's own lobby list, by id, rather than from the card that was pressed:
 * that list loading says geo-chat knows the new account, and it still answers once the card is gone
 * (the panel closed, or the lobby opened and its card became Join). Set unless that list says it
 * already is, the lobby opened, or it is no longer listed. Any other failure is thrown for the
 * runner's Retry, since the copy replaying it may show no error for this lobby. A list that failed
 * for good (after its warm-up retries) is read again here, so Retry reads it again too. Taken back
 * while waiting (`isCurrent`), it is never set.
 */
function useQueuedLobbyReminder(reminder: ReturnType<typeof useDebateLobbyReminder>) {
  const { mutateAsync } = reminder;
  const { authenticated } = useGeoChatAuth();
  // Read only: the navbar's lineup already holds the list. `refetch` ignores `enabled`.
  const list = useDebateLobbies(false);
  const lobbies = list.data?.lobbies;
  const { refetch } = list;

  return useQueuedAction({
    id: QUEUED_REMINDER_ID,
    component: 'debate_matchmaking',
    label: 'your lobby reminder',
    requires: 'auth',
    liveOnly: true,
    ready: authenticated && (lobbies !== undefined || list.isError),
    run: async (intent, { isCurrent }) => {
      let rows = lobbies;
      if (!rows) {
        const read = await refetch();
        rows = read.data?.lobbies;
        if (!rows) throw read.error ?? new Error('The lobby list could not be read.');
      }
      const target = intent ? rows.find(row => sameId(row.lobby_id, intent)) : undefined;
      if (!target || target.open || target.viewer_reminded || !isCurrent()) return;
      try {
        await mutateAsync({ lobbyId: target.lobby_id, reminded: true });
      } catch (error) {
        // Opened since: the list swaps in Join.
        if (error instanceof GeoChatRequestError && error.status === 409) return;
        // Thrown, so the runner keeps it queued and offers Retry: the copy replaying it may be the
        // navbar's, or another lobby's card, and neither shows this lobby's error.
        throw error;
      }
    },
  });
}

/**
 * Replays a queued reminder with no Remind me on screen. The navbar's Debate button holds it, so it
 * is mounted on every page.
 */
export function useLobbyReminderReplay() {
  useQueuedLobbyReminder(useDebateLobbyReminder());
}

/**
 * Remind me on a lobby still to open, for anyone (GEO-3289). Signed in it sets or clears the
 * reminder. Signed out it is queued at the press and the account prompt opens; see
 * {@link useQueuedLobbyReminder} for when it is set.
 *
 * `reminded` draws a queued reminder as set, so the press shows while sign-up runs, and a press
 * toggles what is drawn: taking back a queued one cancels it rather than setting it again. A
 * failure is `error`, for {@link LobbyReminderError} beside the button.
 */
export function useLobbyReminderPress(lobby: Pick<DebateLobbySummary, 'lobby_id' | 'open' | 'viewer_reminded'> | null) {
  const reminder = useDebateLobbyReminder();
  const { mutate, isPending } = reminder;
  const error = useLobbyReminderError(reminder, lobby ?? NO_LOBBY);
  const { authenticated } = useGeoChatAuth();
  const lobbyId = lobby ? dashlessId(lobby.lobby_id) : '';
  const { queue, cancel, intent } = useQueuedLobbyReminder(reminder);
  const signIn = usePrivySignIn();

  const queuedHere = lobby !== null && intent !== undefined && sameId(intent, lobbyId);
  const reminded = Boolean(lobby?.viewer_reminded) || queuedHere;
  // Another control's write for this lobby (the navbar's replay, say) still landing: taking it back
  // now would lose to that write, so wait it out.
  const savingElsewhere = useLobbyReminderSaving(lobbyId);
  const pending = isPending || savingElsewhere;

  const press = React.useCallback(() => {
    if (!lobby || pending) return;
    if (reminded) {
      if (queuedHere) cancel();
      if (lobby.viewer_reminded) mutate({ lobbyId: lobby.lobby_id, reminded: false });
      return;
    }
    if (authenticated) {
      mutate({ lobbyId: lobby.lobby_id, reminded: true });
      return;
    }
    queue(lobbyId);
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
  }, [authenticated, cancel, lobby, lobbyId, mutate, pending, queue, queuedHere, reminded, signIn]);

  return {
    reminded,
    pending,
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
