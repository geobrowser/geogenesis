import { beforeEach, describe, expect, it } from 'vitest';

import {
  didLocallyLeaveDebate,
  didLocallyLeaveRematch,
  markLocalDebateLeave,
  markLocalRematchLeave,
  unmarkLocalDebateLeave,
  unmarkLocalRematchLeave,
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

  // A failed leave/abort unmarks (hooks call this in `onError`), so a stale mark can't later suppress
  // a genuine opponent-leave on this tab.
  it('clears a debate mark on unmark', () => {
    markLocalDebateLeave('debate-unmark-a');
    expect(didLocallyLeaveDebate('debate-unmark-a')).toBe(true);

    unmarkLocalDebateLeave('debate-unmark-a');
    expect(didLocallyLeaveDebate('debate-unmark-a')).toBe(false);
  });

  it('clears a rematch mark on unmark', () => {
    markLocalRematchLeave('rematch-unmark-a');
    expect(didLocallyLeaveRematch('rematch-unmark-a')).toBe(true);

    unmarkLocalRematchLeave('rematch-unmark-a');
    expect(didLocallyLeaveRematch('rematch-unmark-a')).toBe(false);
  });

  it('unmarking one leave does not clear another', () => {
    markLocalDebateLeave('debate-keep');
    markLocalDebateLeave('debate-drop');

    unmarkLocalDebateLeave('debate-drop');

    expect(didLocallyLeaveDebate('debate-keep')).toBe(true);
    expect(didLocallyLeaveDebate('debate-drop')).toBe(false);
  });
});
