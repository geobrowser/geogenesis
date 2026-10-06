import type { ScheduledDebateRequest, ScheduledDebateStatus } from '../api';
import { cellKey, cellOf } from './debate-calendar-model';

/** One debater's own answer, independent of the other's. */
export type DebaterAnswer = 'accepted' | 'declined' | 'pending' | 'no_answer';

/** How a debater came to be in the match. */
export type DebaterRole = 'sent' | 'received' | 'admin';

/**
 * A match's state as the admin calendar colours it (GEO-2943).
 *
 * `waiting` and `unanswered` are kept apart on purpose — the ticket's first open question. One
 * debater committed and waiting on the other is the state an admin most needs to act on; nobody
 * having answered an admin-arranged match is usually just early.
 */
export type MatchState = 'confirmed' | 'waiting' | 'unanswered' | 'off';

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
  createdByAdmin: boolean;
  outsideAvailability: boolean;
  rescheduleCount: number;
};

export const MATCH_STATE_LABELS: Record<MatchState, string> = {
  confirmed: 'Both accepted',
  waiting: 'Waiting on one',
  unanswered: 'Nobody answered',
  off: 'Won’t happen',
};

export const STATUS_LABELS: Record<ScheduledDebateStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
  cancelled: 'Cancelled',
  // Auto-declined because the debater accepted something overlapping; nobody turned anyone down.
  superseded: 'Slot taken',
};

export const ANSWER_LABELS: Record<DebaterAnswer, string> = {
  accepted: 'Accepted',
  declined: 'Declined',
  pending: 'Pending',
  no_answer: 'No answer',
};

export const ROLE_LABELS: Record<DebaterRole, string> = {
  sent: 'Sent',
  received: 'Received',
  admin: 'Admin match',
};

export function matchState(request: Pick<ScheduledDebateRequest, 'status' | 'participants'>): MatchState {
  if (request.status === 'accepted') return 'confirmed';
  if (request.status !== 'pending') return 'off';
  // The proposer counts as having accepted, so a debater-sent request is always waiting on one.
  return request.participants.some(participant => participant.accepted === true) ? 'waiting' : 'unanswered';
}

function answerOf(accepted: boolean | null, status: ScheduledDebateStatus): DebaterAnswer {
  if (accepted === true) return 'accepted';
  if (accepted === false) return 'declined';
  return status === 'pending' ? 'pending' : 'no_answer';
}

function roleOf(userId: string, request: ScheduledDebateRequest): DebaterRole {
  // `invited_by_user_id` survives reschedules, so it still says who started this after the time moved.
  if (!request.invited_by_user_id) return 'admin';
  return request.invited_by_user_id === userId ? 'sent' : 'received';
}

/** Every request with a readable time, as the calendar draws it, earliest first. */
export function adminDebates(requests: ScheduledDebateRequest[] | undefined): AdminDebate[] {
  const debates: AdminDebate[] = [];
  for (const request of requests ?? []) {
    const start = Date.parse(request.scheduled_start_at);
    const end = Date.parse(request.scheduled_end_at);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    debates.push({
      requestId: request.request_id,
      start,
      end,
      status: request.status,
      state: matchState(request),
      debaters: request.participants.map(participant => ({
        userId: participant.user_id,
        answer: answerOf(participant.accepted, request.status),
        role: roleOf(participant.user_id, request),
      })),
      createdByAdmin: request.created_by_admin,
      outsideAvailability: request.outside_availability ?? false,
      rescheduleCount: request.reschedule_count,
    });
  }
  return debates.sort((left, right) => left.start - right.start || left.requestId.localeCompare(right.requestId));
}

/** The states that ask something of an admin. */
export function needsAttention(debate: AdminDebate) {
  return debate.state === 'waiting' || debate.state === 'unanswered';
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
