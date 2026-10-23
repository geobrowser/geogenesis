import {
  type DebateLobbyClaims,
  type DebateLobbyMember,
  type DebateLobbyMemberAction,
  type DebateLobbyModerationAction,
  type DebateLobbyModerationEntry,
  type DebateLobbyPair,
  type DebateLobbyPerson,
  type DebateLobbyRole,
  type DebateLobbySummary,
  type DebateLobbyView,
  GeoChatRequestError,
  LOBBY_CLAIM_LISTS_MAX,
  dashlessId,
} from '../api';

/** geo-chat's limit, in characters (code points, not UTF-16 units). */
export const NAME_MAX_CHARS = 120;
/** geo-chat schedules at most this far ahead. */
export const MAX_SCHEDULE_AHEAD_DAYS = 30;

/** Stands in for a person the graph has no name for yet. */
export const UNNAMED_PERSON = 'Someone';

export function personName(person: Pick<DebateLobbyPerson, 'display_name'>) {
  return person.display_name?.trim() || UNNAMED_PERSON;
}

/** "Adam", "Adam and Priya", "Adam, Priya and 2 more". `null` with no hosts. */
export function hostsLabel(hosts: Pick<DebateLobbyPerson, 'display_name'>[]) {
  const names = hosts.map(personName);
  if (names.length === 0) return null;
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

/** "18:00" today, "Tue 18:00" within a week, "Oct 14, 18:00" beyond. Local time. */
export function lobbyTimeLabel(iso: string, now: number = Date.now()) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;

  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const today = new Date(now);
  if (at.toDateString() === today.toDateString()) return time;
  const days = (at.getTime() - now) / 86_400_000;
  if (days > -1 && days < 6) return `${at.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
  return `${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}

/**
 * The time line for a lobby that has not opened: "Tue 18:00 · opens 17:50". `null` once open or for
 * an instant lobby, which has nothing to wait for.
 */
export function lobbyScheduleLabel(
  lobby: { scheduled: boolean; starts_at: string; opens_at: string; open: boolean },
  now: number = Date.now()
) {
  if (lobby.open || !lobby.scheduled) return null;
  const starts = lobbyTimeLabel(lobby.starts_at, now);
  const opensAt = new Date(lobby.opens_at);
  if (!starts || Number.isNaN(opensAt.getTime())) return starts;
  const opens = opensAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${starts} · opens ${opens}`;
}

/** "Tue 6 Oct, 18:00": the date block on the page before the door opens. Local time. */
export function lobbyDateLabel(iso: string) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const date = at.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${date}, ${at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

/** "in 20 min" within the hour, else "today", "tomorrow" or "in 2 days" by local calendar day; "soon" once due. */
export function untilLabel(iso: string, now: number) {
  const at = Date.parse(iso);
  if (Number.isNaN(at) || at <= now) return 'soon';
  if (at - now < 3_600_000) return `in ${Math.ceil((at - now) / 60_000)} min`;
  const days = localDaysFrom(now, at);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

function startOfLocalDay(ms: number) {
  const day = new Date(ms);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

/** Calendar days from `from` to `to` in local time: 0 the same day, 1 the next, -1 the one before. */
export function localDaysFrom(from: number, to: number) {
  // Rounded: a daylight saving change makes a calendar day 23 or 25 hours.
  return Math.round((startOfLocalDay(to) - startOfLocalDay(from)) / 86_400_000);
}

/** "Opens at 17:50 · in 2 days", for the lobby page before the door opens. */
export function notYetOpenLabel(lobby: { opens_at: string }, now: number) {
  const opensAt = new Date(lobby.opens_at);
  if (Number.isNaN(opensAt.getTime())) return 'Opens soon';
  const opens = opensAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `Opens at ${opens} · ${untilLabel(lobby.opens_at, now)}`;
}

/** "Tue 18:00" for a lobby still to open, "open now" for one already open. */
export function nextLobbyTimeLabel(lobby: Pick<DebateLobbySummary, 'open' | 'starts_at'>, now: number = Date.now()) {
  return lobby.open ? 'open now' : lobbyTimeLabel(lobby.starts_at, now);
}

/**
 * Who a lobby counts as here: the whole roster, stepped-out members included. The lobby header and
 * the debate end card both count this way, so they never disagree.
 */
export function lobbyHeadcount(lobby: Pick<DebateLobbyView, 'members'>) {
  return lobby.members.length;
}

/** Everyone in the room: who the header counts as here, plus guests listening without an account. */
export function lobbyRoomHeadcount(lobby: Pick<DebateLobbyView, 'members' | 'guest_count'>) {
  return lobbyHeadcount(lobby) + (lobby.guest_count ?? 0);
}

export function hereLabel(headcount: number) {
  return `${headcount} here`;
}

export function hereNowLabel(count: number) {
  return `${count} here now`;
}

export function debatingLabel(count: number) {
  return `${count} debating`;
}

/** Members in a debate. People, not pairs: the lobby card's `debating_count` counts the same way. */
export function debatingCount(members: Pick<DebateLobbyMember, 'in_debate'>[]) {
  return members.filter(member => member.in_debate).length;
}

export type LobbyMemberStatus = 'in_debate' | 'looking' | 'chatting';

export const STATUS_LABEL: Record<LobbyMemberStatus, string> = {
  in_debate: 'In a debate',
  looking: 'Looking to debate',
  chatting: 'Just chatting',
};

/** One word or two, for a phone's narrow tile. */
export const SHORT_STATUS_LABEL: Record<LobbyMemberStatus, string> = {
  in_debate: 'In a debate',
  looking: 'Looking',
  chatting: 'Just chatting',
};

/**
 * In a debate, else Looking to debate by the availability toggle, else Just chatting. `available`
 * stands in for the roster's flag; `null` when there is neither, from a geo-chat that predates it.
 */
export function memberStatus(
  member: Pick<DebateLobbyMember, 'in_debate' | 'available_to_debate'>,
  available: boolean | undefined = member.available_to_debate
): LobbyMemberStatus | null {
  if (member.in_debate) return 'in_debate';
  if (available === undefined) return null;
  return available ? 'looking' : 'chatting';
}

/** "Ana vs. Ben"; a pair whose partner is hidden reads as the one name. */
export function pairLabel(pair: DebateLobbyPair) {
  return pair.people.map(personName).join(' vs. ');
}

/** "round 2 of 3", "round 2" for open rounds; `null` before the first round or without progress. */
export function pairRoundLabel(progress: DebateLobbyPair['progress']) {
  if (!progress || progress.round === null) return null;
  return progress.rounds === null ? `round ${progress.round}` : `round ${progress.round} of ${progress.rounds}`;
}

/** How many claims the viewer and `userId` disagree on; `null` for none, unknown, or the viewer. */
export function disagreementCount(disagreements: DebateLobbyClaims['disagreements'], userId: string): number | null {
  const entry = disagreements?.find(row => dashlessId(row.user_id) === dashlessId(userId));
  return entry && entry.claims > 0 ? entry.claims : null;
}

/** What the pair is debating, from its first lobby member's roster row. */
export function pairSubject(pair: DebateLobbyPair, members: DebateLobbyMember[]) {
  for (const person of pair.people) {
    if (!person.in_lobby) continue;
    const member = members.find(m => sameUser(m, person));
    if (member?.in_debate_subject) return member.in_debate_subject;
  }
  return null;
}

/**
 * A lobby reminder is called an RSVP on screen, as community calls word it (GEO-3268): "RSVP" to
 * set it, "Going" once set, "6 going" for the count. geo-chat still calls it a reminder.
 */
export function rsvpLabel(going: boolean) {
  return going ? 'Going' : 'RSVP';
}

export function goingLabel(count: number) {
  return `${count} going`;
}

export const RSVP_FAILED = 'Could not update your RSVP. Try again.';

export const ROLE_LABEL: Record<DebateLobbyRole, string> = {
  host: 'Host',
  speaker: 'Speaker',
  listener: 'Listener',
};

const ROLE_ORDER: Record<DebateLobbyRole, number> = { host: 0, speaker: 1, listener: 2 };

/** Hosting now: a host, or the acting host while no host is connected. */
export function isHosting(member: Pick<DebateLobbyMember, 'role' | 'acting_host'>) {
  return member.role === 'host' || member.acting_host;
}

/** Hosting first, then speakers, then listeners; server order (longest on the roster) within each. */
export function rosterOrder(members: DebateLobbyMember[]) {
  const rank = (member: DebateLobbyMember) => (isHosting(member) ? 0 : ROLE_ORDER[member.role]);
  return members
    .map((member, index) => ({ member, index }))
    .sort((a, b) => rank(a.member) - rank(b.member) || a.index - b.index)
    .map(({ member }) => member);
}

/**
 * Who hosts once `hosts_changed_at` moves past `seen` (`undefined` before the first view). A
 * handoff always follows a hostless view, so the stamp is read rather than the roster.
 */
export function hostAfterChange(
  seen: string | null | undefined,
  lobby: Pick<DebateLobbyView, 'hosts_changed_at' | 'members'>
) {
  if (seen === undefined || !lobby.hosts_changed_at || lobby.hosts_changed_at === seen) return null;
  return lobby.members.find(member => member.acting_host) ?? lobby.members.find(isHosting) ?? null;
}

/**
 * The host the page last saw who is now off the roster, for "X left. Y is now hosting.". `null`
 * when they are still here (stepped out, say) or the page never saw a host.
 */
export function hostWhoLeft<T extends Pick<DebateLobbyPerson, 'user_id'>>(
  lastHosts: T[],
  lobby: Pick<DebateLobbyView, 'members'>
): T | null {
  return lastHosts.find(host => !lobby.members.some(member => sameUser(member, host))) ?? null;
}

/**
 * Nobody else is in: no other member and no guest. `guest_count` counts live guest sessions, so a
 * guest's own counts once it has started (`ownGuestSession`); without a count a guest is not alone.
 */
export function isAlone(
  lobby: Pick<DebateLobbyView, 'members' | 'guest_count'>,
  viewerId: string | null,
  guest: boolean,
  ownGuestSession = false
): boolean {
  if (guest) {
    return (
      lobby.members.length === 0 && lobby.guest_count !== undefined && lobby.guest_count <= Number(ownGuestSession)
    );
  }
  if (!viewerId || (lobby.guest_count ?? 0) > 0) return false;
  return lobby.members.every(member => dashlessId(member.user_id) === dashlessId(viewerId));
}

export function handoffLabel(
  host: Pick<DebateLobbyPerson, 'display_name'>,
  left: Pick<DebateLobbyPerson, 'display_name'> | null
) {
  return left ? `${personName(left)} left. ${personName(host)} is now hosting.` : `${personName(host)} is now hosting.`;
}

/** The join was refused because the viewer is in another open lobby. */
export function isAlreadyInAnotherLobby(error: unknown): error is GeoChatRequestError {
  return error instanceof GeoChatRequestError && error.status === 409 && error.code === 'already_in_another_lobby';
}

/** The join was refused because a host removed the viewer; only an explicit Rejoin comes back. */
export function isRemovedFromLobby(error: unknown): error is GeoChatRequestError {
  return error instanceof GeoChatRequestError && error.status === 409 && error.code === 'lobby_removed';
}

/** The other lobby's id, from the 409's `details.current_lobby_id`, or the call's (GEO-3419). */
export function otherLobbyIdFrom(error: GeoChatRequestError) {
  const id = error.details?.current_lobby_id ?? error.details?.current_call_id;
  return typeof id === 'string' && id ? dashlessId(id) : null;
}

/** What to tell someone geo-chat refused, by its error code; `fallback` for anything else. */
export function lobbyErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof GeoChatRequestError)) return fallback;
  if (error.status === 429 && error.details?.scope === 'lobby') {
    return 'Lots of people are joining this lobby right now. Try again in a moment.';
  }
  if (error.status === 429) return 'That was a lot of tries at once. Wait a moment and try again.';
  switch (error.code) {
    case 'lobby_limit_reached': {
      const limit = error.details?.limit;
      return typeof limit === 'number'
        ? `You already have ${limit} lobbies open or scheduled. End one to open another.`
        : 'You have too many lobbies open or scheduled. End one to open another.';
    }
    case 'lobby_claim_list_limit': {
      const limit = error.details?.limit;
      return `This lobby already has ${typeof limit === 'number' ? limit : LOBBY_CLAIM_LISTS_MAX} claim lists. Remove one to add another.`;
    }
    case 'lobby_host_required':
      return 'Only a host can do that.';
    case 'lobby_connection_in_use':
      return 'This tab is signed in as someone else. Reload the page and try again.';
    case 'lobby_name_required':
      return 'Name the lobby.';
    case 'lobby_name_too_long':
      return `Keep the name to ${NAME_MAX_CHARS} characters.`;
    case 'lobby_name_invalid':
      return 'Remove the special formatting characters from the name.';
    case 'lobby_start_in_past':
      return 'Pick a time in the future.';
    case 'lobby_start_too_far':
      return `Pick a time within ${MAX_SCHEDULE_AHEAD_DAYS} days.`;
    case 'lobby_already_open':
      return 'This lobby is open now. Join it instead.';
    case 'lobby_closed':
      return 'This lobby has closed.';
    case 'lobby_banned':
      return 'You can’t join this lobby.';
    case 'lobby_not_found':
      return 'This lobby no longer exists.';
    case 'lobby_stepped_out':
      return 'You’re in a debate. Voice is back when you return to the room.';
    case 'lobby_not_present':
      return 'You’re not in the lobby right now. Join it to use voice.';
    case 'lobby_voice_full': {
      const limit = error.details?.limit;
      return typeof limit === 'number'
        ? `Voice is full in this lobby (${limit} people). You can still follow along here.`
        : 'Voice is full in this lobby. You can still follow along here.';
    }
    case 'voice_capacity_reached':
      return 'Voice is busy right now. Try again in a minute.';
    case 'voice_unavailable':
    case 'livekit_not_configured':
      return 'Voice is unavailable right now. Try again in a moment.';
    case 'lobby_member_not_found':
      return 'They aren’t in this lobby anymore.';
    case 'lobby_target_is_self':
      return 'You can’t do that to yourself.';
    case 'lobby_target_is_host':
      return 'Remove them as host first.';
    case 'lobby_target_is_space_editor':
      return 'They host because they edit this space.';
    case 'call_editor_required':
      return 'Only editors of this space can start a call.';
    case 'call_space_unsupported':
      return 'Calls aren’t available in this space.';
    case 'call_not_found':
      return 'This call no longer exists.';
    case 'lobby_creator_host':
      return 'Only the lobby’s creator can remove their host status.';
    case 'lobby_last_host':
      return 'Make someone else a host first. The lobby needs one.';
    case 'lobby_target_banned':
      return 'They’re banned from this lobby. Unban them first.';
    case 'lobby_target_not_in_voice':
      return 'Their mic isn’t on.';
    case 'lobby_not_listener':
      return 'Only listeners raise a hand.';
    case 'lobby_removed':
    case 'lobby_guest_removed':
      return 'A host removed you from this lobby.';
    case 'guest_cap_reached':
      // A cap of 0 is listening without an account turned off, not full.
      return isGuestListeningOff(error)
        ? 'Listening without an account isn’t available in this lobby. Create an account to join.'
        : 'This lobby has as many listeners without an account as it can take. Create an account to join, or try again in a minute.';
    default:
      return fallback;
  }
}

/** Guest listening is off for this lobby (`guest_cap_reached` with a cap of 0): retrying cannot help. */
export function isGuestListeningOff(error: unknown) {
  return error instanceof GeoChatRequestError && error.code === 'guest_cap_reached' && error.details?.limit === 0;
}

/** A refused moderation action. Hosts moderate from inside the lobby only. */
export function moderationErrorMessage(error: unknown, fallback = 'That didn’t work. Try again.') {
  if (error instanceof GeoChatRequestError && error.code === 'lobby_not_present') return 'Join the lobby to moderate.';
  return lobbyErrorMessage(error, fallback);
}

export const MEMBER_ACTION_LABEL: Record<DebateLobbyMemberAction, string> = {
  promote: 'Make host',
  mute: 'Mute mic',
  'move-to-listeners': 'Move to listeners',
  'move-to-speakers': 'Move to speakers',
  remove: 'Remove from lobby',
  ban: 'Ban from lobby',
  unban: 'Unban',
  'remove-host': 'Remove as host',
};

/** Host actions the viewer may take on `member`, in menu order; geo-chat enforces the same rules. */
export function memberActions(
  viewer: Pick<DebateLobbyView['viewer'], 'hosting' | 'role' | 'creator'>,
  member: Pick<DebateLobbyMember, 'role' | 'creator' | 'space_editor'>,
  isSelf: boolean
): DebateLobbyMemberAction[] {
  if (!viewer.hosting) return [];
  // A space editor hosts a call because of the space: not theirs or anyone's to change here.
  if (member.space_editor) return [];
  // The acting host is a speaker: hosting never changes their role, so who hosts is not theirs to change.
  const hostByRole = viewer.role === 'host';
  if (isSelf) return hostByRole ? ['remove-host'] : [];
  if (member.role === 'host') {
    return hostByRole && (!member.creator || viewer.creator) ? ['remove-host'] : [];
  }
  const actions: DebateLobbyMemberAction[] = [];
  if (hostByRole) actions.push('promote');
  if (member.role === 'speaker') actions.push('mute', 'move-to-listeners');
  else actions.push('move-to-speakers');
  actions.push('remove', 'ban');
  return actions;
}

/** The roster line for someone in a debate: what they are debating when geo-chat says. */
export function inDebateLabel(subject: DebateLobbyMember['in_debate_subject']) {
  if (subject?.phase === 'choosing_claim') return 'In a debate, picking a claim';
  if (subject?.phase === 'on_claim' && subject.claim_name.trim())
    return `In a debate on “${subject.claim_name.trim()}”`;
  return 'In a debate';
}

/** In the person card, where Request would be. */
export function inDebateRequestLabel(member: Pick<DebateLobbyPerson, 'display_name'>) {
  return `${personName(member)} is in a debate. You can request them when they’re back.`;
}

/** "Moved to listeners by Priya", or without a name when geo-chat has none. */
export function movedToListenersLabel(moved: NonNullable<DebateLobbyMember['moved_to_listeners']>) {
  return moved.by ? `Moved to listeners by ${personName(moved.by)}` : 'Moved to listeners';
}

/** Raised hands, oldest first. */
export function raisedHands(members: DebateLobbyMember[]) {
  return members
    .filter(member => member.hand_raised_at)
    .sort((a, b) => Date.parse(a.hand_raised_at!) - Date.parse(b.hand_raised_at!));
}

/** "20 s", "3 min", "2 h": how long ago, for a raised hand. */
export function sinceLabel(iso: string, now: number = Date.now()) {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (Number.isNaN(seconds)) return null;
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  return `${Math.floor(seconds / 3600)} h`;
}

/** What the viewer is told after a host acts on them. Kick and ban have their own screens. */
export function moderationNoticeText(action: DebateLobbyModerationAction): string | null {
  switch (action) {
    case 'mute':
      return 'A host muted you. Unmute when you’re ready.';
    case 'move_to_listeners':
      return 'A host moved you to listeners. Raise your hand to ask to speak.';
    case 'move_to_speakers':
      return 'A host moved you to speakers. Unmute when you’re ready.';
    case 'promote':
      return 'A host made you a host.';
    case 'remove_host':
      return 'A host removed your host status.';
    default:
      return null;
  }
}

/** "Adam muted Sam", "Adam moved Sam to listeners"; an automatic change reads "Sam started hosting". */
export function moderationLogLabel(entry: Pick<DebateLobbyModerationEntry, 'action' | 'actor' | 'target'>) {
  const target = entry.target ? personName(entry.target) : UNNAMED_PERSON;
  if (!entry.actor && (entry.action === 'promote' || entry.action === 'remove_host')) {
    return entry.action === 'promote' ? `${target} started hosting` : `${target} stopped hosting`;
  }
  const actor = entry.actor ? personName(entry.actor) : UNNAMED_PERSON;
  switch (entry.action) {
    case 'mute':
      return `${actor} muted ${target}`;
    case 'move_to_listeners':
      return `${actor} moved ${target} to listeners`;
    case 'move_to_speakers':
      return `${actor} moved ${target} to speakers`;
    case 'kick':
      return `${actor} removed ${target}`;
    case 'ban':
      return `${actor} banned ${target}`;
    case 'unban':
      return `${actor} unbanned ${target}`;
    case 'promote':
      return `${actor} made ${target} a host`;
    case 'remove_host':
      return entry.target && entry.actor && sameUser(entry.actor, entry.target)
        ? `${actor} stepped down as host`
        : `${actor} removed ${target} as host`;
    case 'end':
      return `${actor} ended the lobby`;
    case 'remove_guests':
      return `${actor} removed the guests without an account`;
    default:
      return actor;
  }
}

function sameUser(a: Pick<DebateLobbyPerson, 'user_id'>, b: Pick<DebateLobbyPerson, 'user_id'>) {
  return dashlessId(a.user_id) === dashlessId(b.user_id);
}
