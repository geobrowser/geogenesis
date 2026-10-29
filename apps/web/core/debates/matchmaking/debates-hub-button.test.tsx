import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type { ComponentProps } from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebatesHubButton } from './debates-hub-button';
import { debatesHubAtom } from '~/atoms';

const mocks = vi.hoisted(() => ({
  ready: true,
  authenticated: true,
  incomingRequestCount: 0,
  scheduledAwaitingAnswerCount: undefined as number | undefined,
}));

const lineup = vi.hoisted(() => ({ live: [] as { lobby_id: string; headcount: number }[] }));
const replay = vi.hoisted(() => vi.fn());
// GEO-3289. A reminder queued before sign-up replays from here.
vi.mock('../lobbies/lobby-reminder-press', () => ({ useLobbyReminderReplay: replay }));
// GEO-3268's lineup reads the lobby list and holds the matchmaking scope.
vi.mock('../lobbies/live-lobbies', () => ({ useLobbyLineup: () => ({ live: lineup.live, soon: null, later: [] }) }));
vi.mock('../lobbies/live-lobbies-preview', () => ({
  LiveLobbiesPreview: ({ children }: { children: unknown }) => children,
}));

vi.mock('../hooks', () => ({
  // The set-schedule banner reads the saved calendar; these keep the mock complete rather than
  // exercising it — the schedule itself is covered in core/availability.
  useDebateSchedule: () => ({ blocks: [], isSet: false }),
  useSaveDebateSchedule: () => ({ mutate: vi.fn(), isPending: false }),
  useGeoChatAuth: () => ({ ready: mocks.ready, authenticated: mocks.authenticated, accountKey: 'user-a' }),
  useDebateActivity: () => ({
    data: {
      incoming_request_count: mocks.incomingRequestCount,
      scheduled_awaiting_answer_count: mocks.scheduledAwaitingAnswerCount,
    },
  }),
}));

vi.mock('./hooks', () => ({
  useDebateRequests: () => ({ data: undefined, isLoading: false, error: null }),
}));

// The badge is the panel's needs-you count (GEO-3463), which reads the scheduled list from cache only
// and the viewer's id for challenges. Neither is loaded here, so activity's counts stand in.
vi.mock('../rooms/scheduling-hooks', () => ({
  useScheduledDebates: () => ({ data: undefined }),
}));
vi.mock('../use-current-geo-chat-user-id', () => ({ useCurrentGeoChatUserId: () => 'user-a' }));

function renderButton(props: ComponentProps<typeof DebatesHubButton> = {}) {
  const store = createStore();
  return render(
    <Provider store={store}>
      <DebatesHubButton {...props} />
    </Provider>
  );
}

beforeEach(() => {
  mocks.ready = true;
  mocks.authenticated = true;
  mocks.incomingRequestCount = 0;
  mocks.scheduledAwaitingAnswerCount = undefined;
  lineup.live = [];
  replay.mockClear();
});

afterEach(cleanup);

describe('DebatesHubButton', () => {
  it('holds the queued lobby reminder’s replay, on every page it is on', () => {
    mocks.authenticated = false;
    renderButton();
    expect(replay).toHaveBeenCalled();
  });

  it('shows for a signed-in user', () => {
    renderButton();
    expect(screen.getByRole('button', { name: 'Debate' })).toBeInTheDocument();
  });

  // GEO-2725. It used to be hidden signed out, because every tab behind it needed an identity.
  // Claims and People are readable anonymously now, and this is the only opener for them — hiding
  // it left them unreachable.
  it('shows for a signed-out visitor', () => {
    mocks.authenticated = false;
    renderButton();

    expect(screen.getByRole('button', { name: 'Debate' })).toBeInTheDocument();
  });

  it('shows while Privy is still restoring the session', () => {
    mocks.ready = false;
    mocks.authenticated = false;
    renderButton();

    // No longer anything to wait for: the button is the same for both answers, so there is no
    // flash of it appearing or disappearing once Privy resolves.
    expect(screen.getByRole('button', { name: 'Debate' })).toBeInTheDocument();
  });

  // The badge counts requests addressed to somebody, so signed out there is nobody to badge it
  // for — and a cache left over from a session that has since signed out must not leak into it.
  it('never badges a signed-out visitor, even with a stale count cached', () => {
    mocks.authenticated = false;
    mocks.incomingRequestCount = 3;
    renderButton();

    expect(screen.getByRole('button', { name: 'Debate' })).toBeInTheDocument();
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  it('counts scheduled requests waiting on an answer alongside instant ones', () => {
    mocks.incomingRequestCount = 1;
    mocks.scheduledAwaitingAnswerCount = 2;
    renderButton();

    expect(screen.getByRole('button', { name: 'Debate, 3 pending requests' })).toBeInTheDocument();
  });

  it('badges a scheduled request on its own', () => {
    mocks.scheduledAwaitingAnswerCount = 1;
    renderButton();

    expect(screen.getByRole('button', { name: 'Debate, 1 pending request' })).toBeInTheDocument();
  });

  it('keeps announcing the pending request count while signed in', () => {
    mocks.incomingRequestCount = 3;
    renderButton();

    expect(screen.getByRole('button', { name: 'Debate, 3 pending requests' })).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  /**
   * GEO-2689. A megaphone on its own does not say "debate", and the button had nothing else to go
   * on.
   *
   * Most of these do pin the word: "Debate" is the product's choice, and a test that shrugged at it
   * would not notice the button quietly renaming itself. The one exception is the agreement case
   * below, which reads whatever is shown and requires the accessible name to match — that one holds
   * whichever word is chosen, because a control showing one name while answering to another is
   * worse than one showing none.
   */
  describe('label', () => {
    it('says what the button is for', () => {
      renderButton();

      expect(screen.getByText('Debate')).toBeInTheDocument();
    });

    it('shows the same word the button answers to', () => {
      // No pending count, so everything the button shows is the label — the icon carries no text.
      // Reading all of it beats picking a span: the first span is the label only until someone adds
      // a wrapper or moves the count, and then the assertion quietly changes subject. Not selected
      // by its class either, which would tie this to styling and to the test below that pins it.
      renderButton();

      const button = screen.getByRole('button');
      const visible = button.textContent?.trim() ?? '';

      // Read back rather than asserted twice over: the point is that the two agree, whichever word
      // is chosen, so this fails if either is edited without the other.
      expect(visible).not.toBe('');
      expect(button).toHaveAccessibleName(visible);
    });

    // The count is the reason the accessible name is written by hand, and it has to keep winning
    // over the visible text now that there is some.
    it('still announces the pending count rather than reading out the label and a bare number', () => {
      mocks.incomingRequestCount = 2;
      renderButton();

      expect(screen.getByRole('button', { name: 'Debate, 2 pending requests' })).toBeInTheDocument();
      expect(screen.getByText('Debate')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    // Read aloud, so it has to be a sentence. One request is not "1 pending requests".
    it('counts a single pending request', () => {
      mocks.incomingRequestCount = 1;
      renderButton();

      expect(screen.getByRole('button', { name: 'Debate, 1 pending request' })).toBeInTheDocument();
    });

    // Set in the browse sidebar's menu type so the two read as the same kind of navigation text,
    // rather than the navbar's heavier metadata weight.
    it('is set in the browse menu type', () => {
      renderButton();

      expect(screen.getByText('Debate')).toHaveClass('text-browseMenu');
    });

    // Phones have the least room in the navbar, so the label is dropped there — but only the
    // visible one. `aria-label` still names the button for anyone reading it that way.
    it('drops the visible label on phones without dropping the name', () => {
      renderButton();

      expect(screen.getByText('Debate')).toHaveClass('mobile:hidden');
      expect(screen.getByRole('button', { name: 'Debate' })).toBeInTheDocument();
    });
  });

  it('leaves the hub closed when there is no button to open it', () => {
    mocks.authenticated = false;
    const store = createStore();
    render(
      <Provider store={store}>
        <DebatesHubButton />
      </Provider>
    );

    expect(store.get(debatesHubAtom)).toBeNull();
  });

  // GEO-3268. A live lobby turns the button into the navbar's black pill with a green chip.
  describe('live lobbies', () => {
    it('looks as it always has with nothing live', () => {
      renderButton();
      expect(screen.queryByText(/live/i)).not.toBeInTheDocument();
      expect(screen.queryByTestId('live-lobby-dot')).not.toBeInTheDocument();
    });

    it('shows one lobby’s headcount, and says a lobby is live in its name', () => {
      lineup.live = [{ lobby_id: 'nyc', headcount: 14 }];
      renderButton();

      const button = screen.getByRole('button', { name: 'Debate, a lobby is live' });
      expect(button).toHaveTextContent('Live · 14');
      expect(button.className).toContain('bg-[#151515]');
    });

    it('counts lobbies, not people, with more than one live', () => {
      lineup.live = [
        { lobby_id: 'nyc', headcount: 14 },
        { lobby_id: 'ai', headcount: 5 },
      ];
      renderButton();

      expect(screen.getByRole('button', { name: 'Debate, 2 lobbies are live' })).toHaveTextContent('2 live');
    });

    it('keeps the pending request count beside the chip', () => {
      lineup.live = [{ lobby_id: 'nyc', headcount: 14 }];
      mocks.incomingRequestCount = 2;
      renderButton();

      const button = screen.getByRole('button', { name: 'Debate, a lobby is live, 2 pending requests' });
      expect(button).toHaveTextContent('2');
      expect(button).toHaveTextContent('Live · 14');
    });

    it('swaps the chip for a dot on phones', () => {
      lineup.live = [{ lobby_id: 'nyc', headcount: 14 }];
      renderButton();

      expect(screen.getByText('Live · 14').className).toContain('mobile:hidden');
      expect(screen.getByTestId('live-lobby-dot').className).toContain('mobile:block');
    });
  });

  // GEO-3415. The debate feed's phone bar, which has room the phone navbar does not.
  describe('compact', () => {
    it('leaves the reminder replay to the navbar button, so it runs once', () => {
      renderButton({ compact: true, placement: 'debate_feed_bar' });
      expect(replay).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Debate' })).toHaveAttribute(
        'data-geo-analytics-label',
        'Debate feed bar debate hub toggle'
      );
    });

    it('replays queued reminders when it is the mobile Explore navbar button', () => {
      renderButton({ compact: true, placement: 'navbar' });

      expect(replay).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Debate' })).toHaveAttribute(
        'data-geo-analytics-label',
        'Navbar debate hub toggle'
      );
    });

    it('keeps the word and a 44px target on a phone', () => {
      renderButton({ compact: true });

      const button = screen.getByRole('button', { name: 'Debate' });
      expect(button).toHaveClass('h-11', 'min-w-11');
      expect(screen.getByText('Debate').className).not.toContain('mobile:hidden');
    });

    it('shows the pending count', () => {
      mocks.incomingRequestCount = 2;
      renderButton({ compact: true });

      expect(screen.getByRole('button', { name: 'Debate, 2 pending requests' })).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('keeps the live chip rather than dropping to a dot', () => {
      lineup.live = [{ lobby_id: 'lobby-1', headcount: 14 }];
      renderButton({ compact: true });

      expect(screen.getByRole('button', { name: 'Debate, a lobby is live' })).toBeInTheDocument();
      expect(screen.getByText('Live · 14').className).not.toContain('mobile:hidden');
      expect(screen.queryByTestId('live-lobby-dot')).not.toBeInTheDocument();
    });
  });
});
