import { describe, expect, it } from 'vitest';

import { activeDebate, hasActiveDebateFlow } from './activity-state';
import type { Debate, DebateActivity, DebateMatch } from './api';

const debate = (status: Debate['status']) => ({ id: 'debate-1', status }) as Debate;
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
