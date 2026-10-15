import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyClaim, DebateLobbyClaims, DebateLobbyMember } from '../api';
import type { LobbyPageView } from './lobby-view';

const mocks = vi.hoisted(() => ({
  data: undefined as DebateLobbyClaims | undefined,
  isLoading: false,
  mutate: vi.fn(),
  phone: false,
}));

vi.mock('~/core/hooks/use-is-phone-layout', () => ({ useIsPhoneLayout: () => mocks.phone }));

vi.mock('./lobby-room-claims-hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('./lobby-room-claims-hooks')>()),
  useRefreshLobbyClaimsOnRefusal: () => vi.fn(),
  useDebateLobbyClaims: () => ({ data: mocks.data, isLoading: mocks.isLoading }),
}));

vi.mock('~/core/claims/browse/use-claim-matchup', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/claims/browse/use-claim-matchup')>()),
  useMissingIntentRecovery: () => vi.fn(),
}));

vi.mock('../hooks', () => ({ useDebateActivity: () => ({ data: { available_to_debate: true } }) }));

vi.mock('../matchmaking/hooks', () => ({
  useDebateRequests: () => ({ data: { outbound: null, incoming: [] } }),
  useCreateDebateRequest: () => ({ mutate: mocks.mutate, isPending: false, error: null }),
}));

// The menu's placement hook observes the trigger, and JSDOM has no ResizeObserver.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

const { LobbyDisagreementsTrigger, lobbyDisagreements } = await import('./lobby-disagreements');

afterEach(() => {
  cleanup();
  mocks.data = undefined;
  mocks.isLoading = false;
  mocks.mutate.mockReset();
  mocks.phone = false;
});

const daniel = {
  user_id: 'Daniel-1',
  profile_space_id: 'space-daniel',
  display_name: 'Daniel',
  avatar_cid: null,
} as DebateLobbyMember;

const lobby = { lobby_id: '0192-abc' } as LobbyPageView;

function participant(id: string, requestable = true) {
  return { user_id: id, profile_space_id: `space-${id}`, display_name: id, avatar_cid: null, requestable };
}

function row(
  id: string,
  viewerPosition: boolean | null,
  against: ReturnType<typeof participant>[],
  ready = true
): DebateLobbyClaim {
  return {
    claim: { id, space_id: 'space-1', claim_entity_id: `entity-${id}`, claim: `Claim ${id}`, description: null },
    response_kind: 'stance',
    viewer_response:
      viewerPosition === null
        ? null
        : { position: viewerPosition, position_label: viewerPosition ? 'Agree' : 'Disagree' },
    viewer_debate_ready: ready,
    readiness_disabled_reason: null,
    active_debate: false,
    positions: [true, false].map(position => ({
      position,
      position_label: position ? 'Agree' : 'Disagree',
      total_in_room: against.length,
      requestable_count: against.filter(person => person.requestable).length,
      participants: viewerPosition !== null && position !== viewerPosition ? against : [],
    })),
  };
}

describe('lobbyDisagreements', () => {
  it('keeps the claims where the person is listed on the side opposite the viewer', () => {
    const claims = [
      row('a', true, [participant('daniel1')]),
      row('b', null, [participant('daniel1')]),
      row('c', false, [participant('elena')]),
      row('d', false, [participant('daniel-1', false)]),
    ];

    expect(lobbyDisagreements(claims, 'Daniel-1')).toEqual([
      { row: claims[0], viewerLabel: 'Agree', theirLabel: 'Disagree', requestable: true },
      { row: claims[3], viewerLabel: 'Disagree', theirLabel: 'Agree', requestable: false },
    ]);
  });
});

describe('LobbyDisagreementsTrigger', () => {
  it('opens the claims behind the count and requests that one person on a claim', () => {
    mocks.data = {
      lobby_id: '0192abc',
      source: 'room',
      claims: [row('a', true, [participant('daniel1')]), row('b', false, [participant('daniel1', false)])],
      disagreements: [{ user_id: 'daniel1', claims: 3 }],
    };
    render(<LobbyDisagreementsTrigger lobby={lobby} member={daniel} count={3} variant="pill" />);

    fireEvent.click(screen.getByRole('button', { name: 'Disagrees on 3 claims with Daniel' }));
    const list = screen.getByTestId('lobby-disagreements');
    const rows = within(list).getAllByTestId('lobby-disagreement');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Claim a');
    expect(rows[0]).toHaveTextContent('You: Agree · Daniel: Disagree');
    // Daniel can't take a request on b right now, so it offers none.
    expect(within(rows[1]!).queryByRole('button', { name: 'Request debate' })).toBeNull();
    expect(list).toHaveTextContent('1 more claim isn’t listed here.');

    fireEvent.click(within(rows[0]!).getByRole('button', { name: 'Request debate' }));
    expect(mocks.mutate).toHaveBeenCalledWith(
      {
        space_id: 'space-1',
        claim_entity_id: 'entity-a',
        lobby_id: '0192abc',
        recipient_user_id: 'daniel1',
      },
      { onError: expect.any(Function) }
    );
  });

  it('says so while the claims load', () => {
    mocks.isLoading = true;
    render(<LobbyDisagreementsTrigger lobby={lobby} member={daniel} count={2} variant="line" />);

    fireEvent.click(screen.getByRole('button', { name: 'Disagrees on 2 claims with Daniel' }));
    expect(screen.getByTestId('lobby-disagreements')).toHaveTextContent('Loading claims…');
  });
});
