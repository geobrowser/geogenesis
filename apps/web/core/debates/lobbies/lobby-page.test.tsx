import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyMember, DebateLobbyRole } from '../api';
import { useHandoffNotice } from './lobby-page';

function member(userId: string, role: DebateLobbyRole, actingHost = false): DebateLobbyMember {
  return {
    acting_host: actingHost,
    user_id: userId,
    profile_space_id: `space-${userId}`,
    display_name: userId.toUpperCase(),
    avatar_cid: null,
    role,
    creator: false,
    present_since: '2026-10-05T10:00:00Z',
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useHandoffNotice', () => {
  // geo-chat waits 60s before an acting host takes over, so a hostless view always comes between.
  it('announces the acting host after a hostless gap, then clears', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(lobby => useHandoffNotice(lobby), {
      initialProps: { hosts_changed_at: null as string | null, members: [member('a', 'host'), member('b', 'speaker')] },
    });
    expect(result.current).toBeNull();

    rerender({ hosts_changed_at: null, members: [member('b', 'speaker')] });
    expect(result.current).toBeNull();

    rerender({ hosts_changed_at: '2026-10-05T10:01:00Z', members: [member('b', 'speaker', true)] });
    expect(result.current?.user_id).toBe('b');

    act(() => vi.advanceTimersByTime(8_000));
    expect(result.current).toBeNull();
  });

  it('says nothing about hosting that changed before the page opened', () => {
    const { result } = renderHook(() =>
      useHandoffNotice({ hosts_changed_at: '2026-10-05T10:01:00Z', members: [member('b', 'speaker', true)] })
    );
    expect(result.current).toBeNull();
  });
});
