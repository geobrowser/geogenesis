import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ listSpaceChatRooms: vi.fn() }));

vi.mock('~/core/state/feature-flags', () => ({ useFeatureFlag: () => true }));
vi.mock('~/core/debates/hooks', () => ({
  useGeoChatAuth: () => ({ ready: true, authenticated: false, accountKey: null, getPrivyIdentityToken: vi.fn() }),
}));
vi.mock('~/core/debates/use-geo-chat-account-status', () => ({
  useGeoChatAccountStatus: () => ({ kind: 'unknown' }),
}));
vi.mock('~/core/space-chat/api', () => ({ listSpaceChatRooms: mocks.listSpaceChatRooms }));
// The panel reads the same room list, as the real one does.
vi.mock('./space-chat-panel', async () => {
  const { useSpaceChatRooms } = await import('~/core/space-chat/hooks');
  return {
    SpaceChatPanel: ({ spaceId }: { spaceId: string }) => {
      useSpaceChatRooms(spaceId, true);
      return <div data-testid="panel" />;
    },
  };
});
vi.mock('./space-channels', () => ({ SpaceChannels: () => <div data-testid="channels" /> }));

const { SpaceChatTab } = await import('./space-chat-tab');

afterEach(cleanup);

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SpaceChatTab spaceId="space-1" />
    </QueryClientProvider>
  );
}

describe('SpaceChatTab with the channels flag', () => {
  it('opens the channels when geo-chat has them switched on', async () => {
    mocks.listSpaceChatRooms.mockReset();
    mocks.listSpaceChatRooms.mockResolvedValue({ rooms: [], channels_enabled: true });
    renderTab();
    expect(await screen.findByTestId('channels')).toBeInTheDocument();
  });

  it('falls back to #general when geo-chat has them off', async () => {
    mocks.listSpaceChatRooms.mockReset();
    mocks.listSpaceChatRooms.mockResolvedValue({ rooms: [] });
    renderTab();
    expect(await screen.findByTestId('panel')).toBeInTheDocument();
  });

  it('shows #general once after a failed list read, without a refetch loop', async () => {
    mocks.listSpaceChatRooms.mockReset();
    mocks.listSpaceChatRooms.mockRejectedValue(new Error('cors'));
    renderTab();
    expect(await screen.findByTestId('panel')).toBeInTheDocument();
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(mocks.listSpaceChatRooms.mock.calls.length).toBeLessThanOrEqual(2);
    expect(screen.getByTestId('panel')).toBeInTheDocument();
  });
});
