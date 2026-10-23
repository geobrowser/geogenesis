import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import type * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { type DebateLobbyMember, GeoChatRequestError } from '../api';
import type { LobbyPageView } from './lobby-view';

vi.mock('~/core/hooks/use-is-phone-layout', () => ({ useIsPhoneLayout: () => false }));
vi.mock('./lobby-schedule', () => ({ LobbyScheduleSection: () => <div>Schedule a debate</div> }));
vi.mock('./lobby-guest-hooks', () => ({ useIsLobbyGuest: () => false }));
vi.mock('./lobby-people', () => ({
  LobbyPersonName: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('./lobby-request-debate', async importOriginal => ({
  ...(await importOriginal<typeof import('./lobby-request-debate')>()),
  LobbyRequestDebate: () => <button type="button">Request a debate</button>,
}));
vi.mock('./moderation-hooks', () => ({
  useModerateLobbyMember: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null }),
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
vi.mock('./lobby-host-lobbies', () => ({
  useListedLobbies: () => [],
  nextLobbyByHost: () => ({
    host: { user_id: 'adam', profile_space_id: 'space-adam', display_name: 'Adam', avatar_cid: null },
    lobby: { lobby_id: 'next', name: 'Next lobby', open: false, opens_at: '2026-10-30T10:00:00Z' },
  }),
}));
vi.mock('./lobby-reminder-press', () => ({
  useLobbyReminderPress: () => ({ reminded: false, pending: false, press: vi.fn(), error: null }),
  LobbyReminderError: () => null,
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

const { LobbyPeople } = await import('./lobby-roster');
const { LobbyPersonCard } = await import('./lobby-person-menu');
const { LobbyClosedCard, LobbyEmptyRoom } = await import('./lobby-state-cards');
const { LobbyPurposeProvider } = await import('./lobby-purpose');
const { memberActions, otherLobbyIdFrom } = await import('./lobby-format');

const CALL = { purpose: 'call' as const, spaceId: 'space1', exitHref: '/space/space1' };

afterEach(cleanup);

function member(id: string, extra: Partial<DebateLobbyMember> = {}): DebateLobbyMember {
  return {
    user_id: id,
    profile_space_id: `space-${id}`,
    display_name: id,
    avatar_cid: null,
    role: 'speaker',
    creator: false,
    acting_host: false,
    on_roster_since: '2026-10-23T10:00:00Z',
    stepped_out: false,
    in_debate: false,
    available_to_debate: true,
    ...extra,
  };
}

function view(members: DebateLobbyMember[], extra: Partial<LobbyPageView> = {}): LobbyPageView {
  return {
    lobby_id: 'call1',
    name: 'Community call',
    purpose: 'call',
    call: { space_id: 'space1', space_name: 'Crypto', started_by: null },
    access: { status: 'admitted' },
    starts_at: '2026-10-23T10:00:00Z',
    opens_at: '2026-10-23T10:00:00Z',
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

function inCall(children: React.ReactNode) {
  return <LobbyPurposeProvider value={CALL}>{children}</LobbyPurposeProvider>;
}

describe('the roster in a space call', () => {
  const roster = [
    member('Adam', { role: 'host', creator: true }),
    member('Daniel'),
    member('Maya', { in_debate: true }),
  ];
  const pairs = [{ people: [{ ...member('Maya'), in_lobby: true }] }];

  it('shows no availability, debate pairs or disagreements', () => {
    render(
      inCall(
        <LobbyPeople
          lobby={view(roster, { debate_pairs: pairs })}
          viewerId="Adam"
          ownAvailable
          disagreements={[{ user_id: 'daniel', claims: 4 }]}
        />
      )
    );

    expect(screen.queryByTestId('lobby-debate-pair')).not.toBeInTheDocument();
    expect(screen.queryByText('Looking to debate')).not.toBeInTheDocument();
    expect(screen.queryByText(/Disagrees/)).not.toBeInTheDocument();
  });

  it('keeps them in a lobby', () => {
    render(
      <LobbyPeople lobby={view(roster, { debate_pairs: pairs })} viewerId="Adam" ownAvailable disagreements={null} />
    );

    expect(screen.getByTestId('lobby-debate-pair')).toBeInTheDocument();
    expect(screen.getAllByText('Looking to debate').length).toBeGreaterThan(0);
  });
});

describe('the person card in a space call', () => {
  it('offers no debate request or scheduling, and removes from the call', () => {
    const daniel = member('Daniel');
    render(
      inCall(
        <LobbyPersonCard
          lobby={view([member('Adam', { role: 'host' }), daniel])}
          member={daniel}
          isSelf={false}
          viewerId="Adam"
          disagreements={null}
          onDone={vi.fn()}
        />
      )
    );

    const card = screen.getByTestId('lobby-person-card');
    expect(within(card).queryByRole('button', { name: 'Request a debate' })).not.toBeInTheDocument();
    expect(within(card).queryByText('Schedule a debate')).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Remove from call' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Move to listeners' })).toBeInTheDocument();
  });

  it('does not say someone in a debate can be requested later', () => {
    const maya = member('Maya', { in_debate: true });
    render(
      inCall(
        <LobbyPersonCard
          lobby={view([maya])}
          member={maya}
          isSelf={false}
          viewerId="Adam"
          disagreements={null}
          onDone={vi.fn()}
        />
      )
    );
    expect(screen.queryByText(/is in a debate/)).not.toBeInTheDocument();
  });
});

describe('state cards in a space call', () => {
  it('ends with a way back to the space, not the creator’s next lobby', () => {
    render(inCall(<LobbyClosedCard lobby={{ lobby_id: 'call1', created_by: 'Adam' }} ended />));

    expect(screen.getByRole('heading', { name: 'This call has ended' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the space' })).toHaveAttribute('href', '/space/space1');
    expect(screen.queryByText(/next lobby/i)).not.toBeInTheDocument();
  });

  it('asks the first one in to share the link, without lobby suggestions', () => {
    render(inCall(<LobbyEmptyRoom lobby={{ lobby_id: 'call1', created_by: 'Adam' }} signedIn />));

    expect(screen.getByText('You’re the first one here. Share the link so others can join.')).toBeInTheDocument();
    expect(screen.queryByText('Next lobby')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'See who’s free this week' })).not.toBeInTheDocument();
  });
});

describe('space editors', () => {
  const host = { hosting: true, role: 'host' as const, creator: true };

  it('cannot be acted on, nor step down, since they host because of the space', () => {
    expect(memberActions(host, { role: 'host', creator: false, space_editor: true }, false)).toEqual([]);
    expect(memberActions(host, { role: 'host', creator: false, space_editor: true }, true)).toEqual([]);
  });

  it('leaves other hosts as they were', () => {
    expect(memberActions(host, { role: 'host', creator: false }, false)).toEqual(['remove-host']);
  });
});

describe('one room at a time', () => {
  it('names the call the viewer is in when the other room is a call', () => {
    const error = new GeoChatRequestError('already', 'already_in_another_lobby', 409, null, {
      current_lobby_id: null,
      current_call_id: 'ABC-def',
    });
    expect(otherLobbyIdFrom(error)).toBe('abcdef');
  });
});
