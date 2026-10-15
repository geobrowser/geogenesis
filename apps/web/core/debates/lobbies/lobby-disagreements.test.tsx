import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyClaim, DebateLobbyClaims, DebateLobbyMember } from '../api';
import type { LobbyPageView } from './lobby-view';

const mocks = vi.hoisted(() => ({
  data: undefined as DebateLobbyClaims | undefined,
  isLoading: false,
  error: null as Error | null,
  refetch: vi.fn(),
  mutate: vi.fn(),
  requestError: null as Error | null,
  phone: false,
  snapshot: { status: 'idle', pending: null, runId: null } as {
    status: string;
    pending: { expectedResponse: 'positive' | 'negative' | null } | null;
    runId: string | null;
  },
}));

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponseIndexingSnapshot: () => mocks.snapshot,
}));

vi.mock('~/core/claims/browse/claim-response-summary', () => ({
  useClaimResponseSummary: () => ({ indexedViewerDirection: null, isViewerResponseLoading: false }),
}));

vi.mock('~/core/hooks/use-is-phone-layout', () => ({ useIsPhoneLayout: () => mocks.phone }));

vi.mock('./lobby-room-claims-hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('./lobby-room-claims-hooks')>()),
  useRefreshLobbyClaimsOnRefusal: () => vi.fn(),
  useDebateLobbyClaims: () => ({
    data: mocks.data,
    isLoading: mocks.isLoading,
    error: mocks.error,
    failureReason: mocks.error,
    refetch: mocks.refetch,
  }),
}));

vi.mock('~/core/claims/browse/use-claim-matchup', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/claims/browse/use-claim-matchup')>()),
  useMissingIntentRecovery: () => vi.fn(),
}));

vi.mock('../hooks', () => ({ useDebateActivity: () => ({ data: { available_to_debate: true } }) }));

vi.mock('../matchmaking/hooks', () => ({
  useDebateRequests: () => ({ data: { outbound: null, incoming: [] } }),
  useCreateDebateRequest: () => ({ mutate: mocks.mutate, isPending: false, error: mocks.requestError }),
}));

// The menu's placement hook observes the trigger, and JSDOM has no ResizeObserver.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

const { LobbyDisagreementsTrigger, lobbyDisagreements } = await import('./lobby-disagreements');
const { GeoChatRequestError } = await import('../api');
const { RECIPIENT_UNAVAILABLE_MESSAGE } = await import('./lobby-room-claims-hooks');
const { REQUEST_PENDING_LABEL } = await import('../request-gate');

afterEach(() => {
  cleanup();
  mocks.data = undefined;
  mocks.isLoading = false;
  mocks.error = null;
  mocks.refetch.mockReset();
  mocks.mutate.mockReset();
  mocks.requestError = null;
  mocks.snapshot = { status: 'idle', pending: null, runId: null };
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
  /** Everyone on the other side; above `against.length` when geo-chat cut the list off. */
  inRoom = against.length
): DebateLobbyClaim {
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
      total_in_room: inRoom,
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
      { row: claims[0], viewerPosition: true, viewerLabel: 'Agree', theirLabel: 'Disagree', requestable: true },
      { row: claims[3], viewerPosition: false, viewerLabel: 'Disagree', theirLabel: 'Agree', requestable: false },
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

  it('keeps a refusal readable after the refresh it triggers marks the person unrequestable', () => {
    mocks.data = { lobby_id: '0192abc', source: 'room', claims: [row('a', true, [participant('daniel1')])] };
    const { rerender } = render(<LobbyDisagreementsTrigger lobby={lobby} member={daniel} count={1} variant="pill" />);
    fireEvent.click(screen.getByRole('button', { name: 'Disagrees on 1 claims with Daniel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Request debate' }));

    // geo-chat refuses, and the refetch it triggers comes back with Daniel no longer requestable.
    mocks.requestError = new GeoChatRequestError('unavailable', 'recipient_not_available', 409);
    mocks.data = { lobby_id: '0192abc', source: 'room', claims: [row('a', true, [participant('daniel1', false)])] };
    rerender(<LobbyDisagreementsTrigger lobby={lobby} member={daniel} count={1} variant="pill" />);

    const disagreement = screen.getByTestId('lobby-disagreement');
    expect(within(disagreement).getByRole('alert')).toHaveTextContent(RECIPIENT_UNAVAILABLE_MESSAGE);
    expect(within(disagreement).getByRole('button', { name: 'Request debate' })).toBeDisabled();
  });

  it('keeps a refused row a refresh drops from a full list, and drops it from one that is not full', () => {
    const others = Array.from({ length: 7 }, (_, index) => participant(`other${index}`));
    mocks.data = {
      lobby_id: '0192abc',
      source: 'room',
      claims: [row('a', true, [participant('daniel1'), ...others], 9), row('b', true, [participant('daniel1')])],
    };
    const { rerender } = render(<LobbyDisagreementsTrigger lobby={lobby} member={daniel} count={2} variant="pill" />);
    fireEvent.click(screen.getByRole('button', { name: 'Disagrees on 2 claims with Daniel' }));
    fireEvent.click(
      within(screen.getAllByTestId('lobby-disagreement')[0]!).getByRole('button', { name: 'Request debate' })
    );

    // Refused; the refresh lists eight others on a, so Daniel no longer fits. On b he has left the side.
    mocks.requestError = new GeoChatRequestError('unavailable', 'recipient_not_available', 409);
    mocks.data = {
      lobby_id: '0192abc',
      source: 'room',
      claims: [row('a', true, [...others, participant('other7')], 9), row('b', true, [])],
    };
    rerender(<LobbyDisagreementsTrigger lobby={lobby} member={daniel} count={2} variant="pill" />);

    const rows = screen.getAllByTestId('lobby-disagreement');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Claim a');
    expect(within(rows[0]!).getByRole('alert')).toHaveTextContent(RECIPIENT_UNAVAILABLE_MESSAGE);
  });

  it('holds the offer while a changed vote publishes, and drops it while a cleared one does', () => {
    mocks.data = {
      lobby_id: '0192abc',
      source: 'room',
      claims: [row('a', true, [participant('daniel1')])],
    };
    mocks.snapshot = { status: 'publishing', pending: { expectedResponse: 'negative' }, runId: 'run' };
    const { rerender } = render(<LobbyDisagreementsTrigger lobby={lobby} member={daniel} count={1} variant="pill" />);
    fireEvent.click(screen.getByRole('button', { name: 'Disagrees on 1 claims with Daniel' }));

    // geo-chat still says Agree; the viewer just switched to Disagree, so no request goes out on Agree.
    const held = screen.getByRole('button', { name: REQUEST_PENDING_LABEL });
    expect(held).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Request debate' })).toBeNull();

    mocks.snapshot = { status: 'publishing', pending: { expectedResponse: null }, runId: 'run' };
    rerender(<LobbyDisagreementsTrigger lobby={lobby} member={daniel} count={1} variant="pill" />);
    expect(screen.queryByRole('button', { name: REQUEST_PENDING_LABEL })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Request debate' })).toBeNull();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('counts the claims it can’t list when the person is on none of the lists', () => {
    mocks.data = { lobby_id: '0192abc', source: 'room', claims: [row('a', true, [participant('elena')], 9)] };
    render(<LobbyDisagreementsTrigger lobby={lobby} member={daniel} count={3} variant="pill" />);

    fireEvent.click(screen.getByRole('button', { name: 'Disagrees on 3 claims with Daniel' }));
    expect(screen.getByTestId('lobby-disagreements')).toHaveTextContent('3 claims aren’t listed here.');
  });

  it('leaves scrolling to the menu or sheet around it', () => {
    mocks.data = { lobby_id: '0192abc', source: 'room', claims: [row('a', true, [participant('daniel1')])] };
    render(<LobbyDisagreementsTrigger lobby={lobby} member={daniel} count={1} variant="pill" />);

    fireEvent.click(screen.getByRole('button', { name: 'Disagrees on 1 claims with Daniel' }));
    const list = screen.getByTestId('lobby-disagreements');
    // A scroller nested in the menu's wheel trap can't be wheeled; jsdom can't wheel, so check for one.
    expect(list.className).not.toMatch(/overflow-y-(auto|scroll)/);
    expect(list.querySelector('[class*="overflow-y-auto"]')).toBeNull();
  });

  it('offers a retry when the claims fail to load, rather than calling them unlisted', () => {
    mocks.error = new Error('down');
    render(<LobbyDisagreementsTrigger lobby={lobby} member={daniel} count={2} variant="line" />);

    fireEvent.click(screen.getByRole('button', { name: 'Disagrees on 2 claims with Daniel' }));
    const list = screen.getByTestId('lobby-disagreements');
    expect(list).toHaveTextContent('Something went wrong.');
    expect(list).not.toHaveTextContent('These claims aren’t listed here yet.');
    fireEvent.click(within(list).getByRole('button', { name: 'Try again' }));
    expect(mocks.refetch).toHaveBeenCalled();
  });
});
