import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';

import type * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyView } from '../api';
import type { MemberLobbyPageView } from './lobby-view';

const api = vi.hoisted(() => ({ setDebateLobbyHand: vi.fn() }));

vi.mock('../api', async importOriginal => ({ ...(await importOriginal<typeof import('../api')>()), ...api }));
vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'acct', getPrivyIdentityToken: vi.fn() }),
}));

const { BOTTOM_STACK, useAppBottomInset } = await import('~/core/app-bottom-inset');
const { GeoChatRequestError } = await import('../api');
const { LOBBY_CONTROL_COPY, LobbyControlBar, LobbyHandControl } = await import('./lobby-control-bar');

function lobby(viewer: Partial<DebateLobbyView['viewer']> = {}): MemberLobbyPageView {
  return {
    lobby_id: 'lobby1',
    name: 'Hour',
    access: { status: 'admitted' },
    starts_at: '2026-10-05T10:00:00Z',
    opens_at: '2026-10-05T10:00:00Z',
    scheduled: false,
    created_by: 'host1',
    acting_host_id: null,
    hosts_changed_at: null,
    reminder_count: 0,
    members: [],
    viewer: {
      kind: 'member',
      role: 'listener',
      creator: false,
      hosting: false,
      reminded: false,
      voice_away_at: null,
      connected: true,
      stepped_out: false,
      ...viewer,
    },
  };
}

function renderWith(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  api.setDebateLobbyHand.mockResolvedValue(lobby());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LobbyHandControl', () => {
  it('raises and lowers the viewer’s hand', async () => {
    const { unmount } = renderWith(<LobbyHandControl lobby={lobby()} />);
    expect(screen.getByText(LOBBY_CONTROL_COPY.listener)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Raise hand' }));
    await waitFor(() =>
      expect(api.setDebateLobbyHand).toHaveBeenCalledWith('lobby1', true, expect.any(Function), 'acct')
    );
    unmount();

    renderWith(<LobbyHandControl lobby={lobby({ hand_raised_at: '2026-10-05T10:01:00Z' })} />);
    expect(screen.getByText('Hosts can see your hand.')).toBeTruthy();
    const lower = screen.getByRole('button', { name: 'Hand raised · Lower' });
    expect(lower.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(lower);
    await waitFor(() =>
      expect(api.setDebateLobbyHand).toHaveBeenCalledWith('lobby1', false, expect.any(Function), 'acct')
    );
  });

  it('words a refused raise for the hand, not voice', async () => {
    api.setDebateLobbyHand.mockRejectedValue(new GeoChatRequestError('raw', 'lobby_stepped_out', 409));
    renderWith(<LobbyHandControl lobby={lobby()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Raise hand' }));
    expect(await screen.findByText('You stepped out. Go back to the room to raise your hand.')).toBeTruthy();
  });
});

describe('LobbyControlBar', () => {
  it('shows the request hint beside Leave when there is no hand or availability', () => {
    render(
      <LobbyControlBar controlsRef={() => undefined} showHint leave={<button type="button">Leave lobby</button>} />
    );
    expect(screen.getByText(LOBBY_CONTROL_COPY.hint)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Leave lobby' })).toBeTruthy();
  });

  it('lets the hand control’s own hint stand in for the request hint', () => {
    render(
      <LobbyControlBar
        controlsRef={() => undefined}
        showHint
        hand={<span>hand</span>}
        leave={<button type="button">Leave lobby</button>}
      />
    );
    expect(screen.queryByText(LOBBY_CONTROL_COPY.hint)).toBeNull();
  });

  it('claims its height as the app bottom inset, so floating chrome sits above it', () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(64);
    const { unmount } = render(
      <LobbyControlBar controlsRef={() => undefined} showHint leave={<button type="button">Leave lobby</button>} />
    );
    expect(document.documentElement.style.getPropertyValue('--app-bottom-inset')).toBe('64px');
    unmount();
    expect(document.documentElement.style.getPropertyValue('--app-bottom-inset')).toBe('');
    spy.mockRestore();
  });

  it('sits on the upload banner when it shows, and the inset counts both', () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(64);
    const banner = renderHook(() => useAppBottomInset('debate-upload-banner', 40, true, BOTTOM_STACK.uploadBanner));
    render(
      <LobbyControlBar controlsRef={() => undefined} showHint leave={<button type="button">Leave lobby</button>} />
    );

    expect(screen.getByTestId('lobby-control-bar').style.bottom).toBe('40px');
    expect(screen.getByTestId('lobby-control-bar').style.marginBottom).toBe('40px');
    expect(document.documentElement.style.getPropertyValue('--app-bottom-inset')).toBe('104px');

    act(() => banner.unmount());
    expect(screen.getByTestId('lobby-control-bar').style.bottom).toBe('');
    expect(screen.getByTestId('lobby-control-bar').style.marginBottom).toBe('');
    expect(document.documentElement.style.getPropertyValue('--app-bottom-inset')).toBe('64px');
    spy.mockRestore();
  });

  it('draws a guest’s banner inside the bar', () => {
    render(
      <LobbyControlBar
        controlsRef={() => undefined}
        showHint={false}
        banner={<div data-testid="banner" />}
        leave={<a href="/">Leave lobby</a>}
      />
    );
    expect(screen.getByTestId('lobby-control-bar').contains(screen.getByTestId('banner'))).toBe(true);
  });
});
