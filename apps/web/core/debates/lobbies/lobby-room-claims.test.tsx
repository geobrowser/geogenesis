import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyClaim, DebateLobbyClaims } from '../api';
import { REQUEST_PENDING_LABEL } from '../request-gate';
import { LOBBY_ROOM_CLAIMS_COPY, LobbyRoomClaims, lobbyRoomClaimFrom } from './lobby-room-claims';
import type { LobbyPageView } from './lobby-view';

const mocks = vi.hoisted(() => ({
  data: undefined as DebateLobbyClaims | undefined,
  mutate: vi.fn(),
  recover: vi.fn(),
  backfill: vi.fn(),
  indexed: null as 'positive' | 'negative' | null,
  refreshOnRefusal: vi.fn(),
  activity: undefined as { available_to_debate: boolean; outbound_request?: unknown } | undefined,
  snapshot: { status: 'idle', pending: null, runId: null } as {
    status: string;
    pending: { expectedResponse: 'positive' | 'negative' | null } | null;
    runId: string | null;
  },
}));

vi.mock('./lobby-room-claims-hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('./lobby-room-claims-hooks')>()),
  useRefreshLobbyClaimsOnRefusal: () => mocks.refreshOnRefusal,
  useDebateLobbyClaims: () => ({
    data: mocks.data,
    isLoading: false,
    error: null,
    failureReason: null,
    refetch: vi.fn(),
  }),
}));

// Recovery itself is the side panel's, tested with it; here only that a refusal reaches it.
vi.mock('~/core/claims/browse/use-claim-matchup', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/claims/browse/use-claim-matchup')>()),
  useMissingIntentRecovery: () => mocks.recover,
}));

vi.mock('../backfill-readiness-for-held-position', async importOriginal => ({
  ...(await importOriginal<typeof import('../backfill-readiness-for-held-position')>()),
  useBackfillReadinessForHeldPosition: mocks.backfill,
}));

vi.mock('~/core/claims/browse/claim-response-summary', () => ({
  useClaimResponseSummary: () => ({ indexedViewerDirection: mocks.indexed, isViewerResponseLoading: false }),
}));

vi.mock('../hooks', () => ({ useDebateActivity: () => ({ data: mocks.activity }) }));

vi.mock('../matchmaking/hooks', () => ({
  useDebateRequests: () => ({ data: { outbound: null, incoming: [] } }),
  useCreateDebateRequest: () => ({ mutate: mocks.mutate, isPending: false, error: null }),
}));

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponseIndexingSnapshot: () => mocks.snapshot,
}));

vi.mock('../matchmaking/hub-states', () => ({
  HubQueryState: ({
    isEmpty,
    emptyMessage,
    emptyAction,
    children,
  }: {
    isEmpty: boolean;
    emptyMessage: string;
    emptyAction?: { label: string; onClick: () => void };
    children: React.ReactNode;
  }) =>
    isEmpty ? (
      <div>
        <p>{emptyMessage}</p>
        {emptyAction ? (
          <button type="button" onClick={emptyAction.onClick}>
            {emptyAction.label}
          </button>
        ) : null}
      </div>
    ) : (
      <>{children}</>
    ),
  HubMessageNote: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

vi.mock('../matchmaking/matchmaking-claim-card', () => ({
  isResolvableClaim: () => true,
  MatchmakingClaimCard: ({ claim, endSlot }: { claim: { claim: string }; endSlot?: React.ReactNode }) => (
    <article data-testid="claim-card">
      <h3>{claim.claim}</h3>
      {endSlot}
    </article>
  ),
}));

const lobby = { lobby_id: '0192-abc' } as LobbyPageView;

function row(id: string, viewerPosition: boolean | null, requestableAgainst: number): DebateLobbyClaim {
  const other = (position: boolean) => (viewerPosition === null ? position === false : position !== viewerPosition);
  return {
    claim: { id, space_id: 'space-1', claim_entity_id: `entity-${id}`, claim: `Claim ${id}`, description: null },
    response_kind: 'stance',
    viewer_response:
      viewerPosition === null
        ? null
        : { position: viewerPosition, position_label: viewerPosition ? 'Agree' : 'Disagree' },
    viewer_debate_ready: true,
    readiness_disabled_reason: null,
    active_debate: false,
    positions: [true, false].map(position => ({
      position,
      position_label: position ? 'Agree' : 'Disagree',
      total_in_room: 2,
      requestable_count: other(position) ? requestableAgainst : 0,
      participants: [],
    })),
  };
}

beforeEach(() => {
  mocks.activity = { available_to_debate: true };
});

afterEach(() => {
  cleanup();
  mocks.data = undefined;
  mocks.mutate.mockReset();
  mocks.recover.mockReset();
  mocks.backfill.mockReset();
  mocks.indexed = null;
  mocks.refreshOnRefusal.mockReset();
  mocks.snapshot = { status: 'idle', pending: null, runId: null };
});

describe('LobbyRoomClaims', () => {
  it('keeps the server order, drops excluded claims, and sends a lobby-scoped request', () => {
    mocks.data = {
      lobby_id: '0192abc',
      source: 'room',
      claims: [row('b', true, 1), row('a', true, 0), row('c', false, 2)],
    };
    render(<LobbyRoomClaims lobby={lobby} excludeClaimIds={new Set(['c'])} />);

    expect(screen.getAllByRole('heading').map(heading => heading.textContent)).toEqual(['Claim b', 'Claim a']);
    const requests = screen.getAllByRole('button', { name: 'Request debate' });
    expect(requests).toHaveLength(1);

    fireEvent.click(requests[0]!);
    expect(mocks.mutate).toHaveBeenCalledWith(
      { space_id: 'space-1', claim_entity_id: 'entity-b', lobby_id: '0192abc' },
      { onError: expect.any(Function) }
    );

    // A refusal reaches both the intent recovery and the stale-offer refresh.
    const refusal = new Error('refused');
    mocks.mutate.mock.calls[0]![1].onError(refusal);
    expect(mocks.recover).toHaveBeenCalledWith(refusal);
    expect(mocks.refreshOnRefusal).toHaveBeenCalledWith(refusal);
  });

  it('waits for geo-chat to hold a side the viewer just took before offering a request', () => {
    mocks.snapshot = { status: 'reconciling', pending: { expectedResponse: 'positive' }, runId: 'run-1' };
    mocks.data = { lobby_id: '0192abc', source: 'room', claims: [row('a', null, 1)] };
    render(<LobbyRoomClaims lobby={lobby} />);

    const offer = screen.getByRole('button', { name: REQUEST_PENDING_LABEL });
    expect(offer.hasAttribute('disabled')).toBe(true);
  });

  it('holds the offer while geo-chat has the side but not a ready row for it', () => {
    mocks.data = {
      lobby_id: '0192abc',
      source: 'room',
      claims: [{ ...row('a', true, 1), viewer_debate_ready: false }],
    };
    render(<LobbyRoomClaims lobby={lobby} />);

    expect(screen.queryByRole('button', { name: 'Request debate' })).toBeNull();
    expect(screen.getByRole('button', { name: REQUEST_PENDING_LABEL }).hasAttribute('disabled')).toBe(true);
  });

  it('says why when geo-chat disabled the side, instead of waiting', () => {
    mocks.data = {
      lobby_id: '0192abc',
      source: 'room',
      claims: [
        { ...row('a', true, 1), viewer_debate_ready: false, readiness_disabled_reason: 'claim_response_withdrawn' },
      ],
    };
    render(<LobbyRoomClaims lobby={lobby} />);

    const button = screen.getByRole('button', { name: 'Request debate' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: REQUEST_PENDING_LABEL })).toBeNull();
    fireEvent.click(button);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('waits for the backfill on a withdrawn row the viewer has re-answered on chain', () => {
    mocks.indexed = 'positive';
    const withdrawn = {
      ...row('a', null, 1),
      viewer_debate_ready: false,
      readiness_disabled_reason: 'claim_response_withdrawn',
    };
    // geo-chat has no side for the viewer, so only Disagree people are requestable against Agree.
    withdrawn.positions = withdrawn.positions.map(side => ({ ...side, requestable_count: side.position ? 0 : 1 }));
    mocks.data = { lobby_id: '0192abc', source: 'room', claims: [withdrawn] };
    render(<LobbyRoomClaims lobby={lobby} />);

    expect(mocks.backfill).toHaveBeenCalledWith(expect.objectContaining({ indexedPosition: true }));
    expect(screen.getByRole('button', { name: REQUEST_PENDING_LABEL }).hasAttribute('disabled')).toBe(true);
  });

  it('holds the offer while the viewer is not available', () => {
    mocks.activity = { available_to_debate: false };
    mocks.data = { lobby_id: '0192abc', source: 'room', claims: [row('a', true, 1)] };
    render(<LobbyRoomClaims lobby={lobby} />);

    expect(screen.getByRole('button', { name: 'Request debate' }).hasAttribute('disabled')).toBe(true);
  });

  it('says when the list is the recently voted fallback', () => {
    mocks.data = { lobby_id: '0192abc', source: 'recent', claims: [row('a', null, 0)] };
    render(<LobbyRoomClaims lobby={lobby} />);

    expect(screen.getByText(LOBBY_ROOM_CLAIMS_COPY.recent)).toBeTruthy();
    expect(screen.getByTestId('claim-card')).toBeTruthy();
  });

  it('shows no empty state when every claim is shown elsewhere', () => {
    mocks.data = { lobby_id: '0192abc', source: 'recent', claims: [row('a', null, 0)] };
    render(<LobbyRoomClaims lobby={lobby} excludeClaimIds={new Set(['a'])} onExplore={vi.fn()} />);

    expect(screen.queryByText(LOBBY_ROOM_CLAIMS_COPY.empty)).toBeNull();
    expect(screen.queryByText(LOBBY_ROOM_CLAIMS_COPY.recent)).toBeNull();
    expect(screen.queryByTestId('claim-card')).toBeNull();
  });

  it('offers Explore when there is nothing to show', () => {
    const onExplore = vi.fn();
    mocks.data = { lobby_id: '0192abc', source: 'recent', claims: [] };
    render(<LobbyRoomClaims lobby={lobby} onExplore={onExplore} />);

    expect(screen.getByText(LOBBY_ROOM_CLAIMS_COPY.empty)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Explore claims' }));
    expect(onExplore).toHaveBeenCalled();
  });
});

describe('lobbyRoomClaimFrom', () => {
  it('counts the viewer back on their own side only', () => {
    const entry = lobbyRoomClaimFrom(row('a', true, 1));
    expect(entry.positions.map(side => [side.position, side.total_count, side.requestable_count])).toEqual([
      [true, 3, 0],
      [false, 2, 1],
    ]);
  });
});
