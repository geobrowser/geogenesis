import * as React from 'react';

import { capture } from '~/core/analytics';
import { currentNavigationType } from '~/core/utils/navigation-type';

import { type Debate, type DebateLobbyRole, type DebateLobbyRoomVote, type DebateLobbyView, dashlessId } from '../api';
import { sameId } from '../rooms/room-presence';
import { debateRoomPath } from '../rooms/room-routes';

// Lobby analytics (GEO-3126, GEO-3311). Events must be registered in `geobrowser/analytics`; never
// send `measurement_version`, `source`, `name` or `duration*`. Sessions live in memory, mirrored to
// the tab's sessionStorage so a reload keeps them, and are touched only from effects and handlers.

/** How the viewer got to the lobby, as of the join that starts the session. */
export type LobbyEntry =
  /** No in-app control marked it: a pasted or shared link, a typed URL, a reload. */
  | 'link'
  /** The lobbies card or the spotlight in the side panel. */
  | 'side_panel'
  /** The Debate button's hover list in the navbar (GEO-3268). */
  | 'nav'
  /** The live lobby banner above the Explore feed (GEO-3268). */
  | 'explore_banner'
  /** A lobby's card on the debate calendar, from the row pinned above the hours (GEO-3268). */
  | 'calendar'
  /** A lobby under Upcoming lobbies in the Requests tab (GEO-3292). */
  | 'requests'
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

/** Why a room vote stopped, as the hosting tab that saw it stop can tell. */
export type LobbyRoomVoteEnd = 'ended' | 'replaced' | 'lobby_ended';

/**
 * `via` on a lobby's shared link. A signed-out visitor's room page learns the kind from the guest
 * view; when that read fails, the link still says it is a lobby and sign-in attributes the sign-up
 * to it. Bare room links stay `room`.
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
const STORAGE_KEY = 'geo.lobby-analytics.v1';

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
  /** As of the join, then each change this tab saw. `null` when geo-chat did not say. */
  role: DebateLobbyRole | null;
  hosting: boolean | null;
  /** The viewer's `last_moderation.at` last seen, so a role change can name the host action behind it. */
  moderationAt: string | null;
  /** People in the room (members not stepped out, plus guests), the most this tab saw. */
  peakHeadcount: number | null;
  lastHeadcount: number | null;
  /** When this tab last wrote the session: as late as it is known to have been alive. */
  touchedAt: number;
};

type StoredSession = Omit<Session, 'debates' | 'requests'> & { debates: string[]; requests: string[] };

let session: Session | null = null;
/** Earlier sessions by dashless lobby id, so a debate or request answered after moving on still counts. */
const retained = new Map<string, Session>();
let pendingEntry: { lobbyId: string; entry: LobbyEntry; at: number } | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
let restored = false;
/** The room vote each lobby is running, as a hosting tab last saw it, with its latest tally. */
const runningRoomVotes = new Map<string, DebateLobbyRoomVote>();
/** Votes this tab already reported ended; a stale read must not end one twice. */
const endedRoomVotes = new Set<string>();

function toStored(value: Session): StoredSession {
  return { ...value, debates: [...value.debates], requests: [...value.requests] };
}

function fromStored(value: StoredSession): Session {
  return { ...value, debates: new Set(value.debates), requests: new Set(value.requests) };
}

/**
 * Brings back the sessions the previous load of this tab kept, once, and only after a reload. A
 * reload around a debate's start would otherwise lose the session the debate belongs to. Any other
 * load starts fresh: a duplicated tab copies sessionStorage, and two tabs holding one session would
 * each count its debates.
 */
function restore() {
  if (restored) return;
  restored = true;
  if (currentNavigationType() !== 'reload') return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw) as { session: StoredSession | null; retained: StoredSession[] };
    for (const earlier of stored.retained) {
      if (!retained.has(earlier.lobbyId)) retained.set(earlier.lobbyId, fromStored(earlier));
    }
    if (stored.session && session === null) {
      session = fromStored(stored.session);
      // Still in the room when the page went without a `pagehide` (a phone discarding the tab):
      // that visit is over, as of the last time the tab wrote it.
      if (session.endedAt === null && session.steppedOutAt === null) end('page_closed', session.touchedAt);
    }
  } catch {
    // Unreadable or blocked storage: start fresh.
  }
}

function persist() {
  if (session) session.touchedAt = Date.now();
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ session: session ? toStored(session) : null, retained: [...retained.values()].map(toStored) })
    );
  } catch {
    // Storage full or blocked; the in-memory session still counts this visit.
  }
}

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
  restore();
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
  restore();
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
  persist();
  send('lobby_left', {
    lobby_id: ended.lobbyId,
    lobby_session_id: ended.sessionId,
    time_in_lobby_ms: Math.max(0, Math.round((ended.steppedOutAt ?? now) - ended.joinedAt)),
    exit,
    ...optional('peak_headcount', ended.peakHeadcount),
  });
}

/** `{ [key]: value }`, or nothing when the value is unknown, so a missing fact never reads as false or zero. */
function optional<K extends string, V>(key: K, value: V | null | undefined) {
  return (value === null || value === undefined ? {} : { [key]: value }) as Partial<Record<K, V>>;
}

/** Milliseconds from an ISO instant to now (negative before it); `null` when it does not parse. */
function msSince(iso: string, now = Date.now()) {
  const at = Date.parse(iso);
  return Number.isNaN(at) ? null : Math.round(now - at);
}

function newcomerProperty(isNewcomer: boolean | null) {
  return optional('is_newcomer', isNewcomer);
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

function roleProperties(role: DebateLobbyRole | null, hosting: boolean | null) {
  return { ...optional('role', role), ...optional('hosting', hosting) };
}

/** The server put the viewer on the roster. Starts a session unless this one is still going. */
export function lobbyJoined(
  lobbyId: string,
  {
    isNewcomer,
    role = null,
    hosting = null,
    moderationAt = null,
  }: {
    isNewcomer: boolean | null;
    role?: DebateLobbyRole | null;
    hosting?: boolean | null;
    moderationAt?: string | null;
  }
) {
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
    role,
    hosting,
    moderationAt,
    peakHeadcount: null,
    lastHeadcount: null,
    touchedAt: Date.now(),
  };
  session = started;
  retained.delete(started.lobbyId);
  persist();
  send('lobby_joined', {
    lobby_id: started.lobbyId,
    lobby_session_id: started.sessionId,
    ...newcomerProperty(isNewcomer),
    ...roleProperties(role, hosting),
    entry: takeEntry(lobbyId),
  });
}

/**
 * The viewer's own role in the lobby, from each view their tab reads while in the room. A change
 * from the one the session last knew is reported once; `moderation_action` names the host action
 * behind it when one landed with it.
 */
export function lobbyViewerRole(
  lobbyId: string,
  {
    role,
    hosting,
    moderation,
  }: {
    role: DebateLobbyRole | null;
    hosting: boolean;
    moderation: DebateLobbyView['viewer']['last_moderation'];
  }
) {
  const active = activeFor(lobbyId);
  if (!active || role === null) return;
  const moderationAt = moderation?.at ?? null;
  const freshModeration = moderation && moderationAt !== active.moderationAt ? moderation.action : null;
  active.moderationAt = moderationAt;
  if (active.role === null && active.hosting === null) {
    // Joined against a server that did not say: this is the first role the session knows.
    active.role = role;
    active.hosting = hosting;
    persist();
    return;
  }
  if (active.role === role && active.hosting === hosting) {
    persist();
    return;
  }
  const previous = { role: active.role, hosting: active.hosting };
  active.role = role;
  active.hosting = hosting;
  persist();
  send('lobby_role_changed', {
    lobby_id: active.lobbyId,
    lobby_session_id: active.sessionId,
    role,
    hosting,
    ...optional('previous_role', previous.role),
    ...optional('previous_hosting', previous.hosting),
    ...optional('moderation_action', freshModeration),
  });
}

/** How many people are in the room, as the viewer's tab reads it. Kept for the session's peak. */
export function lobbyHeadcountSeen(lobbyId: string, headcount: number) {
  const active = activeFor(lobbyId);
  if (!active) return;
  if (active.lastHeadcount === headcount && (active.peakHeadcount ?? 0) >= headcount) return;
  active.lastHeadcount = headcount;
  active.peakHeadcount = Math.max(active.peakHeadcount ?? 0, headcount);
  persist();
}

/** Leave, or the server took them out. Also ends a stepped-out session. */
export function lobbyLeft(lobbyId: string, exit: Exclude<LobbyExit, 'debate_started'>) {
  restore();
  if (session && sameId(session.lobbyId, lobbyId)) end(exit);
}

/** Out to debate, by this tab or by the server. `lobby_left` waits for the debate. */
export function lobbySteppedOut(lobbyId: string, now = Date.now()) {
  const active = activeFor(lobbyId);
  if (!active) return;
  cancelRelease();
  active.steppedOutAt = now;
  persist();
}

/** The lobby page mounted. Cancels the end a StrictMode unmount just scheduled. */
export function lobbyPageMounted(lobbyId: string) {
  restore();
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
  persist();
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
  persist();
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

/** The session id to put on an event about this lobby, when the viewer has one going. */
function sessionProperty(current: Session | null) {
  return optional('lobby_session_id', current?.sessionId);
}

/** RSVP (Going) set or taken back on a lobby still to open, on the server's confirmation. */
export function lobbyRsvpChanged(
  lobbyId: string,
  { going, startsAt, reminderCount }: { going: boolean; startsAt: string; reminderCount: number }
) {
  const sinceStart = msSince(startsAt);
  send('lobby_rsvp_changed', {
    lobby_id: dashlessId(lobbyId),
    going,
    going_count: reminderCount,
    ...optional('ms_until_start', sinceStart === null ? null : -sinceStart),
  });
}

/** What every room vote event says about the vote. */
function roomVoteProperties(lobbyId: string, vote: DebateLobbyRoomVote) {
  return {
    lobby_id: lobbyId,
    ...sessionProperty(sessionFor(lobbyId, Date.now())),
    room_vote_id: vote.vote_id,
    debate_claim_id: vote.claim.id,
    target_id: vote.claim.claim_entity_id,
  };
}

/** A host asked the room to vote, on the server's confirmation. Sent by that host's tab only. */
export function lobbyRoomVoteStarted(lobbyId: string, vote: DebateLobbyRoomVote, { replaced }: { replaced: boolean }) {
  const id = dashlessId(lobbyId);
  // A vote this one replaced ends first, with the tally it had.
  lobbyRoomVoteSeen(id, vote);
  send('lobby_room_vote_started', {
    ...roomVoteProperties(id, vote),
    replaced,
    eligible: vote.tally.eligible,
  });
}

function endRoomVote(lobbyId: string, vote: DebateLobbyRoomVote, reason: LobbyRoomVoteEnd) {
  runningRoomVotes.delete(lobbyId);
  if (endedRoomVotes.has(vote.vote_id)) return;
  endedRoomVotes.add(vote.vote_id);
  const voteMs = msSince(vote.started_at);
  send('lobby_room_vote_ended', {
    ...roomVoteProperties(lobbyId, vote),
    agree: vote.tally.agree,
    disagree: vote.tally.disagree,
    eligible: vote.tally.eligible,
    end_reason: reason,
    ...optional('vote_ms', voteMs === null ? null : Math.max(0, voteMs)),
  });
}

/**
 * The lobby's room vote as a hosting tab reads it. Keeps the latest tally of the running vote and,
 * when that vote is gone or another took its place, reports it ended with that tally. Every hosting
 * tab reports, so a lobby with two hosts in can send a vote's end twice: count by `room_vote_id`.
 */
export function lobbyRoomVoteSeen(lobbyId: string, vote: DebateLobbyRoomVote | null) {
  const id = dashlessId(lobbyId);
  const previous = runningRoomVotes.get(id);
  if (previous && previous.vote_id !== vote?.vote_id) endRoomVote(id, previous, vote ? 'replaced' : 'ended');
  if (vote && !endedRoomVotes.has(vote.vote_id)) runningRoomVotes.set(id, vote);
}

/**
 * A host ended the lobby, on the server's confirmation. Sent by that host's tab only; a lobby that
 * closes because everyone left has no `lobby_ended`, and its last `lobby_left` marks the end.
 */
export function lobbyEnded(lobbyId: string, { scheduled, opensAt }: { scheduled: boolean; opensAt: string }) {
  const id = dashlessId(lobbyId);
  const running = runningRoomVotes.get(id);
  if (running) endRoomVote(id, running, 'lobby_ended');
  const current = sessionFor(id, Date.now());
  const openMs = msSince(opensAt);
  send('lobby_ended', {
    lobby_id: id,
    ...sessionProperty(current),
    scheduled,
    ...optional('open_ms', openMs === null ? null : Math.max(0, openMs)),
    ...optional('headcount', current?.lastHeadcount),
    ...optional('peak_headcount', current?.peakHeadcount),
  });
}

/** Tests only. */
export function resetLobbyAnalytics() {
  cancelRelease();
  session = null;
  retained.clear();
  pendingEntry = null;
  runningRoomVotes.clear();
  endedRoomVotes.clear();
  restored = false;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing kept.
  }
}
