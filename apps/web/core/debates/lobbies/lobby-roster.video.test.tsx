import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyMember } from '../api';
import type { LobbyPageView } from './lobby-view';

const mocks = vi.hoisted(() => ({ phone: false, video: true }));

vi.mock('~/core/hooks/use-is-phone-layout', () => ({ useIsPhoneLayout: () => mocks.phone }));
vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: (id: string) => id === 'debateVideo' && mocks.video,
}));
vi.mock('./lobby-guest-hooks', () => ({ useIsLobbyGuest: () => false }));
vi.mock('./lobby-people', () => ({
  LobbyPersonName: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('./lobby-request-debate', async importOriginal => ({
  ...(await importOriginal<typeof import('./lobby-request-debate')>()),
  LobbyRequestDebate: () => null,
}));
vi.mock('./lobby-member-actions', async importOriginal => ({
  ...(await importOriginal<typeof import('./lobby-member-actions')>()),
  LobbyMemberActions: () => null,
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
  mocks.video = true;
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

function lobby(members: DebateLobbyMember[]): LobbyPageView {
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
  };
}

/** The host (the viewer) and `count - 1` speakers named S01, S02, … */
function room(count: number) {
  return [
    member('Adam', { role: 'host', creator: true }),
    ...Array.from({ length: count - 1 }, (_, index) => member(`S${String(index + 1).padStart(2, '0')}`)),
  ];
}

function camera(id: string) {
  const track = { attach: vi.fn(), detach: vi.fn() };
  return [id.toLowerCase(), { participant: { identity: id }, publication: { track, isMuted: false } }] as const;
}

function people(view: LobbyPageView, { cameras = [] as string[], speaking = [] as string[] } = {}) {
  return (
    <LobbyVoiceStatesProvider
      value={{
        speaking: new Set(speaking.map(id => id.toLowerCase())),
        micOn: new Set(speaking.map(id => id.toLowerCase())),
        cameras: new Map(cameras.map(camera)) as never,
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
  it('keeps today’s tiles with the debateVideo flag off', () => {
    mocks.video = false;
    render(people(lobby([member('Adam', { role: 'host' }), member('Daniel')]), { cameras: ['Daniel'] }));
    expect(screen.queryByTestId('lobby-speaker-grid')).toBeNull();
    expect(screen.queryByTestId('lobby-speaker-frame')).toBeNull();
  });

  it('shows each speaker’s camera in a frame, and the avatar in the same frame with the camera off', () => {
    render(
      people(lobby([member('Adam', { role: 'host' }), member('Daniel'), member('Elena')]), {
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
    render(people(lobby(room(3)), { speaking: ['S01'] }));
    expect(screen.getByRole('group', { name: 'S01' })).toHaveClass('border-green');
    expect(screen.getByRole('group', { name: 'S02' })).toHaveClass('border-grey-02');
  });

  it('goes 3 across for 5 to 9 speakers and 4 across, compact, from 10', () => {
    const { unmount } = render(people(lobby(room(8))));
    expect(screen.getByTestId('lobby-speaker-grid')).toHaveAttribute('data-columns', '3');
    unmount();

    render(people(lobby([...room(9), member('Daniel')])));
    expect(screen.getByTestId('lobby-speaker-grid')).toHaveAttribute('data-columns', '4');
    // The phone's one line: "Disagrees on 4" as text, not a pill.
    const trigger = within(screen.getByRole('group', { name: 'Daniel' })).getByTestId('lobby-disagreements-trigger');
    expect(trigger).not.toHaveClass('rounded-full');
  });

  it('stops at 12 tiles and lists the rest under More speakers, marking cameras that are on', () => {
    render(people(lobby(room(14)), { cameras: ['S13'] }));
    expect(screen.getAllByTestId('lobby-speaker-tile')).toHaveLength(12);

    const more = screen.getByTestId('lobby-more-speakers');
    expect(within(more).getByText('More speakers · 2')).toBeInTheDocument();
    const chips = within(more).getAllByTestId('lobby-more-speaker');
    expect(chips).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Speakers · 14' })).toBeInTheDocument();
  });

  it('gives a tile to someone in the row who starts talking, without moving anyone else', () => {
    const view = lobby(room(14));
    const { rerender } = render(people(view));
    const before = tileNames();
    expect(before).not.toContain('S13');

    rerender(people(view, { speaking: ['S13'] }));
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
          {people(lobby(room(11)), { cameras: ['S01'], speaking: ['S01'] })}
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
    const { unmount } = render(people(lobby(room(3))));
    expect(screen.queryByTestId('lobby-speaker-strip')).toBeNull();
    unmount();

    mocks.phone = false;
    const target = document.createElement('div');
    render(<LobbySlotsProvider value={{ speakerStrip: target }}>{people(lobby(room(3)))}</LobbySlotsProvider>);
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
