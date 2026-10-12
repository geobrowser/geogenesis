import * as React from 'react';

import { capture } from '~/core/analytics';

import { type Debate, dashlessId } from '../api';
import { sameId } from '../rooms/room-presence';
import { debateRoomPath } from '../rooms/room-routes';

// Lobby analytics (GEO-3126). Events must be registered in `geobrowser/analytics`; never send
// `measurement_version`, `source` or `duration*`. Sessions live in memory, touched only from
// effects and handlers.

/** How the viewer got to the lobby, as of the join that starts the session. */
export type LobbyEntry =
  /** No in-app control marked it: a pasted or shared link, a typed URL, a reload. */
  | 'link'
  /** The lobbies card in the side panel. */
  | 'side_panel'
  /** Go to lobby, right after creating it. */
  | 'created'
  /** Back to the room, on a debate's end card or on the lobby's stepped-out prompt. */
  | 'back_after_debate'
  /** Rejoin after leaving, being removed, or being moved out by another tab. */
  | 'rejoin'
  /** A link on another lobby's page. */
  | 'other_lobby'
  | 'unknown';

export type LobbyExit = 'left' | 'debate_started' | 'page_closed' | 'lobby_ended' | 'unknown';

export type LobbyRequestKind = 'claim' | 'person';

/**
 * `via` on a lobby's shared link. A signed-out visitor's room page cannot read the room's kind, so
 * the link says it is a lobby and sign-in attributes the sign-up to it. Bare room links stay `room`.
 */
export const LOBBY_LINK_VIA = 'lobby';

/** The link a lobby hands out to share. */
export function lobbyShareUrl(lobbyId: string) {
  return `${window.location.origin}${debateRoomPath(lobbyId)}?via=${LOBBY_LINK_VIA}`;
}

/** A marked entry older than this is stale: the navigation it was set for never joined. */
const ENTRY_TTL_MS = 60_000;
/** How long after stepping out or leaving a debate still counts for the session. */
const DEBATE_ATTRIBUTION_MS = 60 * 60_000;

type Session = {
  lobbyId: string;
  sessionId: string;
  joinedAt: number;
  /** `null` when geo-chat did not say; then `is_newcomer` is left out rather than sent false. */
  isNewcomer: boolean | null;
  /** Out to debate, by this tab or by the server; still open until the debate or a leave. */
  steppedOutAt: number | null;
  /** Sent its `lobby_left`; kept until the next join to attribute a debate that follows. */
  endedAt: number | null;
  debates: Set<string>;
  /** A repeat click reuses a pending challenge, so ids are counted once. */
  requests: Set<string>;
};

let session: Session | null = null;
/** Earlier sessions by dashless lobby id, so a debate or request answered after moving on still counts. */
const retained = new Map<string, Session>();
let pendingEntry: { lobbyId: string; entry: LobbyEntry; at: number } | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

/** Analytics never gets in the way of the lobby. */
function send(...args: Parameters<typeof capture>) {
  try {
    capture(...args);
  } catch {
    // Dropped.
  }
}

function cancelRelease() {
  if (releaseTimer === null) return;
  clearTimeout(releaseTimer);
  releaseTimer = null;
}

/** In the room: joined, not stepped out, not ended. */
function activeFor(lobbyId: string) {
  return session !== null &&
    sameId(session.lobbyId, lobbyId) &&
    session.steppedOutAt === null &&
    session.endedAt === null
    ? session
    : null;
}

function withinWindow(target: Session, now: number) {
  const outSince = target.endedAt ?? target.steppedOutAt;
  return outSince === null || now - outSince <= DEBATE_ATTRIBUTION_MS;
}

/** The session a debate or request for this lobby belongs to: the current one first, then a retained one. */
function sessionFor(lobbyId: string, now: number) {
  for (const [id, earlier] of retained) {
    if (!withinWindow(earlier, now)) retained.delete(id);
  }
  const found = session && sameId(session.lobbyId, lobbyId) ? session : (retained.get(dashlessId(lobbyId)) ?? null);
  return found && withinWindow(found, now) ? found : null;
}

/** Ends a session with its one `lobby_left`. */
function end(exit: LobbyExit, now = Date.now(), ended = session) {
  if (ended === session) cancelRelease();
  if (!ended || ended.endedAt !== null) return;
  ended.endedAt = now;
  send('lobby_left', {
    lobby_id: ended.lobbyId,
    lobby_session_id: ended.sessionId,
    time_in_lobby_ms: Math.max(0, Math.round((ended.steppedOutAt ?? now) - ended.joinedAt)),
    exit,
  });
}

function newcomerProperty(isNewcomer: boolean | null) {
  return isNewcomer === null ? {} : { is_newcomer: isNewcomer };
}

/** Set by the control that leads into the lobby, before navigating or joining. */
export function markLobbyEntry(lobbyId: string, entry: LobbyEntry) {
  pendingEntry = { lobbyId: dashlessId(lobbyId), entry, at: Date.now() };
}

function takeEntry(lobbyId: string): LobbyEntry {
  const pending = pendingEntry;
  pendingEntry = null;
  if (!pending || !sameId(pending.lobbyId, lobbyId) || Date.now() - pending.at > ENTRY_TTL_MS) return 'link';
  return pending.entry;
}

/** The server put the viewer on the roster. Starts a session unless this one is still going. */
export function lobbyJoined(lobbyId: string, { isNewcomer }: { isNewcomer: boolean | null }) {
  cancelRelease();
  if (activeFor(lobbyId)) return;
  // Joining one lobby leaves any other; back without a debate ends a stepped-out one.
  if (session) {
    end(session.steppedOutAt === null ? 'left' : 'unknown');
    retained.set(session.lobbyId, session);
  }
  const started: Session = {
    // geo-chat's spelling, so events join its `lobby_id` and `Debate.lobby_id`.
    lobbyId: dashlessId(lobbyId),
    sessionId: crypto.randomUUID(),
    joinedAt: Date.now(),
    isNewcomer,
    steppedOutAt: null,
    endedAt: null,
    debates: new Set(),
    requests: new Set(),
  };
  session = started;
  retained.delete(started.lobbyId);
  send('lobby_joined', {
    lobby_id: started.lobbyId,
    lobby_session_id: started.sessionId,
    ...newcomerProperty(isNewcomer),
    entry: takeEntry(lobbyId),
  });
}

/** Leave, or the server took them out. Also ends a stepped-out session. */
export function lobbyLeft(lobbyId: string, exit: Exclude<LobbyExit, 'debate_started'>) {
  if (session && sameId(session.lobbyId, lobbyId)) end(exit);
}

/** Out to debate, by this tab or by the server. `lobby_left` waits for the debate. */
export function lobbySteppedOut(lobbyId: string, now = Date.now()) {
  const active = activeFor(lobbyId);
  if (!active) return;
  cancelRelease();
  active.steppedOutAt = now;
}

/** The lobby page mounted. Cancels the end a StrictMode unmount just scheduled. */
export function lobbyPageMounted(lobbyId: string) {
  if (session && sameId(session.lobbyId, lobbyId)) cancelRelease();
}

/** The lobby page unmounted: navigated away, unless it remounts in the same tick. */
export function lobbyPageUnmounted(lobbyId: string) {
  if (!activeFor(lobbyId)) return;
  cancelRelease();
  releaseTimer = setTimeout(() => {
    releaseTimer = null;
    if (activeFor(lobbyId)) end('left');
  }, 0);
}

/** The page is being unloaded, not kept in the back-forward cache. Best effort. */
export function lobbyPageClosed(lobbyId: string) {
  if (activeFor(lobbyId)) end('page_closed');
}

/**
 * A debate this viewer is in. Counts once per session and debate, against the session of the
 * debate's lobby: the open one, or one that stepped out or ended within the hour.
 */
export function lobbyDebateSeen(debate: Pick<Debate, 'id' | 'lobby_id'>, now = Date.now()) {
  if (!debate.lobby_id) return;
  const current = sessionFor(debate.lobby_id, now);
  if (!current || current.debates.has(debate.id)) return;
  current.debates.add(debate.id);
  end('debate_started', now, current);
  send('lobby_debate_started', {
    lobby_id: current.lobbyId,
    lobby_session_id: current.sessionId,
    debate_id: debate.id,
    ...newcomerProperty(current.isNewcomer),
    ms_since_join: Math.max(0, Math.round(now - current.joinedAt)),
  });
}

/**
 * The viewer's current debate, from the coordinator's activity. Covers every way into a debate,
 * including the server stepping people out when a debate starts with no call from this tab.
 */
export function useLobbyDebateAnalytics(debate: Pick<Debate, 'id' | 'lobby_id'> | null | undefined) {
  const debateId = debate?.id ?? null;
  const lobbyId = debate?.lobby_id ?? null;
  React.useEffect(() => {
    if (debateId && lobbyId) lobbyDebateSeen({ id: debateId, lobby_id: lobbyId });
  }, [debateId, lobbyId]);
}

/** A request the server accepted, sent from a lobby. Dropped without a session of that lobby in the window. */
export function lobbyDebateRequested(
  lobbyId: string,
  request: { kind: 'claim'; requestId: string; claimId: string } | { kind: 'person'; requestId: string }
) {
  const target = sessionFor(lobbyId, Date.now());
  if (!target || target.requests.has(request.requestId)) return;
  target.requests.add(request.requestId);
  send('lobby_debate_requested', {
    lobby_id: target.lobbyId,
    lobby_session_id: target.sessionId,
    request_kind: request.kind,
    request_id: request.requestId,
    ...(request.kind === 'claim' ? { target_id: request.claimId } : {}),
  });
}

export function lobbyCreated(lobbyId: string, { scheduled }: { scheduled: boolean }) {
  send('lobby_created', { lobby_id: dashlessId(lobbyId), scheduled });
}

/** Tests only. */
export function resetLobbyAnalytics() {
  cancelRelease();
  session = null;
  retained.clear();
  pendingEntry = null;
}
