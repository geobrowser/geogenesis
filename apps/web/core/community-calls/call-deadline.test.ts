import { describe, expect, it } from 'vitest';

import {
  BELOW_QUORUM_GRACE_MS,
  CALL_HARD_CAP_MS,
  type CallDeadlineInput,
  callDeadline,
  hardCapMs,
  scheduledCutoffMs,
} from './call-deadline';
import { LIVE_MEETING_GRACE_MINUTES } from './constants';

const MINUTE = 60 * 1000;
const START = Date.UTC(2026, 8, 23, 18, 0);
/** A one-hour call — the shape of the 09-23 call the cutoff ended at exactly 20:00:00... */
const END = START + 60 * MINUTE;
/** ...which was this instant: scheduled end plus the 30-minute grace. */
const OLD_CUTOFF = END + LIVE_MEETING_GRACE_MINUTES * MINUTE;

const base: CallDeadlineInput = {
  startMs: START,
  endMs: END,
  extensionMs: 0,
  connectedCount: 2,
  belowQuorumSinceMs: null,
};

describe('callDeadline — GEO-2584 keepalive', () => {
  it('keeps a call with two or more connected running past the old cutoff, to the 2h cap', () => {
    for (const connectedCount of [2, 3, 12]) {
      const { deadlineMs, reason } = callDeadline({ ...base, connectedCount });
      expect(deadlineMs).toBeGreaterThan(OLD_CUTOFF);
      expect(deadlineMs).toBe(START + CALL_HARD_CAP_MS);
      expect(reason).toBe('cap');
    }
  });

  it('ends a call below quorum at the scheduled cutoff, exactly as before', () => {
    const lone = callDeadline({ ...base, connectedCount: 1, belowQuorumSinceMs: START + 5 * MINUTE });
    expect(lone).toEqual({ deadlineMs: OLD_CUTOFF, reason: 'scheduled' });
  });

  it('ends a kept-alive call shortly after it falls below quorum', () => {
    const droppedAt = OLD_CUTOFF + 20 * MINUTE;
    const lone = callDeadline({ ...base, connectedCount: 1, belowQuorumSinceMs: droppedAt });
    expect(lone).toEqual({ deadlineMs: droppedAt + BELOW_QUORUM_GRACE_MS, reason: 'alone' });
    expect(lone.deadlineMs).toBeLessThan(START + CALL_HARD_CAP_MS);
  });

  it('ends at the cap regardless of how many are connected', () => {
    const cap = START + CALL_HARD_CAP_MS;
    expect(callDeadline({ ...base, connectedCount: 50 }).deadlineMs).toBe(cap);
    // Falling below quorum inside the last minute does not buy a minute past the cap.
    const lateDrop = callDeadline({ ...base, connectedCount: 1, belowQuorumSinceMs: cap - 10 * 1000 });
    expect(lateDrop).toEqual({ deadlineMs: cap, reason: 'cap' });
  });

  it('never ends earlier than the old cutoff, even for a call scheduled longer than the cap', () => {
    const longEnd = START + 3 * 60 * MINUTE;
    const long = { ...base, endMs: longEnd };
    expect(hardCapMs(long)).toBe(scheduledCutoffMs(long));
    expect(callDeadline(long).deadlineMs).toBe(longEnd + LIVE_MEETING_GRACE_MINUTES * MINUTE);
  });

  it("moves the cutoff and the cap together with an editor's extension", () => {
    const extended = { ...base, extensionMs: 45 * MINUTE };
    expect(scheduledCutoffMs(extended)).toBe(OLD_CUTOFF + 45 * MINUTE);
    expect(callDeadline(extended).deadlineMs).toBe(START + CALL_HARD_CAP_MS + 45 * MINUTE);
    expect(callDeadline({ ...extended, connectedCount: 1, belowQuorumSinceMs: START }).deadlineMs).toBe(
      OLD_CUTOFF + 45 * MINUTE
    );
  });

  it('does not count a room as alone while its quorum is intact, whatever belowQuorumSinceMs says', () => {
    expect(callDeadline({ ...base, connectedCount: 2, belowQuorumSinceMs: OLD_CUTOFF }).reason).toBe('cap');
  });
});
