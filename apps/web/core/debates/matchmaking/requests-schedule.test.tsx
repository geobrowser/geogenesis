import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';

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
  requestsError: null as Error | null,
  block: vi.fn(),
  challenge: null as unknown,
  challengeError: null as Error | null,
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
  useDebateActivity: () => ({ data: { challenge: mocks.challenge, outbound_request: null } }),
  useAcceptDebateChallenge: () => ({ mutate: vi.fn(), isPending: false, error: mocks.challengeError }),
  useRejectDebateChallenge: () => ({ mutate: vi.fn(), isPending: false }),
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'account-a', getPrivyIdentityToken: vi.fn() }),
}));

vi.mock('./hooks', () => ({
  useDebateRequests: () => ({
    data: mocks.requestsError ? undefined : { incoming: mocks.incoming, outbound: mocks.outbound },
    isLoading: false,
    error: mocks.requestsError,
    refetch: vi.fn(),
  }),
  useBlockDebateUser: () => ({ mutate: mocks.block, isPending: false }),
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
// The panel's one reading of the open ask (GEO-3463); the schedule reads it rather than asking again.
const { HubAskProvider } = await import('./hub-ask-context');
const render = (ui: import('react').ReactElement) => rtlRender(ui, { wrapper: HubAskProvider });

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
  mocks.requestsError = null;
  mocks.block.mockReset();
  mocks.challenge = null;
  mocks.challengeError = null;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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
      .map(button => button.textContent || button.getAttribute('aria-label'));
    // The card's "…" comes along: Block and "I don't want to debate this claim".
    expect(buttons).toEqual(['Accept', 'Not now', 'More options']);
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

    // The Filters popover's segmented control: one radio group, equal centred segments.
    expect(screen.getByRole('radiogroup', { name: 'Show' })).toBeInTheDocument();
    const needsYou = screen.getByRole('radio', { name: 'Needs you (2)' });
    fireEvent.click(needsYou);

    expect(needsYou).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'false');
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

  it('says which lobby a request was made in', () => {
    mocks.history = {
      ...mocks.history,
      items: [historyItem({ lobby: { room_id: 'l1', name: 'NYC Debates' } })],
    };
    render(<RequestsSchedule />);

    expect(screen.getByTestId('requests-history')).toHaveTextContent(
      'Stablecoins should be regulated · in NYC Debates · Nobody took it'
    );
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

  // The section's rule: one failed read must not take the others' rows with it.
  it('keeps booked debates, invites and history on screen when the requests read fails', () => {
    mocks.requestsError = new Error('geo-chat is down');
    mocks.scheduled = { ...EMPTY_SCHEDULED, answerable: [invite('s1', true)] };
    mocks.history = { ...mocks.history, items: [historyItem({})] };
    render(<RequestsSchedule />);

    expect(screen.getByText('Mia invited you')).toBeInTheDocument();
    expect(screen.getByTestId('requests-history')).toBeInTheDocument();
  });

  // geo-chat gives every kind its own entry, so one debate would otherwise be listed twice.
  it('lists a debate once, not again as the request that led to it', () => {
    mocks.history = {
      ...mocks.history,
      items: [
        historyItem({ id: 'debate:d1', kind: 'debate', direction: null, outcome: 'held', debate_id: 'd1' }),
        historyItem({ id: 'claim_request:r1', outcome: 'accepted', debate_id: 'd1' }),
      ],
    };
    render(<RequestsSchedule />);

    const rows = screen.getAllByTestId('requests-history');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Debate with Mia');
    // Straight to the debate's page: history's claim names the space it lives under.
    expect(within(rows[0]).getByRole('link', { name: 'Watch' })).toHaveAttribute('href', '/space/s1/debates/d1');
  });

  it('leaves out history for an invite still open on the timeline', () => {
    mocks.scheduled = { ...EMPTY_SCHEDULED, answerable: [invite('s1', true)] };
    mocks.history = {
      ...mocks.history,
      items: [historyItem({ id: 'scheduled_invite:s1', kind: 'scheduled_invite', outcome: 'accepted' })],
    };
    render(<RequestsSchedule />);

    expect(screen.queryByTestId('requests-history')).not.toBeInTheDocument();
  });

  it('offers Watch only for a debate that happened', () => {
    mocks.history = {
      ...mocks.history,
      items: [
        historyItem({ id: 'debate:d2', kind: 'debate', direction: null, outcome: 'never_started', debate_id: 'd2' }),
      ],
    };
    render(<RequestsSchedule />);

    expect(within(screen.getByTestId('requests-history')).queryByText('Watch')).not.toBeInTheDocument();
  });

  // The latch is the buttons' own, keyed on the request's version: a moved time can be answered again.
  it('lets an invite be answered again once its time has been moved', async () => {
    mocks.scheduled = { ...EMPTY_SCHEDULED, answerable: [invite('s1', true)] };
    const view = render(<RequestsSchedule />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(mocks.respond).toHaveBeenCalledTimes(1));

    mocks.scheduled = { ...EMPTY_SCHEDULED, answerable: [{ ...invite('s1', true), reschedule_count: 1 }] };
    view.rerender(<RequestsSchedule />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(mocks.respond).toHaveBeenCalledTimes(2));
  });

  it('keeps Block requester in the incoming request’s menu', () => {
    // The menu is a Radix popper, which measures itself; jsdom ships no observer.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    mocks.incoming = [liveRequest('r1', 'A claim')];
    render(<RequestsSchedule />);

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block Ana' }));

    expect(mocks.block).toHaveBeenCalledWith('user-them');
  });

  it('keeps the request’s analytics series: Accept, and Dismiss for Not now', () => {
    mocks.incoming = [liveRequest('r1', 'A claim')];
    render(<RequestsSchedule />);

    expect(screen.getByRole('button', { name: 'Accept' })).toHaveAttribute(
      'data-geo-analytics-label',
      'Debate hub Accept'
    );
    expect(screen.getByRole('button', { name: 'Not now' })).toHaveAttribute(
      'data-geo-analytics-label',
      'Debate hub Dismiss'
    );
  });

  it('announces a challenge that failed to accept', () => {
    mocks.challenge = {
      id: 'ch-1',
      status: 'pending',
      requester: party('user-them', 'Ana'),
      recipient: party('user-me', 'You'),
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    mocks.challengeError = new Error('They are in a debate now');
    render(<RequestsSchedule />);

    expect(screen.getByRole('alert')).toHaveTextContent('They are in a debate now');
  });

  it('calls an arranged invite a debate with them, not an invitation from them', () => {
    mocks.scheduled = {
      ...EMPTY_SCHEDULED,
      answerable: [{ ...invite('s1', true), invited_by_user_id: null, created_by_admin: true }],
    };
    render(<RequestsSchedule />);

    expect(screen.queryByText('Mia invited you')).not.toBeInTheDocument();
    expect(screen.getByText('Debate with Mia')).toBeInTheDocument();
  });

  // Today's date sits once, on its first section. With nothing of today above the line, that is below.
  it('dates today below the line when nothing of today is above it', () => {
    const start = Date.now() + 60_000;
    if (new Date(start).toDateString() !== new Date().toDateString()) return;
    mocks.scheduled = {
      ...EMPTY_SCHEDULED,
      answerable: [
        {
          ...invite('s1', true),
          scheduled_start_at: new Date(start).toISOString(),
          scheduled_end_at: new Date(start + 30 * 60_000).toISOString(),
        },
      ],
    };
    render(<RequestsSchedule />);

    expect(screen.getByText('TODAY')).toBeInTheDocument();
  });
});

// Preston's notes on the build (GEO-3463), against the schedule board.
describe('RequestsSchedule against the board', () => {
  it('separates neighbouring Needs-you cards, whatever sits next to them', () => {
    mocks.incoming = [liveRequest('r1', 'First claim'), liveRequest('r2', 'Second claim', party('user-two', 'Ben'))];
    mocks.outbound = { ...liveRequest('out-1', 'My claim'), requester: party('user-me', 'You') };
    render(<RequestsSchedule />);

    const needs = screen.getAllByTestId('requests-incoming');
    const plain = screen.getByTestId('requests-outgoing');
    // All three share the Now group, whose items are spaced by the group, not by luck.
    for (const item of [...needs, plain]) {
      expect(item.parentElement).toHaveClass('gap-2');
      expect(item).toHaveClass('rounded-[10px]', 'p-2');
    }
    expect(needs[0].parentElement).toBe(plain.parentElement);
  });

  it('draws the board’s 26px, 14px action pills', () => {
    mocks.incoming = [liveRequest('r1', 'A claim')];
    mocks.scheduled = { ...EMPTY_SCHEDULED, answerable: [invite('s1', true)] };
    render(<RequestsSchedule />);

    for (const name of ['Not now', 'Decline', 'Suggest a time']) {
      expect(screen.getByRole('button', { name })).toHaveClass('h-[26px]', 'text-breadcrumb');
    }
  });

  it('dims past items as the board does, and labels Needs you in semibold purple', () => {
    mocks.incoming = [liveRequest('r1', 'A claim')];
    mocks.history = { ...mocks.history, items: [historyItem({})] };
    render(<RequestsSchedule />);

    expect(screen.getByTestId('requests-history')).toHaveClass('opacity-55');
    expect(within(screen.getByTestId('requests-incoming')).getByText('Needs you')).toHaveClass(
      'font-semibold',
      'text-purple'
    );
    expect(screen.getByText('NOW')).toHaveClass('text-green', 'font-semibold');
  });
});

describe('RequestsSchedule scrolling', () => {
  const rect = (top: number, height = 0) =>
    ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

  // GEO-3431: a link followed while Requests is already open still lands on its request.
  it('scrolls to and focuses a request a link asks for after the tab is open', () => {
    mocks.scheduled = { ...EMPTY_SCHEDULED, answerable: [invite('s1', true)] };
    const view = render(
      <div data-debates-hub-scroll>
        <RequestsSchedule />
      </div>
    );
    view.rerender(
      <div data-debates-hub-scroll>
        <RequestsSchedule focusedRequestId="s1" />
      </div>
    );

    expect(document.activeElement).toBe(screen.getByText('Mia invited you').closest('[data-focused]'));
  });

  it('holds the now-line still when something above it changes height', () => {
    mocks.history = { ...mocks.history, items: [historyItem({})] };
    let observed: (() => void) | null = null;
    const originalObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(callback: () => void) {
        observed = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    let lineTop = 600;
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.hasAttribute('data-requests-now-line')) {
        return rect(lineTop - (this.closest('[data-debates-hub-scroll]') as HTMLElement).scrollTop);
      }
      if (this.hasAttribute('data-hub-sticky-controls')) return rect(0, 52);
      return rect(0);
    };
    try {
      render(
        <div data-debates-hub-scroll>
          <RequestsSchedule />
        </div>
      );
      const scroller = document.querySelector('[data-debates-hub-scroll]') as HTMLElement;
      expect(scroller.scrollTop).toBe(548);

      // A notice lands above the line and pushes it 40px down.
      lineTop = 640;
      act(() => observed?.());

      expect(scroller.scrollTop).toBe(588);
    } finally {
      Element.prototype.getBoundingClientRect = original;
      globalThis.ResizeObserver = originalObserver;
    }
  });
});
