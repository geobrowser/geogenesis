import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpaceChatRoom } from './api';
import { READ_CURSOR_DELAY_MS, useMarkChannelRead } from './channel-hooks';

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
