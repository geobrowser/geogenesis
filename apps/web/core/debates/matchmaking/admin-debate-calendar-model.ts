import { normId } from '~/core/utils/norm-id';

import type { ScheduledDebateRequest, ScheduledDebateStatus } from '../api';
import { cellKey, cellOf } from './debate-calendar-model';

/**
 * One debater's own answer, independent of the other's. `sent` is the debater who started the
 * match: sending counts as accepting, and saying "Accepted" next to "Sent the invite" read as two
 * answers where there was one.
 */
export type DebaterAnswer = 'sent' | 'accepted' | 'declined' | 'pending' | 'no_answer';

/** How a debater came to be in the match. */
export type DebaterRole = 'sent' | 'received' | 'admin';

/**
 * A match's state as the admin calendar groups it (GEO-2943): one look and one legend entry each.
 *
 * `waiting` and `noreply` are kept apart on purpose, the ticket's first open question. One debater
 * committed and waiting on the other is the state an admin most needs to act on; nobody having
 * answered an admin match is usually just early. `closed` gathers the three ways a match ends
 * without anyone saying no (cancelled, expired, slot taken); each keeps its own label.
 */
export type MatchState = 'confirmed' | 'waiting' | 'noreply' | 'declined' | 'closed';

export const MATCH_STATES: MatchState[] = ['confirmed', 'waiting', 'noreply', 'declined', 'closed'];

/** The legend's names. A block says more: whose reply it waits on, or how it closed. */
export const MATCH_STATE_LABELS: Record<MatchState, string> = {
  confirmed: 'Confirmed',
  waiting: 'Waiting',
  noreply: 'No replies',
  declined: 'Declined',
  closed: 'Closed',
};

/** Shown until asked for: what is closed needs nothing from an admin. */
export const DEFAULT_SHOWN_STATES: ReadonlySet<MatchState> = new Set(['confirmed', 'waiting', 'noreply', 'declined']);

const CLOSED_LABELS: Partial<Record<ScheduledDebateStatus, string>> = {
  cancelled: 'Cancelled',
  expired: 'Expired',
  // Auto-closed because a debater accepted something overlapping; nobody turned anyone down.
  superseded: 'Slot taken',
};

export const ANSWER_LABELS: Record<DebaterAnswer, string> = {
  sent: 'Sent invite',
  accepted: 'Accepted',
  declined: 'Declined',
  pending: 'No reply yet',
  no_answer: 'No reply',
};

export const ROLE_LABELS: Record<DebaterRole, string> = {
  sent: 'Sent the invite',
  received: 'Was invited',
  admin: 'Matched by an admin',
};

export type AdminDebater = {
  userId: string;
  answer: DebaterAnswer;
  role: DebaterRole;
};

export type AdminDebate = {
  requestId: string;
  start: number;
  end: number;
  status: ScheduledDebateStatus;
  state: MatchState;
  debaters: AdminDebater[];
  /** The debater a `waiting` match is waiting on; null in every other state. */
  waitingOnUserId: string | null;
  createdByAdmin: boolean;
  outsideAvailability: boolean;
  rescheduleCount: number;
};

export function matchState(request: Pick<ScheduledDebateRequest, 'status' | 'participants'>): MatchState {
  if (request.status === 'accepted') return 'confirmed';
  if (request.status === 'declined') return 'declined';
  if (request.status !== 'pending') return 'closed';
  // The proposer counts as having accepted, so a debater-sent request is always waiting on one.
  return request.participants.some(participant => participant.accepted === true) ? 'waiting' : 'noreply';
}

function roleOf(userId: string, request: ScheduledDebateRequest): DebaterRole {
  // `invited_by_user_id` survives reschedules, so it still says who started this after the time moved.
  if (!request.invited_by_user_id) return 'admin';
  // Compared normalised: geo-chat writes participant ids without dashes and `invited_by_user_id`
  // with them, so a plain comparison labelled every debater as having received the invite.
  return normId(request.invited_by_user_id) === normId(userId) ? 'sent' : 'received';
}

function answerOf(accepted: boolean | null, role: DebaterRole, status: ScheduledDebateStatus): DebaterAnswer {
  if (role === 'sent') return 'sent';
  if (accepted === true) return 'accepted';
  if (accepted === false) return 'declined';
  return status === 'pending' ? 'pending' : 'no_answer';
}

/** Every request with a readable time, as the calendar draws it, earliest first. */
export function adminDebates(requests: ScheduledDebateRequest[] | undefined): AdminDebate[] {
  const debates: AdminDebate[] = [];
  for (const request of requests ?? []) {
    const start = Date.parse(request.scheduled_start_at);
    const end = Date.parse(request.scheduled_end_at);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    const state = matchState(request);
    const debaters = request.participants.map(participant => {
      const role = roleOf(participant.user_id, request);
      return { userId: participant.user_id, role, answer: answerOf(participant.accepted, role, request.status) };
    });
    debates.push({
      requestId: request.request_id,
      start,
      end,
      status: request.status,
      state,
      debaters,
      waitingOnUserId:
        state === 'waiting'
          ? (request.participants.find(participant => participant.accepted !== true)?.user_id ?? null)
          : null,
      createdByAdmin: request.created_by_admin,
      outsideAvailability: request.outside_availability ?? false,
      rescheduleCount: request.reschedule_count,
    });
  }
  return debates.sort((left, right) => left.start - right.start || left.requestId.localeCompare(right.requestId));
}

/** A first name for a debater, or a stand-in while the graph has not named them yet. */
export type FirstNameOf = (userId: string) => string;

/** What a block says about its state: whose reply it waits on, or exactly how it closed. */
export function blockLabel(debate: AdminDebate, firstNameOf: FirstNameOf): string {
  if (debate.state === 'waiting' && debate.waitingOnUserId) return `Waiting on ${firstNameOf(debate.waitingOnUserId)}`;
  if (debate.state === 'closed') return CLOSED_LABELS[debate.status] ?? MATCH_STATE_LABELS.closed;
  return MATCH_STATE_LABELS[debate.state];
}

/** The card's one-sentence account of the match, in the words an admin would use. */
export function matchSentence(debate: AdminDebate, firstNameOf: FirstNameOf): string {
  const sender = debate.debaters.find(debater => debater.role === 'sent');
  const origin = sender ? `${firstNameOf(sender.userId)} sent the invite.` : 'An admin arranged this match.';
  switch (debate.state) {
    case 'confirmed':
      return `${origin} Both accepted.`;
    case 'waiting':
      return `${origin} Waiting on ${debate.waitingOnUserId ? firstNameOf(debate.waitingOnUserId) : 'a reply'} to reply.`;
    case 'noreply':
      return `${origin} Neither debater has replied yet.`;
    case 'declined': {
      const decliner = debate.debaters.find(debater => debater.answer === 'declined');
      return `${decliner ? firstNameOf(decliner.userId) : 'A debater'} declined. This debate won’t happen.`;
    }
    case 'closed':
      if (debate.status === 'cancelled') return 'Cancelled after it was set up. This debate won’t happen.';
      if (debate.status === 'expired') return 'Nobody replied before the start time, so it expired.';
      return 'A debater accepted another debate at this time, so this one was closed.';
  }
}

/**
 * Whether the block carries the off-hours tag. Only while a match is open: a time outside someone's
 * availability predicts a decline, which means nothing once it is confirmed or closed.
 */
export function showsOffHours(debate: AdminDebate) {
  return debate.outsideAvailability && (debate.state === 'waiting' || debate.state === 'noreply');
}

/** How many of `debates` are in each state, for the legend. */
export function countByState(debates: AdminDebate[]): Record<MatchState, number> {
  const counts: Record<MatchState, number> = { confirmed: 0, waiting: 0, noreply: 0, declined: 0, closed: 0 };
  for (const debate of debates) counts[debate.state] += 1;
  return counts;
}

/** The week's debates by the hour they start in; debates outside the week are left out. */
export function adminDebatesByCell(debates: AdminDebate[], days: Date[]): Map<string, AdminDebate[]> {
  const byCell = new Map<string, AdminDebate[]>();
  for (const debate of debates) {
    const cell = cellOf(debate.start, days);
    if (!cell) continue;
    const key = cellKey(cell.day, cell.hour);
    byCell.set(key, [...(byCell.get(key) ?? []), debate]);
  }
  return byCell;
}

/** `Madrid` from `Europe/Madrid`, `New York` from `America/New_York`: a zone as people say it. */
export function zoneCity(timezone: string): string {
  const city = timezone.split('/').at(-1) ?? timezone;
  return city.replace(/_/g, ' ');
}

/** `7:00 PM`, in `timezone`. Falls back to the viewer's zone for a zone the browser cannot read. */
export function timeIn(at: number, timezone: string | undefined): string {
  try {
    return new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: timezone });
  } catch {
    return new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
}

/** ` (next day)` or ` (day before)` when `at` falls on another date in `timezone` than for the viewer. */
export function dayShift(at: number, timezone: string | undefined): string {
  if (!timezone) return '';
  try {
    const theirs = new Date(at).toLocaleDateString('en-CA', { timeZone: timezone });
    const ours = new Date(at).toLocaleDateString('en-CA');
    if (theirs === ours) return '';
    return theirs > ours ? ' (next day)' : ' (day before)';
  } catch {
    return '';
  }
}
