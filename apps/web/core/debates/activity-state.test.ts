import { describe, expect, it } from 'vitest';

import { activeDebate, hasActiveDebateFlow, recordingCancelledDebateId } from './activity-state';
import type { Debate, DebateActivity, DebateMatch } from './api';

const debate = (status: Debate['status']) => ({ id: 'debate-1', status }) as Debate;
const cancelledRecording = (status: Debate['status']) =>
  ({ id: 'debate-1', status, recording_cancelled_at: '2026-08-11T12:00:00.000Z' }) as Debate;
const activity = (overrides: Partial<DebateActivity>) => overrides as DebateActivity;

describe('activity state', () => {
  it.each(['ready', 'connecting', 'preflight', 'in_progress', 'thanking'] as const)(
    'counts a %s debate as one the viewer is in',
    status => {
      expect(activeDebate(activity({ debate: debate(status) }))).not.toBeNull();
    }
  );

  // The bug this exists to stop: geo-chat keeps reporting the last debate, so reading the field
  // raw left the viewer permanently "in a debate" with every Debate button dead.
  it.each(['complete', 'cancelled'] as const)('does not count a %s debate', status => {
    expect(activeDebate(activity({ debate: debate(status) }))).toBeNull();
    expect(hasActiveDebateFlow(activity({ debate: debate(status) }))).toBe(false);
  });

  // Cancelling the upload ends the debate for both sides before its status catches up. Counting it
  // left the pair mid-flow with every Debate control dead and no way to start anything new.
  it('does not count a debate whose recording was cancelled', () => {
    const activityWithCancelledRecording = activity({ debate: cancelledRecording('thanking') });

    expect(activeDebate(activityWithCancelledRecording)).toBeNull();
    expect(hasActiveDebateFlow(activityWithCancelledRecording)).toBe(false);
  });

  it('names the debate whose recording was cancelled so callers refuse to route into it', () => {
    expect(recordingCancelledDebateId(activity({ debate: cancelledRecording('thanking') }))).toBe('debate-1');
    expect(recordingCancelledDebateId(activity({ debate: debate('thanking') }))).toBeNull();
    expect(recordingCancelledDebateId(activity({ debate: null }))).toBeNull();
    expect(recordingCancelledDebateId(null)).toBeNull();
  });

  it('treats a rematch session as an active flow', () => {
    expect(hasActiveDebateFlow(activity({ rematch: { id: 'rematch-1' } as DebateActivity['rematch'] }))).toBe(true);
  });

  // GEO-2514 deleted auto-pairing, so the server never populates this again. Reading it would only
  // resurrect the permanent "in a debate" latch from a match left over before the cutover.
  it('ignores a reported match entirely', () => {
    const stale = activity({ debate: null, match: { id: 'match-1', status: 'pending' } as DebateMatch });

    expect(hasActiveDebateFlow(stale)).toBe(false);
  });

  it('reads missing activity as free', () => {
    expect(hasActiveDebateFlow(null)).toBe(false);
    expect(hasActiveDebateFlow(undefined)).toBe(false);
    expect(hasActiveDebateFlow(activity({ debate: null }))).toBe(false);
  });
});
