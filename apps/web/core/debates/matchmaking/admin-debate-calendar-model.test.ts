import { describe, expect, it } from 'vitest';

import type { ScheduledDebateRequest } from '../api';
import {
  adminDebates,
  adminDebatesByCell,
  blockLabel,
  countByState,
  matchSentence,
  matchState,
  showsOffHours,
  zoneCity,
} from './admin-debate-calendar-model';
import { weekDays, weekStart } from './debate-calendar-model';

const NAMES: Record<string, string> = { a: 'Ana', b: 'Raj' };
const firstNameOf = (userId: string) => NAMES[userId] ?? 'Someone';

function request(over: Partial<ScheduledDebateRequest>): ScheduledDebateRequest {
  return {
    request_id: 'req',
    status: 'pending',
    scheduled_start_at: new Date(2026, 9, 8, 15).toISOString(),
    scheduled_end_at: new Date(2026, 9, 8, 15, 30).toISOString(),
    invited_by_user_id: 'a',
    created_by_admin: false,
    proposed_by_user_id: 'a',
    reschedule_count: 0,
    room_id: null,
    participants: [
      { user_id: 'a', accepted: true },
      { user_id: 'b', accepted: null },
    ],
    viewer_must_answer: false,
    ...over,
  };
}

const adminMatch = (over: Partial<ScheduledDebateRequest> = {}) =>
  request({
    invited_by_user_id: null,
    proposed_by_user_id: null,
    created_by_admin: true,
    participants: [
      { user_id: 'a', accepted: null },
      { user_id: 'b', accepted: null },
    ],
    ...over,
  });

describe('matchState', () => {
  it('tells one debater waiting apart from nobody having replied', () => {
    expect(matchState(request({}))).toBe('waiting');
    expect(matchState(adminMatch())).toBe('noreply');
  });

  it('keeps a decline apart from the ways a match closes without one', () => {
    expect(matchState(request({ status: 'accepted' }))).toBe('confirmed');
    expect(matchState(request({ status: 'declined' }))).toBe('declined');
    for (const status of ['expired', 'cancelled', 'superseded'] as const) {
      expect(matchState(request({ status }))).toBe('closed');
    }
  });
});

describe('blockLabel and matchSentence', () => {
  it('names who a waiting match is waiting on', () => {
    const [debate] = adminDebates([request({})]);
    expect(blockLabel(debate, firstNameOf)).toBe('Waiting on Raj');
    expect(matchSentence(debate, firstNameOf)).toBe('Ana sent the invite. Waiting on Raj to reply.');
  });

  it('labels each way a match closes on its own', () => {
    const labels = (['cancelled', 'expired', 'superseded'] as const).map(status =>
      blockLabel(adminDebates([request({ status })])[0], firstNameOf)
    );
    expect(labels).toEqual(['Cancelled', 'Expired', 'Slot taken']);
  });

  it('says who declined, and that an admin arranged a match', () => {
    const [declined] = adminDebates([
      request({
        status: 'declined',
        participants: [
          { user_id: 'a', accepted: true },
          { user_id: 'b', accepted: false },
        ],
      }),
    ]);
    expect(matchSentence(declined, firstNameOf)).toBe('Raj declined. This debate won’t happen.');
    expect(matchSentence(adminDebates([adminMatch()])[0], firstNameOf)).toBe(
      'An admin arranged this match. Neither debater has replied yet.'
    );
  });
});

describe('adminDebates', () => {
  it('gives the sender "Sent invite" rather than a second "Accepted"', () => {
    const [sent] = adminDebates([request({})]);
    expect(sent.debaters.map(debater => [debater.role, debater.answer])).toEqual([
      ['sent', 'sent'],
      ['received', 'pending'],
    ]);
  });

  it('marks an admin match as neither sent nor received, and an unanswered closed one as no reply', () => {
    const [arranged] = adminDebates([
      adminMatch({
        status: 'declined',
        participants: [
          { user_id: 'a', accepted: null },
          { user_id: 'b', accepted: false },
        ],
      }),
    ]);
    expect(arranged.debaters.map(debater => [debater.role, debater.answer])).toEqual([
      ['admin', 'no_answer'],
      ['admin', 'declined'],
    ]);
  });

  it('finds the sender when geo-chat writes the two ids in different shapes', () => {
    const [debate] = adminDebates([
      request({
        invited_by_user_id: '019fedae-72b6-7ab2-927a-df044d57c511',
        participants: [
          { user_id: '019fedae72b67ab2927adf044d57c511', accepted: true },
          { user_id: '019fedae72b67ab2927adf044d57c512', accepted: null },
        ],
      }),
    ]);
    expect(debate.debaters.map(debater => debater.role)).toEqual(['sent', 'received']);
  });

  it('drops unreadable times and orders by start', () => {
    const debates = adminDebates([
      request({ request_id: 'late', scheduled_start_at: new Date(2026, 9, 9, 9).toISOString() }),
      request({ request_id: 'broken', scheduled_start_at: 'not a time' }),
      request({ request_id: 'early' }),
    ]);
    expect(debates.map(debate => debate.requestId)).toEqual(['early', 'late']);
  });
});

describe('showsOffHours', () => {
  it('tags only open matches booked outside availability', () => {
    expect(showsOffHours(adminDebates([adminMatch({ outside_availability: true })])[0])).toBe(true);
    expect(showsOffHours(adminDebates([adminMatch({ outside_availability: true, status: 'accepted' })])[0])).toBe(
      false
    );
    expect(showsOffHours(adminDebates([adminMatch()])[0])).toBe(false);
  });
});

describe('countByState and adminDebatesByCell', () => {
  it('counts each state and buckets by the hour a debate starts, leaving out other weeks', () => {
    const days = weekDays(weekStart(new Date(2026, 9, 7, 10), 0));
    const debates = adminDebates([
      request({ request_id: 'thu' }),
      request({ request_id: 'done', status: 'accepted' }),
      request({ request_id: 'next-week', scheduled_start_at: new Date(2026, 9, 15, 15).toISOString() }),
    ]);
    expect(countByState(debates)).toEqual({ confirmed: 1, waiting: 2, noreply: 0, declined: 0, closed: 0 });
    expect(
      [...adminDebatesByCell(debates, days).values()]
        .flat()
        .map(debate => debate.requestId)
        .sort()
    ).toEqual(['done', 'thu']);
  });
});

describe('zoneCity', () => {
  it('says a zone the way people do', () => {
    expect(zoneCity('America/New_York')).toBe('New York');
    expect(zoneCity('Europe/Madrid')).toBe('Madrid');
  });
});
