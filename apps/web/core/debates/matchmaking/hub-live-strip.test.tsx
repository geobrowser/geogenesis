import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyCalendarRow, DebateLobbySummary } from '../api';
import type { LobbyLineup } from '../lobbies/live-lobbies';
import { ResizeObserverStub } from '../resize-observer-fixtures';
import type { EndedAsk, OutgoingAsk } from './use-outgoing-ask';

const mocks = vi.hoisted(() => ({
  ask: null as OutgoingAsk | null,
  ended: null as EndedAsk | null,
  cancel: vi.fn(),
  dismissEnded: vi.fn(),
  close: vi.fn(),
  auth: { ready: true, authenticated: true },
  signIn: vi.fn(),
  queue: vi.fn(),
  mutate: vi.fn(),
  week: [] as DebateLobbyCalendarRow[],
  viewerId: 'viewer' as string | null,
  dismissed: [] as string[],
}));

vi.mock('./hub-ask-context', () => ({
  useHubAskState: () => ({
    ask: mocks.ask,
    ended: mocks.ended,
    cancel: mocks.cancel,
    cancelling: false,
    dismissEnded: mocks.dismissEnded,
  }),
}));
vi.mock('./use-outgoing-ask', () => ({
  useAskClock: () => ({ remainingMs: 72_000, label: '1:12' }),
}));
vi.mock('./use-debates-hub', () => ({ useDebatesHub: () => ({ close: mocks.close }) }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/explore',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => mocks.auth,
}));
// The press itself is real, so a signed-out RSVP is seen going through sign-in; what it calls is not.
vi.mock('../lobbies/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../lobbies/hooks')>()),
  useDebateLobbies: () => ({ data: undefined, isError: false, refetch: vi.fn() }),
  useDebateLobbyReminder: () => ({ mutate: mocks.mutate, mutateAsync: vi.fn(), isPending: false }),
  useLobbyReminderSaving: () => false,
  useLobbyReminderError: () => null,
  useDebateLobby: () => ({ data: undefined, refetch: vi.fn() }),
  useDebateLobbyCalendar: () => ({ data: { lobbies: mocks.week } }),
  useFindCalendarLobby: () => () => undefined,
}));
vi.mock('../use-current-geo-chat-user-id', () => ({ useCurrentGeoChatUserId: () => mocks.viewerId }));
// The browser's dismissals, without the storage under them.
vi.mock('~/core/hooks/use-dismissed-notice', async () => {
  const React = await import('react');
  return {
    useDismissedNotices: () => {
      const [, rerender] = React.useReducer((n: number) => n + 1, 0);
      return {
        isDismissed: (id: string) => mocks.dismissed.includes(id),
        remember: (ids: string[]) => {
          mocks.dismissed.push(...ids);
          rerender();
        },
      };
    },
  };
});
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.signIn }));
vi.mock('~/core/state/pending-actions', () => ({
  useQueuedAction: () => ({ intent: undefined, isQueued: false, queue: mocks.queue, cancel: vi.fn() }),
}));

const { HubLiveStrip, askShareLeft } = await import('./hub-live-strip');
// Real timers for the Going pause: Framer's frame loop, scheduled on fake ones, stalls every later
// test's exits once they are put back.
const { STACK_GOING_HOLD_MS } = await import('./use-stack-lobbies');

const CLAIM = {
  id: 'dc-1',
  space_id: 'space1',
  claim_entity_id: 'claim1',
  claim: 'Ranked-choice voting for federal elections',
  description: null,
};

function lobby(overrides: Partial<DebateLobbySummary> = {}): DebateLobbySummary {
  return {
    lobby_id: 'lobby1',
    name: 'NYC Debates',
    scheduled: false,
    starts_at: new Date().toISOString(),
    opens_at: new Date().toISOString(),
    open: true,
    hosts: [],
    headcount: 14,
    avatars: [],
    debating_count: 0,
    reminder_count: 0,
    viewer_reminded: false,
    viewer_on_roster: false,
    ...overrides,
  };
}

/** A lobby still to open in the calendar's week, two hours from now unless told otherwise. */
function upcoming(overrides: Partial<DebateLobbyCalendarRow> = {}): DebateLobbyCalendarRow {
  const startsAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
  return {
    ...lobby({ open: false, scheduled: true, starts_at: startsAt, opens_at: startsAt, headcount: 0 }),
    state: 'upcoming',
    closed_at: null,
    ...overrides,
  };
}

/** Noon, `days` local days from today. */
function inDays(days: number) {
  const at = new Date();
  at.setDate(at.getDate() + days);
  at.setHours(12, 0, 0, 0);
  return at.toISOString();
}

const EMPTY: LobbyLineup = { live: [], next: null };

/** The names of the edges under the top card, top first. */
function edgeNames() {
  return screen.queryAllByRole('button', { name: /^Show / }).map(edge => edge.getAttribute('aria-label'));
}

beforeEach(() => {
  // The stack eases its height, which needs one (react-use-measure).
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  mocks.ask = null;
  mocks.ended = null;
  mocks.auth = { ready: true, authenticated: true };
  mocks.week = [];
  mocks.viewerId = 'viewer';
  mocks.dismissed = [];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('HubLiveStrip', () => {
  it('draws nothing at all when there is nothing to say', () => {
    const { container } = render(<HubLiveStrip lineup={EMPTY} />);

    expect(container).toBeEmptyDOMElement();
  });

  // The full live card, not a one-line strip (Preston, 28 Oct).
  it('shows a live lobby as the live card, with Join', () => {
    render(<HubLiveStrip lineup={{ ...EMPTY, live: [lobby()] }} />);

    const card = within(screen.getByRole('region', { name: 'Live debate lobby' }));
    expect(card.getByRole('heading', { name: 'Live lobby' })).toBeInTheDocument();
    expect(card.getByText('NYC Debates')).toBeInTheDocument();
    expect(card.getByRole('link', { name: 'Join lobby' })).toHaveAttribute('href', '/debate/lobby1');
  });

  it('shows a signed-in viewer the Today’s claims callout, alone', () => {
    render(<HubLiveStrip lineup={EMPTY} todaysCallout={<section aria-label="Today’s claims" />} />);
    expect(screen.getByRole('region', { name: 'Today’s claims' })).toBeInTheDocument();
    expect(edgeNames()).toEqual([]);
  });

  // GEO-3586: the callouts as one stack, so an upcoming lobby no longer waits behind Today's claims.
  describe('the callout stack', () => {
    const callout = <section aria-label="Today’s claims" />;

    it('leads with the live lobby, then the soonest lobby, Today’s claims, then later lobbies', () => {
      mocks.week = [
        upcoming({ lobby_id: 'fri', name: 'Friday hot takes', starts_at: inDays(3) }),
        upcoming({ lobby_id: 'tonight', name: 'AI policy night' }),
      ];
      render(<HubLiveStrip lineup={{ ...EMPTY, live: [lobby()] }} todaysCallout={callout} />);

      expect(screen.getByTestId('lobby-spotlight')).toHaveTextContent('NYC Debates');
      // Two edges under the top card; the fourth waits out of sight.
      expect(edgeNames()).toEqual(['Show upcoming lobby AI policy night', 'Show Today’s claims']);
    });

    // GEO-3586 review: a card brought forward used to stay on top whatever arrived after it.
    it('puts the stack’s own first card back on top once the stack changes, so a new live lobby leads', async () => {
      mocks.week = [upcoming({ lobby_id: 'tonight', name: 'AI policy night' })];
      const { rerender } = render(<HubLiveStrip lineup={EMPTY} todaysCallout={callout} />);

      fireEvent.click(screen.getByRole('button', { name: 'Show Today’s claims' }));
      await waitFor(() => expect(screen.getByRole('region', { name: 'Today’s claims' })).toBeInTheDocument());

      rerender(<HubLiveStrip lineup={{ ...EMPTY, live: [lobby()] }} todaysCallout={callout} />);
      await waitFor(() => expect(screen.getByTestId('lobby-spotlight')).toBeInTheDocument());
      expect(edgeNames()).toEqual(['Show upcoming lobby AI policy night', 'Show Today’s claims']);
    });

    // GEO-3586 review: the pressed control left with its card, and focus fell to the page.
    it('hands focus to the card that comes up when a press takes the top one away', async () => {
      mocks.week = [upcoming({ lobby_id: 'tonight', name: 'AI policy night' })];
      render(<HubLiveStrip lineup={EMPTY} todaysCallout={callout} />);

      const dismiss = screen.getByRole('button', { name: 'Dismiss upcoming lobby' });
      dismiss.focus();
      fireEvent.click(dismiss);
      const next = await screen.findByRole('region', { name: 'Today’s claims' });
      // The card that came up, not the page: `body` would contain it too.
      await waitFor(() => {
        expect(document.activeElement).not.toBe(document.body);
        expect(document.activeElement).toContainElement(next);
      });
    });

    it('reads the top card before the edges under it, and gives the lowest edge a taller tap target', () => {
      mocks.week = [
        upcoming({ lobby_id: 'tonight', name: 'AI policy night' }),
        upcoming({ lobby_id: 'fri', name: 'Friday hot takes', starts_at: inDays(3) }),
      ];
      render(<HubLiveStrip lineup={EMPTY} todaysCallout={callout} />);

      const card = screen.getByRole('region', { name: 'Upcoming lobby' });
      const [first, last] = screen.getAllByRole('button', { name: /^Show / });
      expect(card.compareDocumentPosition(first!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(last).toHaveClass('after:h-2');
      expect(first).not.toHaveClass('after:h-2');
    });

    // GEO-3586 review: the card left 0.7 s after an RSVP made inside its details, taking them along.
    it('keeps a lobby’s details open after an RSVP made in them, and lets the card go once closed', async () => {
      {
        mocks.week = [upcoming({ lobby_id: 'tonight', name: 'AI policy night' })];
        const { rerender } = render(<HubLiveStrip lineup={EMPTY} todaysCallout={callout} />);
        fireEvent.click(screen.getByRole('button', { name: /AI policy night, lobby details/ }));
        expect(screen.getByRole('dialog', { name: 'Lobby details' })).toBeInTheDocument();

        mocks.week = [upcoming({ lobby_id: 'tonight', name: 'AI policy night', viewer_reminded: true })];
        rerender(<HubLiveStrip lineup={EMPTY} todaysCallout={callout} />);
        await act(() => new Promise(resolve => setTimeout(resolve, STACK_GOING_HOLD_MS + 100)));
        expect(screen.getByRole('dialog', { name: 'Lobby details' })).toBeInTheDocument();

        fireEvent.keyDown(screen.getByRole('dialog', { name: 'Lobby details' }), { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('region', { name: 'Upcoming lobby' })).not.toBeInTheDocument());
      }
    });

    // GEO-3586 Copilot: the stack's order coming back must not bring back a card brought forward
    // before it changed.
    it('forgets a card brought forward once the stack changes, even if it changes back', async () => {
      mocks.week = [upcoming({ lobby_id: 'tonight', name: 'AI policy night' })];
      const { rerender } = render(<HubLiveStrip lineup={EMPTY} todaysCallout={callout} />);
      fireEvent.click(screen.getByRole('button', { name: 'Show Today’s claims' }));
      await waitFor(() => expect(screen.getByRole('region', { name: 'Today’s claims' })).toBeInTheDocument());

      rerender(<HubLiveStrip lineup={{ ...EMPTY, live: [lobby()] }} todaysCallout={callout} />);
      await waitFor(() => expect(screen.getByTestId('lobby-spotlight')).toBeInTheDocument());
      rerender(<HubLiveStrip lineup={EMPTY} todaysCallout={callout} />);
      await waitFor(() => expect(screen.getByRole('region', { name: 'Upcoming lobby' })).toBeInTheDocument());
      expect(edgeNames()).toEqual(['Show Today’s claims']);
    });

    // GEO-3586 Copilot: a press that changed nothing left the stack ready to take focus, so a card
    // leaving long after (a lobby going live) pulled focus back from wherever the viewer was.
    it('takes no focus for a card that leaves long after a press in the stack', async () => {
      const now = vi.spyOn(Date, 'now');
      try {
        now.mockReturnValue(1_000_000);
        mocks.week = [upcoming({ lobby_id: 'tonight', name: 'AI policy night' })];
        const { rerender } = render(<HubLiveStrip lineup={EMPTY} todaysCallout={callout} />);
        fireEvent.click(screen.getByRole('region', { name: 'Upcoming lobby' }));

        now.mockReturnValue(1_000_000 + 60_000);
        rerender(<HubLiveStrip lineup={{ ...EMPTY, live: [lobby()] }} todaysCallout={callout} />);
        await waitFor(() => expect(screen.getByTestId('lobby-spotlight')).toBeInTheDocument());
        expect(document.activeElement).toBe(document.body);
      } finally {
        now.mockRestore();
      }
    });

    // GEO-3586 Copilot: the last card was dropped at once, with no exit, the tabs jumping up under it.
    it('lets the last card play its exit before the stack draws nothing', async () => {
      mocks.week = [upcoming({ lobby_id: 'tonight', name: 'AI policy night' })];
      const { container } = render(<HubLiveStrip lineup={EMPTY} />);

      fireEvent.click(screen.getByRole('button', { name: 'Dismiss upcoming lobby' }));
      expect(screen.getByRole('region', { name: 'Upcoming lobby' })).toBeInTheDocument();
      await waitFor(() => expect(container).toBeEmptyDOMElement());
    });

    // GEO-3586 review: focus followed a press only within 2 s, so a card sent on by an RSVP that took
    // a moment to land left focus on the page.
    it('hands focus on when an RSVP sends the focused card on, however long the RSVP took', async () => {
      const now = vi.spyOn(Date, 'now');
      try {
        now.mockReturnValue(1_000_000);
        mocks.week = [upcoming({ lobby_id: 'tonight', name: 'AI policy night' })];
        const { rerender } = render(<HubLiveStrip lineup={EMPTY} todaysCallout={callout} />);
        const rsvp = within(screen.getByRole('region', { name: 'Upcoming lobby' })).getByRole('button', {
          name: 'RSVP',
        });
        rsvp.focus();
        fireEvent.click(rsvp);

        now.mockReturnValue(1_000_000 + 5_000);
        mocks.week = [upcoming({ lobby_id: 'tonight', name: 'AI policy night', viewer_reminded: true })];
        rerender(<HubLiveStrip lineup={EMPTY} todaysCallout={callout} />);
        const next = await screen.findByRole('region', { name: 'Today’s claims' }, { timeout: 3000 });
        await waitFor(
          () => {
            expect(document.activeElement).not.toBe(document.body);
            expect(document.activeElement).toContainElement(next);
          },
          { timeout: 3000 }
        );
      } finally {
        now.mockRestore();
      }
    });

    it('hands focus to the card brought forward from its edge', async () => {
      mocks.week = [upcoming({ lobby_id: 'tonight', name: 'AI policy night' })];
      render(<HubLiveStrip lineup={EMPTY} todaysCallout={callout} />);

      const edge = screen.getByRole('button', { name: 'Show Today’s claims' });
      edge.focus();
      fireEvent.click(edge);
      const next = screen.getByRole('region', { name: 'Today’s claims' });
      await waitFor(() => {
        expect(document.activeElement).not.toBe(document.body);
        expect(document.activeElement).toContainElement(next);
      });
    });

    // GEO-3586 review: with the leaving card lifted out of the flow, the box eased to the next card's
    // height under it and the clip cut it off mid-slide.
    it('keeps the leaving card’s room until it has gone', async () => {
      const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(180);
      try {
        mocks.week = [upcoming({ lobby_id: 'tonight', name: 'AI policy night' })];
        render(<HubLiveStrip lineup={EMPTY} todaysCallout={callout} />);
        const box = () => screen.getByTestId('hub-callout-stack-room');
        // Held around the stack, not on it, so the edges under the new card don't stretch with it.
        const stack = () => screen.getByTestId('hub-callout-stack').querySelector<HTMLElement>('.relative')!;
        expect(box().style.minHeight).toBe('');

        fireEvent.click(screen.getByRole('button', { name: 'Dismiss upcoming lobby' }));
        expect(box().style.minHeight).toBe('180px');
        expect(stack().style.minHeight).toBe('');
        await waitFor(() => expect(box().style.minHeight).toBe(''));
      } finally {
        height.mockRestore();
      }
    });

    it('puts later lobbies after Today’s claims', () => {
      mocks.week = [
        upcoming({ lobby_id: 'fri', name: 'Friday hot takes', starts_at: inDays(3) }),
        upcoming({ lobby_id: 'tonight', name: 'AI policy night' }),
      ];
      render(<HubLiveStrip lineup={EMPTY} todaysCallout={callout} />);

      expect(screen.getByRole('region', { name: 'Upcoming lobby' })).toHaveTextContent('AI policy night');
      expect(edgeNames()).toEqual(['Show Today’s claims', 'Show upcoming lobby Friday hot takes']);
    });

    it('shows an upcoming lobby the viewer hasn’t answered, light, with its RSVP', () => {
      mocks.week = [upcoming({ lobby_id: 'tonight', name: 'AI policy night' })];
      render(<HubLiveStrip lineup={EMPTY} todaysCallout={callout} />);

      const card = screen.getByRole('region', { name: 'Upcoming lobby' });
      expect(card).toHaveClass('bg-white');
      expect(within(card).getByRole('heading', { name: 'Upcoming lobby' })).toBeInTheDocument();
      expect(card).toHaveTextContent('AI policy night');
      fireEvent.click(within(card).getByRole('button', { name: 'RSVP' }));
      expect(mocks.mutate).toHaveBeenCalledWith({ lobbyId: 'tonight', reminded: true });
      expect(edgeNames()).toEqual(['Show Today’s claims']);
    });

    it('leaves out lobbies RSVP’d to, hosted, dismissed in Requests, or more than a week out', () => {
      const me = { user_id: 'viewer', profile_space_id: 's', display_name: 'Me', avatar_cid: null };
      mocks.week = [
        upcoming({ lobby_id: 'going', viewer_reminded: true }),
        upcoming({ lobby_id: 'hosting', hosts: [me] }),
        upcoming({ lobby_id: 'dismissed', viewer_dismissed: true }),
        upcoming({ lobby_id: 'far', starts_at: inDays(9) }),
      ];
      const { container } = render(<HubLiveStrip lineup={EMPTY} />);

      expect(container).toBeEmptyDOMElement();
    });

    it('brings a card forward from its edge', async () => {
      mocks.week = [upcoming({ lobby_id: 'tonight', name: 'AI policy night' })];
      render(<HubLiveStrip lineup={EMPTY} todaysCallout={callout} />);

      fireEvent.click(screen.getByRole('button', { name: 'Show Today’s claims' }));
      expect(edgeNames()).toEqual(['Show upcoming lobby AI policy night']);
      await waitFor(() => expect(screen.getByRole('region', { name: 'Today’s claims' })).toBeInTheDocument());
    });

    it('takes a dismissed lobby out of the stack only, and the next card comes up', async () => {
      mocks.week = [upcoming({ lobby_id: 'tonight', name: 'AI policy night' })];
      render(<HubLiveStrip lineup={EMPTY} todaysCallout={callout} />);

      fireEvent.click(screen.getByRole('button', { name: 'Dismiss upcoming lobby' }));
      expect(mocks.dismissed).toEqual(['debatesPanelUpcomingLobby:tonight']);
      // Nothing written to geo-chat: the lobby stays on the Requests timeline.
      expect(mocks.mutate).not.toHaveBeenCalled();
      // The next card is drawn at once, underneath the one sliding off it.
      expect(screen.getByRole('region', { name: 'Today’s claims' })).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Upcoming lobby' })).not.toBeInTheDocument());
      expect(edgeNames()).toEqual([]);
    });

    it('dismisses the live lobbies on screen from the live card’s X', async () => {
      render(<HubLiveStrip lineup={{ ...EMPTY, live: [lobby()] }} todaysCallout={callout} />);

      fireEvent.click(screen.getByRole('button', { name: 'Dismiss live lobby' }));
      expect(mocks.dismissed).toEqual(['debatesPanelLiveLobby:lobby1']);
      await waitFor(() => expect(screen.queryByTestId('lobby-spotlight')).not.toBeInTheDocument());
      expect(screen.getByRole('region', { name: 'Today’s claims' })).toBeInTheDocument();
    });

    it('keeps a lobby up showing Going for a moment once RSVP’d, then lets it leave', async () => {
      {
        mocks.week = [upcoming({ lobby_id: 'tonight', name: 'AI policy night' })];
        const { rerender } = render(<HubLiveStrip lineup={EMPTY} todaysCallout={callout} />);

        mocks.week = [upcoming({ lobby_id: 'tonight', name: 'AI policy night', viewer_reminded: true })];
        rerender(<HubLiveStrip lineup={EMPTY} todaysCallout={callout} />);
        expect(screen.getByRole('region', { name: 'Upcoming lobby' })).toHaveTextContent('Going');

        await act(() => new Promise(resolve => setTimeout(resolve, STACK_GOING_HOLD_MS + 100)));
        await waitFor(() => expect(screen.queryByRole('region', { name: 'Upcoming lobby' })).not.toBeInTheDocument());
        expect(screen.getByRole('region', { name: 'Today’s claims' })).toBeInTheDocument();
      }
    });

    describe('signed out', () => {
      beforeEach(() => {
        mocks.auth = { ready: true, authenticated: false };
        mocks.viewerId = null;
      });

      it('offers the week’s lobbies, with RSVP queuing the sign-up', () => {
        mocks.week = [upcoming({ lobby_id: 'later', name: 'AI policy night' })];
        render(<HubLiveStrip lineup={EMPTY} />);

        const card = screen.getByRole('region', { name: 'Upcoming lobby' });
        fireEvent.click(within(card).getByRole('button', { name: 'RSVP' }));
        expect(mocks.queue).toHaveBeenCalledWith('later');
        expect(mocks.signIn).toHaveBeenCalledWith(
          expect.objectContaining({ auth_control: 'remind_lobby', target_id: 'later' }),
          expect.anything()
        );
        expect(mocks.mutate).not.toHaveBeenCalled();
      });

      it('leaves out lobbies more than a week out', () => {
        mocks.week = [upcoming({ lobby_id: 'far', starts_at: inDays(9) })];
        const { container } = render(<HubLiveStrip lineup={EMPTY} />);

        expect(container).toBeEmptyDOMElement();
      });

      // GEO-3586 review: the list and the week are polled apart signed out, so the week can still
      // call a lobby upcoming after the list has it live.
      it('shows a lobby the list has live only as the live card, even while the week says upcoming', () => {
        mocks.week = [upcoming({ lobby_id: 'lobby1', name: 'NYC Debates' })];
        render(<HubLiveStrip lineup={{ ...EMPTY, live: [lobby()] }} />);

        expect(screen.getByTestId('lobby-spotlight')).toHaveTextContent('NYC Debates');
        expect(screen.queryByRole('region', { name: 'Upcoming lobby' })).not.toBeInTheDocument();
        expect(edgeNames()).toEqual([]);
      });

      it('opens the lobby’s details from its name', () => {
        mocks.week = [upcoming({ lobby_id: 'later', name: 'AI policy night' })];
        render(<HubLiveStrip lineup={EMPTY} />);

        fireEvent.click(screen.getByRole('button', { name: /AI policy night, lobby details/ }));
        const details = screen.getByRole('dialog', { name: 'Lobby details' });
        expect(within(details).getByRole('link', { name: 'Open lobby page' })).toHaveAttribute('href', '/debate/later');
      });

      it('shows nothing while auth is still resolving, so a signed-in viewer never sees it flash', () => {
        mocks.auth = { ready: false, authenticated: false };
        mocks.week = [upcoming({ lobby_id: 'later' })];
        const { container } = render(<HubLiveStrip lineup={EMPTY} />);

        expect(container).toBeEmptyDOMElement();
      });
    });
  });

  it('puts your open request ahead of a live lobby, with the time left and Cancel', () => {
    mocks.ask = {
      kind: 'claim',
      id: 'req-1',
      claim: CLAIM,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 72_000).toISOString(),
    };
    render(<HubLiveStrip lineup={{ ...EMPTY, live: [lobby()] }} />);

    expect(screen.queryByTestId('lobby-spotlight')).not.toBeInTheDocument();
    const strip = screen.getByTestId('hub-strip-ask');
    expect(strip).toHaveTextContent('Requesting · people who disagree');
    expect(strip).toHaveTextContent(CLAIM.claim);
    expect(strip).toHaveTextContent('1:12');
    expect(strip).not.toHaveTextContent(/Asking/);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.cancel).toHaveBeenCalledTimes(1);
  });

  it('names the person a challenge went to', () => {
    mocks.ask = {
      kind: 'person',
      id: 'ch-1',
      recipientProfileSpaceId: 'person1',
      recipientName: 'Ana Ruiz',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 72_000).toISOString(),
    };
    render(<HubLiveStrip lineup={EMPTY} />);

    expect(screen.getByTestId('hub-strip-ask')).toHaveTextContent('Requesting Ana Ruiz');
  });

  it('says nobody took it once a claim request ends, and offers the calendar filtered to that claim', () => {
    mocks.ended = {
      kind: 'claim',
      id: 'req-1',
      claim: CLAIM,
      createdAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
    };
    render(<HubLiveStrip lineup={{ ...EMPTY, live: [lobby()] }} />);

    expect(screen.getByTestId('hub-strip-ended')).toHaveTextContent('Nobody took it this time');
    const schedule = screen.getByRole('link', { name: 'Schedule' });
    const params = new URL(schedule.getAttribute('href') ?? '', 'https://geo.local').searchParams;
    expect(params.get('claims')).toBe('space1:claim1');
    expect(params.get('from')).toBe('/explore');

    fireEvent.click(schedule);
    expect(mocks.dismissEnded).toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalled();
  });

  it('offers the person’s times once a challenge ends unanswered, and can be dismissed', () => {
    mocks.ended = {
      kind: 'person',
      id: 'ch-1',
      recipientProfileSpaceId: 'person1',
      recipientName: 'Ana Ruiz',
      createdAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
    };
    render(<HubLiveStrip lineup={EMPTY} />);

    expect(screen.getByTestId('hub-strip-ended')).toHaveTextContent('Ana Ruiz can’t right now');
    const params = new URL(
      screen.getByRole('link', { name: 'Schedule' }).getAttribute('href') ?? '',
      'https://geo.local'
    ).searchParams;
    expect(params.get('people')).toBe('person1');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(mocks.dismissEnded).toHaveBeenCalled();
  });
});

describe('askShareLeft', () => {
  // The bar is measured against the ask's own lifetime, so a 2-minute challenge and a 90 s claim
  // request both start full, whatever geo-chat's timeouts become.
  it('is the share of the ask’s own lifetime still left', () => {
    const ask = { createdAt: '2026-10-23T12:00:00.000Z', expiresAt: '2026-10-23T12:02:00.000Z' };
    expect(askShareLeft(ask, 120_000)).toBe(1);
    expect(askShareLeft(ask, 30_000)).toBe(0.25);
    expect(askShareLeft({ createdAt: ask.createdAt, expiresAt: '2026-10-23T12:01:30.000Z' }, 45_000)).toBe(0.5);
  });

  it('draws an empty bar rather than a broken one for unusable times', () => {
    expect(askShareLeft({ createdAt: 'nope', expiresAt: 'nope' }, 10_000)).toBe(0);
  });
});
