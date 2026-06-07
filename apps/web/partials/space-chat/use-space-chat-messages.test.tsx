import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ListMessagesResponse, ListRoomsResponse, SpaceRoom } from './api';

const authState = {
  ready: true,
  authenticated: true,
};

const apiMocks = {
  listSpaceRooms: vi.fn<(_: string, options?: { accessToken?: string | null }) => Promise<ListRoomsResponse>>(),
  listRoomMessages: vi.fn<
    (_: { roomId: string; accessToken?: string | null; limit?: number }) => Promise<ListMessagesResponse>
  >(),
  createRoomMessage: vi.fn(),
};

const sessionMocks = {
  resolveGeoChatAccessToken: vi.fn<() => Promise<string | null>>(),
};

const gatewayMocks = {
  useSpaceChatGateway: vi.fn(),
};

vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => authState,
}));

vi.mock('./api', async importOriginal => ({
  ...(await importOriginal<typeof import('./api')>()),
  listSpaceRooms: apiMocks.listSpaceRooms,
  listRoomMessages: apiMocks.listRoomMessages,
  createRoomMessage: apiMocks.createRoomMessage,
}));

vi.mock('./session', () => ({
  resolveGeoChatAccessToken: sessionMocks.resolveGeoChatAccessToken,
}));

vi.mock('./use-space-chat-gateway', () => ({
  useSpaceChatGateway: gatewayMocks.useSpaceChatGateway,
}));

const { useSpaceChatMessages } = await import('./use-space-chat-messages');

const room: SpaceRoom = {
  id: 'room-id',
  public_dao_space_id: 'public-space-id',
  space_id: 'dao-space',
  kind: 'member',
  key: 'dao-space::member',
};

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('useSpaceChatMessages', () => {
  beforeEach(() => {
    authState.ready = true;
    authState.authenticated = true;
    apiMocks.listSpaceRooms.mockReset();
    apiMocks.listRoomMessages.mockReset();
    apiMocks.createRoomMessage.mockReset();
    sessionMocks.resolveGeoChatAccessToken.mockReset();
    gatewayMocks.useSpaceChatGateway.mockReset();

    apiMocks.listSpaceRooms.mockResolvedValue({ rooms: [room] });
    apiMocks.listRoomMessages.mockResolvedValue({ messages: [], next_before: null });
    sessionMocks.resolveGeoChatAccessToken.mockResolvedValue('app-token');
  });

  it('establishes the chat app session before the first send when Privy is authenticated', async () => {
    renderHook(
      () =>
        useSpaceChatMessages({
          spaceId: 'dao-space',
          channelId: 'member',
          connectedAddress: '0x1234',
          canPost: true,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(sessionMocks.resolveGeoChatAccessToken).toHaveBeenCalledOnce());
    await waitFor(() => {
      expect(apiMocks.listSpaceRooms).toHaveBeenCalledWith('dao-space', { accessToken: 'app-token' });
    });
    await waitFor(() => {
      expect(gatewayMocks.useSpaceChatGateway).toHaveBeenLastCalledWith(
        expect.objectContaining({ accessToken: null })
      );
    });
    expect(apiMocks.listSpaceRooms).not.toHaveBeenCalledWith('dao-space', { accessToken: null });
  });

  it('uses the app session token for editor-room websocket subscriptions too', async () => {
    apiMocks.listSpaceRooms.mockResolvedValueOnce({
      rooms: [{ ...room, id: 'editor-room-id', kind: 'editor', key: 'dao-space::editor' }],
    });

    renderHook(
      () =>
        useSpaceChatMessages({
          spaceId: 'dao-space',
          channelId: 'editor',
          connectedAddress: '0x1234',
          canPost: true,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(gatewayMocks.useSpaceChatGateway).toHaveBeenLastCalledWith(
        expect.objectContaining({ accessToken: 'app-token' })
      );
    });
  });

  it('polls for reconciliation only while the window is inactive', async () => {
    const { queryClient, wrapper } = createWrapperWithClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);

    renderHook(
      () =>
        useSpaceChatMessages({
          spaceId: 'dao-space',
          channelId: 'member',
          connectedAddress: '0x1234',
          canPost: true,
        }),
      { wrapper }
    );

    await waitFor(() => expect(apiMocks.listRoomMessages).toHaveBeenCalled());

    vi.useFakeTimers();

    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(invalidateSpy).not.toHaveBeenCalled();

    vi.mocked(document.hasFocus).mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);

    vi.mocked(document.hasFocus).mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(2);
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(2);
  });
});

function createWrapper() {
  return createWrapperWithClient().wrapper;
}

function createWrapperWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return { queryClient, wrapper: Wrapper };
}
