import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbySummary } from '../api';

const api = vi.hoisted(() => ({ listDebateLobbies: vi.fn(), setDebateLobbyReminder: vi.fn() }));

vi.mock('../api', async importOriginal => ({ ...(await importOriginal<typeof import('../api')>()), ...api }));
vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'acct', getPrivyIdentityToken: vi.fn() }),
}));
vi.mock('./lobby-analytics', () => ({ markLobbyEntry: vi.fn() }));

const { GeoChatRequestError } = await import('../api');
const { LobbyClosedCard } = await import('./lobby-state-cards');

const adam = { user_id: 'u1', profile_space_id: 's1', display_name: 'Adam', avatar_cid: null };

const summary = (overrides: Partial<DebateLobbySummary>): DebateLobbySummary => ({
  lobby_id: 'next1',
  name: 'Next hour',
  scheduled: true,
  starts_at: '2026-10-20T18:00:00Z',
  opens_at: '2026-10-20T17:50:00Z',
  open: false,
  hosts: [adam],
  headcount: 0,
  avatars: [],
  debating_count: 0,
  reminder_count: 0,
  viewer_reminded: false,
  viewer_on_roster: false,
  ...overrides,
});

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LobbyClosedCard lobby={{ lobby_id: 'ended1', created_by: 'u1' }} ended />
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe('LobbyClosedCard next lobby', () => {
  // Inside a lobby nothing pushes `debate.lobbies_changed`, so the list refetches itself at opens_at.
  it('swaps RSVP for Join once the next lobby opens', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const opensAt = new Date(Date.now() + 60_000).toISOString();
    api.listDebateLobbies
      .mockResolvedValueOnce({ lobbies: [summary({ opens_at: opensAt })] })
      .mockResolvedValue({ lobbies: [summary({ opens_at: opensAt, open: true })] });
    renderCard();
    expect(await screen.findByRole('button', { name: 'RSVP' })).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(55_000);
    });
    expect(api.listDebateLobbies).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_000);
    });
    expect(await screen.findByRole('link', { name: 'Join' })).toBeTruthy();
    expect(api.listDebateLobbies).toHaveBeenCalledTimes(2);
  });

  it('refetches the list on a 409 lobby_already_open and shows Join, not an error', async () => {
    api.listDebateLobbies
      .mockResolvedValueOnce({ lobbies: [summary({})] })
      .mockResolvedValue({ lobbies: [summary({ open: true })] });
    api.setDebateLobbyReminder.mockRejectedValue(
      new GeoChatRequestError('this lobby is open now; join it instead', 'lobby_already_open', 409)
    );
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'RSVP' }));
    expect(await screen.findByRole('link', { name: 'Join' })).toBeTruthy();
    expect(api.listDebateLobbies).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/join it instead|Try again/)).toBeNull();
  });

  it('still shows other reminder failures', async () => {
    api.listDebateLobbies.mockResolvedValue({ lobbies: [summary({})] });
    api.setDebateLobbyReminder.mockRejectedValue(new Error('network'));
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'RSVP' }));
    expect(await screen.findByText('Could not update your RSVP. Try again.')).toBeTruthy();
  });

  // The error belongs to the lobby asked about, not to whatever the refreshed list suggests next.
  describe('after a failed RSVP', () => {
    async function failOnA(opensAt: string) {
      api.setDebateLobbyReminder.mockRejectedValue(new Error('network'));
      renderCard();
      fireEvent.click(await screen.findByRole('button', { name: 'RSVP' }));
      expect(await screen.findByText('Could not update your RSVP. Try again.')).toBeTruthy();
      expect(api.listDebateLobbies).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(Date.parse(opensAt) - Date.now() + 2_000);
      });
    }

    it('drops the error once the refresh shows that lobby open', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const opensAt = new Date(Date.now() + 60_000).toISOString();
      api.listDebateLobbies
        .mockResolvedValueOnce({ lobbies: [summary({ opens_at: opensAt })] })
        .mockResolvedValue({ lobbies: [summary({ opens_at: opensAt, open: true })] });
      await failOnA(opensAt);

      expect(await screen.findByRole('link', { name: 'Join' })).toBeTruthy();
      expect(screen.queryByText('Could not update your RSVP. Try again.')).toBeNull();
    });

    it('drops the error when the refresh suggests another lobby', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const opensAt = new Date(Date.now() + 60_000).toISOString();
      api.listDebateLobbies
        .mockResolvedValueOnce({ lobbies: [summary({ opens_at: opensAt })] })
        .mockResolvedValue({ lobbies: [summary({ lobby_id: 'next2', name: 'Later hour' })] });
      await failOnA(opensAt);

      expect(await screen.findByText(/Later hour/)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'RSVP' })).toBeTruthy();
      expect(screen.queryByText('Could not update your RSVP. Try again.')).toBeNull();
    });
  });
});
