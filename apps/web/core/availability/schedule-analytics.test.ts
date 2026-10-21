import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AvailabilityBlock } from './blocks';
import type { PeerSchedule } from './peer-schedule';
import { debateAvailabilityLinkOpened, debateAvailabilityViewed, debateScheduleSaved } from './schedule-analytics';

const capture = vi.hoisted(() => vi.fn());
vi.mock('~/core/analytics', () => ({ capture }));

afterEach(() => capture.mockClear());

describe('schedule analytics', () => {
  it('describes a saved week by its shape, with no times in it', () => {
    const blocks: AvailabilityBlock[] = [
      { id: 'a', kind: 'recurring', weekday: 0, start: 9 * 60, end: 12 * 60 },
      { id: 'b', kind: 'recurring', weekday: 0, start: 14 * 60, end: 15 * 60 },
      { id: 'c', kind: 'recurring', weekday: 3, start: 18 * 60, end: 19 * 60 },
      { id: 'd', kind: 'dated', date: '2026-10-01', start: 600, end: 660 },
      { id: 'e', kind: 'exception', date: '2026-10-05', start: 540, end: 720 },
    ];

    debateScheduleSaved(blocks, { surface: 'people_tab', isFirstSchedule: true });

    expect(capture).toHaveBeenCalledWith('debate_schedule_saved', {
      surface: 'people_tab',
      is_first_schedule: true,
      block_count: 5,
      recurring_block_count: 3,
      dated_block_count: 1,
      exception_block_count: 1,
      weekday_count: 2,
      weekly_minutes: 300,
    });
  });

  it('counts a cleared schedule as an empty one', () => {
    debateScheduleSaved([], { surface: 'navbar', isFirstSchedule: false });

    expect(capture).toHaveBeenCalledWith(
      'debate_schedule_saved',
      expect.objectContaining({ block_count: 0, weekday_count: 0, weekly_minutes: 0 })
    );
  });

  it('measures a week in minutes, so one long range is not outweighed by two short ones', () => {
    const schedule: PeerSchedule = {
      userId: 'them',
      viewerTimezone: 'UTC',
      peerTimezone: 'Europe/Vilnius',
      viewerHasSchedule: true,
      peerHasSchedule: true,
      theirWeekKnown: true,
      slots: [
        { start: '2026-10-01T09:00:00Z', end: '2026-10-01T12:00:00Z', viewerIsFree: true },
        { start: '2026-10-02T09:00:00Z', end: '2026-10-02T09:30:00Z', viewerIsFree: false },
      ],
    };

    debateAvailabilityViewed(schedule, { entry: 'availability_link', bookable: true });

    expect(capture).toHaveBeenCalledWith('debate_availability_viewed', {
      entry: 'availability_link',
      bookable: true,
      peer_user_id: 'them',
      peer_has_schedule: true,
      viewer_has_schedule: true,
      free_minutes: 210,
      mutual_free_minutes: 180,
    });
  });

  // GEO-3432: a reschedule names the debate it moves, so one started and abandoned can be found.
  describe('a week opened to move a debate', () => {
    const schedule: PeerSchedule = {
      userId: 'them',
      viewerTimezone: 'UTC',
      peerTimezone: 'UTC',
      viewerHasSchedule: true,
      peerHasSchedule: true,
      theirWeekKnown: true,
      slots: [],
    };

    it('sends the request id, lowercased', () => {
      debateAvailabilityViewed(schedule, {
        entry: 'reschedule_link',
        bookable: true,
        requestId: '6676B145-0970-4C1C-BFBC-7497D9721B39',
      });

      expect(capture).toHaveBeenCalledWith(
        'debate_availability_viewed',
        expect.objectContaining({ entry: 'reschedule_link', request_id: '6676b145-0970-4c1c-bfbc-7497d9721b39' })
      );
    });

    // It can arrive from a link anyone can edit.
    it.each([[null], [undefined], ['someone@example.com'], ['6676b145']])('sends no request id for %s', requestId => {
      debateAvailabilityViewed(schedule, { entry: 'reschedule_link', bookable: true, requestId });

      expect(capture.mock.calls.at(-1)?.[1]).not.toHaveProperty('request_id');
    });
  });

  // `via` is URL text anyone can edit, so analytics gets a fixed vocabulary rather than the text.
  it.each([
    ['share', 'share'],
    [null, 'none'],
    ['someone@example.com', 'other'],
  ] as const)('records a link that came via %s as %s', (via, linkSource) => {
    debateAvailabilityLinkOpened({ viewer: 'signed_out', peer: 'bookable', rescheduling: false, via });

    expect(capture).toHaveBeenCalledWith(
      'debate_availability_link_opened',
      expect.objectContaining({ link_source: linkSource })
    );
  });
});
