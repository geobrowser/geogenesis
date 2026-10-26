import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

function invite(id: string, startOffset: number, mine: boolean, overrides: Record<string, unknown> = {}) {
  return {
    request_id: id,
    status: 'pending',
    scheduled_start_at: iso(startOffset),
    scheduled_end_at: iso(startOffset + 30),
    invited_by_user_id: mine ? ME : THEM,
    created_by_admin: false,
    proposed_by_user_id: mine ? ME : THEM,
    reschedule_count: 0,
    room_id: null,
    participants: [
      { user_id: ME, accepted: mine ? true : null, responded_at: mine ? iso(-60) : null },
      { user_id: THEM, accepted: mine ? null : true, responded_at: mine ? null : iso(-60) },
    ],
    viewer_must_answer: !mine,
    ...overrides,
  };
}

const api = vi.hoisted(() => ({
  history404: true,
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
          invite('accepted-room', -43, true, {
            status: 'accepted',
            room_id: 'room-1',
            viewer_must_answer: false,
            participants: [
              { user_id: ME, accepted: true, responded_at: iso(-120) },
              { user_id: THEM, accepted: true, responded_at: iso(-110) },
            ],
          }),
          invite('mine-pending', 30, true),
          invite('theirs-a', 3 * 24 * 60, false),
          invite('theirs-b', 3 * 24 * 60, false),
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
        : Promise.resolve({ items: [], next_cursor: null }),
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

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
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

afterEach(cleanup);

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
});
