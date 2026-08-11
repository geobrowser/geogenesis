import { describe, expect, it } from 'vitest';

import { activeDebate, activeMatch, hasActiveDebateFlow } from './activity-state';
import type { Debate, DebateActivity, DebateMatch } from './api';

const debate = (status: Debate['status']) => ({ id: 'debate-1', status }) as Debate;
const match = (status: DebateMatch['status']) => ({ id: 'match-1', status }) as DebateMatch;
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

  it.each(['pending', 'accepted'] as const)('counts a %s match', status => {
    expect(activeMatch(activity({ match: match(status) }))).not.toBeNull();
  });

  it.each(['declined', 'expired'] as const)('does not count a %s match', status => {
    expect(activeMatch(activity({ match: match(status) }))).toBeNull();
    expect(hasActiveDebateFlow(activity({ match: match(status) }))).toBe(false);
  });

  it('treats a rematch session as an active flow', () => {
    expect(hasActiveDebateFlow(activity({ rematch: { id: 'rematch-1' } as DebateActivity['rematch'] }))).toBe(true);
  });

  it('reads missing activity as free', () => {
    expect(hasActiveDebateFlow(null)).toBe(false);
    expect(hasActiveDebateFlow(undefined)).toBe(false);
    expect(hasActiveDebateFlow(activity({ match: null, debate: null }))).toBe(false);
  });
});
