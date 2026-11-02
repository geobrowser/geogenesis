import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, expect, it, vi } from 'vitest';

import { parseShareLink } from '~/core/sharing/share-link';

import { LobbyHeader } from './lobby-header';
import type { LobbyPageView } from './lobby-view';

const capture = vi.hoisted(() => vi.fn());
vi.mock('~/core/analytics', () => ({ capture, analyticsContextRevision: () => 0 }));
vi.mock('./hooks', () => ({
  useEndDebateLobby: () => ({}),
  useUpdateDebateLobby: () => ({ mutate: vi.fn(), error: null, isPending: false }),
}));
vi.mock('./lobby-moderation', () => ({ LobbyHostLists: () => null }));
// The phone menu's content mounts only while it is open, as the real sheet's does.
vi.mock('./lobby-popup', async importOriginal => {
  const actual = await importOriginal<typeof import('./lobby-popup')>();
  return {
    ...actual,
    LobbyPopup: ({
      open,
      onOpenChange,
      trigger,
      children,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      trigger: ReactNode;
      children: ReactNode;
    }) => (
      <>
        <span onClick={() => onOpenChange(true)}>{trigger}</span>
        {open ? <actual.LobbyHandoffScope onOpenChange={onOpenChange}>{children}</actual.LobbyHandoffScope> : null}
      </>
    ),
  };
});
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
  if (phone) fireEvent.click(screen.getByRole('button', { name: 'Lobby options' }));
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

// GEO-3540: any host edits, present or not; End stays with whoever is hosting.
it.each([false, true])('offers Edit lobby to a host who is not the acting host (phone: %s)', phone => {
  const host = {
    ...lobby,
    purpose: 'lobby',
    viewer: { kind: 'user', role: 'host', hosting: false },
  } as unknown as LobbyPageView;
  render(<LobbyHeader lobby={host} phone={phone} availability={null} />);
  if (phone) fireEvent.click(screen.getByRole('button', { name: 'Lobby options' }));
  expect(screen.getByRole('button', { name: 'Edit lobby' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^End/ })).toBeNull();
});

// Review: a dialog opened inside the modal phone sheet can't be tapped, so the sheet closes first and
// the dialog outlives it.
it('closes the phone menu before showing the edit dialog', async () => {
  const host = {
    ...lobby,
    purpose: 'lobby',
    starts_at: new Date().toISOString(),
    viewer: { kind: 'user', role: 'host', hosting: true },
  } as unknown as LobbyPageView;
  render(<LobbyHeader lobby={host} phone availability={null} />);
  fireEvent.click(screen.getByRole('button', { name: 'Lobby options' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit lobby' }));

  expect(await screen.findByRole('dialog', { name: 'Edit lobby' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
});
