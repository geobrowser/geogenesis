import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateHistoryItem, DebateRequest, DebateRequestParty, ScheduledDebateRequest } from '../api';
import type { ScheduledContent } from './scheduled-debates-section';

const mocks = vi.hoisted(() => ({
  incoming: [] as DebateRequest[],
  outbound: null as DebateRequest | null,
  accept: vi.fn(),
  dismiss: vi.fn(),
  withdraw: vi.fn(),
  respond: vi.fn(),
  history: {
    items: [] as DebateHistoryItem[],
    unavailable: false,
    isLoading: false,
    hasMore: false,
    loadingMore: false,
    loadMore: vi.fn(),
  },
  pastDebates: [] as { entityId: string; spaceId: string; title: string; createdAtSec: number; debateClaim: null }[],
  pastDebatesEnabled: [] as boolean[],
  scheduled: null as unknown as ScheduledContent,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/explore',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('~/partials/availability/peer-availability-booking-modal', () => ({
  PeerAvailabilityBookingModal: () => null,
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: 'space-me' }),
}));

vi.mock('./availability-request-notice', () => ({
  useAvailabilityRequests: () => [],
  AvailabilityRequestNotice: () => null,
}));

vi.mock('./use-geo-chat-user-summaries', () => ({
  useGeoChatUserSummaries: () => [
    { user_id: 'user-them', profile_space_id: 'p', display_name: 'Mia', avatar_cid: null },
  ],
}));

vi.mock('./scheduled-debates-section', async importOriginal => ({
  ...(await importOriginal<typeof import('./scheduled-debates-section')>()),
  useScheduledContent: () => mocks.scheduled,
}));

vi.mock('./request-history', async importOriginal => ({
  ...(await importOriginal<typeof import('./request-history')>()),
  useDebateHistory: () => mocks.history,
}));

vi.mock('../use-person-debates', () => ({
  usePersonDebates: (_spaceId: string, enabled: boolean) => {
    mocks.pastDebatesEnabled.push(enabled);
    return { rows: enabled ? mocks.pastDebates : [] };
  },
}));

vi.mock('../rooms/scheduling-hooks', () => ({
  useScheduledDebates: () => ({ data: { requests: mocks.scheduled.answerable } }),
  useCancelScheduledDebate: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
  useRespondToScheduledDebate: () => ({ mutateAsync: mocks.respond, isPending: false }),
}));

vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useDebateActivity: () => ({ data: { challenge: null, outbound_request: null } }),
  useAcceptDebateChallenge: () => ({ mutate: vi.fn(), isPending: false }),
  useRejectDebateChallenge: () => ({ mutate: vi.fn(), isPending: false }),
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'account-a', getPrivyIdentityToken: vi.fn() }),
}));

vi.mock('./hooks', () => ({
  useDebateRequests: () => ({
    data: { incoming: mocks.incoming, outbound: mocks.outbound },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useAcceptDebateRequest: () => ({ mutate: mocks.accept, isPending: false }),
  useDismissDebateRequest: () => ({ mutate: mocks.dismiss, isPending: false }),
  useWithdrawDebateRequest: () => ({ mutate: mocks.withdraw, isPending: false }),
  useDebatePeople: () => ({ data: { people: [] } }),
}));

vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  getCurrentGeoChatUserId: () => 'user-me',
  resolveCurrentGeoChatUserId: () => Promise.resolve('user-me'),
}));

const { RequestsSchedule } = await import('./requests-schedule');

const EMPTY_SCHEDULED: ScheduledContent = {
  answerable: [],
  upcoming: [],
  lobbies: [],
  people: [],
  requestsError: null,
  roomsError: null,
  lobbiesError: null,
  loading: false,
};

function party(userId: string, name: string): DebateRequestParty {
  return {
    user_id: userId,
    profile_space_id: `profile-${userId}`,
    display_name: name,
    avatar_cid: null,
    online: true,
    available_to_debate: true,
    in_debate: false,
    online_since: '2026-10-23T11:00:00.000Z',
    position: true,
    position_label: 'Yes',
  };
}

function liveRequest(id: string, claim: string, requester = party('user-them', 'Ana')): DebateRequest {
  return {
    id,
    status: 'pending',
    claim: { id: `row-${id}`, space_id: 'space-a', claim_entity_id: `entity-${id}`, claim, description: null },
    requester,
    recipient: party('user-me', 'You'),
    turn_format_id: null,
    created_at: new Date(Date.now() - 10_000).toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
}

function invite(id: string, mustAnswer: boolean): ScheduledDebateRequest {
  const start = Date.now() + 2 * 86_400_000;
  return {
    request_id: id,
    status: 'pending',
    scheduled_start_at: new Date(start).toISOString(),
    scheduled_end_at: new Date(start + 30 * 60_000).toISOString(),
    invited_by_user_id: mustAnswer ? 'user-them' : 'user-me',
    created_by_admin: false,
    proposed_by_user_id: mustAnswer ? 'user-them' : 'user-me',
    reschedule_count: 0,
    room_id: null,
    participants: [
      { user_id: 'user-me', accepted: mustAnswer ? null : true, responded_at: null },
      { user_id: 'user-them', accepted: mustAnswer ? true : null, responded_at: null },
    ] as unknown as ScheduledDebateRequest['participants'],
    viewer_must_answer: mustAnswer,
  };
}

function historyItem(overrides: Partial<DebateHistoryItem>): DebateHistoryItem {
  return {
    id: 'claim_request:1',
    kind: 'claim_request',
    occurred_at: new Date(Date.now() - 86_400_000).toISOString(),
    direction: 'outgoing',
    outcome: 'passed_by_everyone',
    other_user_ids: ['user-them'],
    claim: {
      id: 'c1',
      space_id: 's1',
      claim_entity_id: 'e1',
      claim: 'Stablecoins should be regulated',
      description: null,
    },
    debate_id: null,
    lobby: null,
    scheduled_start_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.incoming = [];
  mocks.outbound = null;
  mocks.scheduled = { ...EMPTY_SCHEDULED };
  mocks.history = { ...mocks.history, items: [], unavailable: false, hasMore: false };
  mocks.pastDebates = [];
  mocks.pastDebatesEnabled = [];
  mocks.accept.mockReset();
  mocks.dismiss.mockReset();
  mocks.withdraw.mockReset();
  mocks.respond.mockReset().mockResolvedValue({ outcome: 'answered' });
});

afterEach(cleanup);

const nowLine = () => screen.getByRole('separator', { name: 'Now' });
const isAbove = (node: Element, other: Element) =>
  Boolean(node.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('RequestsSchedule', () => {
  it('puts an incoming request under Now, marked as needing an answer, with Accept then Not now', () => {
    mocks.incoming = [liveRequest('r1', 'AI labs should publish their safety evaluations')];
    render(<RequestsSchedule />);

    const item = screen.getByTestId('requests-incoming');
    expect(within(item).getByText('Ana wants to debate now')).toBeInTheDocument();
    expect(within(item).getByText('Needs you')).toBeInTheDocument();
    expect(
      within(item).getByText(/AI labs should publish their safety evaluations · \d:\d\d left/)
    ).toBeInTheDocument();
    const buttons = within(item)
      .getAllByRole('button')
      .map(button => button.textContent);
    expect(buttons).toEqual(['Accept', 'Not now']);
    expect(isAbove(nowLine(), item)).toBe(true);
  });

  // Not now passes the request on to the next person, which is the card's old Dismiss.
  it('passes on a request with Not now', () => {
    mocks.incoming = [liveRequest('r1', 'A claim')];
    render(<RequestsSchedule />);

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(mocks.dismiss).toHaveBeenCalledWith({ requestId: 'r1' }, expect.anything());
  });

  it('offers Accept, Decline and Suggest a time on an invite, in that order, with no expiry line', () => {
    mocks.scheduled = { ...EMPTY_SCHEDULED, answerable: [invite('s1', true)] };
    render(<RequestsSchedule />);

    expect(screen.getByText('Mia invited you')).toBeInTheDocument();
    const item = screen.getByText('Mia invited you').closest('[data-needs-you]')!;
    expect(
      within(item as HTMLElement)
        .getAllByRole('button')
        .map(button => button.textContent)
    ).toEqual(['Accept', 'Decline', 'Suggest a time']);
    expect(screen.queryByText(/Expires at start/)).not.toBeInTheDocument();
    expect(isAbove(nowLine(), item)).toBe(true);
  });

  it('shows an invite the viewer sent as waiting on the other side', () => {
    mocks.scheduled = { ...EMPTY_SCHEDULED, answerable: [invite('s2', false)] };
    render(<RequestsSchedule />);

    expect(screen.getByText('Invite to Mia')).toBeInTheDocument();
    expect(screen.getByText(/Waiting on their answer/)).toBeInTheDocument();
    expect(screen.queryByText('Needs you')).not.toBeInTheDocument();
  });

  it('lists the viewer’s own open request with a countdown and Cancel', () => {
    mocks.outbound = { ...liveRequest('out-1', 'Ranked-choice voting'), requester: party('user-me', 'You') };
    render(<RequestsSchedule />);

    const item = screen.getByTestId('requests-outgoing');
    expect(within(item).getByText('Requesting · people who disagree')).toBeInTheDocument();
    fireEvent.click(within(item).getByRole('button', { name: 'Cancel' }));
    expect(mocks.withdraw).toHaveBeenCalledWith('out-1');
  });

  it('narrows to what needs an answer, with the same count as the badge', () => {
    mocks.incoming = [liveRequest('r1', 'First claim')];
    mocks.scheduled = { ...EMPTY_SCHEDULED, answerable: [invite('s1', true), invite('s2', false)] };
    render(<RequestsSchedule />);

    const needsYou = screen.getByRole('button', { name: 'Needs you (2)' });
    fireEvent.click(needsYou);

    expect(needsYou).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Mia invited you')).toBeInTheDocument();
    expect(screen.queryByText('Invite to Mia')).not.toBeInTheDocument();
  });

  it('puts history above the now-line, with how each item ended', () => {
    mocks.history = {
      ...mocks.history,
      items: [
        historyItem({}),
        historyItem({ id: 'challenge:2', kind: 'challenge', direction: 'incoming', outcome: 'expired' }),
      ],
    };
    mocks.incoming = [liveRequest('r1', 'Upcoming claim')];
    render(<RequestsSchedule />);

    const rows = screen.getAllByTestId('requests-history');
    expect(rows).toHaveLength(2);
    expect(screen.getByText('Stablecoins should be regulated · Nobody took it')).toBeInTheDocument();
    expect(screen.getByText('Mia asked you')).toBeInTheDocument();
    for (const row of rows) expect(isAbove(row, nowLine())).toBe(true);
  });

  // Pending and under-way items are already drawn from the live reads at their own time.
  it('leaves still-open history out', () => {
    mocks.history = {
      ...mocks.history,
      items: [historyItem({ id: 'scheduled_invite:3', kind: 'scheduled_invite', outcome: 'pending' })],
    };
    render(<RequestsSchedule />);

    expect(screen.queryByTestId('requests-history')).not.toBeInTheDocument();
  });

  it('falls back to the debates the viewer has had until history can answer', () => {
    mocks.history = { ...mocks.history, unavailable: true };
    mocks.pastDebates = [
      {
        entityId: 'debate-1',
        spaceId: 'space-a',
        title: 'Nuclear power debate',
        createdAtSec: Math.floor(Date.now() / 1000) - 86_400,
        debateClaim: null,
      },
    ];
    render(<RequestsSchedule />);

    expect(mocks.pastDebatesEnabled).toContain(true);
    expect(screen.getByTestId('requests-past-debate')).toHaveTextContent('Nuclear power debate');
  });

  it('does not ask the graph for past debates while history answers', () => {
    render(<RequestsSchedule />);
    expect(mocks.pastDebatesEnabled.every(enabled => !enabled)).toBe(true);
  });

  it('lists a lobby the viewer is going to at its time', () => {
    const start = new Date(Date.now() + 86_400_000).toISOString();
    mocks.scheduled = {
      ...EMPTY_SCHEDULED,
      lobbies: [
        {
          lobbyId: 'lobby-1',
          name: 'AI policy night',
          startsAt: start,
          opensAt: start,
          open: false,
          hosts: [],
          hosting: false,
          onRoster: false,
        },
      ],
    };
    render(<RequestsSchedule />);

    const item = screen.getByTestId('requests-lobby');
    expect(item).toHaveTextContent('AI policy night');
    expect(item).toHaveTextContent('Lobby · You’re going');
    expect(isAbove(nowLine(), item)).toBe(true);
  });

  it('shows a lobby that is open as Live, with Join', () => {
    const start = new Date(Date.now() - 60_000).toISOString();
    mocks.scheduled = {
      ...EMPTY_SCHEDULED,
      lobbies: [
        {
          lobbyId: 'lobby-2',
          name: 'NYC Debates',
          startsAt: start,
          opensAt: start,
          open: true,
          hosts: [],
          hosting: false,
          onRoster: false,
        },
      ],
    };
    render(<RequestsSchedule />);

    const item = screen.getByTestId('requests-lobby');
    expect(within(item).getByText('Live')).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: 'Join' })).toBeInTheDocument();
  });

  // The design's landing: the now-line just under the filter row, whatever is above it.
  it('opens with the now-line just under the pinned filter row', () => {
    mocks.history = { ...mocks.history, items: [historyItem({})] };
    const rect = (top: number, height = 0) => ({
      top,
      bottom: top + height,
      height,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: top,
      toJSON: () => ({}),
    });
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.hasAttribute('data-requests-now-line'))
        return rect(600 - (this.closest('[data-debates-hub-scroll]') as HTMLElement).scrollTop) as DOMRect;
      if (this.hasAttribute('data-hub-sticky-controls')) return rect(0, 52) as DOMRect;
      return rect(0) as DOMRect;
    };
    try {
      render(
        <div data-debates-hub-scroll>
          <RequestsSchedule />
        </div>
      );
      const scroller = document.querySelector('[data-debates-hub-scroll]') as HTMLElement;
      expect(scroller.scrollTop).toBe(548);
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });
});
