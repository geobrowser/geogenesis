import { cleanup, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { useActionContext } from '~/core/action-context-provider';

import type { DebateLobbyMember, DebateLobbyRoomVote, DebateLobbyView } from '../api';
import { type LobbyPageView, lobbyViewForGuest, lobbyViewForMember } from './lobby-view';

const mocks = vi.hoisted(() => ({
  roomVote: null as DebateLobbyRoomVote | null,
  highlightsEnabled: [] as boolean[],
  lobbyHeadcountSeen: vi.fn(),
  lobbyRoomVoteSeen: vi.fn(),
  lobbyViewerRole: vi.fn(),
}));

vi.mock('./lobby-highlights-hooks', () => ({
  // Like a disabled query: no request, but whatever the cache holds.
  useLobbyHighlights: (_lobbyId: string, enabled: boolean) => {
    mocks.highlightsEnabled.push(enabled);
    return { data: { room_vote: mocks.roomVote } };
  },
}));

vi.mock('./lobby-analytics', () => ({
  lobbyHeadcountSeen: mocks.lobbyHeadcountSeen,
  lobbyRoomVoteSeen: mocks.lobbyRoomVoteSeen,
  lobbyViewerRole: mocks.lobbyViewerRole,
}));

const { LobbyAnalyticsScope } = await import('./lobby-room-analytics');

const LOBBY = '6f347510-bc7a-4865-8c1f-99748bb2ee27';
const CLAIM = '22222222222222222222222222222222';
const OTHER_CLAIM = '33333333333333333333333333333333';

const member = (id: string, steppedOut = false): DebateLobbyMember => ({
  user_id: id,
  profile_space_id: `space-${id}`,
  display_name: null,
  avatar_cid: null,
  role: 'listener',
  creator: false,
  acting_host: false,
  on_roster_since: '2026-10-14T12:00:00Z',
  stepped_out: steppedOut,
  in_debate: false,
});

function view(viewer: Partial<DebateLobbyView['viewer']> = {}): DebateLobbyView {
  return {
    lobby_id: LOBBY,
    name: 'Lobby',
    access: { status: 'admitted' },
    starts_at: '2026-10-14T12:00:00Z',
    opens_at: '2026-10-14T12:00:00Z',
    scheduled: false,
    created_by: 'host',
    acting_host_id: null,
    hosts_changed_at: null,
    reminder_count: 0,
    members: [member('a'), member('b'), member('c', true)],
    guest_count: 2,
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

const vote: DebateLobbyRoomVote = {
  vote_id: 'vote-1',
  claim: { id: 'debate-claim', space_id: 'space', claim_entity_id: CLAIM, claim: 'Claim', description: null },
  started_by: null,
  started_at: '2026-10-14T12:00:00Z',
  tally: { agree: 1, disagree: 0, eligible: 3 },
};

const seen: Record<string, unknown>[] = [];
function VoteProbe({ claimId }: { claimId: string }) {
  const getContext = useActionContext('entity_vote_buttons', 'claim', claimId);
  seen.push(getContext() as Record<string, unknown>);
  return null;
}

function renderScope(lobby: LobbyPageView, claimId = CLAIM) {
  return render(
    <LobbyAnalyticsScope lobby={lobby}>
      <VoteProbe claimId={claimId} />
    </LobbyAnalyticsScope>
  );
}

afterEach(() => {
  cleanup();
  seen.length = 0;
  mocks.roomVote = null;
  mocks.highlightsEnabled.length = 0;
  vi.clearAllMocks();
});

describe('LobbyAnalyticsScope', () => {
  it('puts the lobby on every action inside, and the room vote only on its claim', () => {
    mocks.roomVote = vote;
    renderScope(lobbyViewForMember(view()));
    renderScope(lobbyViewForMember(view()), OTHER_CLAIM);

    expect(seen[0]).toMatchObject({ lobby_id: LOBBY.replaceAll('-', ''), room_vote_id: 'vote-1' });
    expect(seen[1]).toMatchObject({ lobby_id: LOBBY.replaceAll('-', '') });
    expect(seen[1]).not.toHaveProperty('room_vote_id');
  });

  it('reports the viewer’s role and the room’s headcount while in the room', () => {
    const moderation = { action: 'move_to_speakers' as const, at: '2026-10-14T12:01:00Z' };
    renderScope(lobbyViewForMember(view({ hosting: true, last_moderation: moderation })));

    expect(mocks.lobbyViewerRole).toHaveBeenCalledWith(LOBBY.replaceAll('-', ''), {
      role: 'speaker',
      hosting: true,
      moderation,
    });
    // The header's count (the whole roster, stepped out included) plus two guests.
    expect(mocks.lobbyHeadcountSeen).toHaveBeenCalledWith(LOBBY.replaceAll('-', ''), 5);
  });

  it('follows the room vote from a hosting tab only', () => {
    mocks.roomVote = vote;
    renderScope(lobbyViewForMember(view({ hosting: false })));
    expect(mocks.lobbyRoomVoteSeen).not.toHaveBeenCalled();

    cleanup();
    renderScope(lobbyViewForMember(view({ hosting: true })));
    expect(mocks.lobbyRoomVoteSeen).toHaveBeenCalledWith(LOBBY.replaceAll('-', ''), vote);
  });

  it('never asks for the highlights itself', () => {
    renderScope(lobbyViewForMember(view({ hosting: true })));
    expect(mocks.highlightsEnabled).toEqual([false]);
  });

  it('reports nothing outside the room, but still scopes the lobby', () => {
    renderScope(lobbyViewForMember(view({ connected: false, stepped_out: true })));
    const { lobby_id: _id, name: _name, access: _access, viewer: _viewer, ...guestFields } = view();
    renderScope(
      lobbyViewForGuest({ lobby_id: LOBBY, name: 'Lobby', access: { status: 'admitted' }, ...guestFields } as never)
    );

    expect(mocks.lobbyViewerRole).not.toHaveBeenCalled();
    expect(mocks.lobbyHeadcountSeen).not.toHaveBeenCalled();
    expect(seen.every(context => context.lobby_id === LOBBY.replaceAll('-', ''))).toBe(true);
  });
});
