import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyCalendarRow, DebateLobbySummary } from '../api';
import { ResizeObserverStub } from '../resize-observer-fixtures';
import { historyItem, invite } from './requests-fixtures';

/**
 * The Requests timeline over geo-chat-shaped responses, with only the network stubbed (26 Oct).
 *
 * `requests-schedule.test.tsx` mocks the content and history hooks wholesale, which is how a crash
 * in the real hooks reached the preview unseen. This renders the state from that report: a room open
 * now, an invite the viewer sent, two invites waiting on them, and no history endpoint (geo-chat#299
 * not deployed), so the past-debates fallback is on.
 */

const now = Date.now();
const iso = (offsetMinutes: number) => new Date(now + offsetMinutes * 60_000).toISOString();
const ME = 'user-me';
const THEM = 'user-them';

const api = vi.hoisted(() => ({
  // Until geo-chat#299 deploys, the history route is a 404; flipped for the case after it has.
  history404: true,
  history: [] as unknown[],
  // Lobbies as geo-chat holds them, for the side panel's list and the calendar range alike: the
  // RSVP and dismissal writes change them.
  lobbies: [] as DebateLobbyCalendarRow[],
  /** The side panel's list where it differs from the week: it caps upcoming lobbies, the week does not. */
  listed: null as DebateLobbyCalendarRow[] | null,
  setDebateLobbyReminder: vi.fn(),
  setDebateLobbyDismissal: vi.fn(),
}));

vi.mock('../api', async importOriginal => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getCurrentGeoChatUserId: () => ME,
    resolveCurrentGeoChatUserId: () => Promise.resolve(ME),
    getServerTime: () => Promise.resolve({ server_time_ms: Date.now() }),
    getDebateActivity: () =>
      Promise.resolve({
        online: true,
        available_to_debate: false,
        cooldown_until: null,
        match: null,
        debate: null,
        rematch: null,
        challenge: null,
        outbound_request: null,
        incoming_request_count: 0,
        scheduled_awaiting_answer_count: 2,
      }),
    listDebateRequests: () => Promise.resolve({ outbound: null, incoming: [] }),
    listScheduledDebates: () =>
      Promise.resolve({
        requests: [
          invite('accepted-room', false, {
            startsInMinutes: -43,
            status: 'accepted',
            room_id: 'room-1',
            viewer_must_answer: false,
            participants: [
              { user_id: ME, accepted: true },
              { user_id: THEM, accepted: true },
            ],
          }),
          invite('mine-pending', false, { startsInMinutes: 30 }),
          invite('theirs-a', true, { startsInMinutes: 3 * 24 * 60 }),
          invite('theirs-b', true, { startsInMinutes: 3 * 24 * 60 }),
        ],
        availability_requests: [],
      }),
    listUpcomingDebateRooms: () =>
      Promise.resolve({
        rooms: [
          {
            room_id: 'room-1',
            starts_at: iso(-43),
            opens_at: iso(-48),
            joinable: true,
            due: true,
            others_present: true,
            others_live: true,
            rematch_session_id: null,
            kind: 'debate',
          },
        ],
      }),
    listDebateLobbies: () => Promise.resolve({ lobbies: api.listed ?? api.lobbies }),
    // The details' own read; the list row stands in for it.
    getDebateLobby: () => new Promise(() => undefined),
    listDebateLobbyCalendar: () => Promise.resolve({ lobbies: api.lobbies }),
    setDebateLobbyReminder: api.setDebateLobbyReminder,
    setDebateLobbyDismissal: api.setDebateLobbyDismissal,
    listDebateHistory: () =>
      api.history404
        ? Promise.reject(new actual.GeoChatRequestError('Not found', null, 404))
        : Promise.resolve({ items: api.history, next_cursor: null }),
  };
});

vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => ({
    ready: true,
    authenticated: true,
    accountKey: 'account-me',
    getPrivyIdentityToken: () => Promise.resolve('token'),
  }),
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: 'space-me', isLoading: false }),
}));

// The two graph reads: who the participants are, and the viewer's past debates.
vi.mock('./use-geo-chat-user-summaries', () => ({
  useGeoChatUserSummaries: () => [
    { user_id: THEM, profile_space_id: 'space-them', display_name: 'Johnathon', avatar_cid: null },
  ],
}));
vi.mock('../use-person-debates', () => ({
  usePersonDebates: (_spaceId: string, enabled: boolean) => ({
    rows: enabled
      ? [
          {
            entityId: 'debate-old',
            spaceId: 'space-a',
            title: 'An older debate',
            createdAtSec: now / 1000 - 86_400,
            debateClaim: null,
          },
        ]
      : [],
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/explore',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => vi.fn() }));

vi.mock('~/partials/availability/peer-availability-booking-modal', () => ({
  PeerAvailabilityBookingModal: () => null,
}));

const { RequestsSchedule } = await import('./requests-schedule');
const { HubAskProvider } = await import('./hub-ask-context');

vi.stubGlobal('ResizeObserver', ResizeObserverStub);
vi.stubGlobal(
  'IntersectionObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
);

afterEach(() => {
  cleanup();
  api.history404 = true;
  api.history = [];
  api.lobbies = [];
  api.listed = null;
  api.setDebateLobbyReminder.mockReset();
  api.setDebateLobbyDismissal.mockReset();
});

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <Provider store={createStore()}>
      <QueryClientProvider client={client}>
        <HubAskProvider>
          <RequestsSchedule focusedRequestId={null} />
        </HubAskProvider>
      </QueryClientProvider>
    </Provider>
  );
}

describe('the Requests timeline over real hooks', () => {
  it('draws the preview report’s state without falling over', async () => {
    renderTab();

    expect(await screen.findByText('Debate with Johnathon', {}, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('Johnathon invited you')).toHaveLength(2));
    expect(screen.getByText('Invite to Johnathon')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Needs you (2)' })).toBeInTheDocument();
    // History is a 404 until geo-chat#299 deploys: the past is the viewer's debates, not an error.
    expect(screen.getByText('An older debate')).toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong/)).not.toBeInTheDocument();
  });

  // Once geo-chat#299 is deployed: the past is geo-chat's own history, and the graph is not asked.
  it('draws geo-chat’s history above the line once the route answers, and not the stand-in', async () => {
    api.history404 = false;
    api.history = [historyItem({ occurred_at: iso(-24 * 60) })];
    renderTab();

    const row = await screen.findByTestId('requests-history', {}, { timeout: 3000 });
    expect(row).toHaveTextContent('Requested · people who disagree');
    expect(row).toHaveTextContent('Stablecoins should be regulated · Nobody took it');
    expect(screen.queryByText('An older debate')).not.toBeInTheDocument();
  });

  describe('an upcoming lobby the viewer has not answered (GEO-3519)', () => {
    const tomorrow = iso(24 * 60);
    const offered: DebateLobbyCalendarRow = {
      lobby_id: 'lobby-1',
      name: 'AI policy night',
      scheduled: true,
      starts_at: tomorrow,
      opens_at: tomorrow,
      open: false,
      hosts: [{ user_id: 'user-host', profile_space_id: 'space-host', display_name: 'Bryan', avatar_cid: null }],
      headcount: 0,
      avatars: [],
      debating_count: 0,
      reminder_count: 2,
      viewer_reminded: false,
      viewer_dismissed: false,
      viewer_on_roster: false,
      state: 'upcoming',
      closed_at: null,
    };
    /** The lobby view geo-chat answers a write with. */
    const viewOf = (lobby: DebateLobbySummary) => ({
      lobby_id: lobby.lobby_id,
      name: lobby.name,
      access: { status: 'not_yet_open', opens_at: lobby.opens_at },
      starts_at: lobby.starts_at,
      opens_at: lobby.opens_at,
      scheduled: true,
      created_by: 'user-host',
      acting_host_id: null,
      hosts_changed_at: null,
      reminder_count: lobby.reminder_count,
      members: [],
      viewer: {
        role: null,
        creator: false,
        hosting: false,
        reminded: lobby.viewer_reminded,
        voice_away_at: null,
        connected: false,
        stepped_out: false,
      },
    });

    // `/me/debate-rooms` does not list it yet: that read hears of an RSVP only when geo-chat's
    // event comes round. The row turns into the going row from the week's own answer, and the capped
    // list need not hold it: a creator's third lobby in the week, say.
    it('turns into a lobby the viewer is going to once they RSVP, one the list left out included', async () => {
      api.lobbies = [offered];
      api.listed = [];
      api.setDebateLobbyReminder.mockImplementation(async () => {
        api.lobbies = [{ ...offered, viewer_reminded: true, reminder_count: 3 }];
        return viewOf(api.lobbies[0]!);
      });
      renderTab();

      const row = await screen.findByTestId('requests-unanswered-lobby', {}, { timeout: 3000 });
      fireEvent.click(within(row).getByRole('button', { name: 'RSVP' }));

      const going = await screen.findByTestId('requests-lobby');
      expect(going).toHaveTextContent('AI policy night');
      expect(going).toHaveTextContent('Lobby · Hosted by Bryan');
      expect(screen.queryByTestId('requests-unanswered-lobby')).not.toBeInTheDocument();
      expect(api.setDebateLobbyReminder).toHaveBeenCalledWith('lobby-1', true, expect.anything(), 'account-me');
    });

    // An RSVP inside the details swaps the offered row for a going one; the details stay open on it.
    it('keeps the details open on the going row after an RSVP inside them', async () => {
      api.lobbies = [offered];
      api.setDebateLobbyReminder.mockImplementation(async () => {
        api.lobbies = [{ ...offered, viewer_reminded: true, reminder_count: 3 }];
        return viewOf(api.lobbies[0]!);
      });
      renderTab();

      fireEvent.click(await screen.findByRole('button', { name: 'AI policy night, lobby details' }, { timeout: 3000 }));
      const before = screen.getByRole('dialog', { name: 'Lobby details' });
      fireEvent.click(within(before).getByRole('button', { name: 'RSVP' }));

      await screen.findByTestId('requests-lobby');
      expect(screen.queryByTestId('requests-unanswered-lobby')).not.toBeInTheDocument();
      const details = screen.getByRole('dialog', { name: 'Lobby details' });
      expect(within(details).getByRole('button', { name: 'Going' })).toHaveAttribute('aria-pressed', 'true');
      await waitFor(() => expect(details).toContainElement(document.activeElement as HTMLElement));
    });

    it('leaves on Dismiss at once, and stays gone once geo-chat has it', async () => {
      api.lobbies = [offered];
      let settle: () => void = () => undefined;
      api.setDebateLobbyDismissal.mockImplementation(
        () =>
          new Promise(done => {
            settle = () => {
              api.lobbies = [{ ...offered, viewer_dismissed: true }];
              done(viewOf(offered));
            };
          })
      );
      renderTab();

      const row = await screen.findByTestId('requests-unanswered-lobby', {}, { timeout: 3000 });
      fireEvent.click(within(row).getByRole('button', { name: 'Dismiss' }));

      await waitFor(() => expect(screen.queryByTestId('requests-unanswered-lobby')).not.toBeInTheDocument());
      expect(api.setDebateLobbyDismissal).toHaveBeenCalledWith('lobby-1', true, expect.anything(), 'account-me');

      await act(async () => settle());
      // The refetch the write starts, which now carries the dismissal.
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(screen.queryByTestId('requests-unanswered-lobby')).not.toBeInTheDocument();
    });

    it('comes back with the failure said on it when the dismissal does not save', async () => {
      api.lobbies = [offered];
      let fail: () => void = () => undefined;
      api.setDebateLobbyDismissal.mockImplementation(
        () => new Promise((_, reject) => (fail = () => reject(new Error('down'))))
      );
      renderTab();

      const row = await screen.findByTestId('requests-unanswered-lobby', {}, { timeout: 3000 });
      fireEvent.click(within(row).getByRole('button', { name: 'Dismiss' }));
      await waitFor(() => expect(screen.queryByTestId('requests-unanswered-lobby')).not.toBeInTheDocument());

      await act(async () => fail());

      const back = await screen.findByTestId('requests-unanswered-lobby');
      expect(within(back).getByRole('alert')).toHaveTextContent('Could not dismiss this lobby. Try again.');
    });
  });
});
