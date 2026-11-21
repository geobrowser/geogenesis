import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpaceChatRoom } from './api';
import { READ_CURSOR_DELAY_MS, useMarkChannelRead, withWrittenRoom } from './channel-hooks';
import { getShownChatRoom } from './shown-room';

const mocks = vi.hoisted(() => ({ markRead: vi.fn() }));
vi.mock('./api', async importOriginal => ({
  ...(await importOriginal<typeof import('./api')>()),
  markSpaceChatRoomRead: mocks.markRead,
}));
vi.mock('./hooks', () => {
  const auth = { accountKey: 'acct', getPrivyIdentityToken: async () => 'token' };
  return { useSpaceChatAuth: () => ({ ready: true, auth, settingUp: false }) };
});

const room: SpaceChatRoom = { id: 'r1', public_dao_space_id: 'p', space_id: 's', kind: 'channel', key: 'k' };
let hidden = false;

function setHidden(next: boolean) {
  hidden = next;
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

function renderRead(initial: { newestId: string; room?: SpaceChatRoom }) {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    ({ newestId, room: shown = room }: { newestId: string; room?: SpaceChatRoom }) =>
      useMarkChannelRead(shown, newestId, true),
    { wrapper, initialProps: initial }
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => (hidden ? 'hidden' : 'visible'));
  mocks.markRead.mockReset();
  mocks.markRead.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useMarkChannelRead', () => {
  it('writes once for a burst, with the newest id, after the delay', () => {
    const { rerender } = renderRead({ newestId: '01' });
    rerender({ newestId: '02' });
    rerender({ newestId: '03' });
    expect(mocks.markRead).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(READ_CURSOR_DELAY_MS);
    });
    expect(mocks.markRead).toHaveBeenCalledTimes(1);
    expect(mocks.markRead).toHaveBeenCalledWith('r1', '03', expect.anything());
  });

  it('writes what is pending when the tab hides, and nothing while hidden', () => {
    const { rerender } = renderRead({ newestId: '01' });
    setHidden(true);
    expect(mocks.markRead).toHaveBeenCalledTimes(1);
    rerender({ newestId: '02' });
    act(() => {
      vi.advanceTimersByTime(READ_CURSOR_DELAY_MS * 2);
    });
    expect(mocks.markRead).toHaveBeenCalledTimes(1);
    setHidden(false);
    act(() => {
      vi.advanceTimersByTime(READ_CURSOR_DELAY_MS);
    });
    expect(mocks.markRead).toHaveBeenLastCalledWith('r1', '02', expect.anything());
  });

  it('marks the channel shown while its tab is visible, and clears it on hide and unmount', () => {
    const { unmount } = renderRead({ newestId: '01' });
    expect(getShownChatRoom()).toBe('r1');
    setHidden(true);
    expect(getShownChatRoom()).toBeNull();
    setHidden(false);
    expect(getShownChatRoom()).toBe('r1');
    unmount();
    expect(getShownChatRoom()).toBeNull();
  });

  it('writes at once when the window loses focus or the channel closes', () => {
    const { rerender, unmount } = renderRead({ newestId: '01' });
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(mocks.markRead).toHaveBeenCalledTimes(1);
    rerender({ newestId: '02' });
    unmount();
    expect(mocks.markRead).toHaveBeenCalledTimes(2);
    expect(mocks.markRead).toHaveBeenLastCalledWith('r1', '02', expect.anything());
  });
});

describe('withWrittenRoom', () => {
  const held: SpaceChatRoom = {
    ...room,
    name: 'markets',
    version: 1,
    can_post: true,
    can_reply: true,
    can_moderate: true,
    unread_count: 4,
    last_read_message_id: '01',
  };
  const list = (rooms: SpaceChatRoom[]) => ({ supported: true, rooms, channelsEnabled: true, canManageChannels: true });

  it('merges an update over the held row and keeps the viewer fields', () => {
    const written = { ...room, name: 'prices', slow_mode: true, version: 2 };
    expect(withWrittenRoom(list([held]), written, true).rooms).toEqual([
      { ...held, name: 'prices', slow_mode: true, version: 2 },
    ]);
  });

  it('drops an archived row only from a list without archived channels', () => {
    const written = { ...room, archived: true, version: 2 };
    expect(withWrittenRoom(list([held]), written, false).rooms).toEqual([]);
    expect(withWrittenRoom(list([held]), written, true).rooms[0]).toMatchObject({ archived: true, unread_count: 4 });
  });

  it('adds a created channel the editor can post in and moderate', () => {
    const created = { ...room, id: 'r2', name: 'desk', version: 1 };
    expect(withWrittenRoom(list([held]), created, true).rooms[1]).toEqual({
      ...created,
      can_post: true,
      can_reply: true,
      can_moderate: true,
      unread_count: 0,
    });
  });
});
