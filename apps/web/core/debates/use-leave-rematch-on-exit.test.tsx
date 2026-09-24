import { cleanup, render, renderHook } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateRematchSession, DebateRematchStatus } from './api';
import { useLeaveRematchOnExit } from './use-leave-rematch-on-exit';

const session = (overrides: Partial<DebateRematchSession> = {}): DebateRematchSession => ({
  id: 'session-1',
  source_debate_id: 'debate-1',
  source_space_id: 'space-1',
  status: 'browsing',
  participants: [],
  decision_expires_at: '2026-09-24T17:00:00Z',
  browsing_expires_at: '2026-09-24T18:00:00Z',
  request: null,
  converted_debate_id: null,
  recently_rejected_claim_ids: [],
  created_at: '2026-09-24T17:00:00Z',
  updated_at: '2026-09-24T17:00:00Z',
  ...overrides,
});

const leave = vi.fn();

const mount = (current: DebateRematchSession | null, exiting = () => false) =>
  renderHook(
    ({ value }: { value: DebateRematchSession | null }) =>
      useLeaveRematchOnExit({ sessionId: 'session-1', session: value, leave, exiting }),
    { initialProps: { value: current } }
  );

describe('leaving a debate-again session on exit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    leave.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  // The bug: navigating anywhere but the Leave button left both people "in a debate".
  it.each<DebateRematchStatus>(['browsing', 'request_pending'])('leaves a %s session on unmount', status => {
    const { unmount } = mount(session({ status }));
    unmount();
    vi.runAllTimers();
    expect(leave).toHaveBeenCalledTimes(1);
  });

  // Converted is the hand-off into the debate; the others have nothing left to end.
  it.each<DebateRematchStatus>(['converted', 'ended', 'expired', 'deciding'])('keeps a %s session', status => {
    const { unmount } = mount(session({ status }));
    unmount();
    vi.runAllTimers();
    expect(leave).not.toHaveBeenCalled();
  });

  // A room's session has no browsing deadline and is the room's to end (GEO-2941).
  it("never ends a room's session", () => {
    const { unmount } = mount(session({ source_debate_id: null, browsing_expires_at: null }));
    unmount();
    vi.runAllTimers();
    expect(leave).not.toHaveBeenCalled();
  });

  // A profile challenge also has no source debate, but it does have a deadline, so it is not a room.
  it('ends a profile-challenge session', () => {
    const { unmount } = mount(session({ source_debate_id: null }));
    unmount();
    vi.runAllTimers();
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the page already started its own exit', () => {
    const { unmount } = mount(session(), () => true);
    unmount();
    vi.runAllTimers();
    expect(leave).not.toHaveBeenCalled();
  });

  it('does nothing before the session has loaded', () => {
    const { unmount } = mount(null);
    unmount();
    vi.runAllTimers();
    expect(leave).not.toHaveBeenCalled();
  });

  // Decided on the state at unmount: a session that converted while the page was open is kept.
  it('reads the session as it is when the page unmounts', () => {
    const { rerender, unmount } = mount(session());
    rerender({ value: session({ status: 'converted', converted_debate_id: 'debate-2' }) });
    unmount();
    vi.runAllTimers();
    expect(leave).not.toHaveBeenCalled();
  });

  // Development double-invokes effects: an unmount followed at once by a mount of the same session
  // is not someone leaving, and must not end the session they are looking at.
  it('survives StrictMode remounting the page', () => {
    function Probe() {
      useLeaveRematchOnExit({ sessionId: 'session-1', session: session(), leave, exiting: () => false });
      return null;
    }
    const { unmount } = render(
      <React.StrictMode>
        <Probe />
      </React.StrictMode>
    );
    vi.runAllTimers();
    expect(leave).not.toHaveBeenCalled();

    unmount();
    vi.runAllTimers();
    expect(leave).toHaveBeenCalledTimes(1);
  });
});
