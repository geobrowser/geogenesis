import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MatchmakingMatch } from '../api';
import { MatchesTab } from './matches-tab';

const mocks = vi.hoisted(() => ({
  matches: [] as MatchmakingMatch[],
  outbound: null as unknown,
  readinessMutate: vi.fn(),
  createRequestMutate: vi.fn(),
}));

vi.mock('../hooks', () => ({
  useDebateActivity: () => ({ data: { outbound_request: null } }),
}));

vi.mock('./hooks', () => ({
  useMatchmakingMatches: () => ({ data: { matches: mocks.matches }, isLoading: false, error: null }),
  useDebateRequests: () => ({ data: { outbound: mocks.outbound, incoming: [] }, isLoading: false, error: null }),
  useClaimReadiness: () => ({ mutate: mocks.readinessMutate, isPending: false, error: null }),
  useCreateDebateRequest: () => ({ mutate: mocks.createRequestMutate, isPending: false, error: null }),
  useWithdrawDebateRequest: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

vi.mock('~/core/hooks/use-spaces-by-ids', () => ({
  useSpacesByIds: () => ({ spaces: [], spacesById: new Map(), isLoading: false }),
}));

// The on-chain response controls are covered by their own tests; here they only need to prove the
// card offers them.
vi.mock('../debate-entity-response-controls', () => ({
  DebateEntityResponseControls: ({ entityId, responseKind }: { entityId: string; responseKind: string }) => (
    <div data-testid="response-controls" data-entity={entityId} data-response-kind={responseKind} />
  ),
}));

vi.mock('./hub-response-batch', () => ({
  HubResponseBatch: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Claim and space ids are knowledge-graph ids, so the fixtures have to be real ones — the card
// refuses to touch the graph for anything else.
const SPACE_ID = '019fedae-72b6-7ab2-927a-df044d57c566';
const CLAIM_ENTITY_ID = '019fedb1-0c41-7f3e-9a11-2c7d5e8b4419';

function match(overrides: Partial<MatchmakingMatch> = {}): MatchmakingMatch {
  return {
    claim: {
      id: 'debate-claim-1',
      space_id: SPACE_ID,
      claim_entity_id: CLAIM_ENTITY_ID,
      claim: 'Chips are better than fries',
      description: null,
    },
    topics: [],
    response_kind: 'stance',
    viewer_position: true,
    viewer_response: { position: true, position_label: 'Agree' },
    viewer_debate_ready: true,
    readiness_disabled_reason: null,
    positions: [
      { position: true, position_label: 'Agree', total_count: 2, available_now_count: 1, participants: [] },
      { position: false, position_label: 'Disagree', total_count: 3, available_now_count: 2, participants: [] },
    ],
    ...overrides,
  } as MatchmakingMatch;
}

beforeEach(() => {
  mocks.matches = [match()];
  mocks.outbound = null;
  mocks.readinessMutate.mockReset();
  mocks.createRequestMutate.mockReset();
});

afterEach(cleanup);

describe('MatchesTab', () => {
  it('shows both sides with their semantic response labels', () => {
    render(<MatchesTab onTabChange={vi.fn()} />);

    expect(screen.getByText('Agree')).toBeInTheDocument();
    expect(screen.getByText('Disagree')).toBeInTheDocument();
  });

  it('labels a factual claim with the veracity vocabulary', () => {
    mocks.matches = [
      match({
        response_kind: 'veracity',
        viewer_response: { position: true, position_label: 'Verify' },
        positions: [],
      }),
    ];
    render(<MatchesTab onTabChange={vi.fn()} />);

    expect(screen.getByText('Verify')).toBeInTheDocument();
    expect(screen.getByText('Dispute')).toBeInTheDocument();
  });

  // A position is an on-chain response, so the side pills stay read-only summaries and taking a
  // side goes through the same response controls the claim page uses.
  it('offers the on-chain response controls instead of position buttons', () => {
    render(<MatchesTab onTabChange={vi.fn()} />);

    const controls = screen.getByTestId('response-controls');
    expect(controls).toHaveAttribute('data-entity', CLAIM_ENTITY_ID);
    expect(controls).toHaveAttribute('data-response-kind', 'stance');

    expect(screen.queryByRole('button', { name: 'Agree' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disagree' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Chips are better than fries' })).toHaveAttribute(
      'href',
      expect.stringContaining(CLAIM_ENTITY_ID)
    );
  });

  it('uses the veracity response kind for a factual claim', () => {
    mocks.matches = [match({ response_kind: 'veracity' })];
    render(<MatchesTab onTabChange={vi.fn()} />);

    expect(screen.getByTestId('response-controls')).toHaveAttribute('data-response-kind', 'veracity');
  });

  // geo-chat can return a claim the knowledge graph has never seen. Querying the graph for one
  // fails the whole request, so the card must not offer to respond to it or link to it.
  it('does not reach for the graph when the claim id is not a graph id', () => {
    mocks.matches = [
      match({
        claim: {
          id: 'debate-claim-1',
          space_id: 'matchmaking-space-019fedae72b67ab2927adf044d57c566',
          claim_entity_id: 'matchmaking-claim-019fedae72b67ab2927adf044d57c566',
          claim: 'Leftover fixture claim',
          description: null,
        },
      }),
    ];
    render(<MatchesTab onTabChange={vi.fn()} />);

    expect(screen.queryByTestId('response-controls')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Leftover fixture claim' })).not.toBeInTheDocument();
    expect(screen.getByText('Leftover fixture claim')).toBeInTheDocument();
    expect(screen.getByText('Claim unavailable')).toBeInTheDocument();
    // Readiness is geo-chat state, so it still works for a claim the graph can't resolve.
    expect(screen.getByRole('switch', { name: 'Ready to debate this claim' })).toBeInTheDocument();
  });

  it('stands down from a claim by turning readiness off, never by clearing a position', () => {
    render(<MatchesTab onTabChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('switch', { name: 'Ready to debate this claim' }));

    expect(mocks.readinessMutate).toHaveBeenCalledWith({
      spaceId: SPACE_ID,
      claimId: CLAIM_ENTITY_ID,
      ready: false,
    });
  });

  it('requests a debate on the claim and blocks a second concurrent request', () => {
    const { rerender } = render(<MatchesTab onTabChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Request debate' }));
    expect(mocks.createRequestMutate).toHaveBeenCalledWith({ space_id: SPACE_ID, claim_entity_id: CLAIM_ENTITY_ID });

    mocks.outbound = { id: 'request-1', claim: match().claim, expires_at: '2099-01-01T00:00:00.000Z' };
    rerender(<MatchesTab onTabChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Request debate' })).toBeDisabled();
  });
});
