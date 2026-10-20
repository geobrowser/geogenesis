import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyMember } from '../api';
import type { LobbyPageView } from './lobby-view';

const mocks = vi.hoisted(() => ({ phone: false, guest: false, video: false }));

vi.mock('~/core/hooks/use-is-phone-layout', () => ({ useIsPhoneLayout: () => mocks.phone }));
vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: (id: string) => id === 'debateVideo' && mocks.video,
}));
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
vi.mock('./lobby-room-claims-hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('./lobby-room-claims-hooks')>()),
  useDebateLobbyClaims: () => ({ data: undefined, isLoading: true, error: null, refetch: vi.fn() }),
}));
vi.mock('./lobby-voice', async () => {
  const ReactModule = await import('react');
  const Context = ReactModule.createContext({
    speaking: new Set<string>(),
    micOn: new Set<string>(),
    cameras: new Map(),
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
const { LobbyShowPeopleContext, LobbySlotsProvider } = await import('./lobby-slots');
const { lobbyMetaLabel } = await import('./lobby-header');

afterEach(() => {
  cleanup();
  mocks.phone = false;
  mocks.guest = false;
  mocks.video = false;
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
    <LobbyVoiceStatesProvider
      value={{ speaking: new Set(speaking), micOn: new Set(speaking), cameras: new Map(), connected: true }}
    >
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
      <LobbyVoiceStatesProvider
        value={{ speaking: new Set(['adam']), micOn: new Set(['adam']), cameras: new Map(), connected: true }}
      >
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
  it('keeps an open disagreements sheet open when that speaker starts talking', () => {
    mocks.phone = true;
    const view = lobby(roster);
    const { rerender } = renderPeople(view);

    fireEvent.click(screen.getByRole('button', { name: 'Disagrees on 4 claims with Daniel' }));
    expect(screen.getByTestId('lobby-disagreements')).toBeInTheDocument();

    rerender(
      <LobbyVoiceStatesProvider
        value={{ speaking: new Set(['daniel']), micOn: new Set(['daniel']), cameras: new Map(), connected: true }}
      >
        <LobbyPeople
          lobby={view}
          viewerId="Adam"
          ownAvailable={undefined}
          disagreements={[{ user_id: 'daniel', claims: 4 }]}
        />
      </LobbyVoiceStatesProvider>
    );
    // The open sheet hides the page behind it from the accessibility tree.
    const daniel = screen.getByRole('group', { name: 'Daniel', hidden: true });
    expect(daniel).toHaveTextContent('Speaking');
    expect(screen.getByTestId('lobby-disagreements')).toBeInTheDocument();
  });

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

describe('LobbyPeople video (GEO-3307)', () => {
  function camera(id: string) {
    const track = { attach: vi.fn(), detach: vi.fn() };
    return { id, track, ref: { participant: { identity: id }, publication: { track, isMuted: false } } };
  }

  function renderWithCameras(view: LobbyPageView, cameras: ReturnType<typeof camera>[]) {
    const map = new Map(cameras.map(entry => [entry.id, entry.ref]));
    return render(
      <LobbyVoiceStatesProvider
        value={{ speaking: new Set(), micOn: new Set(), cameras: map as never, connected: true }}
      >
        <LobbyPeople lobby={view} viewerId="Adam" ownAvailable={undefined} disagreements={null} />
      </LobbyVoiceStatesProvider>
    );
  }

  it('shows a speaker’s camera in their tile, and the avatar for one with the camera off', () => {
    const daniel = camera('daniel');
    renderWithCameras(lobby([member('Adam', { role: 'host' }), member('Daniel'), member('Elena')]), [daniel]);
    const tile = screen.getByRole('group', { name: 'Daniel' });
    const video = within(tile).getByTestId('lobby-speaker-video');
    expect(daniel.track.attach).toHaveBeenCalledWith(video);
    expect(video).not.toHaveClass('-scale-x-100');
    expect(within(screen.getByRole('group', { name: 'Elena' })).queryByTestId('lobby-speaker-video')).toBeNull();
  });

  it('mirrors the viewer’s own preview', () => {
    renderWithCameras(lobby([member('Adam', { role: 'host' })]), [camera('adam')]);
    expect(screen.getByTestId('lobby-speaker-video')).toHaveClass('-scale-x-100');
  });

  it('never shows video for a listener or someone stepped out', () => {
    renderWithCameras(
      lobby([member('Adam', { role: 'host', stepped_out: true }), member('Sam', { role: 'listener' })]),
      [camera('adam'), camera('sam')]
    );
    expect(screen.queryByTestId('lobby-speaker-video')).toBeNull();
  });

  it('detaches the video when the camera goes away', () => {
    const daniel = camera('daniel');
    const view = lobby([member('Daniel')]);
    const { rerender } = renderWithCameras(view, [daniel]);
    const video = screen.getByTestId('lobby-speaker-video');
    rerender(
      <LobbyVoiceStatesProvider value={{ speaking: new Set(), micOn: new Set(), cameras: new Map(), connected: true }}>
        <LobbyPeople lobby={view} viewerId="Adam" ownAvailable={undefined} disagreements={null} />
      </LobbyVoiceStatesProvider>
    );
    expect(daniel.track.detach).toHaveBeenCalledWith(video);
    expect(screen.queryByTestId('lobby-speaker-video')).toBeNull();
  });
});

function room(count: number) {
  return [
    member('Adam', { role: 'host', creator: true }),
    ...Array.from({ length: count - 1 }, (_, index) => member(`S${String(index + 1).padStart(2, '0')}`)),
  ];
}

function gridCamera(id: string) {
  const track = { attach: vi.fn(), detach: vi.fn() };
  return [id.toLowerCase(), { participant: { identity: id }, publication: { track, isMuted: false } }] as const;
}

function gridPeople(view: LobbyPageView, { cameras = [] as string[], speaking = [] as string[] } = {}) {
  return (
    <LobbyVoiceStatesProvider
      value={{
        speaking: new Set(speaking.map(id => id.toLowerCase())),
        micOn: new Set(speaking.map(id => id.toLowerCase())),
        cameras: new Map(cameras.map(gridCamera)) as never,
        connected: true,
      }}
    >
      <LobbyPeople
        lobby={view}
        viewerId="Adam"
        ownAvailable={undefined}
        disagreements={[{ user_id: 'daniel', claims: 4 }]}
      />
    </LobbyVoiceStatesProvider>
  );
}

const tileNames = () => screen.getAllByTestId('lobby-speaker-tile').map(tile => tile.getAttribute('aria-label') ?? '');

describe('LobbyPeople video grid (GEO-3399)', () => {
  beforeEach(() => {
    mocks.video = true;
  });

  it('keeps today’s tiles with the debateVideo flag off', () => {
    mocks.video = false;
    render(gridPeople(lobby([member('Adam', { role: 'host' }), member('Daniel')]), { cameras: ['Daniel'] }));
    expect(screen.queryByTestId('lobby-speaker-grid')).toBeNull();
    expect(screen.queryByTestId('lobby-speaker-frame')).toBeNull();
  });

  it('shows each speaker’s camera in a frame, and the avatar in the same frame with the camera off', () => {
    render(
      gridPeople(lobby([member('Adam', { role: 'host' }), member('Daniel'), member('Elena')]), {
        cameras: ['Adam', 'Daniel'],
      })
    );
    expect(screen.getByTestId('lobby-speaker-grid')).toHaveAttribute('data-columns', '2');
    expect(screen.getAllByTestId('lobby-speaker-frame')).toHaveLength(3);

    const daniel = screen.getByRole('group', { name: 'Daniel' });
    expect(within(daniel).getByTestId('lobby-speaker-video')).not.toHaveClass('-scale-x-100');
    expect(within(daniel).getByTestId('lobby-speaker-frame')).toHaveClass('aspect-video');
    expect(within(daniel).getByTestId('lobby-disagreements-trigger')).toHaveClass('rounded-full');
    expect(within(screen.getByRole('group', { name: 'Elena' })).queryByTestId('lobby-speaker-video')).toBeNull();

    const own = screen.getByRole('group', { name: 'Adam (you)' });
    expect(within(own).getByTestId('lobby-speaker-video')).toHaveClass('-scale-x-100');
    expect(within(own).getByText('You')).toBeInTheDocument();
  });

  it('outlines whoever is talking', () => {
    render(gridPeople(lobby(room(3)), { speaking: ['S01'] }));
    expect(screen.getByRole('group', { name: 'S01' })).toHaveClass('border-green');
    expect(screen.getByRole('group', { name: 'S02' })).toHaveClass('border-grey-02');
  });

  it('goes 3 across for 5 to 9 speakers and 4 across, compact, from 10', () => {
    const { unmount } = render(gridPeople(lobby(room(8))));
    expect(screen.getByTestId('lobby-speaker-grid')).toHaveAttribute('data-columns', '3');
    unmount();

    render(gridPeople(lobby([...room(9), member('Daniel')])));
    expect(screen.getByTestId('lobby-speaker-grid')).toHaveAttribute('data-columns', '4');
    // The phone's one line: "Disagrees on 4" as text, not a pill.
    const trigger = within(screen.getByRole('group', { name: 'Daniel' })).getByTestId('lobby-disagreements-trigger');
    expect(trigger).not.toHaveClass('rounded-full');
  });

  it('stops at 12 tiles and lists the rest under More speakers, marking cameras that are on', () => {
    render(gridPeople(lobby(room(14)), { cameras: ['S13'] }));
    expect(screen.getAllByTestId('lobby-speaker-tile')).toHaveLength(12);

    const more = screen.getByTestId('lobby-more-speakers');
    expect(within(more).getByText('More speakers · 2')).toBeInTheDocument();
    const chips = within(more).getAllByTestId('lobby-more-speaker');
    expect(chips).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Speakers · 14' })).toBeInTheDocument();
  });

  it('gives a tile to someone in the row who starts talking, without moving anyone else', () => {
    const view = lobby(room(14));
    const { rerender } = render(gridPeople(view));
    const before = tileNames();
    expect(before).not.toContain('S13');

    rerender(gridPeople(view, { speaking: ['S13'] }));
    const after = tileNames();
    expect(after).toContain('S13');
    expect(after).toHaveLength(12);
    const changed = after.flatMap((name, index) => (name === before[index] ? [] : [index]));
    expect(changed).toHaveLength(1);
    expect(after[0]).toBe('Adam (you)');
  });

  it('draws a phone’s speaker strip into the Claims slot, and a tap there shows People', () => {
    mocks.phone = true;
    const target = document.createElement('div');
    document.body.append(target);
    const showPeople = vi.fn();
    render(
      <LobbySlotsProvider value={{ speakerStrip: target }}>
        <LobbyShowPeopleContext.Provider value={showPeople}>
          {gridPeople(lobby(room(11)), { cameras: ['S01'], speaking: ['S01'] })}
        </LobbyShowPeopleContext.Provider>
      </LobbySlotsProvider>
    );

    expect(screen.getByTestId('lobby-speaker-grid')).toHaveAttribute('data-columns', '3');
    expect(screen.getAllByTestId('lobby-speaker-tile')).toHaveLength(9);
    expect(screen.getAllByTestId('lobby-speaker-frame')[0]).toHaveClass('aspect-[4/3]');

    const strip = within(target).getByTestId('lobby-speaker-strip');
    const talking = within(strip).getByRole('button', { name: 'S01, show people' });
    expect(talking).toHaveAttribute('data-speaking', 'true');
    fireEvent.click(within(strip).getByRole('button', { name: '2 more speakers, show people' }));
    expect(showPeople).toHaveBeenCalledTimes(1);
    target.remove();
  });

  it('draws no strip without a Claims slot, and none on a desktop', () => {
    mocks.phone = true;
    const { unmount } = render(gridPeople(lobby(room(3))));
    expect(screen.queryByTestId('lobby-speaker-strip')).toBeNull();
    unmount();

    mocks.phone = false;
    const target = document.createElement('div');
    render(<LobbySlotsProvider value={{ speakerStrip: target }}>{gridPeople(lobby(room(3)))}</LobbySlotsProvider>);
    expect(target).toBeEmptyDOMElement();
  });
});

describe('lobbyMetaLabel', () => {
  it('says Video on with lobby video, Voice only without', () => {
    const view = { members: [member('Adam', { role: 'host' })] };
    expect(lobbyMetaLabel(view, true)).toBe('Hosted by Adam · Video on · Not recorded');
    expect(lobbyMetaLabel(view)).toBe('Hosted by Adam · Voice only · Not recorded');
  });
});
