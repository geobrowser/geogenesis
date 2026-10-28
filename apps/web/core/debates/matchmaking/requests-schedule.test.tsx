import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type DebateHistoryItem,
  type DebateLobbyCalendarRow,
  type DebateLobbySummary,
  type DebateRequest,
  type DebateRequestParty,
  GeoChatRequestError,
  GeoChatSessionError,
} from '../api';
import { ResizeObserverStub, activeResizeObservers, fireResize } from '../resize-observer-fixtures';
import { EMPTY_SCHEDULED, historyItem, invite } from './requests-fixtures';
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
    loadMoreFailed: false,
    loadMore: vi.fn(),
  },
  pastDebates: [] as { entityId: string; spaceId: string; title: string; createdAtSec: number; debateClaim: null }[],
  pastDebatesEnabled: [] as boolean[],
  scheduled: null as unknown as ScheduledContent,
  requestsError: null as Error | null,
  requestsFailureReason: null as Error | null,
  requestsLoading: false,
  rejectChallenge: vi.fn(),
  rejectingChallenge: false,
  invalidateQueries: vi.fn(),
  block: vi.fn(),
  challenge: null as unknown,
  activeDebate: null as { id: string } | null,
  activeRematch: null as { id: string } | null,
  personalSpaceLoading: false,
  pastDebatesLoading: false,
  challengeError: null as Error | null,
  remind: vi.fn(),
  dismissal: { mutate: vi.fn() },
  /** Each lobby's dismissal failure, by id. */
  dismissalErrors: {} as Record<string, Error>,
  lobbyView: { data: undefined as unknown, refetch: vi.fn() },
  calendar: [] as DebateLobbyCalendarRow[],
  calendarRange: [] as [Date, Date][],
  calendarOptions: [] as unknown[],
  calendarLoading: false,
  calendarError: null as Error | null,
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
  usePersonalSpaceId: () =>
    mocks.personalSpaceLoading
      ? { personalSpaceId: null, isLoading: true }
      : { personalSpaceId: 'space-me', isLoading: false },
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
    return { rows: enabled ? mocks.pastDebates : [], isLoading: enabled && mocks.pastDebatesLoading };
  },
}));

vi.mock('../rooms/scheduling-hooks', () => ({
  useScheduledDebates: () => ({ data: { requests: mocks.scheduled.answerable } }),
  useCancelScheduledDebate: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
  useRespondToScheduledDebate: () => ({ mutateAsync: mocks.respond, isPending: false }),
}));

vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useDebateActivity: () => ({
    data: {
      challenge: mocks.challenge,
      debate: mocks.activeDebate,
      rematch: mocks.activeRematch,
      outbound_request: null,
    },
  }),
  useAcceptDebateChallenge: () => ({ mutate: vi.fn(), isPending: false, error: mocks.challengeError }),
  useRejectDebateChallenge: () => ({ mutate: mocks.rejectChallenge, isPending: mocks.rejectingChallenge }),
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'account-a', getPrivyIdentityToken: vi.fn() }),
}));

vi.mock('./hooks', () => ({
  useDebateRequests: () => ({
    data:
      mocks.requestsError || mocks.requestsLoading ? undefined : { incoming: mocks.incoming, outbound: mocks.outbound },
    isLoading: mocks.requestsLoading,
    error: mocks.requestsError,
    failureReason: mocks.requestsFailureReason ?? mocks.requestsError,
    refetch: vi.fn(),
  }),
  useBlockDebateUser: () => ({ mutate: mocks.block, isPending: false }),
  useAcceptDebateRequest: () => ({ mutate: mocks.accept, isPending: false }),
  useDismissDebateRequest: () => ({ mutate: mocks.dismiss, isPending: false }),
  useWithdrawDebateRequest: () => ({ mutate: mocks.withdraw, isPending: false }),
  useDebatePeople: () => ({ data: { people: [] } }),
}));

// Only the history refresh reads the client here, and only to invalidate.
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries, getQueryState: () => undefined }),
}));

// The lobby rows' writes have suites of their own (`lobbies/hooks.test.tsx`, and the real-hooks
// render); here it matters which write a press asks for.
vi.mock('../lobbies/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../lobbies/hooks')>()),
  useDebateLobbyDismissal: () => mocks.dismissal,
  useLobbyDismissalError: (lobbyId: string) => mocks.dismissalErrors[lobbyId] ?? null,
  useDebateLobbyCalendar: (from: Date, to: Date, _enabled: boolean, options: unknown) => {
    mocks.calendarRange.push([from, to]);
    mocks.calendarOptions.push(options);
    return {
      data: mocks.calendarLoading ? undefined : { lobbies: mocks.calendar },
      isLoading: mocks.calendarLoading,
      error: mocks.calendarError,
    };
  },
  useDebateLobby: () => mocks.lobbyView,
}));
vi.mock('../lobbies/lobby-host-lobbies', () => ({
  usePreOpenHosts: (lobby: { hosts?: unknown[] }) => lobby.hosts ?? [],
}));
vi.mock('../lobbies/lobby-reminder-press', () => ({
  useLobbyReminderPress: () => ({ reminded: false, pending: false, error: null, press: mocks.remind }),
}));

vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  getCurrentGeoChatUserId: () => 'user-me',
  resolveCurrentGeoChatUserId: () => Promise.resolve('user-me'),
}));

const { RequestsSchedule, buildEntries } = await import('./requests-schedule');
// The panel's one reading of the open ask (GEO-3463); the schedule reads it rather than asking again.
const { HubAskProvider } = await import('./hub-ask-context');
const render = (ui: import('react').ReactElement) => rtlRender(ui, { wrapper: HubAskProvider });

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

const box = (top: number, height = 0) =>
  ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

const restoreLayouts: (() => void)[] = [];

/**
 * A browser's layout for the timeline, in the panel's box: `clientHeight` tall, scrolling only as far
 * as its content, and clamping `scrollTop` to it as a browser does — when the content shrinks under
 * it too. The now-line sits `lineTop()` px down the content with `below` px of rows under it before
 * the spacer; a linked row, when there is one, at `focusedTop()`. Everything inside moves with the
 * scroll, and the pinned filter row is 52px tall at the top. Anything else measures 0.
 *
 * A container that stayed put while the line scrolled would be a layout no browser draws, and the
 * spacer and the pin would chase each other through it.
 */
function fakeScroller({
  lineTop = () => 600,
  below = 0,
  focusedTop,
  clientHeight: boxHeight = 800,
}: {
  lineTop?: () => number;
  below?: number;
  focusedTop?: () => number;
  /** The box's height, or a reading of it for a box that changes. */
  clientHeight?: number | (() => number);
} = {}) {
  const clientHeight = () => (typeof boxHeight === 'function' ? boxHeight() : boxHeight);
  let scrollTop = 0;
  let writes = 0;
  const scroller = document.createElement('div');
  scroller.setAttribute('data-debates-hub-scroll', '');
  const line = () => scroller.querySelector('[data-requests-now-line]');
  const spacer = () =>
    parseFloat(scroller.querySelector<HTMLElement>('[data-requests-spacer]')?.style.height ?? '') || 0;
  // With the timeline swapped out (an empty state), there is next to nothing to scroll.
  const contentHeight = () => (line() ? lineTop() + below + spacer() : 0);
  const maxScroll = () => Math.max(0, contentHeight() - clientHeight());
  Object.defineProperties(scroller, {
    clientHeight: { get: clientHeight },
    scrollTop: {
      get: () => (scrollTop = Math.min(scrollTop, maxScroll())),
      set: (value: number) => {
        writes += 1;
        scrollTop = Math.max(0, Math.min(value, maxScroll()));
      },
    },
  });
  document.body.appendChild(scroller);

  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (this === scroller) return box(0, clientHeight());
    const top = scroller.scrollTop;
    const nowLine = line();
    if (this.hasAttribute('data-requests-now-line')) return box(lineTop() - top);
    if (this.hasAttribute('data-hub-sticky-controls')) return box(0, 52);
    if (focusedTop && this.hasAttribute('data-focused')) return box(focusedTop() - top);
    if (nowLine && this.contains(nowLine)) return box(-top, contentHeight());
    return box(0);
  };
  restoreLayouts.push(() => {
    Element.prototype.getBoundingClientRect = original;
    scroller.remove();
  });

  return {
    scroller,
    render: (ui: import('react').ReactElement = <RequestsSchedule />) =>
      rtlRender(ui, { container: scroller, wrapper: HubAskProvider }),
    /** The viewer scrolling the box themselves: the input that ends the pin, then the scroll it makes. */
    scrollBy(delta: number) {
      fireEvent.wheel(scroller);
      scroller.scrollTop += delta;
      fireEvent.scroll(scroller);
    },
    /** Dragging the scrollbar, which in some browsers fires the scroll and no input event at all. */
    dragScrollbarBy(delta: number) {
      scroller.scrollTop += delta;
      fireEvent.scroll(scroller);
    },
    /** How many times anything has set `scrollTop`. */
    get writes() {
      return writes;
    },
  };
}

beforeEach(() => {
  mocks.incoming = [];
  mocks.outbound = null;
  mocks.scheduled = { ...EMPTY_SCHEDULED };
  mocks.history = {
    ...mocks.history,
    items: [],
    unavailable: false,
    isLoading: false,
    hasMore: false,
    loadingMore: false,
    loadMoreFailed: false,
  };
  mocks.history.loadMore.mockReset();
  mocks.pastDebates = [];
  mocks.pastDebatesEnabled = [];
  mocks.accept.mockReset();
  mocks.dismiss.mockReset();
  mocks.withdraw.mockReset();
  mocks.respond.mockReset().mockResolvedValue({ outcome: 'answered' });
  mocks.requestsError = null;
  mocks.requestsFailureReason = null;
  mocks.requestsLoading = false;
  mocks.rejectChallenge.mockReset();
  mocks.rejectingChallenge = false;
  mocks.invalidateQueries.mockReset();
  mocks.activeDebate = null;
  mocks.activeRematch = null;
  mocks.personalSpaceLoading = false;
  mocks.pastDebatesLoading = false;
  mocks.block.mockReset();
  mocks.challenge = null;
  mocks.challengeError = null;
  mocks.remind.mockReset();
  mocks.calendar = [];
  mocks.calendarRange = [];
  mocks.dismissal = { mutate: vi.fn() };
  mocks.dismissalErrors = {};
  mocks.calendarOptions = [];
  mocks.calendarLoading = false;
  mocks.calendarError = null;
});

afterEach(() => {
  cleanup();
  for (const restore of restoreLayouts.splice(0)) restore();
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

  // Rejecting a challenge is final: the requester's wait ends and their history says you declined.
  // "Not now" promised a later that does not exist.
  it('calls a challenge’s reject Dismiss, as its card does, and shows it under way', () => {
    mocks.challenge = {
      id: 'ch-1',
      status: 'pending',
      requester: party('user-them', 'Ana'),
      recipient: party('user-me', 'You'),
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    const view = render(<RequestsSchedule />);

    const item = screen.getByTestId('requests-incoming-challenge');
    expect(within(item).queryByRole('button', { name: 'Not now' })).not.toBeInTheDocument();
    const dismiss = within(item).getByRole('button', { name: 'Dismiss' });
    expect(dismiss).toHaveAttribute('data-geo-analytics-label', 'Debate hub Dismiss challenge');
    expect(within(item).getByRole('button', { name: 'Accept' })).toHaveAttribute(
      'data-geo-analytics-label',
      'Debate hub Accept challenge'
    );
    fireEvent.click(dismiss);
    expect(mocks.rejectChallenge).toHaveBeenCalledWith('ch-1');

    mocks.rejectingChallenge = true;
    view.rerender(<RequestsSchedule />);
    expect(within(screen.getByTestId('requests-incoming-challenge')).getByText('Dismissing…')).toBeInTheDocument();
  });

  // geo-chat says a challenge was answered or lapsed with `debate.activity_changed` alone, and the
  // viewer's debate ending reaches activity too; neither refreshes history from the gateway.
  it('refreshes the past when a challenge or the viewer’s debate leaves activity', () => {
    const challenge = {
      id: 'ch-1',
      status: 'pending',
      requester: party('user-them', 'Ana'),
      recipient: party('user-me', 'You'),
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    mocks.challenge = challenge;
    const view = render(<RequestsSchedule />);
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();

    // Arriving is not an ending.
    mocks.activeDebate = { id: 'd1' };
    view.rerender(<RequestsSchedule />);
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();

    mocks.challenge = null;
    view.rerender(<RequestsSchedule />);
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(1);
    // Joining a refetch already on its way, not restarting it: aborting one starves the list.
    expect(mocks.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ['debates', 'account', 'account-a', 'history'], refetchType: 'active' },
      { cancelRefetch: false }
    );

    mocks.activeDebate = null;
    view.rerender(<RequestsSchedule />);
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(2);
  });

  // A debate leaves activity at `thanking`, when geo-chat does not list it yet: it is complete, and in
  // history, only once the rematch session after it ends, about a minute later.
  it('refreshes the past again when the rematch after the viewer’s debate ends', () => {
    mocks.activeDebate = { id: 'd1' };
    const view = render(<RequestsSchedule />);

    mocks.activeDebate = null;
    mocks.activeRematch = { id: 'rematch-1' };
    view.rerender(<RequestsSchedule />);
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(1);

    mocks.activeRematch = null;
    view.rerender(<RequestsSchedule />);
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(2);
  });

  // The actions draw nothing for an invite that can't be taken back; handed in anyway, the row kept
  // an empty 8px wrapper for them.
  it('leaves no room for actions on a waiting invite that can’t be withdrawn', () => {
    mocks.scheduled = {
      ...EMPTY_SCHEDULED,
      answerable: [
        invite('s3', false, {
          invited_by_user_id: 'user-them',
          proposed_by_user_id: 'user-them',
          participants: [
            { user_id: 'user-me', accepted: null },
            { user_id: 'user-them', accepted: true },
          ],
        }),
      ],
    };
    render(<RequestsSchedule />);

    const row = screen.getByText(/Waiting on their answer/).closest('.items-start')!;
    expect(within(row as HTMLElement).queryByRole('button')).not.toBeInTheDocument();
    expect(row.querySelector('.mt-2')).toBeNull();
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
        historyItem({
          id: 'challenge:2',
          kind: 'challenge',
          direction: 'incoming',
          outcome: 'expired',
          other_user_ids: ['user-them'],
        }),
      ],
    };
    mocks.incoming = [liveRequest('r1', 'Upcoming claim')];
    render(<RequestsSchedule />);

    const rows = screen.getAllByTestId('requests-history');
    expect(rows).toHaveLength(2);
    expect(screen.getByText('Requested · people who disagree')).toBeInTheDocument();
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

  // geo-chat#299 sends a lobby it has no name for as "": no blank title, and no bare "in".
  it('says nothing about where for a lobby with no name', () => {
    mocks.history = {
      ...mocks.history,
      items: [
        historyItem({ lobby: { room_id: 'l1', name: '' } }),
        historyItem({ id: 'lobby:l2', kind: 'lobby', outcome: 'joined', lobby: { room_id: 'l2', name: '' } }),
      ],
    };
    render(<RequestsSchedule />);

    const rows = screen.getAllByTestId('requests-history');
    const request = rows.find(row => row.textContent?.includes('Stablecoins'))!;
    expect(request).toHaveTextContent('Stablecoins should be regulated · Nobody took it');
    expect(request).not.toHaveTextContent(' in ');
    expect(rows.find(row => row !== request)).toHaveTextContent('Debate lobby');
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

  // Today's production path: #299 not deployed, so history is `unavailable` at once and the graph's
  // stand-in, waiting on the viewer's space, is what is still loading the past.
  it('does not call the tab empty while the graph’s stand-in for the past is loading', async () => {
    const empty = () => screen.queryByText('Any debate requests you’ll receive will appear here.');
    mocks.history = { ...mocks.history, unavailable: true };
    mocks.personalSpaceLoading = true;
    const view = render(<RequestsSchedule />);
    expect(empty()).not.toBeInTheDocument();

    mocks.personalSpaceLoading = false;
    mocks.pastDebatesLoading = true;
    view.rerender(<RequestsSchedule />);
    expect(empty()).not.toBeInTheDocument();

    // Out of the skeleton, which animates away first.
    mocks.pastDebatesLoading = false;
    view.rerender(<RequestsSchedule />);
    expect(await screen.findByText('Any debate requests you’ll receive will appear here.')).toBeInTheDocument();
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

  // From inside a lobby, a plain click on the stand-in's Watch steps out first, as history's does.
  it('steps out of a lobby before the stand-in’s Watch navigates', async () => {
    const { registerLobbyStepOut } = await import('../lobbies/step-out');
    const stepOut = vi.fn(async () => undefined);
    const release = registerLobbyStepOut(stepOut);
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

    const watch = within(screen.getByTestId('requests-past-debate')).getByRole('link', { name: 'Watch' });
    const notPrevented = fireEvent.click(watch);
    release();

    expect(notPrevented).toBe(false);
    expect(stepOut).toHaveBeenCalledTimes(1);
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
          summary: null,
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
          summary: null,
        },
      ],
    };
    render(<RequestsSchedule />);

    const item = screen.getByTestId('requests-lobby');
    expect(within(item).getByText('Live')).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: 'Join' })).toBeInTheDocument();
  });

  describe('upcoming lobbies the viewer has not answered (GEO-3519)', () => {
    const HOST = { user_id: 'user-host', profile_space_id: 'space-host', display_name: 'Bryan', avatar_cid: null };
    // At a fixed local noon, so the rows' days and times are the same whenever the suite runs.
    const NOON = new Date(2026, 9, 27, 12, 0);
    const startsIn = (minutes: number) => new Date(NOON.getTime() + minutes * 60_000).toISOString();
    const listed = (
      id: string,
      minutes: number,
      overrides: Partial<DebateLobbyCalendarRow> = {}
    ): DebateLobbyCalendarRow => ({
      lobby_id: id,
      name: `Lobby ${id}`,
      scheduled: true,
      starts_at: startsIn(minutes),
      opens_at: startsIn(minutes - 10),
      open: false,
      hosts: [HOST],
      headcount: 0,
      avatars: [],
      debating_count: 0,
      reminder_count: 3,
      viewer_reminded: false,
      viewer_on_roster: false,
      state: 'upcoming',
      closed_at: null,
      ...overrides,
    });
    const offered = () => screen.queryAllByTestId('requests-unanswered-lobby');

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOON);
    });

    it('offers one at its start time, with its host, RSVP and Dismiss', () => {
      mocks.calendar = [listed('l1', 24 * 60)];
      render(<RequestsSchedule />);

      const [row] = offered();
      expect(row).toHaveTextContent('Lobby l1');
      expect(row).toHaveTextContent('Lobby · Hosted by Bryan');
      expect(row).toHaveTextContent(
        new Date(startsIn(24 * 60)).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      );
      expect(isAbove(nowLine(), row!)).toBe(true);

      fireEvent.click(within(row!).getByRole('button', { name: 'RSVP' }));
      expect(mocks.remind).toHaveBeenCalledTimes(1);
      fireEvent.click(within(row!).getByRole('button', { name: 'Dismiss' }));
      expect(mocks.dismissal.mutate).toHaveBeenCalledWith({ lobbyId: 'l1', dismissed: true });
    });

    // Uncapped, unlike the side panel's list: today's midnight to the one a week on. Kept drawn while
    // the next range loads, so the rows do not blink out when that range moves on at midnight.
    it('reads the week’s lobbies from the calendar range, keeping the last range while one loads', () => {
      render(<RequestsSchedule />);

      expect(mocks.calendarRange.at(-1)).toEqual([new Date(2026, 9, 27), new Date(2026, 10, 3)]);
      expect(mocks.calendarOptions.at(-1)).toEqual({ keepPreviousRange: true });
    });

    // A viewer whose only upcoming items are lobbies they have not answered would see "Any debate
    // requests…" and then the rows.
    it('does not call the tab empty while the week is loading', async () => {
      const empty = () => screen.queryByText('Any debate requests you’ll receive will appear here.');
      mocks.calendarLoading = true;
      const view = render(<RequestsSchedule />);
      expect(empty()).not.toBeInTheDocument();

      mocks.calendarLoading = false;
      view.rerender(<RequestsSchedule />);
      expect(await screen.findByText('Any debate requests you’ll receive will appear here.')).toBeInTheDocument();
    });

    it('says a failed week read with the other reads, rather than nothing', () => {
      mocks.calendarError = new Error('down');
      render(<RequestsSchedule />);

      expect(screen.getByText('Could not read this week’s lobbies: down')).toBeInTheDocument();
      expect(screen.queryByText('Any debate requests you’ll receive will appear here.')).not.toBeInTheDocument();
    });

    it('places it by day and time among the rest of the timeline', () => {
      mocks.scheduled = {
        ...EMPTY_SCHEDULED,
        answerable: [
          invite('nine', true, { startsInMinutes: 21 * 60 }),
          invite('eleven', false, { startsInMinutes: 23 * 60 }),
        ],
      };
      mocks.calendar = [listed('later', 2 * 24 * 60), listed('ten', 22 * 60)];
      render(<RequestsSchedule />);

      const [ten, later] = offered();
      expect(ten).toHaveTextContent('Lobby ten');
      expect(later).toHaveTextContent('Lobby later');
      // Tomorrow, between the 9 o'clock and 11 o'clock invites; the day after in its own section.
      const tomorrow = ten!.closest('section')!;
      const [nine, eleven] = [screen.getByText('Mia invited you'), screen.getByText('Invite to Mia')];
      expect(tomorrow).toContainElement(nine);
      expect(tomorrow).toContainElement(eleven);
      expect(isAbove(nine, ten!)).toBe(true);
      expect(isAbove(ten!, eleven)).toBe(true);
      expect(later!.closest('section')).not.toBe(tomorrow);
      expect(isAbove(eleven, later!)).toBe(true);
    });

    it('leaves out a lobby already on the timeline as one the viewer is going to', () => {
      mocks.scheduled = {
        ...EMPTY_SCHEDULED,
        lobbies: [
          {
            lobbyId: 'l1',
            name: 'Lobby l1',
            startsAt: startsIn(60),
            opensAt: startsIn(50),
            open: false,
            hosts: [HOST],
            hosting: false,
            onRoster: false,
            summary: null,
          },
        ],
      };
      mocks.calendar = [listed('l1', 60)];
      render(<RequestsSchedule />);

      expect(offered()).toHaveLength(0);
      expect(screen.getByTestId('requests-lobby')).toHaveTextContent('Lobby · Hosted by Bryan');
    });

    // Nobody is waiting on the answer: an offered lobby is not a request.
    it('neither counts toward Needs you nor shows under it', async () => {
      mocks.calendar = [listed('l1', 60)];
      render(<RequestsSchedule />);
      expect(offered()).toHaveLength(1);

      fireEvent.click(screen.getByRole('radio', { name: 'Needs you (0)' }));

      expect(await screen.findByText('Nothing needs your answer right now.')).toBeInTheDocument();
      await waitFor(() => expect(offered()).toHaveLength(0));
    });

    it('opens the lobby’s details from its name', () => {
      mocks.calendar = [listed('l1', 60)];
      render(<RequestsSchedule />);

      fireEvent.click(screen.getByRole('button', { name: 'Lobby l1, lobby details' }));

      const details = screen.getByRole('dialog', { name: 'Lobby details' });
      expect(details).toHaveTextContent('Hosted by Bryan');
      expect(within(details).getByRole('link', { name: 'Open lobby page' })).toHaveAttribute('href', '/debate/l1');
      fireEvent.click(within(details).getByRole('button', { name: 'RSVP' }));
      expect(mocks.remind).toHaveBeenCalledTimes(1);
    });

    // The write is held above the rows, so its failure is said on the row that comes back.
    it('says a dismissal that failed on its own row only', () => {
      mocks.dismissalErrors = { l1: new Error('down') };
      mocks.calendar = [listed('l1', 60), listed('l2', 120)];
      render(<RequestsSchedule />);

      const [first, second] = offered();
      expect(within(first!).getByRole('alert')).toHaveTextContent('Could not dismiss this lobby. Try again.');
      expect(within(second!).queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  // The design's landing: the now-line just under the filter row, whatever is above it. 26 Oct: with
  // nothing upcoming, the box cannot scroll that far until the spacer below the line has rendered, a
  // pass after the first anchor. It used to settle short, on past days.
  it('opens with the now-line just under the pinned filter row, once the spacer makes room', () => {
    mocks.history = { ...mocks.history, items: [historyItem()] };
    const layout = fakeScroller();
    layout.render();

    // 600 down, less the 52px filter row and the 8px gap under it.
    expect(layout.scroller.scrollTop).toBe(540);
  });

  // Chrome's scroll anchoring could move the box between the pin's writes and release it unseen.
  it('turns scroll anchoring off on the box while the timeline is in it', () => {
    mocks.history = { ...mocks.history, items: [historyItem()] };
    const layout = fakeScroller();
    const view = layout.render();
    expect(layout.scroller.style.getPropertyValue('overflow-anchor')).toBe('none');

    view.unmount();
    expect(layout.scroller.style.getPropertyValue('overflow-anchor')).toBe('');
  });

  it('lands on the now-line when the past arrives after the tab opened empty', async () => {
    // 27 Oct: nothing upcoming and no past yet is the empty state. When the past lands, the timeline
    // (the line with it) mounts only after that state animates out, after the effects have run.
    const layout = fakeScroller();
    const view = layout.render();
    expect(screen.queryByTestId('requests-history')).not.toBeInTheDocument();

    mocks.history = { ...mocks.history, items: [historyItem()] };
    view.rerender(<RequestsSchedule />);

    await waitFor(() => expect(screen.getByTestId('requests-history')).toBeInTheDocument());
    await waitFor(() => expect(layout.scroller.scrollTop).toBe(540));
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
        historyItem({
          id: 'debate:d1',
          kind: 'debate',
          direction: null,
          outcome: 'held',
          debate_id: 'd1',
          other_user_ids: ['user-them'],
        }),
        historyItem({ id: 'claim_request:r1', outcome: 'accepted', debate_id: 'd1', other_user_ids: ['user-them'] }),
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
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
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

  // Saying "Any debate requests…" under a failure contradicts it; over history still loading, it shows
  // for a moment and then swaps out for the timeline, taking the now-line with it.
  it('does not call the tab empty when a read failed or the past is still loading', () => {
    const empty = () => screen.queryByText('Any debate requests you’ll receive will appear here.');

    mocks.requestsError = new Error('geo-chat is down');
    const view = render(<RequestsSchedule />);
    expect(empty()).not.toBeInTheDocument();

    mocks.requestsError = null;
    mocks.scheduled = { ...EMPTY_SCHEDULED, roomsError: new Error('rooms are down') };
    view.rerender(<RequestsSchedule />);
    expect(screen.getByText('Could not read your upcoming debates: rooms are down')).toBeInTheDocument();
    expect(empty()).not.toBeInTheDocument();
    // There may well be something coming up: the failure says so, not "Nothing coming up".
    expect(screen.queryByTestId('requests-nothing-ahead')).not.toBeInTheDocument();

    mocks.scheduled = { ...EMPTY_SCHEDULED };
    mocks.history = { ...mocks.history, isLoading: true };
    view.rerender(<RequestsSchedule />);
    expect(empty()).not.toBeInTheDocument();
  });

  // The requests read landing first, empty, said "Any debate requests…" until an invite landed and
  // swapped it for the timeline: the line-remount path that has broken the anchor before.
  it('says nothing about an empty tab, or nothing coming up, while the scheduled reads load', async () => {
    mocks.scheduled = { ...EMPTY_SCHEDULED, loading: true };
    const view = render(<RequestsSchedule />);
    expect(screen.queryByText('Any debate requests you’ll receive will appear here.')).not.toBeInTheDocument();

    // With the past to show, the timeline is drawn, but nothing ahead is claimed until it is known.
    mocks.history = { ...mocks.history, items: [historyItem()] };
    view.rerender(<RequestsSchedule />);
    // In from the skeleton, which animates out first.
    expect(await screen.findByTestId('requests-history')).toBeInTheDocument();
    expect(screen.queryByTestId('requests-nothing-ahead')).not.toBeInTheDocument();

    mocks.scheduled = { ...EMPTY_SCHEDULED };
    view.rerender(<RequestsSchedule />);
    expect(screen.getByTestId('requests-nothing-ahead')).toBeInTheDocument();
  });

  it('does not say nothing is coming up over a failed requests read', () => {
    mocks.requestsError = new Error('geo-chat is down');
    mocks.history = { ...mocks.history, items: [historyItem()] };
    render(<RequestsSchedule />);

    expect(screen.getByTestId('requests-history')).toBeInTheDocument();
    expect(screen.queryByTestId('requests-nothing-ahead')).not.toBeInTheDocument();
  });

  // A new account's requests read is refused while geo-chat sets it up, and retried for a minute.
  // Until the retries are spent there is no `error`, only the failure behind the retry.
  it('says the account is being set up while its requests read is still being retried', () => {
    mocks.requestsLoading = true;
    mocks.requestsFailureReason = new GeoChatSessionError(new GeoChatRequestError('not yet', null, 401));
    mocks.history = { ...mocks.history, items: [historyItem()] };
    render(<RequestsSchedule />);

    expect(screen.getByText(/Setting up your account/)).toBeInTheDocument();
    // The rest of the timeline stays.
    expect(screen.getByTestId('requests-history')).toBeInTheDocument();
    expect(screen.queryByText('Any debate requests you’ll receive will appear here.')).not.toBeInTheDocument();
  });

  // The action row is one line that does not wrap. The confirm step's question and its two pills
  // squeezed into it beside Join and Reschedule, the question wrapping a word a line.
  it('opens Cancel’s confirm step under the action row, not in it', () => {
    const start = new Date(Date.now() + 86_400_000).toISOString();
    mocks.scheduled = {
      ...EMPTY_SCHEDULED,
      upcoming: [
        {
          room: {
            room_id: 'room-1',
            starts_at: start,
            opens_at: start,
            joinable: false,
            due: false,
            others_present: false,
            rematch_session_id: null,
          } as ScheduledContent['upcoming'][number]['room'],
          opponentUserId: 'user-them',
          scheduledEndAt: null,
          requestId: 'request-1',
        },
      ],
    };
    render(<RequestsSchedule />);

    const row = screen.getByRole('button', { name: 'Reschedule' }).parentElement!;
    fireEvent.click(within(row).getByRole('button', { name: 'Cancel' }));

    const question = screen.getByText(/^Cancel your debate with Mia\?/);
    expect(row).not.toContainElement(question);
    // The row keeps what it had, less Cancel, which the step under it now speaks for.
    expect(within(row).getByRole('button', { name: 'Reschedule' })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(row.nextElementSibling).toContainElement(question);
    expect(row.nextElementSibling).toContainElement(screen.getByRole('button', { name: 'Keep it' }));
  });

  // Today's date sits once, on its first section. With nothing of today above the line, that is below.
  // At a fixed local noon, so an invite a minute out is always today, whenever the suite runs.
  it('dates today below the line when nothing of today is above it', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 27, 12, 0));
    mocks.scheduled = { ...EMPTY_SCHEDULED, answerable: [invite('s1', true, { startsInMinutes: 1 })] };
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
      expect(screen.getByRole('button', { name })).toHaveClass('h-6.5', 'text-breadcrumb');
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
  // GEO-3431: a link followed while Requests is already open still lands on its request. The second
  // link's request sits further down than the first's: the spacer, sized for the first, kept the pin
  // from reaching it, and it was never focused.
  it('scrolls to and focuses a request a link asks for after the tab is open, further down', () => {
    mocks.scheduled = {
      ...EMPTY_SCHEDULED,
      answerable: [invite('s1', true), invite('s2', true, { startsInMinutes: 3 * 24 * 60 })],
    };
    // The line 600px down, s1 300px under it, s2 300px under that, and 100px of the list after.
    let focusedTop = 900;
    const layout = fakeScroller({ below: 700, focusedTop: () => focusedTop });
    const view = layout.render(<RequestsSchedule focusedRequestId="s1" />);
    expect(layout.scroller.scrollTop).toBe(840);

    focusedTop = 1200;
    view.rerender(<RequestsSchedule focusedRequestId="s2" />);

    // 1200 down, less the filter row and the gap.
    expect(layout.scroller.scrollTop).toBe(1140);
    const focused = document.activeElement as HTMLElement;
    expect(focused).toHaveAttribute('data-focused');
    expect(within(focused).getByText(/Debate · /)).toBeInTheDocument();
    expect(screen.getAllByText('Mia invited you')[1]!.closest('[data-focused]')).toBe(focused);
  });

  // The box getting taller with the content unchanged — the live strip going, a phone's URL bar
  // collapsing — clamped the scroll short of the line, and the observer only held what was left.
  it('keeps the line under the filter row when the box itself grows', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    mocks.history = { ...mocks.history, items: [historyItem()] };
    let height = 800;
    const layout = fakeScroller({ clientHeight: () => height });
    layout.render();
    expect(layout.scroller.scrollTop).toBe(540);

    height = 900;
    // Only the box's own observer: nothing inside it changed size.
    act(() => fireResize(layout.scroller));

    expect(layout.scroller.scrollTop).toBe(540);
  });

  // The reads can take a minute (a new account's requests are retried meanwhile) with the rows already
  // drawn. Landing then re-pinned the line, taking the scroll from a viewer who had moved into the past.
  it('leaves a viewer who scrolled before the reads landed where they are', () => {
    mocks.history = { ...mocks.history, items: [historyItem()] };
    mocks.scheduled = { ...EMPTY_SCHEDULED, loading: true };
    const layout = fakeScroller();
    const view = layout.render();
    expect(layout.scroller.scrollTop).toBe(0);

    layout.scrollBy(200);
    mocks.scheduled = { ...EMPTY_SCHEDULED };
    view.rerender(<RequestsSchedule />);

    expect(layout.scroller.scrollTop).toBe(200);
  });

  // Some browsers fire none of wheel, touch, pointer or key for a scrollbar drag: the scroll itself
  // is what says the viewer took over.
  it('lets go of the line when the viewer drags the scrollbar', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    mocks.history = { ...mocks.history, items: [historyItem()] };
    let lineTop = 600;
    const layout = fakeScroller({ lineTop: () => lineTop });
    layout.render();
    expect(layout.scroller.scrollTop).toBe(540);

    layout.dragScrollbarBy(-240);
    lineTop = 640;
    act(() => fireResize());

    // Held where they left it, 40px further for the row that grew above: not pinned back to 580.
    expect(layout.scroller.scrollTop).toBe(340);
  });

  // Before the anchor the top of a short list is always in view, and would page everything at once.
  it('keeps the sentinel off until the line has landed', () => {
    stubIntersecting();
    mocks.history = { ...mocks.history, items: [historyItem()], hasMore: true };
    mocks.scheduled = { ...EMPTY_SCHEDULED, loading: true };
    const view = render(
      <div data-debates-hub-scroll>
        <RequestsSchedule />
      </div>
    );
    expect(mocks.history.loadMore).not.toHaveBeenCalled();

    mocks.scheduled = { ...EMPTY_SCHEDULED };
    view.rerender(
      <div data-debates-hub-scroll>
        <RequestsSchedule />
      </div>
    );
    expect(mocks.history.loadMore).toHaveBeenCalled();
  });

  // The settle loop holds the line while an entrance animation carries it. A line that never stops
  // moving must not hold the box for ever: it gives up after its frame cap.
  it('stops settling the line after its frame cap', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    mocks.history = { ...mocks.history, items: [historyItem()] };
    let frame = 0;
    // 4px one frame, back the next, for as long as anyone looks.
    const layout = fakeScroller({ lineTop: () => 600 + (frame % 2) * 4 });
    layout.render();
    const before = layout.writes;

    act(() => {
      for (; frame < 200 && frames.length > 0; frame += 1) {
        for (const callback of frames.splice(0)) callback(frame * 16);
      }
    });

    // One write a frame while it chases the line, and none once the cap is reached.
    expect(layout.writes - before).toBeLessThanOrEqual(60);
    expect(layout.writes - before).toBeGreaterThan(10);
  });

  /** The observer whose content holds `node`: what a row above the line growing would fire. */
  const observerAround = (node: Element) =>
    activeResizeObservers().find(observer => [...observer.targets].some(target => target.contains(node)));

  // While pinned (the viewer has not touched the box), a change above the line re-pins it.
  it('keeps the now-line pinned under the filter row when something above it grows', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    mocks.history = { ...mocks.history, items: [historyItem()] };
    let lineTop = 600;
    const layout = fakeScroller({ lineTop: () => lineTop });
    layout.render();
    expect(layout.scroller.scrollTop).toBe(540);

    // A notice lands above the line and pushes it 40px down.
    lineTop = 640;
    act(() => fireResize());

    expect(layout.scroller.scrollTop).toBe(580);
  });

  // Once the viewer has scrolled, their place is what is kept: the line stays where they left it on
  // screen. Re-pinning would put it back under the filter row (580 here), not where they were (340).
  it('holds the viewer’s own place, not the pin, once they have scrolled', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    mocks.history = { ...mocks.history, items: [historyItem()] };
    let lineTop = 600;
    const layout = fakeScroller({ lineTop: () => lineTop });
    layout.render();
    expect(layout.scroller.scrollTop).toBe(540);

    // Up into the past: the line is now 300px down the box.
    layout.scrollBy(-240);
    expect(layout.scroller.scrollTop).toBe(300);

    lineTop = 640;
    act(() => fireResize());

    expect(layout.scroller.scrollTop).toBe(340);
  });

  // A past row can grow with no key changing: a name that resolves late and wraps, "Couldn't open
  // it" under Watch, a font arriving. The observer has to be watching the past for that to be held.
  it('holds the line when a past row grows without anything else changing', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    mocks.history = { ...mocks.history, items: [historyItem()] };
    let lineTop = 600;
    const layout = fakeScroller({ lineTop: () => lineTop });
    layout.render();

    const observer = observerAround(screen.getByTestId('requests-history'));
    expect(observer).toBeDefined();

    lineTop = 630;
    act(() => observer!.fire());

    expect(layout.scroller.scrollTop).toBe(570);
  });

  // A link from an email to an invite further down (GEO-3431). The spacer used to make room only for
  // the line, so the linked row sat past the end of the scroll and the anchor never landed: no focus,
  // no paging, no hold.
  it('lands on a linked request further down, with room made below it', () => {
    mocks.scheduled = { ...EMPTY_SCHEDULED, answerable: [invite('s1', true)] };
    // The line 600px down, the linked invite 300px under it, and 100px of the list after that.
    const layout = fakeScroller({ below: 400, focusedTop: () => 900 });
    layout.render(<RequestsSchedule focusedRequestId="s1" />);

    // 900 down, less the filter row and the gap.
    expect(layout.scroller.scrollTop).toBe(840);
    expect(document.activeElement).toBe(screen.getByText('Mia invited you').closest('[data-focused]'));
  });

  // The tab's and the empty state's `HubSwap` slide their content up 4px as it fades in. Pinned
  // mid-slide, the line ended 4px off once the slide finished, and nothing moved it back.
  it('ends on the line once an entrance animation has finished moving it', async () => {
    mocks.history = { ...mocks.history, items: [historyItem()] };
    let slide = 4;
    const layout = fakeScroller({ lineTop: () => 600 + slide });
    layout.render();
    expect(layout.scroller.scrollTop).toBe(544);

    slide = 0;

    await waitFor(() => expect(layout.scroller.scrollTop).toBe(540));
  });

  // 27 Oct's bug again, by another road: an empty "Needs you" swaps the timeline out, and "All" brings
  // it back only after the effects for the new rows have run. It landed at the top of the past.
  it('comes back to the now-line from an empty Needs you', async () => {
    mocks.history = { ...mocks.history, items: [historyItem()] };
    const layout = fakeScroller();
    layout.render();
    expect(layout.scroller.scrollTop).toBe(540);

    // Pressing a segment is the viewer's own input, which ends the pin.
    const press = (name: RegExp) => {
      const segment = screen.getByRole('radio', { name });
      fireEvent.pointerDown(segment);
      fireEvent.click(segment);
    };
    press(/Needs you/);
    await screen.findByText('Nothing needs your answer right now.');
    expect(layout.scroller.scrollTop).toBe(0);

    press(/^All$/);
    await screen.findByRole('separator', { name: 'Now' });

    // Held in the commit that brings the line back, before the first paint: not a frame later.
    expect(layout.scroller.scrollTop).toBe(540);
  });

  it('pages history in when the top comes into view', () => {
    stubIntersecting();
    mocks.history = { ...mocks.history, items: [historyItem()], hasMore: true };
    render(
      <div data-debates-hub-scroll>
        <RequestsSchedule />
      </div>
    );

    expect(mocks.history.loadMore).toHaveBeenCalled();
  });

  // #299 refuses a bad cursor with a 400, and an outage fails the same way. `hasMore` still says yes,
  // and the sentinel used to ask again at round-trip speed for as long as the top was in view.
  it('stops paging after a page fails, and offers the retry instead', () => {
    stubIntersecting();
    mocks.history = { ...mocks.history, items: [historyItem()], hasMore: true, loadMoreFailed: true };
    render(
      <div data-debates-hub-scroll>
        <RequestsSchedule />
      </div>
    );

    expect(mocks.history.loadMore).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Couldn’t load earlier · Try again');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.history.loadMore).toHaveBeenCalledTimes(1);
  });
});

/** An observer that reports everything it watches as in view at once, as the top of a short list is. */
function stubIntersecting() {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as never);
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
  );
}

describe('buildEntries', () => {
  const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
  const request = (id: string, minutes: number) => ({ ...liveRequest(id, id), created_at: at(minutes) });
  const room = (id: string, minutes: number) =>
    ({
      room: { room_id: id, starts_at: at(minutes), due: true, others_present: false },
      opponentUserId: null,
      scheduledEndAt: null,
      requestId: null,
    }) as unknown as ScheduledContent['upcoming'][number];
  const past = (id: string, minutes: number) => historyItem({ id, occurred_at: at(minutes) });
  const rotations = <T,>(list: T[]) => list.map((_, i) => [...list.slice(i), ...list.slice(0, i)]);

  // Placement first, then needs-you within Now, then time. Comparing needs-you only when both are
  // Now, and time otherwise, is not an order: it makes cycles, and the result then hangs on the input.
  it('orders by placement, then needs-you, then time, whatever order the sources arrive in', () => {
    const incoming = [request('r1', -5), request('r2', -12), request('r3', -2)];
    const rooms = [room('a', -10), room('b', -3), room('c', -7)];
    const history = [past('h1', -8), past('h2', -1), past('h3', -11), past('h4', -4)];
    for (const i of rotations(incoming)) {
      for (const r of rotations(rooms)) {
        for (const h of rotations(history)) {
          const keys = buildEntries({
            now: Date.now(),
            incoming: i,
            incomingChallenge: null,
            ask: null,
            scheduled: { answerable: [], upcoming: r, lobbies: [] },
            unansweredLobbies: [],
            history: h,
            pastDebates: [],
            render: {
              incoming: () => null,
              challenge: () => null,
              ask: () => null,
              invite: () => null,
              room: () => null,
              lobby: () => null,
              unansweredLobby: () => null,
              history: () => null,
              pastDebate: () => null,
            },
          }).map(entry => entry.key);
          expect(keys).toEqual([
            'history:h3',
            'history:h1',
            'history:h4',
            'history:h2',
            'request:r2',
            'request:r1',
            'request:r3',
            'room:a',
            'room:c',
            'room:b',
          ]);
        }
      }
    }
  });

  // GEO-3519. Offered, never asked: after Now whatever its time, by time among the rest, never Needs you.
  it('places an unanswered lobby as upcoming, by its start time, never as needing an answer', () => {
    const lobby = (id: string, minutes: number) => ({ lobby_id: id, starts_at: at(minutes) }) as DebateLobbySummary;
    const entries = buildEntries({
      now: Date.now(),
      incoming: [request('r1', -5)],
      incomingChallenge: null,
      ask: null,
      scheduled: { answerable: [invite('i1', true, { startsInMinutes: 90 })], upcoming: [], lobbies: [] },
      unansweredLobbies: [lobby('late', 120), lobby('early', 60), lobby('started', -1)],
      history: [],
      pastDebates: [],
      render: {
        incoming: () => null,
        challenge: () => null,
        ask: () => null,
        invite: () => null,
        room: () => null,
        lobby: () => null,
        unansweredLobby: () => null,
        history: () => null,
        pastDebate: () => null,
      },
    });

    expect(entries.map(entry => entry.key)).toEqual([
      'request:r1',
      'unanswered-lobby:started',
      'unanswered-lobby:early',
      'invite:i1',
      'unanswered-lobby:late',
    ]);
    expect(entries.filter(entry => entry.key.startsWith('unanswered-lobby:'))).toEqual(
      expect.arrayContaining([expect.objectContaining({ when: 'upcoming', needsYou: false })])
    );
    expect(entries.filter(entry => entry.needsYou).map(entry => entry.key)).toEqual(['request:r1', 'invite:i1']);
  });
});
