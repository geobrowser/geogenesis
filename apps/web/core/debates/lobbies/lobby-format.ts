import { type DebateLobbyMember, type DebateLobbyPerson, type DebateLobbyRole, GeoChatRequestError } from '../api';

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

/** Hosts, then speakers, then listeners; longest-present first within each, as the server sends. */
export function rosterOrder(members: DebateLobbyMember[]) {
  return members
    .map((member, index) => ({ member, index }))
    .sort((a, b) => ROLE_ORDER[a.member.role] - ROLE_ORDER[b.member.role] || a.index - b.index)
    .map(({ member }) => member);
}

/** Present host ids, sorted, for spotting a handoff between two views. */
export function hostIds(members: DebateLobbyMember[]) {
  return members
    .filter(member => member.role === 'host')
    .map(member => member.user_id)
    .sort();
}

/**
 * The host who took over, when the present hosts changed and none of the earlier ones remain.
 * `null` on the first view, or when an earlier host is still present.
 */
export function newHostAfterHandoff(previous: DebateLobbyMember[] | null, next: DebateLobbyMember[]) {
  if (!previous) return null;
  const before = hostIds(previous);
  const after = hostIds(next);
  if (before.length === 0 || after.length === 0) return null;
  if (after.some(id => before.includes(id))) return null;
  return next.find(member => member.user_id === after[0]) ?? null;
}

/** The join was refused because the viewer is present in another open lobby. */
export function isAlreadyInAnotherLobby(error: unknown): error is GeoChatRequestError {
  return error instanceof GeoChatRequestError && error.status === 409 && error.code === 'already_in_another_lobby';
}

/** The other lobby's id, read from the 409 message ("you are already in lobby <id>; …"). */
export function otherLobbyIdFrom(error: GeoChatRequestError) {
  return /lobby ([0-9a-f]{32})\b/i.exec(error.message)?.[1]?.toLowerCase() ?? null;
}
