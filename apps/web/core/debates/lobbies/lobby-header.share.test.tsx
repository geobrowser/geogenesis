import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, expect, it, vi } from 'vitest';

import { parseShareLink } from '~/core/sharing/share-link';

import { LobbyHeader } from './lobby-header';
import type { LobbyPageView } from './lobby-view';

const capture = vi.hoisted(() => vi.fn());
vi.mock('~/core/analytics', () => ({ capture, analyticsContextRevision: () => 0 }));
vi.mock('./hooks', () => ({ useEndDebateLobby: () => ({}) }));
vi.mock('./lobby-moderation', () => ({ LobbyHostLists: () => null }));
vi.mock('./lobby-popup', () => ({ LobbyPopup: ({ children }: { children: ReactNode }) => <>{children}</> }));
const lobby = {
  lobby_id: '11111111111141118111111111111111',
  name: 'A lobby',
  members: [],
  access: { status: 'admitted' },
  viewer: { kind: 'guest', role: null, hosting: false },
} as unknown as LobbyPageView;
afterEach(() => {
  cleanup();
  capture.mockReset();
  vi.restoreAllMocks();
});

it.each([false, true])('tags the lobby copy control (phone: %s)', async phone => {
  const write = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: write } });
  render(<LobbyHeader lobby={lobby} phone={phone} availability={null} />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
  await waitFor(() => expect(capture).toHaveBeenCalledWith('share_link_handoff', expect.anything()));
  const url = new URL(write.mock.calls[0][0]);
  expect(url.pathname).toBe(`/debate/${lobby.lobby_id}`);
  expect(url.searchParams.get('via')).toBe('lobby');
  expect(url.searchParams.get('si')).toHaveLength(24);
  expect(capture).toHaveBeenCalledWith(
    'share_link_handoff',
    expect.objectContaining({ ...parseShareLink(url), handoff_kind: 'copied', target_type: 'lobby' })
  );
});
