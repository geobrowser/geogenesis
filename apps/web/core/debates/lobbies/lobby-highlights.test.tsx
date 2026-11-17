import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type DebateClaimSummary, GeoChatRequestError } from '../api';
import { AgendaClaimFilterContext } from '../todays-claims/agenda-claim-filter';
import { agendaFilterFixture } from '../todays-claims/debate-agenda-fixtures';
import {
  LobbyRoomClaimsWithHighlights,
  LobbyRoomVote,
  lobbyClaimEntry,
  lobbyHighlightErrorMessage,
} from './lobby-highlights';
import type { LobbyHighlightsState } from './lobby-highlights-state';
import type { LobbyRoomClaim } from './lobby-room-claims-list';
import type { LobbyPageView } from './lobby-view';

type MutateOptions = { onSuccess?: () => void; onError?: (error: unknown) => void };

const mocks = vi.hoisted(() => ({
  state: undefined as LobbyHighlightsState | undefined,
  roomClaim: undefined as unknown,
  setHighlight: vi.fn(),
  startVote: vi.fn(),
  endVote: vi.fn(),
  hint: vi.fn(),
  roomListProps: null as null | {
    excludeClaimIds?: ReadonlySet<string>;
    renderMenu?: (entry: LobbyRoomClaim) => React.ReactNode;
  },
}));

const mutation = (mutate: ReturnType<typeof vi.fn>) => ({
  mutate,
  reset: vi.fn(),
  isPending: false,
  isError: false,
  error: null,
});

vi.mock('./lobby-highlights-hooks', () => ({
  useLobbyHighlights: () => ({ data: mocks.state }),
  useSetLobbyHighlight: () => mutation(mocks.setHighlight),
  useStartLobbyRoomVote: () => mutation(mocks.startVote),
  useEndLobbyRoomVote: () => mutation(mocks.endVote),
  useRoomVoteHint: (...args: unknown[]) => mocks.hint(...args),
}));

vi.mock('./lobby-room-claims-hooks', () => ({
  useDebateLobbyClaims: () => ({ data: { claims: [] } }),
}));

const roomClaim = (id: string): DebateClaimSummary => ({
  id,
  space_id: 'space',
  claim_entity_id: `entity-${id}`,
  claim: `Claim ${id}`,
  description: null,
});

vi.mock('./lobby-room-claims', () => ({
  LobbyClaimRequest: () => null,
  lobbyRoomClaimFrom: vi.fn(),
  LobbyRoomClaims: (props: {
    excludeClaimIds?: ReadonlySet<string>;
    renderMenu?: (entry: LobbyRoomClaim) => React.ReactNode;
  }) => {
    mocks.roomListProps = props;
    return (
      <div data-testid="room-list">
        {props.renderMenu?.({ claim: mocks.roomClaim as DebateClaimSummary } as LobbyRoomClaim)}
      </div>
    );
  },
}));

vi.mock('./lobby-room-claims-list', () => ({
  LobbyRoomClaimsList: ({
    claims,
    renderHeader,
    renderMenu,
  }: {
    claims: LobbyRoomClaim[];
    renderHeader?: (entry: LobbyRoomClaim) => React.ReactNode;
    renderMenu?: (entry: LobbyRoomClaim) => React.ReactNode;
  }) => (
    <ul>
      {claims.map(entry => (
        <li key={entry.claim.id} data-testid={`card-${entry.claim.id}`}>
          {renderHeader?.(entry)}
          <span>{entry.claim.claim}</span>
          {renderMenu?.(entry)}
        </li>
      ))}
    </ul>
  ),
}));

vi.mock('~/design-system/menu', () => ({
  Menu: ({
    trigger,
    open,
    onOpenChange,
    children,
  }: {
    trigger: React.ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
  }) => (
    <div>
      <span onClick={() => onOpenChange(!open)}>{trigger}</span>
      {open ? children : null}
    </div>
  ),
}));

const priya = { user_id: 'u2', profile_space_id: 'p2', display_name: 'Priya', avatar_cid: null };
const adam = { user_id: 'u1', profile_space_id: 'p1', display_name: 'Adam', avatar_cid: null };

function stateWith({ vote = true }: { vote?: boolean } = {}): LobbyHighlightsState {
  return {
    lobby_id: 'lobby',
    as_of: '2026-10-07T12:00:00Z',
    highlights: [
      { claim: roomClaim('h1'), highlighted_by: priya, highlighted_at: '2026-10-07T12:00:00Z' },
      { claim: roomClaim('v'), highlighted_by: adam, highlighted_at: '2026-10-07T11:00:00Z' },
    ],
    room_vote: vote
      ? {
          vote_id: 'vote-1',
          claim: roomClaim('v'),
          started_by: adam,
          started_at: '2026-10-07T12:00:00Z',
          tally: { agree: 2, disagree: 1, eligible: 5 },
        }
      : null,
    viewer: { room_vote_position: null, vote_id: vote ? 'vote-1' : null },
  };
}

const lobby = (hosting: boolean) =>
  ({ lobby_id: 'lobby', viewer: { kind: 'member', hosting, connected: true } }) as unknown as LobbyPageView;

beforeEach(() => {
  mocks.state = stateWith();
  mocks.roomClaim = roomClaim('r1');
  mocks.roomListProps = null;
  for (const fn of [mocks.setHighlight, mocks.startVote, mocks.endVote, mocks.hint]) fn.mockReset();
});

afterEach(cleanup);

describe('LobbyRoomClaimsWithHighlights', () => {
  it('shows highlights first with who highlighted them, and drops them from the list below', () => {
    render(<LobbyRoomClaimsWithHighlights lobby={lobby(false)} />);

    const highlighted = screen.getByTestId('lobby-highlighted-claims');
    expect(within(highlighted).getByText('Highlighted by Priya')).toBeTruthy();
    // The voted claim is in the vote card, not repeated here.
    expect(within(highlighted).queryByTestId('card-v')).toBeNull();
    expect([...(mocks.roomListProps?.excludeClaimIds ?? [])].sort()).toEqual(['h1', 'v']);
  });

  it('gives non-hosts no host controls', () => {
    render(<LobbyRoomClaimsWithHighlights lobby={lobby(false)} />);
    expect(screen.queryByRole('button', { name: 'Claim options' })).toBeNull();
    expect(mocks.roomListProps?.renderMenu).toBeUndefined();
  });

  it('lets a host highlight a room claim and remove a highlight', () => {
    render(<LobbyRoomClaimsWithHighlights lobby={lobby(true)} />);

    const [onHighlight, onRoomClaim] = screen.getAllByRole('button', { name: 'Claim options' });
    fireEvent.click(onRoomClaim!);
    fireEvent.click(screen.getByRole('button', { name: 'Highlight at the top for everyone' }));
    expect(mocks.setHighlight).toHaveBeenCalledWith({ claimId: 'r1', highlighted: true }, expect.anything());

    fireEvent.click(onHighlight!);
    fireEvent.click(screen.getByRole('button', { name: 'Remove highlight' }));
    expect(mocks.setHighlight).toHaveBeenCalledWith({ claimId: 'h1', highlighted: false }, expect.anything());
  });

  it('asks before replacing a running vote', () => {
    render(<LobbyRoomClaimsWithHighlights lobby={lobby(true)} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Claim options' })[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Ask the room to vote' }));
    expect(mocks.startVote).not.toHaveBeenCalled();
    expect(screen.getByText('End the vote on “Claim v” and start this one?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'End and start' }));
    expect(mocks.startVote).toHaveBeenCalledWith({ claimId: 'r1', replace: true }, expect.anything());
  });

  it('starts a vote at once when none runs, and asks when another host started one meanwhile', () => {
    mocks.state = stateWith({ vote: false });
    mocks.startVote.mockImplementation((_variables: unknown, options: MutateOptions) =>
      options.onError?.(
        new GeoChatRequestError('running', 'lobby_room_vote_running', 409, null, {
          vote_id: 'vote-2',
          debate_claim_id: 'h1',
        })
      )
    );
    render(<LobbyRoomClaimsWithHighlights lobby={lobby(true)} />);

    // Highlights h1 and v, then the room claim.
    fireEvent.click(screen.getAllByRole('button', { name: 'Claim options' }).at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: 'Ask the room to vote' }));
    expect(mocks.startVote).toHaveBeenCalledWith({ claimId: 'r1', replace: false }, expect.anything());
    expect(screen.getByText('End the vote on “Claim h1” and start this one?')).toBeTruthy();
  });
});

describe('LobbyRoomVote', () => {
  it('shows the vote, who started it and the room tally to everyone', () => {
    render(<LobbyRoomVote lobby={lobby(false)} />);

    expect(screen.getByText('Room vote · started by Adam')).toBeTruthy();
    expect(screen.getByTestId('card-v')).toBeTruthy();
    expect(screen.getByText('2 of 3 in the room agree')).toBeTruthy();
    expect(screen.getByText('3 of 5 voted')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'End vote' })).toBeNull();
    expect(mocks.hint).toHaveBeenCalledWith('lobby', mocks.state?.room_vote, true);
  });

  it('lets a host end the vote', () => {
    render(<LobbyRoomVote lobby={lobby(true)} />);
    fireEvent.click(screen.getByRole('button', { name: 'End vote' }));
    expect(mocks.endVote).toHaveBeenCalledWith('vote-1');
  });

  it('shows nothing without a running vote', () => {
    mocks.state = stateWith({ vote: false });
    render(<LobbyRoomVote lobby={lobby(true)} />);
    expect(screen.queryByTestId('lobby-room-vote')).toBeNull();
  });

  it('says when nobody has voted yet', () => {
    mocks.state = stateWith();
    mocks.state.room_vote!.tally = { agree: 0, disagree: 0, eligible: 4 };
    render(<LobbyRoomVote lobby={lobby(false)} />);
    expect(screen.getByText('Nobody has voted yet')).toBeTruthy();
    expect(screen.getByText('0 of 4 voted')).toBeTruthy();
  });
});

/**
 * GEO-3775. In an agenda-only lobby a host's highlights and room vote are agenda claims only
 * (`AGENDA_ONLY_LOBBY_HOST_LISTS`); one on no agenda still leaves the list below.
 */
describe('agenda-only', () => {
  const inLobby = (filter: ReturnType<typeof agendaFilterFixture>, children: React.ReactNode) =>
    render(<AgendaClaimFilterContext.Provider value={filter}>{children}</AgendaClaimFilterContext.Provider>);

  it('draws only the highlights on an agenda, and still keeps the others out of the list below', () => {
    mocks.state = stateWith({ vote: false });
    inLobby(agendaFilterFixture({ ids: ['entity-elsewhere'] }), <LobbyRoomClaimsWithHighlights lobby={lobby(false)} />);
    expect(screen.queryByTestId('lobby-highlighted-claims')).toBeNull();
    expect([...(mocks.roomListProps?.excludeClaimIds ?? [])].sort()).toEqual(['h1', 'v']);

    cleanup();
    inLobby(agendaFilterFixture({ ids: ['entity-h1'] }), <LobbyRoomClaimsWithHighlights lobby={lobby(false)} />);
    expect(within(screen.getByTestId('lobby-highlighted-claims')).getByTestId('card-h1')).toBeTruthy();
  });

  it('draws no highlight while the agendas load', () => {
    mocks.state = stateWith({ vote: false });
    inLobby(
      agendaFilterFixture({ ids: ['entity-h1'], pending: true }),
      <LobbyRoomClaimsWithHighlights lobby={lobby(false)} />
    );
    expect(screen.queryByTestId('lobby-highlighted-claims')).toBeNull();
  });

  it('neither draws nor hints a vote on a claim no agenda lists', () => {
    inLobby(agendaFilterFixture({ ids: ['entity-h1'] }), <LobbyRoomVote lobby={lobby(false)} />);
    expect(screen.queryByTestId('lobby-room-vote')).toBeNull();
    expect(mocks.hint).toHaveBeenCalledWith('lobby', null, true);

    cleanup();
    inLobby(agendaFilterFixture({ ids: ['entity-v'] }), <LobbyRoomVote lobby={lobby(false)} />);
    expect(screen.getByTestId('lobby-room-vote')).toBeTruthy();
  });
});

describe('lobbyClaimEntry', () => {
  it('draws a claim nobody in the room holds with empty sides and the viewer’s known side', () => {
    const entry = lobbyClaimEntry(roomClaim('x'), undefined, false);
    expect(entry.readiness.viewer_response).toEqual({ position: false, position_label: 'Disagree' });
    expect(entry.positions.map(side => [side.position, side.total_count])).toEqual([
      [true, 0],
      [false, 1],
    ]);
    expect(lobbyClaimEntry(roomClaim('x'), undefined).readiness.viewer_response).toBeNull();
  });
});

describe('lobbyHighlightErrorMessage', () => {
  it('names the highlight limit', () => {
    expect(
      lobbyHighlightErrorMessage(new GeoChatRequestError('full', 'lobby_highlight_limit', 409, null, { limit: 10 }))
    ).toBe('You can highlight up to 10 claims. Remove one first.');
  });
});
