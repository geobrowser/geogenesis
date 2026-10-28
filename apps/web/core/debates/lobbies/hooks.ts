'use client';

import {
  type UseQueryResult,
  replaceEqualDeep,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import * as React from 'react';

import {
  type CreateDebateLobbyRequest,
  type DebateLobbyHeartbeat,
  type DebateLobbyMember,
  type DebateLobbySummary,
  type DebateLobbyView,
  GeoChatRequestError,
  createDebateLobby,
  dashlessId,
  endDebateLobby,
  endDebateLobbyStepOut,
  getDebateLobby,
  getMyDebateLobby,
  listDebateLobbies,
  listDebateLobbyCalendar,
  sendDebateLobbyHeartbeat,
  setDebateLobbyDismissal,
  setDebateLobbyPresence,
  setDebateLobbyReminder,
  stepOutOfDebateLobby,
} from '../api';
import { rememberLobbyReturnDestination } from '../debate-return-navigation';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '../hooks';
import { viewerReadRetryOptions } from '../matchmaking/hooks';
import { useConnectionId } from '../rooms/hooks';
import { sameId } from '../rooms/room-presence';
import {
  lobbyCreated,
  lobbyEnded,
  lobbyJoined,
  lobbyLeft,
  lobbyPageClosed,
  lobbyPageMounted,
  lobbyPageUnmounted,
  lobbyRsvpChanged,
  lobbySteppedOut,
  markLobbyEntry,
} from './lobby-analytics';
import { settleFetchedLobbyClaimLists } from './lobby-claim-lists-state';
import {
  isAlreadyInAnotherLobby,
  isRemovedFromLobby,
  lobbyErrorMessage,
  lobbyRoomHeadcount,
  otherLobbyIdFrom,
} from './lobby-format';
import { readGuestSecret } from './lobby-guest-secret';
import { useLobbyRoomNoun } from './lobby-purpose';
import { carryLobbyJoinChoice, forgetLobbyDevices, registerLobbyStepOut } from './step-out';

/** The lease is 120s server-side; a throttled background tab beating once a minute stays in. */
export const LOBBY_HEARTBEAT_MS = 15_000;
/** A tab turning visible beats only if this long has passed, to stay under 30 beats a minute. */
const VISIBLE_BEAT_MIN_GAP_MS = 30_000;
/** For a 429 without `Retry-After`. */
const RATE_LIMIT_FALLBACK_MS = 5_000;
/** How long a 429 asks us to wait, or `null` for any other outcome. */
export function rateLimitDelayMs(error: unknown) {
  if (!(error instanceof GeoChatRequestError) || error.status !== 429) return null;
  return error.retryAfterMs ?? RATE_LIMIT_FALLBACK_MS;
}

/** Automatic presence calls retry once after a 429's `Retry-After`, per geo-chat's guidance. */
async function retryOnceIfRateLimited<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    const delay = rateLimitDelayMs(error);
    if (delay === null) throw error;
    await new Promise(resolve => setTimeout(resolve, delay));
    return task();
  }
}

/** How often a signed-out visitor's lobby list is read: they hold no gateway scope to patch it. */
export const SIGNED_OUT_LOBBIES_POLL_MS = 30_000;

/**
 * The lobby list, patched or refetched by `debate.lobbies_changed`. Reloaded on every mount in case
 * patches stopped while nothing held the matchmaking scope. With `staleTime`, reloaded on mount only
 * once that old.
 *
 * Signed out too (GEO-3289): geo-chat answers with the list a new account sees (GEO-3291). With no
 * gateway scope to carry `debate.lobbies_changed`, that list is polled instead.
 */
export function useDebateLobbies(enabled = true, { staleTime }: { staleTime?: number } = {}) {
  const { accountKey, authenticated, ready, getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.lobbies(accountKey),
    queryFn: ({ signal }) => listDebateLobbies(getPrivyIdentityToken, accountKey, signal),
    // Signed in it carries the viewer's own reminders and roster, so it waits out a new account
    // geo-chat does not know yet like the account's other reads. Anonymous, one read.
    ...(accountKey ? viewerReadRetryOptions(accountKey) : {}),
    enabled: enabled && ready,
    ...(staleTime === undefined ? { refetchOnMount: 'always' as const } : { staleTime }),
    ...(authenticated ? {} : { refetchInterval: SIGNED_OUT_LOBBIES_POLL_MS }),
  });
}

/**
 * Every lobby starting in `[from, to)` (GEO-3271), for the calendar's week: no per-host or total cap,
 * and ended lobbies included. Signed in only. Refetched with the lobby list; card patches are laid
 * over it by the gateway.
 */
export function useDebateLobbyCalendar(from: Date, to: Date, enabled = true) {
  const { accountKey, authenticated, ready, getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.lobbyCalendar(accountKey, from.getTime(), to.getTime()),
    queryFn: ({ signal }) => listDebateLobbyCalendar({ from, to }, getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && ready && authenticated,
  });
}

/** The lobby the viewer is on the roster of, across tabs; see `DebateMyLobby`. */
export function useMyDebateLobby(enabled = true) {
  const { accountKey, authenticated, ready, getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.myLobby(accountKey),
    queryFn: ({ signal }) => getMyDebateLobby(getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && ready && authenticated,
  });
}

/** Floor between refetches at `opens_at`, so a client clock ahead of the server cannot spin. */
const OPENS_REFETCH_MIN_MS = 5_000;
/** `setTimeout`'s ceiling; a later opening refetches early and schedules again. */
export const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Structural sharing that still hands out a new `members` on every full read, a refetch or a stored
 * view, even one equal to the last: a stepped-out page waits for a roster read since its step-out,
 * and tells one by that. Patches (claim lists, guest counts) spread the cached view and keep it.
 */
function shareLobbyViewWithFreshRoster(previous: unknown, next: unknown): unknown {
  const shared = replaceEqualDeep(previous, next) as DebateLobbyView | undefined;
  const members = (next as DebateLobbyView | undefined)?.members;
  if (!shared || !members || shared.members === members) return shared;
  return { ...shared, members };
}

/**
 * One lobby. Kept current by `debate.lobby_changed` and the heartbeat's own view. That event only
 * reaches people in the lobby, so a lobby not yet open is refetched at `opens_at`.
 */
export function useDebateLobby(lobbyId: string, enabled = true) {
  const { accountKey, authenticated, ready, getPrivyIdentityToken } = useGeoChatAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    ...debateQueryNetworkOptions,
    // Waits out a new account geo-chat does not know yet; a guest signing in listens meanwhile.
    ...viewerReadRetryOptions(accountKey),
    queryKey: debateQueryKeys.lobby(accountKey, lobbyId),
    // A list change that landed while this read was in flight is newer than what it read. The cache
    // is read only once the response is in: read before, it would miss exactly that change.
    queryFn: async ({ signal }) => {
      const fetched = await getDebateLobby(lobbyId, getPrivyIdentityToken, accountKey, signal);
      return settleFetchedLobbyClaimLists(
        queryClient.getQueryData<DebateLobbyView>(debateQueryKeys.lobby(accountKey, lobbyId)),
        fetched
      );
    },
    enabled: enabled && Boolean(lobbyId) && ready && authenticated,
    structuralSharing: shareLobbyViewWithFreshRoster,
  });

  const access = query.data?.access;
  useRefetchAtOpening(query, access?.status === 'not_yet_open' ? access.opens_at : null);

  return query;
}

/** Refetches `query` just after `opensAt`, and again after each refetch that leaves it unchanged. */
export function useRefetchAtOpening(
  query: Pick<UseQueryResult, 'refetch' | 'dataUpdatedAt' | 'errorUpdatedAt'>,
  opensAt: string | null
) {
  const { refetch, dataUpdatedAt, errorUpdatedAt } = query;
  React.useEffect(() => {
    if (!opensAt) return;
    const at = Date.parse(opensAt);
    if (Number.isNaN(at)) return;
    const delay = Math.min(Math.max(at - Date.now() + 1_000, OPENS_REFETCH_MIN_MS), MAX_TIMEOUT_MS);
    const timeout = setTimeout(() => void refetch(), delay);
    return () => clearTimeout(timeout);
    // Reschedules after a refetch that still says not yet open, or that failed.
  }, [dataUpdatedAt, errorUpdatedAt, opensAt, refetch]);
}

/** Writes a returned view into the lobby's cache entry and marks the list stale. */
export function useStoreLobbyView() {
  const queryClient = useQueryClient();
  const { accountKey } = useGeoChatAuth();

  return React.useCallback(
    (view: DebateLobbyView) => {
      queryClient.setQueryData(debateQueryKeys.lobby(accountKey, view.lobby_id), view);
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.lobbies(accountKey) });
    },
    [accountKey, queryClient]
  );
}

export function useCreateDebateLobby() {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const store = useStoreLobbyView();

  return useMutation({
    mutationFn: (body: CreateDebateLobbyRequest) => createDebateLobby(body, getPrivyIdentityToken, accountKey),
    onSuccess: view => {
      store(view);
      lobbyCreated(view.lobby_id, { scheduled: view.scheduled });
    },
  });
}

/** A cached lobby list, or the calendar's week, which sits under the same key. */
type ListedLobbies = { lobbies: DebateLobbySummary[] };

/** `list` with `patch` laid over `lobbyId`'s row, or the same list when it is not listed. */
function patchListedLobby<T extends ListedLobbies>(list: T, lobbyId: string, patch: Partial<DebateLobbySummary>): T {
  const id = dashlessId(lobbyId);
  if (!list.lobbies.some(row => dashlessId(row.lobby_id) === id)) return list;
  return { ...list, lobbies: list.lobbies.map(row => (dashlessId(row.lobby_id) === id ? { ...row, ...patch } : row)) };
}

/** Lays `patch` over `lobbyId`'s row in every cached list: the side panel's and each calendar week. */
function useWriteListedLobby() {
  const queryClient = useQueryClient();
  const { accountKey } = useGeoChatAuth();
  return React.useCallback(
    (lobbyId: string, patch: Partial<DebateLobbySummary>) =>
      queryClient.setQueriesData<ListedLobbies>(
        { queryKey: debateQueryKeys.lobbies(accountKey) },
        list => list && patchListedLobby(list, lobbyId, patch)
      ),
    [accountKey, queryClient]
  );
}

/** Too late to change: the lobby opened or ended since the list was read, so the list is read again. */
function useRefetchListOnConflict() {
  const queryClient = useQueryClient();
  const { accountKey } = useGeoChatAuth();
  return React.useCallback(
    (error: Error) => {
      if (error instanceof GeoChatRequestError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: debateQueryKeys.lobbies(accountKey) });
      }
    },
    [accountKey, queryClient]
  );
}

/** Every reminder write shares it, so one in flight shows on every control for that lobby. */
const LOBBY_REMINDER_MUTATION_KEY = ['debates', 'lobby-reminder'] as const;

export function useDebateLobbyReminder() {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const store = useStoreLobbyView();
  const writeListed = useWriteListedLobby();
  const refetchOnConflict = useRefetchListOnConflict();

  return useMutation({
    mutationKey: LOBBY_REMINDER_MUTATION_KEY,
    mutationFn: ({ lobbyId, reminded }: { lobbyId: string; reminded: boolean }) =>
      setDebateLobbyReminder(lobbyId, reminded, getPrivyIdentityToken, accountKey),
    onSuccess: view => {
      // Remind me draws from the list's row, so the answer is written there now (the calendar's
      // week sits under the same key). Waiting on the refetch `store` starts would show RSVP again
      // until it lands, and for good if it fails (GEO-3289). An RSVP clears a dismissal (GEO-3519),
      // as geo-chat does, so a lobby dismissed and then RSVP'd elsewhere is not hidden meanwhile.
      writeListed(view.lobby_id, {
        viewer_reminded: view.viewer.reminded,
        reminder_count: view.reminder_count,
        ...(view.viewer.reminded ? { viewer_dismissed: false } : {}),
      });
      store(view);
      lobbyRsvpChanged(view.lobby_id, {
        going: view.viewer.reminded,
        startsAt: view.starts_at,
        reminderCount: view.reminder_count,
      });
    },
    onError: refetchOnConflict,
  });
}

/**
 * Dismiss on an upcoming lobby in the Requests timeline (GEO-3519), or `dismissed: false` to take it
 * back. Unlike the reminder it is drawn at once: the row leaves on the press, and comes back if the
 * write fails. Hold it above the rows it removes, so the failure outlives the row it hid; see
 * {@link lobbyDismissalError}.
 */
export function useDebateLobbyDismissal() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const store = useStoreLobbyView();
  const writeListed = useWriteListedLobby();
  const refetchOnConflict = useRefetchListOnConflict();

  return useMutation({
    mutationFn: ({ lobbyId, dismissed }: { lobbyId: string; dismissed: boolean }) =>
      setDebateLobbyDismissal(lobbyId, dismissed, getPrivyIdentityToken, accountKey),
    onMutate: async ({ lobbyId, dismissed }) => {
      // A read already on its way would land the old row over this one.
      await queryClient.cancelQueries({ queryKey: debateQueryKeys.lobbies(accountKey) });
      writeListed(lobbyId, { viewer_dismissed: dismissed });
    },
    // geo-chat's answer over the drawn one, where it gives one.
    onSuccess: (view, { dismissed }) => {
      writeListed(view.lobby_id, { viewer_dismissed: view.viewer.dismissed ?? dismissed });
      store(view);
    },
    // Only this row put back, rather than a snapshot of the whole list: card patches that landed
    // while the write was out are kept.
    onError: (error, { lobbyId, dismissed }) => {
      writeListed(lobbyId, { viewer_dismissed: !dismissed });
      refetchOnConflict(error);
    },
  });
}

/** The failure of the dismissal `dismissal` last asked for, when it was for `lobbyId`. */
export function lobbyDismissalError(
  dismissal: Pick<ReturnType<typeof useDebateLobbyDismissal>, 'isError' | 'error' | 'variables'>,
  lobbyId: string
): Error | null {
  if (!dismissal.isError || !dismissal.variables) return null;
  return dashlessId(dismissal.variables.lobbyId) === dashlessId(lobbyId) ? dismissal.error : null;
}

/**
 * Whether any control is writing this lobby's reminder (GEO-3289), the navbar's queued replay
 * included. Each control has its own mutation, so this is what stops one taking a reminder back
 * while another's write is still landing.
 */
export function useLobbyReminderSaving(lobbyId: string) {
  const saving = useMutationState({
    filters: { mutationKey: LOBBY_REMINDER_MUTATION_KEY, status: 'pending' },
    select: mutation => (mutation.state.variables as { lobbyId: string } | undefined)?.lobbyId,
  });
  return lobbyId !== '' && saving.some(id => id !== undefined && dashlessId(id) === dashlessId(lobbyId));
}

/**
 * The reminder failure to show beside `lobby`: only one asked for this lobby, while it is still to
 * open. A 409 `lobby_already_open` shows nothing; the refetched list swaps in Join.
 */
export function useLobbyReminderError(
  reminder: ReturnType<typeof useDebateLobbyReminder>,
  lobby: { lobby_id: string; open: boolean }
): unknown {
  const id = dashlessId(lobby.lobby_id);
  const { reset } = reminder;
  // Clears when another lobby takes this one's place.
  React.useEffect(() => reset, [id, reset]);

  if (!reminder.isError || lobby.open) return null;
  if (!reminder.variables || dashlessId(reminder.variables.lobbyId) !== id) return null;
  const error = reminder.error;
  if (error instanceof GeoChatRequestError && error.code === 'lobby_already_open') return null;
  return error;
}

export function useEndDebateLobby(lobbyId: string) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const store = useStoreLobbyView();

  return useMutation({
    mutationFn: (options: { publishRecording?: boolean } | void) =>
      endDebateLobby(lobbyId, getPrivyIdentityToken, accountKey, options ?? {}),
    onSuccess: view => {
      store(view);
      if (view.purpose !== 'call') lobbyEnded(view.lobby_id, { scheduled: view.scheduled, opensAt: view.opens_at });
    },
  });
}

/** The lobby, or the call (GEO-3419), a `moved` heartbeat went to. */
function otherRoomId(heartbeat: DebateLobbyHeartbeat) {
  const id = heartbeat.current_lobby_id ?? heartbeat.current_call_id;
  return id ? dashlessId(id) : null;
}

export type LobbyPresenceState =
  | { status: 'idle' }
  | { status: 'joining' }
  | { status: 'joined' }
  /** In another open lobby; joining this one leaves it, so the viewer is asked first. */
  | { status: 'confirm_leave_other'; otherLobbyId: string | null; rejoin?: true }
  /** Joined another lobby from another tab, which dropped this one; no automatic rejoin. */
  | { status: 'moved'; otherLobbyId: string | null }
  /**
   * Out to debate, still on the roster. Stepped out by a debate in another tab, it joins again once a
   * newer roster shows that debate over. It ends as `left` once one shows the viewer gone, or as
   * `dropped` when a host removes them meanwhile.
   */
  | { status: 'stepped_out' }
  /** Taken out by the server; the refetched access says the rest. */
  | { status: 'dropped'; reason: 'ended' | 'banned' | 'removed' }
  | { status: 'left' }
  | { status: 'failed'; message: string };

/** A lobby view's roster, with the viewer's id to find their own row in it. */
export type LobbyPresenceRoster = { members: readonly DebateLobbyMember[]; viewerId: string };

/**
 * Presence in one lobby: joins once admitted, heartbeats while joined, and leaves on unmount,
 * `pagehide` or Leave. A heartbeat answering `lapsed` joins again.
 */
export function useLobbyPresence(
  lobbyId: string,
  admitted: boolean,
  steppedOut = false,
  connected = false,
  removed = false,
  /** The view's roster and whose row is the viewer's; undefined while either is unknown. */
  roster?: LobbyPresenceRoster
) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const store = useStoreLobbyView();
  const connectionId = useConnectionId();
  const room = useLobbyRoomNoun();
  const [state, setRenderedState] = React.useState<LobbyPresenceState>({ status: 'idle' });
  // Current as of the last update rather than the last render, so `stepOut` sees a server
  // step-out that landed in the same tick as the routing.
  const statusRef = React.useRef(state.status);
  const setState = React.useCallback((next: LobbyPresenceState) => {
    statusRef.current = next.status;
    setRenderedState(next);
  }, []);

  // A token refresh must not re-run the effects below.
  const tokenRef = React.useRef(getPrivyIdentityToken);
  React.useEffect(() => {
    tokenRef.current = getPrivyIdentityToken;
  }, [getPrivyIdentityToken]);

  // Joined per the last answer; drives the heartbeat.
  const joinedRef = React.useRef(false);
  // This tab holds the lobby's voice connection; reported on each heartbeat.
  const voiceConnectedRef = React.useRef(false);
  const setVoiceConnected = React.useCallback((connected: boolean) => {
    voiceConnectedRef.current = connected;
  }, []);
  // When voice stops keeping the viewer available without input, per the last heartbeat.
  const [voiceAwayAt, setVoiceAwayAt] = React.useState<string | null>(null);
  // A join was sent and no leave since, so leaving must be sent even if the join is in flight.
  const sentRef = React.useRef(false);
  // Bumped by Leave and unmount; a join answered under an older generation is dropped.
  const generationRef = React.useRef(0);
  // Presence requests in order, so a leave never lands before the join it follows.
  const queueRef = React.useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = React.useCallback(<T>(task: () => Promise<T>) => {
    const next = queueRef.current.catch(() => undefined).then(task);
    queueRef.current = next.catch(() => undefined);
    return next;
  }, []);

  const join = React.useCallback(
    /** `rejoin` only from the removed screen's Rejoin: the viewer chose to come back. */
    async (leaveOtherLobby = false, rejoin = false) => {
      const generation = generationRef.current;
      const from = statusRef.current;
      if (from === 'stepped_out') markLobbyEntry(lobbyId, 'back_after_debate');
      else if (from === 'left' || from === 'dropped' || from === 'moved') markLobbyEntry(lobbyId, 'rejoin');
      sentRef.current = true;
      setState({ status: 'joining' });
      // A guest signing in: the join ends their guest session, so they are never counted twice.
      const guestSecret = readGuestSecret(lobbyId);
      try {
        const view = await enqueue(() =>
          retryOnceIfRateLimited(() =>
            setDebateLobbyPresence(
              lobbyId,
              {
                connection_id: connectionId,
                joined: true,
                leave_other_lobby: leaveOtherLobby,
                ...(rejoin ? { rejoin: true } : {}),
                ...(guestSecret ? { guest_secret: guestSecret } : {}),
              },
              () => tokenRef.current(),
              accountKey
            )
          )
        );
        if (generation !== generationRef.current) return;
        store(view);
        // A lobby that would not admit answers with its view; the page renders its access.
        joinedRef.current = view.viewer.connected;
        // A reconnect in the same visit is not a new session; `lobbyJoined` tells them apart. A
        // space call has no lobby session: the warehouse's lobby events are lobbies only.
        if (view.viewer.connected && view.purpose !== 'call') {
          lobbyJoined(lobbyId, {
            isNewcomer: view.viewer.newcomer ?? null,
            role: view.viewer.role,
            hosting: view.viewer.hosting,
            moderationAt: view.viewer.last_moderation?.at ?? null,
            headcount: lobbyRoomHeadcount(view),
          });
        }
        setState(view.viewer.connected ? { status: 'joined' } : { status: 'idle' });
      } catch (error) {
        if (generation !== generationRef.current) return;
        joinedRef.current = false;
        sentRef.current = false;
        // Any join, automatic or not, lands on the removed screen; only its Rejoin sends `rejoin`.
        if (isRemovedFromLobby(error)) {
          setState({ status: 'dropped', reason: 'removed' });
          return;
        }
        if (isAlreadyInAnotherLobby(error)) {
          setState({
            status: 'confirm_leave_other',
            otherLobbyId: otherLobbyIdFrom(error),
            ...(rejoin ? { rejoin: true as const } : {}),
          });
          return;
        }
        setState({
          status: 'failed',
          message: lobbyErrorMessage(error, `Could not join this ${room}. Try again.`, room),
        });
      }
    },
    [accountKey, connectionId, enqueue, lobbyId, room, setState, store]
  );

  const sendLeave = React.useCallback(
    (keepalive: boolean) =>
      setDebateLobbyPresence(
        lobbyId,
        { connection_id: connectionId, joined: false },
        () => tokenRef.current(),
        accountKey,
        keepalive
      ),
    [accountKey, connectionId, lobbyId]
  );

  const leave = React.useCallback(async () => {
    generationRef.current += 1;
    sentRef.current = false;
    joinedRef.current = false;
    setState({ status: 'left' });
    lobbyLeft(lobbyId, 'left');
    try {
      store(await enqueue(() => sendLeave(false)));
    } catch {
      // The lease lapses within a minute anyway.
    }
  }, [enqueue, lobbyId, sendLeave, setState, store]);

  // Out of the lobby without a leave: stops the heartbeat and the unmount's leave.
  const stopWithout = React.useCallback(
    (next: LobbyPresenceState) => {
      generationRef.current += 1;
      sentRef.current = false;
      joinedRef.current = false;
      setState(next);
    },
    [setState]
  );

  // The latest roster, and the one shown when a debate in another tab stepped this page out. Only a
  // roster read since can say how that debate went: patches to the view (claim lists, guest counts)
  // keep the same `members`. Null when nothing is to be recovered, as when this tab left to debate.
  const rosterRef = React.useRef(roster);
  React.useEffect(() => {
    rosterRef.current = roster;
  }, [roster]);
  const stepOutRosterRef = React.useRef<{ members: readonly DebateLobbyMember[] | undefined } | null>(null);

  const stepOut = React.useCallback(async () => {
    // This tab is going to the debate itself: its own step-out is never one to come back from here.
    stepOutRosterRef.current = null;
    // The server can step the viewer out first (the debate's start reaches the heartbeat before
    // the routing), and the lobby must still be where the debate returns to.
    const steppedOutAlready = statusRef.current === 'stepped_out';
    if (!sentRef.current && !steppedOutAlready) return;
    lobbySteppedOut(lobbyId);
    rememberLobbyReturnDestination(lobbyId);
    carryLobbyJoinChoice();
    if (!sentRef.current) return;
    stopWithout({ status: 'stepped_out' });
    try {
      store(
        await enqueue(() =>
          stepOutOfDebateLobby(lobbyId, { connection_id: connectionId }, () => tokenRef.current(), accountKey)
        )
      );
    } catch {
      // `lobby_not_present`, or the server steps them out from the debate itself.
    }
  }, [accountKey, connectionId, enqueue, lobbyId, stopWithout, store]);

  /** Stepped out, leave for good. */
  const leaveSteppedOut = React.useCallback(async () => {
    stopWithout({ status: 'left' });
    lobbyLeft(lobbyId, 'left');
    try {
      store(await enqueue(() => endDebateLobbyStepOut(lobbyId, () => tokenRef.current(), accountKey)));
    } catch {
      // Step-out expires on its own.
    }
  }, [accountKey, enqueue, lobbyId, stopWithout, store]);

  React.useEffect(() => {
    return registerLobbyStepOut(stepOut);
  }, [stepOut]);

  // Auto-join once admitted, unless the viewer left or is being asked about another lobby. Arriving
  // stepped out is coming back from the debate, by any route: straight into the room.
  const status = state.status;
  React.useEffect(() => {
    if (!admitted || status !== 'idle') return;
    // A host removed them, possibly mid-debate: coming back is their call, even back from the debate.
    if (removed) {
      setState({ status: 'dropped', reason: 'removed' });
      return;
    }
    if (steppedOut) markLobbyEntry(lobbyId, 'back_after_debate');
    void join(false);
  }, [admitted, join, lobbyId, removed, setState, status, steppedOut]);

  // Stepped out while this page stayed open, by a debate in another tab: back in once a roster read
  // since shows the debate over, which can be before this tab ever saw it running. A roster without
  // the viewer means they left from another tab, and this one leaves with them.
  React.useEffect(() => {
    const shownAtStepOut = stepOutRosterRef.current;
    if (status !== 'stepped_out' || !shownAtStepOut || !admitted) return;
    // A host removed them meanwhile: the removed screen, as for a page still in the room.
    if (removed) {
      stopWithout({ status: 'dropped', reason: 'removed' });
      return;
    }
    if (!roster) return;
    if (roster.members === shownAtStepOut.members) return;
    const own = roster.members.find(member => sameId(member.user_id, roster.viewerId));
    if (!own) stopWithout({ status: 'left' });
    else if (!own.in_debate) void join(false);
  }, [admitted, join, removed, roster, status, stopWithout]);

  // Unbanned after a ban this tab heard: the view is admitted again with `removed`, so the
  // viewer gets the removed screen and its Rejoin rather than a stale ban.
  const droppedBanned = state.status === 'dropped' && state.reason === 'banned';
  React.useEffect(() => {
    if (droppedBanned && admitted && removed) setState({ status: 'dropped', reason: 'removed' });
  }, [admitted, droppedBanned, removed, setState]);

  const beatNowRef = React.useRef<(() => void) | null>(null);

  const onGone = React.useCallback(
    (heartbeat: DebateLobbyHeartbeat) => {
      switch (heartbeat.reason) {
        case 'moved':
          lobbyLeft(lobbyId, 'unknown');
          stopWithout({
            status: 'moved',
            otherLobbyId: otherRoomId(heartbeat),
          });
          return;
        case 'stepped_out':
          lobbySteppedOut(lobbyId);
          stepOutRosterRef.current = { members: rosterRef.current?.members };
          stopWithout({ status: 'stepped_out' });
          void queryClient.invalidateQueries({ queryKey: debateQueryKeys.lobby(accountKey, lobbyId) });
          return;
        case 'ended':
        case 'banned':
        case 'removed':
          lobbyLeft(lobbyId, heartbeat.reason === 'ended' ? 'lobby_ended' : 'unknown');
          stopWithout({ status: 'dropped', reason: heartbeat.reason });
          void queryClient.invalidateQueries({ queryKey: debateQueryKeys.lobby(accountKey, lobbyId) });
          return;
        default:
          // `lapsed`. Off the roster, the page missed the lobby's events; reread what they keep current.
          void join(false).then(() => {
            if (!joinedRef.current) return;
            void queryClient.invalidateQueries({ queryKey: debateQueryKeys.lobbyHighlights(accountKey, lobbyId) });
            void queryClient.invalidateQueries({ queryKey: debateQueryKeys.lobbyClaims(accountKey, lobbyId) });
          });
      }
    },
    [accountKey, join, lobbyId, queryClient, stopWithout]
  );

  // Heartbeat while joined; `reason` says what a dropped connection does next. A tab coming back
  // from the background beats at once, since its timers may have been throttled.
  React.useEffect(() => {
    if (status !== 'joined' || !admitted) return;
    let lastBeat = Date.now();
    // A 429 waits out `Retry-After` and beats again; it is never read as a lapsed lease, since a
    // rejoin would be limited too. The 120s lease covers a throttled beat or two.
    let backoffUntil = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const beat = () => {
      if (Date.now() < backoffUntil) return;
      lastBeat = Date.now();
      void sendDebateLobbyHeartbeat(
        lobbyId,
        { connection_id: connectionId, voice_connected: voiceConnectedRef.current },
        () => tokenRef.current(),
        accountKey
      )
        .then(heartbeat => {
          setVoiceAwayAt(heartbeat.voice_away_at);
          if (joinedRef.current && !heartbeat.connection_alive) onGone(heartbeat);
        })
        .catch(error => {
          const delay = rateLimitDelayMs(error);
          if (delay === null) return;
          backoffUntil = Date.now() + delay;
          if (retry) clearTimeout(retry);
          retry = setTimeout(beat, delay);
        });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastBeat >= VISIBLE_BEAT_MIN_GAP_MS) beat();
    };
    beatNowRef.current = beat;
    const interval = setInterval(beat, LOBBY_HEARTBEAT_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      beatNowRef.current = null;
      if (retry) clearTimeout(retry);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [accountKey, admitted, connectionId, lobbyId, onGone, status]);

  // A view saying this viewer is out (`debate.lobby_changed`) beats at once rather than waiting for
  // the interval, which a hidden tab throttles, so a server step-out takes the mic down promptly.
  // The beat's `reason` decides, since a view fetched before a rejoin can be stale.
  React.useEffect(() => {
    if ((steppedOut || !connected) && joinedRef.current) beatNowRef.current?.();
  }, [connected, steppedOut]);

  // One lobby session per visit: a StrictMode remount cancels the end its unmount scheduled.
  React.useEffect(() => {
    lobbyPageMounted(lobbyId);
    const close = (event: PageTransitionEvent) => {
      if (!event.persisted) lobbyPageClosed(lobbyId);
    };
    window.addEventListener('pagehide', close);
    return () => {
      window.removeEventListener('pagehide', close);
      lobbyPageUnmounted(lobbyId);
      forgetLobbyDevices();
    };
  }, [lobbyId]);

  // Leave on navigation away and on tab close. A bfcache restore joins again. Callbacks are read
  // through refs so a changed identity never runs the cleanup, which would send a leave.
  const joinRef = React.useRef(join);
  const sendLeaveRef = React.useRef(sendLeave);
  React.useEffect(() => {
    joinRef.current = join;
    sendLeaveRef.current = sendLeave;
  }, [join, sendLeave]);

  React.useEffect(() => {
    const queue = enqueue;
    const depart = () => {
      if (!sentRef.current) return;
      void sendLeaveRef.current(true).catch(() => undefined);
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted && sentRef.current) void joinRef.current(false);
    };
    window.addEventListener('pagehide', depart);
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener('pagehide', depart);
      window.removeEventListener('pageshow', restore);
      generationRef.current += 1;
      joinedRef.current = false;
      if (sentRef.current) {
        sentRef.current = false;
        void queue(() => retryOnceIfRateLimited(() => sendLeaveRef.current(true))).catch(() => undefined);
      }
      // Ignored after a real unmount; after StrictMode's test unmount it lets the remount join.
      setState({ status: 'idle' });
    };
  }, [enqueue, setState]);

  return { state, join, leave, leaveSteppedOut, connectionId, setVoiceConnected, voiceAwayAt };
}
