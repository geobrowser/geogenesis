import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyMember, DebateLobbyRole } from '../api';
import { isAlone, useHandoffNotice } from './lobby-page';

function member(userId: string, role: DebateLobbyRole, actingHost = false): DebateLobbyMember {
  return {
    acting_host: actingHost,
    user_id: userId,
    profile_space_id: `space-${userId}`,
    display_name: userId.toUpperCase(),
    avatar_cid: null,
    role,
    creator: false,
    on_roster_since: '2026-10-05T10:00:00Z',
    stepped_out: false,
    in_debate: false,
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
    expect(result.current?.host.user_id).toBe('b');
    expect(result.current?.left?.user_id).toBe('a');

    act(() => vi.advanceTimersByTime(8_000));
    expect(result.current).toBeNull();
  });

  it('names no one as gone when the last host is still on the roster', () => {
    const { result, rerender } = renderHook(lobby => useHandoffNotice(lobby), {
      initialProps: { hosts_changed_at: null as string | null, members: [member('a', 'host'), member('b', 'speaker')] },
    });
    rerender({
      hosts_changed_at: '2026-10-05T10:01:00Z',
      members: [member('a', 'host'), member('b', 'speaker', true)],
    });
    expect(result.current?.host.user_id).toBe('b');
    expect(result.current?.left).toBeNull();
  });

  it('says nothing about hosting that changed before the page opened', () => {
    const { result } = renderHook(() =>
      useHandoffNotice({ hosts_changed_at: '2026-10-05T10:01:00Z', members: [member('b', 'speaker', true)] })
    );
    expect(result.current).toBeNull();
  });
});

describe('isAlone', () => {
  it('is the viewer alone on the roster with no guests', () => {
    expect(isAlone({ members: [member('a-1', 'host')], guest_count: 0 }, 'a1', false)).toBe(true);
    expect(isAlone({ members: [member('a1', 'host')], guest_count: 1 }, 'a1', false)).toBe(false);
    expect(isAlone({ members: [member('a1', 'host'), member('b1', 'speaker')] }, 'a1', false)).toBe(false);
    expect(isAlone({ members: [member('a1', 'host')] }, null, false)).toBe(false);
  });

  it('is an empty roster for a guest', () => {
    expect(isAlone({ members: [] }, null, true)).toBe(true);
    expect(isAlone({ members: [member('a1', 'host')] }, null, true)).toBe(false);
  });
});
