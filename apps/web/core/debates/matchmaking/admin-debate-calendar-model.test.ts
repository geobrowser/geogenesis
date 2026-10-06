import { describe, expect, it } from 'vitest';

import type { ScheduledDebateRequest } from '../api';
import { adminDebates, adminDebatesByCell, matchState, needsAttention } from './admin-debate-calendar-model';
import { weekDays, weekStart } from './debate-calendar-model';

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

describe('matchState', () => {
  it('tells one debater waiting apart from nobody having answered', () => {
    expect(matchState(request({}))).toBe('waiting');
    expect(
      matchState(
        request({
          participants: [
            { user_id: 'a', accepted: null },
            { user_id: 'b', accepted: null },
          ],
        })
      )
    ).toBe('unanswered');
  });

  it('reads accepted as confirmed and every closed status as off', () => {
    expect(matchState(request({ status: 'accepted' }))).toBe('confirmed');
    for (const status of ['declined', 'expired', 'cancelled', 'superseded'] as const) {
      expect(matchState(request({ status }))).toBe('off');
    }
  });
});

describe('adminDebates', () => {
  it('says who sent and who received, and marks an admin match as neither', () => {
    const [sent] = adminDebates([request({})]);
    expect(sent.debaters.map(debater => [debater.role, debater.answer])).toEqual([
      ['sent', 'accepted'],
      ['received', 'pending'],
    ]);

    const [arranged] = adminDebates([
      request({
        invited_by_user_id: null,
        created_by_admin: true,
        outside_availability: true,
        participants: [
          { user_id: 'a', accepted: null },
          { user_id: 'b', accepted: false },
        ],
        status: 'declined',
      }),
    ]);
    expect(arranged.debaters.map(debater => [debater.role, debater.answer])).toEqual([
      ['admin', 'no_answer'],
      ['admin', 'declined'],
    ]);
    expect(arranged.outsideAvailability).toBe(true);
    expect(needsAttention(arranged)).toBe(false);
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

describe('adminDebatesByCell', () => {
  it('buckets by the hour a debate starts, leaving out other weeks', () => {
    const days = weekDays(weekStart(new Date(2026, 9, 7, 10), 0));
    const debates = adminDebates([
      request({ request_id: 'thu' }),
      request({ request_id: 'next-week', scheduled_start_at: new Date(2026, 9, 15, 15).toISOString() }),
    ]);
    const byCell = adminDebatesByCell(debates, days);
    expect([...byCell.values()].flat().map(debate => debate.requestId)).toEqual(['thu']);
  });
});
