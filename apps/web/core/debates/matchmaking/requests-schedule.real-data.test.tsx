import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
    listDebateLobbies: () => Promise.resolve({ lobbies: [] }),
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
});
