import {
  type DebateLobbyMember,
  type DebateLobbyPerson,
  type DebateLobbyRole,
  type DebateLobbyView,
  GeoChatRequestError,
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

/** "Opens Tue 17:50 · starts Tue 18:00", for the lobby page before the door opens. */
export function notYetOpenLabel(lobby: { starts_at: string; opens_at: string }, now: number = Date.now()) {
  const opens = lobbyTimeLabel(lobby.opens_at, now);
  const starts = lobbyTimeLabel(lobby.starts_at, now);
  if (!opens || !starts) return 'Opens soon';
  return `Opens ${opens} · starts ${starts}`;
}

export function hereLabel(headcount: number) {
  return `${headcount} here`;
}

export function remindedLabel(count: number) {
  return `${count} reminded`;
}

export const ROLE_LABEL: Record<DebateLobbyRole, string> = {
  host: 'Host',
  speaker: 'Speaker',
  listener: 'Listener',
  banned: 'Banned',
};

const ROLE_ORDER: Record<DebateLobbyRole, number> = { host: 0, speaker: 1, listener: 2, banned: 3 };

/** Hosting now: a host, or the acting host while no host is present. */
export function isHosting(member: Pick<DebateLobbyMember, 'role' | 'acting_host'>) {
  return member.role === 'host' || member.acting_host;
}

/** Hosting first, then speakers, then listeners; server order (longest-present) within each. */
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

/** The join was refused because the viewer is present in another open lobby. */
export function isAlreadyInAnotherLobby(error: unknown): error is GeoChatRequestError {
  return error instanceof GeoChatRequestError && error.status === 409 && error.code === 'already_in_another_lobby';
}

/** The other lobby's id, from the 409's `details.current_lobby_id`. */
export function otherLobbyIdFrom(error: GeoChatRequestError) {
  const id = error.details?.current_lobby_id;
  return typeof id === 'string' && id ? dashlessId(id) : null;
}

/** What to tell someone geo-chat refused, by its error code; `fallback` for anything else. */
export function lobbyErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof GeoChatRequestError)) return fallback;
  if (error.status === 429) return 'That was a lot of tries at once. Wait a moment and try again.';
  switch (error.code) {
    case 'lobby_limit_reached': {
      const limit = error.details?.limit;
      return typeof limit === 'number'
        ? `You already have ${limit} lobbies open or scheduled. End one to open another.`
        : 'You have too many lobbies open or scheduled. End one to open another.';
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
      return 'You stepped out. Go back to the room to use voice.';
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
    default:
      return fallback;
  }
}
