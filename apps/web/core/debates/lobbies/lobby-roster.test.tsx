import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyMember } from '../api';
import type { LobbyPageView } from './lobby-view';

const mocks = vi.hoisted(() => ({ phone: false, guest: false }));

vi.mock('~/core/hooks/use-is-phone-layout', () => ({ useIsPhoneLayout: () => mocks.phone }));
vi.mock('./lobby-guest-hooks', () => ({ useIsLobbyGuest: () => mocks.guest }));
vi.mock('./lobby-people', () => ({
  LobbyPersonName: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('./lobby-request-debate', async importOriginal => ({
  ...(await importOriginal<typeof import('./lobby-request-debate')>()),
  LobbyRequestDebate: ({ member }: { member: DebateLobbyMember }) => (
    <button type="button">Request a debate with {member.display_name}</button>
  ),
}));
vi.mock('./lobby-member-actions', async importOriginal => ({
  ...(await importOriginal<typeof import('./lobby-member-actions')>()),
  LobbyMemberActions: () => <div data-testid="host-controls">Host controls</div>,
}));
vi.mock('./lobby-voice', async () => {
  const ReactModule = await import('react');
  const Context = ReactModule.createContext({
    speaking: new Set<string>(),
    micOn: new Set<string>(),
    connected: false,
  });
  return { useLobbyVoiceStates: () => ReactModule.useContext(Context), LobbyVoiceStatesProvider: Context.Provider };
});

// The menu's placement hook observes the trigger, and JSDOM has no ResizeObserver.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

const { LobbyPeople } = await import('./lobby-roster');
const { LobbyVoiceStatesProvider } = await import('./lobby-voice');

afterEach(() => {
  cleanup();
  mocks.phone = false;
  mocks.guest = false;
});

function member(id: string, extra: Partial<DebateLobbyMember> = {}): DebateLobbyMember {
  return {
    user_id: id,
    profile_space_id: `space-${id}`,
    display_name: id,
    avatar_cid: null,
    role: 'speaker',
    creator: false,
    acting_host: false,
    on_roster_since: '2026-10-09T10:00:00Z',
    stepped_out: false,
    in_debate: false,
    available_to_debate: true,
    ...extra,
  };
}

function lobby(members: DebateLobbyMember[], extra: Partial<LobbyPageView> = {}): LobbyPageView {
  return {
    lobby_id: 'lobby1',
    name: 'Onboarding',
    access: { status: 'admitted' },
    starts_at: '2026-10-09T10:00:00Z',
    opens_at: '2026-10-09T10:00:00Z',
    scheduled: false,
    created_by: 'Adam',
    acting_host_id: null,
    hosts_changed_at: null,
    reminder_count: 0,
    members,
    guest_count: 0,
    viewer: {
      kind: 'member',
      role: 'host',
      creator: true,
      hosting: true,
      reminded: false,
      voice_away_at: null,
      connected: true,
      stepped_out: false,
    },
    ...extra,
  };
}

const roster = [
  member('Adam', { role: 'host', creator: true }),
  member('Daniel'),
  member('Elena', { newcomer: true }),
  member('Jordan', { available_to_debate: false }),
  member('Sam', { role: 'listener', moved_to_listeners: { by: null, at: '2026-10-09T10:05:00Z' } }),
  member('Maya', { in_debate: true }),
  member('Leo', { in_debate: true }),
];
const pairs = [
  {
    people: [
      { ...member('Maya'), in_lobby: true },
      { ...member('Leo'), in_lobby: true },
    ],
  },
];

function renderPeople(view: LobbyPageView, speaking: string[] = []) {
  return render(
    <LobbyVoiceStatesProvider value={{ speaking: new Set(speaking), micOn: new Set(speaking), connected: true }}>
      <LobbyPeople
        lobby={view}
        viewerId="Adam"
        ownAvailable={undefined}
        disagreements={[
          { user_id: 'daniel', claims: 4 },
          { user_id: 'elena', claims: 0 },
        ]}
      />
    </LobbyVoiceStatesProvider>
  );
}

describe('LobbyPeople on desktop', () => {
  it('draws speaker tiles with tags, statuses and disagreements, leaving pairs to their card', () => {
    renderPeople(lobby(roster, { debate_pairs: pairs, guest_count: 2 }), ['adam']);

    const tiles = screen.getAllByTestId('lobby-speaker-tile');
    expect(tiles.map(tile => tile.getAttribute('aria-label'))).toEqual(['Adam (you)', 'Daniel', 'Elena', 'Jordan']);
    expect(screen.getByRole('heading', { name: 'Speakers · 4' })).toBeInTheDocument();
    expect(screen.getByTestId('lobby-debate-pair')).toHaveTextContent('Maya vs. Leo');

    const [adam, daniel, elena, jordan] = tiles as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
    expect(adam).toHaveAttribute('data-speaking', 'true');
    expect(within(adam).getByRole('img', { name: 'Speaking' })).toBeInTheDocument();
    expect(adam).toHaveTextContent('Host');
    expect(adam).toHaveTextContent('You');
    expect(daniel).toHaveTextContent('Looking to debate');
    expect(daniel).toHaveTextContent('Disagrees on 4');
    expect(elena).toHaveTextContent('New');
    expect(elena).not.toHaveTextContent('Disagrees');
    expect(jordan).toHaveTextContent('Just chatting');
    expect(within(jordan).getByRole('img', { name: 'Muted' })).toBeInTheDocument();
    expect(within(daniel).getByRole('button', { name: 'Disagrees on 4 claims with Daniel' })).toBeInTheDocument();
  });

  it('keeps a tile’s status line one height whether its speaker is talking or not', () => {
    const view = lobby(roster);
    const { rerender } = renderPeople(view);
    const statusLine = () => screen.getAllByTestId('lobby-tile-status')[0]!;
    expect(statusLine()).toHaveTextContent('Looking to debate');
    expect(statusLine()).toHaveClass('h-[18px]');

    rerender(
      <LobbyVoiceStatesProvider value={{ speaking: new Set(['adam']), micOn: new Set(['adam']), connected: true }}>
        <LobbyPeople lobby={view} viewerId="Adam" ownAvailable={undefined} disagreements={null} />
      </LobbyVoiceStatesProvider>
    );
    expect(within(statusLine()).getByRole('img', { name: 'Speaking' })).toBeInTheDocument();
    expect(statusLine()).toHaveClass('h-[18px]');
  });

  it('counts guests among the listeners and notes who a host moved there', () => {
    renderPeople(lobby(roster, { debate_pairs: pairs, guest_count: 2 }));

    expect(screen.getByRole('heading', { name: 'Listening · 3' })).toBeInTheDocument();
    expect(screen.getByTestId('lobby-listener-chip')).toHaveTextContent('Sammoved to listeners');
    expect(screen.getByTestId('lobby-guest-count')).toHaveTextContent('2 guests without an account');
  });

  it('shows a raised hand on a chip before the move a host made', () => {
    const moved = {
      by: { user_id: 'priya', profile_space_id: 'space-priya', display_name: 'Priya', avatar_cid: null },
      at: '2026-10-09T10:05:00Z',
    };
    renderPeople(
      lobby([
        member('Adam', { role: 'host' }),
        member('Sam', { role: 'listener', moved_to_listeners: moved, hand_raised_at: '2026-10-09T10:06:00Z' }),
      ])
    );

    const chip = screen.getByTestId('lobby-listener-chip');
    expect(chip).toHaveTextContent('Samhand raised');
    fireEvent.click(chip);
    expect(screen.getByTestId('lobby-person-card')).toHaveTextContent('Moved to listeners by Priya');
  });

  it('opens a person menu with their disagreements, Request a debate and host controls', () => {
    renderPeople(lobby(roster));

    fireEvent.click(screen.getByRole('button', { name: 'Daniel' }));
    const card = screen.getByTestId('lobby-person-card');
    expect(card).toHaveTextContent('You disagree on 4 claims');
    expect(within(card).getByRole('button', { name: 'Request a debate with Daniel' })).toBeInTheDocument();
    expect(within(card).getByTestId('host-controls')).toBeInTheDocument();
    expect(screen.queryByTestId('bottom-sheet')).toBeNull();
  });

  it('offers no request on the viewer’s own tile', () => {
    renderPeople(lobby(roster));

    fireEvent.click(screen.getByRole('button', { name: 'Adam (you)' }));
    expect(screen.getByTestId('lobby-person-card')).not.toHaveTextContent('Request a debate');
  });

  it('lets a guest request, which queues behind sign-up', () => {
    mocks.guest = true;
    render(<LobbyPeople lobby={lobby(roster)} viewerId={null} ownAvailable={undefined} disagreements={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Daniel' }));
    expect(screen.getByRole('button', { name: 'Request a debate with Daniel' })).toBeInTheDocument();
  });

  it('keeps the host controls event on a tile a host can act on, and a person menu event otherwise', () => {
    renderPeople(lobby(roster));
    expect(screen.getByRole('button', { name: 'Daniel' })).toHaveAttribute(
      'data-geo-analytics-intent',
      'open_lobby_host_controls'
    );
    cleanup();

    mocks.guest = true;
    const guestView = lobby(roster, {
      viewer: {
        kind: 'guest',
        role: null,
        creator: false,
        hosting: false,
        reminded: false,
        voice_away_at: null,
        connected: false,
        stepped_out: false,
      },
    });
    render(<LobbyPeople lobby={guestView} viewerId={null} ownAvailable={undefined} disagreements={null} />);
    const daniel = screen.getByRole('button', { name: 'Daniel' });
    expect(daniel).toHaveAttribute('data-geo-analytics-label', 'Debate hub Lobby person menu');
    expect(daniel).toHaveAttribute('data-geo-analytics-intent', 'debates_hub_action');
  });

  it('says nobody is here in an empty lobby', () => {
    renderPeople(lobby([]));
    expect(screen.getByText('Nobody’s here right now.')).toBeInTheDocument();
  });
});

describe('LobbyPeople on a phone', () => {
  it('shortens statuses to one line and opens the person menu as a sheet', () => {
    mocks.phone = true;
    renderPeople(lobby(roster, { debate_pairs: pairs }), ['adam']);

    const [adam, daniel, elena] = screen.getAllByTestId('lobby-speaker-tile') as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    expect(adam).toHaveTextContent('Speaking');
    expect(adam).not.toHaveTextContent('You');
    expect(daniel).toHaveTextContent('Disagrees on 4');
    expect(daniel).not.toHaveTextContent('Looking');
    expect(elena).toHaveTextContent('Looking');

    fireEvent.click(within(daniel).getByRole('button', { name: 'Daniel' }));
    const sheet = screen.getByTestId('bottom-sheet');
    expect(sheet).toHaveAttribute('role', 'dialog');
    expect(within(sheet).getByRole('button', { name: 'Request a debate with Daniel' })).toBeInTheDocument();
    expect(within(sheet).getByTestId('host-controls')).toBeInTheDocument();
  });
});
