import { cleanup, renderHook, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateRematchSession, DebateRematchStatus } from '../api';
import { debateRematchClaimKey, holdOpenDebateTab, resetDebateTabIdForTests } from '../debate-tab-claims';
import { FakeLockManager, rematchSessionFixture } from '../rematch-session-fixtures';
import { useEndPickerLeftBehind } from './lobby-left-picker';

const session = rematchSessionFixture;

const leave = vi.fn();

type Props = { joined: boolean; value: DebateRematchSession | null; checkedAt?: number };

const mount = (initialProps: Props) =>
  renderHook(
    ({ joined, value, checkedAt = 1 }: Props) => useEndPickerLeftBehind({ joined, session: value, checkedAt, leave }),
    { initialProps }
  );

/** Lets the Web Locks query and the effect's promise settle. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('ending a picker left behind when back in the lobby room', () => {
  beforeEach(() => {
    leave.mockClear();
    resetDebateTabIdForTests('lobby-tab');
  });
  afterEach(() => {
    cleanup();
    resetDebateTabIdForTests();
  });

  // The bug: back in the room after leaving the picker by browser Back, still "Picking a claim".
  it.each<DebateRematchStatus>(['browsing', 'request_pending'])('leaves a %s session once joined', async status => {
    mount({ joined: true, value: session({ status }) });
    await waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('waits until the viewer is in the room', async () => {
    const { rerender } = mount({ joined: false, value: session() });
    await settle();
    expect(leave).not.toHaveBeenCalled();

    rerender({ joined: true, value: session() });
    await waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
  });

  it.each<DebateRematchStatus>(['converted', 'ended', 'expired', 'deciding'])('keeps a %s session', async status => {
    mount({ joined: true, value: session({ status }) });
    await settle();
    expect(leave).not.toHaveBeenCalled();
  });

  it("keeps a room's session, which has no browsing deadline", async () => {
    mount({ joined: true, value: session({ browsing_expires_at: null }) });
    await settle();
    expect(leave).not.toHaveBeenCalled();
  });

  describe('with the picker open in another tab', () => {
    beforeEach(() => {
      Object.defineProperty(navigator, 'locks', { configurable: true, value: new FakeLockManager() });
    });
    afterEach(() => {
      Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    });

    it('keeps the session while that tab holds it', async () => {
      const closePickerTab = holdOpenDebateTab(debateRematchClaimKey('session-1'), 'picker-tab');
      mount({ joined: true, value: session() });
      await settle();
      expect(leave).not.toHaveBeenCalled();
      closePickerTab();
    });

    // Copilot on #2876: the lobby joined while the picker tab was open, then that tab closed, which
    // sends nothing. Only the next activity read can notice; the lock was checked once and never again.
    it('leaves on the next activity read once that tab closes', async () => {
      const closePickerTab = holdOpenDebateTab(debateRematchClaimKey('session-1'), 'picker-tab');
      const { rerender } = mount({ joined: true, value: session(), checkedAt: 1 });
      await settle();
      expect(leave).not.toHaveBeenCalled();

      closePickerTab();
      await settle();
      rerender({ joined: true, value: session(), checkedAt: 2 });
      await waitFor(() => expect(leave).toHaveBeenCalledTimes(1));

      rerender({ joined: true, value: session(), checkedAt: 3 });
      await settle();
      expect(leave).toHaveBeenCalledTimes(1);
    });

    it('leaves once no tab holds it', async () => {
      const closeOtherSession = holdOpenDebateTab(debateRematchClaimKey('session-2'), 'picker-tab');
      mount({ joined: true, value: session() });
      await waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
      closeOtherSession();
    });
  });

  it('tries each session once, however often activity polls', async () => {
    const { rerender } = mount({ joined: true, value: session() });
    await waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
    rerender({ joined: true, value: session({ updated_at: '2026-10-15T16:56:00Z' }) });
    rerender({ joined: false, value: session() });
    rerender({ joined: true, value: session() });
    await settle();
    expect(leave).toHaveBeenCalledTimes(1);

    rerender({ joined: true, value: session({ id: 'session-2' }) });
    await waitFor(() => expect(leave).toHaveBeenCalledTimes(2));
  });
});
