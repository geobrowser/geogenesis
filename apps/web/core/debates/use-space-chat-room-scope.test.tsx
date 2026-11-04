import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { debateGateway, publicChatGateway, useSpaceChatRoomScope } from './debate-gateway';

const ROOM = { space_id: 'space-1', id: 'room-1', kind: 'member' as const };
const SCOPE = { scope: 'chat-room', space_id: 'space-1', room_id: 'room-1', room_kind: 'member' };

describe('useSpaceChatRoomScope', () => {
  const release = vi.fn();
  beforeEach(() => {
    release.mockReset();
    vi.spyOn(debateGateway, 'retainScope').mockImplementation(() => release);
    vi.spyOn(publicChatGateway, 'retainScope').mockImplementation(() => release);
    vi.spyOn(publicChatGateway, 'retryAfterFocus').mockImplementation(() => undefined);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('holds the room on the public connection signed out, and retries it on window focus', () => {
    renderHook(() => useSpaceChatRoomScope(ROOM, true, false));
    expect(publicChatGateway.retainScope).toHaveBeenCalledWith(SCOPE);
    expect(debateGateway.retainScope).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('focus'));
    expect(publicChatGateway.retryAfterFocus).toHaveBeenCalledTimes(1);
  });

  it('moves the room to the account connection on sign-in, releasing the public one', () => {
    const { rerender } = renderHook(({ signedIn }) => useSpaceChatRoomScope(ROOM, true, signedIn), {
      initialProps: { signedIn: false },
    });
    rerender({ signedIn: true });
    expect(release).toHaveBeenCalledTimes(1);
    expect(debateGateway.retainScope).toHaveBeenCalledWith(SCOPE);
    window.dispatchEvent(new Event('focus'));
    expect(publicChatGateway.retryAfterFocus).not.toHaveBeenCalled();
  });

  it('is live only while the gateway reports the room itself live, and re-reads when told', () => {
    let live = false;
    let notify = () => undefined as void;
    vi.spyOn(debateGateway, 'isScopeLive').mockImplementation(() => live);
    vi.spyOn(debateGateway, 'subscribe').mockImplementation(listener => {
      notify = listener;
      return () => true;
    });
    const { result } = renderHook(() => useSpaceChatRoomScope(ROOM, true, true));
    expect(result.current).toBe(false);
    expect(debateGateway.isScopeLive).toHaveBeenCalledWith(SCOPE);

    live = true;
    act(() => notify());
    expect(result.current).toBe(true);
  });

  it('is never live while disabled', () => {
    vi.spyOn(debateGateway, 'isScopeLive').mockImplementation(() => true);
    const { result } = renderHook(() => useSpaceChatRoomScope(ROOM, false, true));
    expect(result.current).toBe(false);
  });
});
