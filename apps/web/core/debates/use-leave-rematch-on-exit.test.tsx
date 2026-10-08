import { cleanup, render, renderHook } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateRematchSession, DebateRematchStatus } from './api';
import { debateRematchClaimKey, holdOpenDebateTab, resetDebateTabIdForTests } from './debate-tab-claims';
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
  it.each<DebateRematchStatus>(['browsing', 'request_pending'])('leaves a %s session on unmount', async status => {
    const { unmount } = mount(session({ status }));
    unmount();
    await vi.runAllTimersAsync();
    expect(leave).toHaveBeenCalledTimes(1);
  });

  // Converted is the hand-off into the debate; the others have nothing left to end.
  it.each<DebateRematchStatus>(['converted', 'ended', 'expired', 'deciding'])('keeps a %s session', async status => {
    const { unmount } = mount(session({ status }));
    unmount();
    await vi.runAllTimersAsync();
    expect(leave).not.toHaveBeenCalled();
  });

  // A room's session has no browsing deadline and is the room's to end (GEO-2941).
  it("never ends a room's session", async () => {
    const { unmount } = mount(session({ source_debate_id: null, browsing_expires_at: null }));
    unmount();
    await vi.runAllTimersAsync();
    expect(leave).not.toHaveBeenCalled();
  });

  // A profile challenge also has no source debate, but it does have a deadline, so it is not a room.
  it('ends a profile-challenge session', async () => {
    const { unmount } = mount(session({ source_debate_id: null }));
    unmount();
    await vi.runAllTimersAsync();
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the page already started its own exit', async () => {
    const { unmount } = mount(session(), () => true);
    unmount();
    await vi.runAllTimersAsync();
    expect(leave).not.toHaveBeenCalled();
  });

  it('does nothing before the session has loaded', async () => {
    const { unmount } = mount(null);
    unmount();
    await vi.runAllTimersAsync();
    expect(leave).not.toHaveBeenCalled();
  });

  // Decided on the state at unmount: a session that converted while the page was open is kept.
  it('reads the session as it is when the page unmounts', async () => {
    const { rerender, unmount } = mount(session());
    rerender({ value: session({ status: 'converted', converted_debate_id: 'debate-2' }) });
    unmount();
    await vi.runAllTimersAsync();
    expect(leave).not.toHaveBeenCalled();
  });

  // Development double-invokes effects: an unmount followed at once by a mount of the same session
  // is not someone leaving, and must not end the session they are looking at.
  it('survives StrictMode remounting the page', async () => {
    function Probe() {
      useLeaveRematchOnExit({ sessionId: 'session-1', session: session(), leave, exiting: () => false });
      return null;
    }
    const { unmount } = render(
      <React.StrictMode>
        <Probe />
      </React.StrictMode>
    );
    await vi.runAllTimersAsync();
    expect(leave).not.toHaveBeenCalled();

    unmount();
    await vi.runAllTimersAsync();
    expect(leave).toHaveBeenCalledTimes(1);
  });
});

/**
 * One browser profile's Web Locks, shared by every "tab" in a test. A tab that closes has its locks
 * dropped by the browser, which is what calling a hold's release models.
 */
class FakeLockManager {
  held: LockInfo[] = [];

  async request(name: string, options: LockOptions, callback: (lock: Lock | null) => Promise<void>) {
    const info: LockInfo = { name, mode: options.mode ?? 'exclusive', clientId: 'test' };
    this.held.push(info);
    try {
      await callback({ name, mode: info.mode! });
    } finally {
      this.held = this.held.filter(lock => lock !== info);
    }
  }

  async query(): Promise<LockManagerSnapshot> {
    return { held: [...this.held], pending: [] };
  }
}

describe('leaving a debate-again session with the picker open in several tabs', () => {
  let locks: FakeLockManager;
  const mountTab = (tabId: string) => {
    resetDebateTabIdForTests(tabId);
    return renderHook(() =>
      useLeaveRematchOnExit({ sessionId: 'session-1', session: session(), leave, exiting: () => false })
    );
  };

  beforeEach(() => {
    vi.useFakeTimers();
    leave.mockClear();
    locks = new FakeLockManager();
    Object.defineProperty(navigator, 'locks', { configurable: true, value: locks });
  });
  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    resetDebateTabIdForTests();
  });

  // The bug: a stray second tab leaving the picker ended the session for both people.
  it('keeps the session when another tab still has the picker open', async () => {
    const tabA = mountTab('tab-a');
    mountTab('tab-b');
    await vi.runAllTimersAsync();

    tabA.unmount();
    await vi.runAllTimersAsync();
    expect(leave).not.toHaveBeenCalled();
  });

  it('leaves once the last tab with the picker open leaves', async () => {
    const tabA = mountTab('tab-a');
    const tabB = mountTab('tab-b');
    await vi.runAllTimersAsync();

    tabA.unmount();
    await vi.runAllTimersAsync();
    expect(leave).not.toHaveBeenCalled();

    tabB.unmount();
    await vi.runAllTimersAsync();
    expect(leave).toHaveBeenCalledTimes(1);
  });

  // Closing a tab runs no React cleanup; the browser drops its locks. The tab left behind is then
  // the last one, and leaving it still releases both people at once (GEO-3024).
  it('leaves from the remaining tab after the other tab was closed', async () => {
    const closeOtherTab = holdOpenDebateTab(debateRematchClaimKey('session-1'), 'tab-b');
    const tabA = mountTab('tab-a');
    await vi.runAllTimersAsync();

    closeOtherTab();
    await vi.runAllTimersAsync();
    expect(leave).not.toHaveBeenCalled();

    tabA.unmount();
    await vi.runAllTimersAsync();
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('leaves from a single tab, as before', async () => {
    const tabA = mountTab('tab-a');
    await vi.runAllTimersAsync();

    tabA.unmount();
    await vi.runAllTimersAsync();
    expect(leave).toHaveBeenCalledTimes(1);
  });

  // Another session's picker in another tab is not this one.
  it('ignores tabs open on a different session', async () => {
    holdOpenDebateTab(debateRematchClaimKey('session-2'), 'tab-b');
    const tabA = mountTab('tab-a');
    await vi.runAllTimersAsync();

    tabA.unmount();
    await vi.runAllTimersAsync();
    expect(leave).toHaveBeenCalledTimes(1);
  });

  // The StrictMode remount holds a second lock under the same tab id; neither may read as another tab.
  it('survives StrictMode remounting the page', async () => {
    resetDebateTabIdForTests('tab-a');
    function Probe() {
      useLeaveRematchOnExit({ sessionId: 'session-1', session: session(), leave, exiting: () => false });
      return null;
    }
    const { unmount } = render(
      <React.StrictMode>
        <Probe />
      </React.StrictMode>
    );
    await vi.runAllTimersAsync();
    expect(leave).not.toHaveBeenCalled();

    unmount();
    await vi.runAllTimersAsync();
    expect(leave).toHaveBeenCalledTimes(1);
  });
});
