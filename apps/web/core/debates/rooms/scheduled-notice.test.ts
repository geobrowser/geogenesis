import { describe, expect, it } from 'vitest';

import { requestIdFromTarget } from '~/core/availability/availability-deep-link';

import { GeoChatRequestError, type ScheduledDebateRequest } from '../api';
import { SCHEDULED_NOTICE_COPY } from './room-copy';
import { requestById } from './room-opponent';
import { startOffset } from './room-time';
import { NOTICE_NOTE_MAX, noticeNote, noticeRequestState, toCantMakeIt, toRunningLate } from './scheduled-notice';
import { cancelFailureMessage, noticeFailureMessage } from './scheduling-refusals';

const DASHED = '6676b145-0970-4c1c-bfbc-7497d9721b39';

function request(overrides: Partial<ScheduledDebateRequest> = {}): ScheduledDebateRequest {
  return {
    request_id: DASHED.replace(/-/g, ''),
    status: 'accepted',
    scheduled_start_at: '2026-10-21T17:00:00.000Z',
    scheduled_end_at: '2026-10-21T17:30:00.000Z',
    invited_by_user_id: 'maya',
    created_by_admin: false,
    proposed_by_user_id: 'maya',
    reschedule_count: 0,
    room_id: 'room-1',
    participants: [],
    viewer_must_answer: false,
    ...overrides,
  };
}

describe('the links geo-chat puts in emails', () => {
  // geo-chat's `running_late_path` / `cant_make_it_path` must build exactly these.
  it('lands on Explore with the request, never on the room', () => {
    expect(toRunningLate(DASHED)).toBe(`/explore?modal=running-late&modalTarget=${DASHED}`);
    expect(toCantMakeIt(DASHED)).toBe(`/explore?modal=cant-make-it&modalTarget=${DASHED}`);
  });

  it('takes a request id dashed or not, and nothing else', () => {
    expect(requestIdFromTarget(DASHED)).toBe(DASHED);
    expect(requestIdFromTarget(DASHED.replace(/-/g, ''))).toBe(DASHED.replace(/-/g, ''));
    expect(requestIdFromTarget('requests')).toBeNull();
    expect(requestIdFromTarget(null)).toBeNull();
  });
});

describe('noticeNote', () => {
  it('sends nothing for a blank note', () => {
    expect(noticeNote('   \n ')).toBeUndefined();
  });

  it('trims, and never sends more than geo-chat takes', () => {
    expect(noticeNote('  On my way  ')).toBe('On my way');
    expect(noticeNote('x'.repeat(NOTICE_NOTE_MAX + 20))).toHaveLength(NOTICE_NOTE_MAX);
  });
});

describe('noticeRequestState', () => {
  it('acts only on an agreed debate with a room', () => {
    expect(noticeRequestState(request())).toBe('active');
    expect(noticeRequestState(request({ room_id: null }))).toBe('over');
    expect(noticeRequestState(request({ status: 'pending', room_id: null }))).toBe('moved');
    expect(noticeRequestState(request({ status: 'cancelled' }))).toBe('over');
    expect(noticeRequestState(undefined)).toBe('missing');
  });

  it('finds the request a dashed link names in a dashless list', () => {
    expect(requestById([request()], DASHED)?.request_id).toBe(DASHED.replace(/-/g, ''));
    expect(requestById([request()], null)).toBeUndefined();
  });
});

describe('the decide heading', () => {
  const heading = (untilStartMs: number) => SCHEDULED_NOTICE_COPY.decide.heading('Maya', startOffset(untilStartMs));

  // The same minutes the join prompt counts, so the two never disagree about one moment.
  it('says how long ago it started, or how soon it starts', () => {
    expect(heading(-3 * 60_000)).toBe('Your debate with Maya started 3 minutes ago');
    expect(heading(-60_000)).toBe('Your debate with Maya started 1 minute ago');
    expect(heading(5 * 60_000)).toBe('Your debate with Maya starts in 5 minutes');
    expect(heading(-10_000)).toBe('Your debate with Maya is starting now');
    expect(heading(Number.NaN)).toBe('Your debate with Maya');
  });
});

describe('noticeFailureMessage', () => {
  const refusal = (code: string) => new GeoChatRequestError('raw', code, 409);

  it('says geo-chat’s refusals plainly', () => {
    expect(noticeFailureMessage(refusal('already_joined'), 'late')).toMatch(/already in the room/);
    expect(noticeFailureMessage(refusal('request_not_active'), 'late')).toBe('This debate is no longer on.');
    expect(noticeFailureMessage(refusal('running_late_limit'), 'late')).toMatch(/three times/);
    expect(noticeFailureMessage(refusal('too_early'), 'late')).toMatch(/once the room opens/);
    // A cancel on a room already closed, from the Requests tab too.
    expect(cancelFailureMessage(refusal('request_not_active'))).toBe('This debate is no longer on.');
    // Can't make it is a cancel, so it says what the Requests tab's Cancel says.
    expect(noticeFailureMessage(refusal('request_not_cancellable'), 'cant')).toBe(
      'This has already been answered, cancelled or expired.'
    );
    expect(noticeFailureMessage(refusal('debate_already_started'), 'cant')).toMatch(/already started/);
  });

  it('keeps any other message', () => {
    expect(noticeFailureMessage(new Error('Network down'), 'late')).toBe('Network down');
  });
});
