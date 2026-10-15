import { cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateRematchSession, DebateRematchStatus } from '../api';
import {
  DEBATE_TAB_CLAIM_TTL_MS,
  debateRematchClaimKey,
  holdOpenDebateTab,
  resetDebateTabIdForTests,
} from '../debate-tab-claims';
import { FakeLockManager, rematchSessionFixture } from '../rematch-session-fixtures';
import { useEndPickerLeftBehind } from './lobby-left-picker';

const session = rematchSessionFixture;

const leave = vi.fn();

/** How long no tab may hold the picker before the lobby takes it as left. */
const GRACE = DEBATE_TAB_CLAIM_TTL_MS;

type Props = { joined: boolean; value: DebateRematchSession | null };

/** Lets the Web Locks query and the effect's promise settle. Only `Date` is faked. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/** The hook, read by activity at `at` ms: each call is one activity read at that moment. */
async function mountAt(at: number, initial: Props) {
  vi.setSystemTime(at);
  const hook = renderHook(
    ({ joined, value, checkedAt }: Props & { checkedAt: number }) =>
      useEndPickerLeftBehind({ joined, session: value, checkedAt, leave }),
    { initialProps: { ...initial, checkedAt: at } }
  );
  await settle();
  const readAt = async (when: number, props: Props = initial) => {
    vi.setSystemTime(when);
    hook.rerender({ ...props, checkedAt: when });
    await settle();
  };
  return readAt;
}

const pickerTab = (id = 'session-1') => holdOpenDebateTab(debateRematchClaimKey(id), 'picker-tab');

describe('ending a picker left behind when back in the lobby room', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    leave.mockClear();
    resetDebateTabIdForTests('lobby-tab');
    Object.defineProperty(navigator, 'locks', { configurable: true, value: new FakeLockManager() });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    resetDebateTabIdForTests();
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  });

  // The bug: back in the room after leaving the picker by browser Back, still "Picking a claim".
  it.each<DebateRematchStatus>(['browsing', 'request_pending'])(
    'leaves a %s session once no tab has held it for the grace period',
    async status => {
      const readAt = await mountAt(0, { joined: true, value: session({ status }) });
      expect(leave).not.toHaveBeenCalled();

      await readAt(GRACE - 1);
      expect(leave).not.toHaveBeenCalled();

      await readAt(GRACE);
      expect(leave).toHaveBeenCalledTimes(1);
    }
  );

  it('waits until the viewer is in the room', async () => {
    const readAt = await mountAt(0, { joined: false, value: session() });
    await readAt(GRACE, { joined: false, value: session() });
    expect(leave).not.toHaveBeenCalled();

    await readAt(GRACE + 1, { joined: true, value: session() });
    await readAt(2 * GRACE + 1, { joined: true, value: session() });
    expect(leave).toHaveBeenCalledTimes(1);
  });

  // An absence seen before they left the room says nothing about the picker once they are back.
  it('starts the grace period again after the viewer was out of the room', async () => {
    const readAt = await mountAt(0, { joined: true, value: session() });
    await readAt(1, { joined: false, value: session() });
    await readAt(GRACE + 1, { joined: true, value: session() });
    expect(leave).not.toHaveBeenCalled();

    await readAt(2 * GRACE + 1, { joined: true, value: session() });
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it.each<DebateRematchStatus>(['converted', 'ended', 'expired', 'deciding'])('keeps a %s session', async status => {
    const readAt = await mountAt(0, { joined: true, value: session({ status }) });
    await readAt(2 * GRACE);
    expect(leave).not.toHaveBeenCalled();
  });

  it("keeps a room's session, which has no browsing deadline", async () => {
    const readAt = await mountAt(0, { joined: true, value: session({ browsing_expires_at: null }) });
    await readAt(2 * GRACE);
    expect(leave).not.toHaveBeenCalled();
  });

  it('keeps the session while another tab holds the picker', async () => {
    const closePickerTab = pickerTab();
    const readAt = await mountAt(0, { joined: true, value: session() });
    await readAt(GRACE);
    await readAt(2 * GRACE);
    expect(leave).not.toHaveBeenCalled();
    closePickerTab();
  });

  // Copilot on #2876 (round 1): the lobby joined while the picker tab was open, then that tab closed,
  // which sends nothing. Only later activity reads can notice.
  it('leaves once the picker tab has been closed for the grace period', async () => {
    const closePickerTab = pickerTab();
    const readAt = await mountAt(0, { joined: true, value: session() });
    closePickerTab();
    await settle();

    await readAt(GRACE);
    expect(leave).not.toHaveBeenCalled();
    await readAt(2 * GRACE);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  // Copilot on #2876 (round 2): reloading the picker drops its lock until the new page mounts, which
  // in this app waits for hydration. A read in that gap must not end the session for both people.
  it('keeps a picker that is reloading across the grace period', async () => {
    let closePickerTab = pickerTab();
    const readAt = await mountAt(0, { joined: true, value: session() });

    // Reload: the lock drops, a read lands in the gap, the new page holds it again.
    closePickerTab();
    await settle();
    await readAt(1);
    closePickerTab = pickerTab();
    await settle();
    await readAt(GRACE / 2);

    // Reloading again, more than a grace period after the first gap began.
    closePickerTab();
    await settle();
    await readAt(GRACE + 2);
    expect(leave).not.toHaveBeenCalled();
    closePickerTab = pickerTab();
    await settle();
    await readAt(2 * GRACE + 2);
    expect(leave).not.toHaveBeenCalled();
    closePickerTab();
  });

  // Copilot on #2876 (round 2): joining the lobby does not show the picker was left, so a tab check
  // that cannot answer must keep it rather than read as "no picker open".
  it('keeps the session when Web Locks are unavailable', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    const readAt = await mountAt(0, { joined: true, value: session() });
    await readAt(GRACE);
    await readAt(2 * GRACE);
    expect(leave).not.toHaveBeenCalled();
  });

  it('keeps the session when the tab check fails', async () => {
    const locks = new FakeLockManager();
    locks.query = () => Promise.reject(new Error('locks unavailable'));
    Object.defineProperty(navigator, 'locks', { configurable: true, value: locks });
    const readAt = await mountAt(0, { joined: true, value: session() });
    await readAt(GRACE);
    await readAt(2 * GRACE);
    expect(leave).not.toHaveBeenCalled();
  });

  it('only counts a lock held for this session', async () => {
    const closeOtherSession = pickerTab('session-2');
    const readAt = await mountAt(0, { joined: true, value: session() });
    await readAt(GRACE);
    expect(leave).toHaveBeenCalledTimes(1);
    closeOtherSession();
  });

  it('tries each session once, however often activity polls', async () => {
    const readAt = await mountAt(0, { joined: true, value: session() });
    await readAt(GRACE);
    expect(leave).toHaveBeenCalledTimes(1);
    await readAt(2 * GRACE, { joined: true, value: session({ updated_at: '2026-10-15T16:56:00Z' }) });
    await readAt(3 * GRACE);
    expect(leave).toHaveBeenCalledTimes(1);

    await readAt(3 * GRACE + 1, { joined: true, value: session({ id: 'session-2' }) });
    await readAt(4 * GRACE + 1, { joined: true, value: session({ id: 'session-2' }) });
    expect(leave).toHaveBeenCalledTimes(2);
  });
});
