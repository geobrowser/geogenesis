import { beforeEach, describe, expect, it } from 'vitest';

import {
  didLocallyLeaveDebate,
  didLocallyLeaveRematch,
  markLocalDebateLeave,
  markLocalRematchLeave,
} from './local-debate-leave';

describe('local debate leave marks', () => {
  beforeEach(() => {});

  it('remembers a debate leave for this tab only', () => {
    markLocalDebateLeave('debate-left-a');
    expect(didLocallyLeaveDebate('debate-left-a')).toBe(true);
    expect(didLocallyLeaveDebate('debate-other')).toBe(false);
  });

  it('remembers a rematch leave for this tab only', () => {
    markLocalRematchLeave('rematch-left-a');
    expect(didLocallyLeaveRematch('rematch-left-a')).toBe(true);
    expect(didLocallyLeaveRematch('rematch-other')).toBe(false);
  });
});
