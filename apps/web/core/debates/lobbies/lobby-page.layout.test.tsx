import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import type * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyHighlights, DebateLobbyMember, DebateLobbyView } from '../api';

const mocks = vi.hoisted(() => ({
  phone: false,
  lobby: undefined as DebateLobbyView | undefined,
  highlights: undefined as Pick<DebateLobbyHighlights, 'highlights' | 'room_vote'> | undefined,
  highlightsEnabled: [] as boolean[],
  leave: vi.fn(),
}));

vi.mock('~/core/hooks/use-is-phone-layout', () => ({ useIsPhoneLayout: () => mocks.phone }));
vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'acct', getPrivyIdentityToken: vi.fn() }),
  useDebateActivity: () => ({ data: undefined }),
}));
vi.mock('../matchmaking/hub-header-controls', () => ({
  HubHeaderControls: () => <div data-testid="availability-pill" />,
}));
vi.mock('../matchmaking/hooks', () => ({ useMatchmakingScope: vi.fn() }));
vi.mock('../use-current-geo-chat-user-id', () => ({ useCurrentGeoChatUserId: () => 'sam' }));
vi.mock('./hooks', () => ({
  MAX_TIMEOUT_MS: 2_147_483_647,
  useDebateLobby: () => ({ data: mocks.lobby, isError: false, refetch: vi.fn() }),
  useLobbyPresence: () => ({
    state: { status: 'joined' },
    join: vi.fn(),
    leave: mocks.leave,
    leaveSteppedOut: vi.fn(),
    connectionId: 'conn-1',
    setVoiceConnected: vi.fn(),
    voiceAwayAt: null,
  }),
  useDebateLobbyReminder: () => ({ mutate: vi.fn(), isPending: false }),
  useLobbyReminderError: () => null,
  useRefetchAtOpening: vi.fn(),
  useEndDebateLobby: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));
vi.mock('./lobby-guest-hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('./lobby-guest-hooks')>()),
  useDebateLobbyGuestView: () => ({ data: undefined, isError: false, dataUpdatedAt: 0, refetch: vi.fn() }),
  useLobbyGuestSession: () => ({
    state: { status: 'idle' },
    retry: vi.fn(),
    reconnect: vi.fn(),
    checkNow: vi.fn(),
    roomDone: vi.fn(),
  }),
}));
vi.mock('./lobby-voice', async () => {
  const ReactModule = await import('react');
  const { LobbySlot } = await import('./lobby-slots');
  const NO = { speaking: new Set(), micOn: new Set(), connected: false };
  const Context = ReactModule.createContext(NO);
  return {
    NO_LOBBY_VOICE: NO,
    LobbyVoiceStatesProvider: Context.Provider,
    useLobbyVoiceStates: () => ReactModule.useContext(Context),
    LobbyGuestVoice: () => null,
    // Draws its controls into the bar's slot, as the real room's VoiceBar does.
    LobbyVoice: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="member-room">
        <LobbySlot name="controls">
          <button type="button">Mute</button>
        </LobbySlot>
        {children}
      </div>
    ),
  };
});
vi.mock('./lobby-claims-area', () => ({ LobbyClaimsArea: () => <div data-testid="claims" /> }));
vi.mock('./lobby-room-claims-hooks', () => ({ useDebateLobbyClaims: () => ({ data: undefined }) }));
vi.mock('./lobby-highlights-hooks', () => ({
  useLobbyHighlights: (_id: string, enabled: boolean) => {
    mocks.highlightsEnabled.push(enabled);
    return { data: enabled ? mocks.highlights : undefined };
  },
}));
vi.mock('./lobby-moderation', () => ({
  LobbyHostLists: () => <div data-testid="host-lists" />,
  LobbyRemovedNotice: () => null,
  useModerationNotice: () => null,
}));
vi.mock('./lobby-control-bar', async importOriginal => ({
  ...(await importOriginal<typeof import('./lobby-control-bar')>()),
  LobbyHandControl: () => <button type="button">Raise hand</button>,
}));
vi.mock('./lobby-queued-request', () => ({
  LOBBY_QUEUED_REQUEST_COPY: { prompt: (name: string) => name },
  LobbyQueuedRequestProvider: ({ children }: { children: React.ReactNode }) => children,
  useLobbyQueuedRequest: () => ({ pending: null, request: vi.fn(), outcome: null, dismissOutcome: vi.fn() }),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

const { DebateLobbyPage } = await import('./lobby-page');

function member(id: string, extra: Partial<DebateLobbyMember> = {}): DebateLobbyMember {
  return {
    user_id: id,
    profile_space_id: `space-${id}`,
    display_name: id[0]!.toUpperCase() + id.slice(1),
    avatar_cid: null,
    role: 'speaker',
    creator: false,
    acting_host: false,
    on_roster_since: '2026-10-09T10:00:00Z',
    stepped_out: false,
    in_debate: false,
    ...extra,
  };
}

function view(viewer: Partial<DebateLobbyView['viewer']> = {}): DebateLobbyView {
  return {
    lobby_id: 'lobby1',
    name: 'Onboarding with Adam',
    access: { status: 'admitted' },
    starts_at: '2026-10-09T10:00:00Z',
    opens_at: '2026-10-09T10:00:00Z',
    scheduled: false,
    created_by: 'adam',
    acting_host_id: null,
    hosts_changed_at: null,
    reminder_count: 0,
    members: [member('adam', { role: 'host', creator: true }), member('sam')],
    guest_count: 0,
    viewer: {
      role: 'speaker',
      creator: false,
      hosting: false,
      reminded: false,
      voice_away_at: null,
      connected: true,
      stepped_out: false,
      ...viewer,
    },
  };
}

beforeEach(() => {
  mocks.phone = false;
  mocks.lobby = view();
  mocks.highlights = { highlights: [], room_vote: null };
  mocks.highlightsEnabled = [];
  mocks.leave.mockReset();
});

afterEach(cleanup);

describe('DebateLobbyPage layout on desktop', () => {
  it('puts people beside the claims aside, with voice, the hint and Leave in the bottom bar', () => {
    render(<DebateLobbyPage lobbyId="lobby1" />);

    expect(screen.getByText('Debates / Lobbies')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Onboarding with Adam' })).toBeInTheDocument();
    expect(screen.getByText('Hosted by Adam · Voice only · Not recorded')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'People in the lobby' })).toBeVisible();
    expect(
      within(screen.getByRole('complementary', { name: 'Claims in the room' })).getByTestId('claims')
    ).toBeVisible();
    expect(screen.queryByRole('tablist', { name: 'Lobby' })).toBeNull();

    const bar = screen.getByTestId('lobby-control-bar');
    expect(within(bar).getByRole('button', { name: 'Mute' })).toBeInTheDocument();
    expect(bar).toHaveTextContent('Request someone on a claim, or tap a person to request them directly.');
    expect(within(screen.getByRole('banner')).getByTestId('availability-pill')).toBeInTheDocument();
    expect(within(bar).queryByTestId('availability-pill')).toBeNull();

    fireEvent.click(within(bar).getByRole('button', { name: 'Leave lobby' }));
    expect(mocks.leave).toHaveBeenCalledOnce();
  });

  it('gives a listener Raise hand in the bar instead of the hint', () => {
    mocks.lobby = view({ role: 'listener' });
    render(<DebateLobbyPage lobbyId="lobby1" />);

    const bar = screen.getByTestId('lobby-control-bar');
    expect(within(bar).getByRole('button', { name: 'Raise hand' })).toBeInTheDocument();
    expect(bar).not.toHaveTextContent('Request someone on a claim');
  });

  it('shows a host the raised-hands chip and End lobby, and no Leave in the header', () => {
    mocks.lobby = view({ role: 'host', hosting: true });
    mocks.lobby.members = [member('adam', { role: 'host' }), member('sam', { role: 'host' })];
    mocks.lobby.members.push(member('lee', { role: 'listener', hand_raised_at: '2026-10-09T10:01:00Z' }));
    render(<DebateLobbyPage lobbyId="lobby1" />);

    const header = screen.getByRole('banner');
    expect(within(header).getByRole('button', { name: 'End lobby' })).toBeInTheDocument();
    expect(within(header).queryByRole('button', { name: 'Leave lobby' })).toBeNull();
    fireEvent.click(within(header).getByRole('button', { name: 'Raised hands · 1' }));
    expect(screen.getByTestId('host-lists')).toBeInTheDocument();
  });
  it('scrolls the people and the claims each on their own, under a fixed header and bar', () => {
    render(<DebateLobbyPage lobbyId="lobby1" />);

    expect(screen.getByTestId('debate-lobby')).toHaveClass('h-[calc(100dvh-2.75rem)]');
    expect(screen.getByRole('region', { name: 'People in the lobby' })).toHaveClass('overflow-y-auto');
    const claims = screen.getByRole('complementary', { name: 'Claims in the room' });
    expect(claims).toHaveClass('overflow-y-auto');
    // The Claims tab's paging sentinel and the cards measure against the column through this.
    expect(claims).toHaveAttribute('data-debates-hub-scroll');
  });
});

describe('DebateLobbyPage layout on a phone', () => {
  it('scrolls the page, with no scroll box for the lists to measure against', () => {
    mocks.phone = true;
    render(<DebateLobbyPage lobbyId="lobby1" />);

    expect(screen.getByTestId('debate-lobby')).toHaveClass('min-h-[calc(100dvh-2.75rem)]');
    fireEvent.click(screen.getByRole('tab', { name: 'Claims' }));
    const claims = screen.getByRole('tabpanel', { name: 'Claims' });
    expect(claims).not.toHaveClass('overflow-y-auto');
    expect(claims).not.toHaveAttribute('data-debates-hub-scroll');
  });

  it('switches People and Claims tabs, keeping both mounted, with availability in the bar', () => {
    mocks.phone = true;
    render(<DebateLobbyPage lobbyId="lobby1" />);

    const tabs = screen.getByRole('tablist', { name: 'Lobby' });
    expect(within(tabs).getByRole('tab', { name: 'People' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'People' })).toBeVisible();
    expect(screen.getByTestId('claims')).not.toBeVisible();
    expect(within(screen.getByTestId('lobby-control-bar')).getByTestId('availability-pill')).toBeInTheDocument();

    fireEvent.click(within(tabs).getByRole('tab', { name: 'Claims' }));
    expect(screen.getByTestId('claims')).toBeVisible();
    expect(screen.getByTestId('member-room')).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'Lobby options' })).toBeInTheDocument();
  });

  it('gives the tabs tab and tabpanel semantics, with arrow keys', () => {
    mocks.phone = true;
    render(<DebateLobbyPage lobbyId="lobby1" />);

    const people = screen.getByRole('tab', { name: 'People' });
    const claims = screen.getByRole('tab', { name: 'Claims' });
    expect(screen.getByRole('tabpanel', { name: 'People' })).toHaveAttribute(
      'id',
      people.getAttribute('aria-controls')
    );
    expect(people).toHaveAttribute('tabindex', '0');
    expect(claims).toHaveAttribute('tabindex', '-1');

    people.focus();
    fireEvent.keyDown(people, { key: 'ArrowRight' });
    expect(claims).toHaveAttribute('aria-selected', 'true');
    expect(claims).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'Claims' })).toHaveAttribute(
      'id',
      claims.getAttribute('aria-controls')
    );

    fireEvent.keyDown(claims, { key: 'Home' });
    expect(people).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(people, { key: 'ArrowLeft' });
    expect(claims).toHaveAttribute('aria-selected', 'true');
  });

  it('marks the Claims tab when a room vote starts while on People', () => {
    mocks.phone = true;
    const { rerender } = render(<DebateLobbyPage lobbyId="lobby1" />);
    const claimsTab = () => screen.getByRole('tab', { name: /Claims/ });
    expect(within(claimsTab()).queryByRole('img', { name: 'New' })).toBeNull();

    mocks.highlights = {
      highlights: [],
      room_vote: { vote_id: 'v1' } as NonNullable<DebateLobbyHighlights['room_vote']>,
    };
    act(() => rerender(<DebateLobbyPage lobbyId="lobby1" />));
    expect(within(claimsTab()).getByRole('img', { name: 'New' })).toBeInTheDocument();

    fireEvent.click(claimsTab());
    expect(within(claimsTab()).queryByRole('img', { name: 'New' })).toBeNull();
  });

  it('reads highlights for the mark only on a phone', () => {
    render(<DebateLobbyPage lobbyId="lobby1" />);
    expect(mocks.highlightsEnabled.every(enabled => !enabled)).toBe(true);
  });
});
