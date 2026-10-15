import { cleanup, renderHook, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateRematchSession, DebateRematchStatus } from '../api';
import { debateRematchClaimKey, holdOpenDebateTab, resetDebateTabIdForTests } from '../debate-tab-claims';
import { useEndPickerLeftBehind } from './lobby-left-picker';

const session = (overrides: Partial<DebateRematchSession> = {}): DebateRematchSession => ({
  id: 'session-1',
  source_debate_id: 'debate-1',
  source_space_id: 'space-1',
  status: 'browsing',
  participants: [],
  decision_expires_at: '2026-10-15T16:55:00Z',
  browsing_expires_at: '2026-10-15T17:55:00Z',
  request: null,
  converted_debate_id: null,
  recently_rejected_claim_ids: [],
  created_at: '2026-10-15T16:55:00Z',
  updated_at: '2026-10-15T16:55:00Z',
  ...overrides,
});

const leave = vi.fn();

type Props = { joined: boolean; value: DebateRematchSession | null };

const mount = (initialProps: Props) =>
  renderHook(({ joined, value }: Props) => useEndPickerLeftBehind({ joined, session: value, leave }), {
    initialProps,
  });

/** One browser profile's Web Locks; a hold's release is the browser dropping a closed tab's locks. */
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
    await waitFor(() => expect(leave).toHaveBeenCalledWith('session-1'));
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

    it('leaves once no tab holds it', async () => {
      const closeOtherSession = holdOpenDebateTab(debateRematchClaimKey('session-2'), 'picker-tab');
      mount({ joined: true, value: session() });
      await waitFor(() => expect(leave).toHaveBeenCalledWith('session-1'));
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
    await waitFor(() => expect(leave).toHaveBeenCalledWith('session-2'));
  });
});
