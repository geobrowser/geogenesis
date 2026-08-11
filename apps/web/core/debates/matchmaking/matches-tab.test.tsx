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
  submitResponse: vi.fn(),
  indexing: { status: 'idle', pending: null, runId: null } as {
    status: 'idle' | 'reconciling' | 'delayed' | 'indexed';
    pending: { expectedResponse: 'positive' | 'negative' | null } | null;
    runId: string | null;
  },
  resetIndexing: vi.fn(),
  isConnected: true,
  availableToDebate: true,
}));

vi.mock('../hooks', () => ({
  useDebateActivity: () => ({ data: { outbound_request: null, available_to_debate: mocks.availableToDebate } }),
}));

vi.mock('./hooks', () => ({
  useMatchmakingMatches: () => ({ data: { matches: mocks.matches }, isLoading: false, error: null }),
  useDebateRequests: () => ({ data: { outbound: mocks.outbound, incoming: [] }, isLoading: false, error: null }),
  useClaimReadiness: () => ({ mutate: mocks.readinessMutate, isPending: false, error: null }),
  useCreateDebateRequest: () => ({ mutate: mocks.createRequestMutate, isPending: false, error: null }),
  useWithdrawDebateRequest: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

// The publish path itself is covered by the entity-response tests; here it only needs to record
// what the card asked for.
vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponse: () => ({
    submitResponse: mocks.submitResponse,
    optimisticResponse: undefined,
    isProcessingResponse: false,
    isResponseIndexingDelayed: false,
    isConnected: mocks.isConnected,
    personalSpaceId: 'personal-space',
  }),
  useEntityResponseIndexingSnapshot: () => mocks.indexing,
  useResetEntityResponseIndexingSnapshot: () => mocks.resetIndexing,
}));

vi.mock('~/core/hooks/use-spaces-by-ids', () => ({
  useSpacesByIds: () => ({ spaces: [], spacesById: new Map(), isLoading: false }),
}));

// Claim and space ids are knowledge-graph ids, so the fixtures have to be real ones — the card
// refuses to touch the graph for anything else.
const SPACE_ID = '019fedae-72b6-7ab2-927a-df044d57c566';
const CLAIM_ENTITY_ID = '019fedb1-0c41-7f3e-9a11-2c7d5e8b4419';

function party(userId: string, displayName: string, position: boolean, positionLabel: string) {
  return {
    user_id: userId,
    profile_space_id: `profile-${userId}`,
    display_name: displayName,
    avatar_cid: null,
    online: true,
    available_to_debate: true,
    in_debate: false,
    online_since: '2026-08-05T11:00:00.000Z',
    position,
    position_label: positionLabel,
  };
}

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
  mocks.submitResponse.mockReset();
  mocks.indexing = { status: 'idle', pending: null, runId: null };
  mocks.resetIndexing.mockReset();
  mocks.isConnected = true;
  mocks.availableToDebate = true;
});

afterEach(cleanup);

describe('MatchesTab', () => {
  it('offers exactly two response actions, labelled for the claim', () => {
    render(<MatchesTab onTabChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^Agree/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Disagree/ })).toBeInTheDocument();
    // "Exactly two" is the point: the hub takes a side on the claim, it does not vote on it, so
    // the vote arrows that live on the claim page must never appear here.
    expect(screen.queryByRole('button', { name: /Upvote|Downvote|vote/i })).not.toBeInTheDocument();
  });

  it('uses the veracity vocabulary for a factual claim', () => {
    mocks.matches = [match({ response_kind: 'veracity', positions: [] })];
    render(<MatchesTab onTabChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^Verify/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Dispute/ })).toBeInTheDocument();
  });

  it('publishes the opposite response when the other side is chosen', () => {
    render(<MatchesTab onTabChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^Disagree/ }));

    expect(mocks.submitResponse.mock.calls[0]?.[0]).toBe('negative');
  });

  it('clears the response when the side already held is chosen again', () => {
    render(<MatchesTab onTabChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^Agree/ }));

    expect(mocks.submitResponse.mock.calls[0]?.[0]).toBe('clear');
  });

  // A failed publish rolls the optimistic state back, so without this the response just appears to
  // vanish a few seconds after being chosen.
  it('says why when publishing the response fails', () => {
    mocks.submitResponse.mockImplementation((_direction, options) => {
      options?.onError?.(new Error('Transaction reverted.'));
    });
    render(<MatchesTab onTabChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^Disagree/ }));

    expect(screen.getByRole('alert')).toHaveTextContent('Transaction reverted.');
  });

  // The client knows its own response before geo-chat does, so the button reflects it immediately.
  it('shows the in-flight response rather than the stale server one', () => {
    mocks.indexing = { status: 'reconciling', pending: { expectedResponse: 'negative' }, runId: 'run-1' };
    render(<MatchesTab onTabChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^Disagree/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Agree/ })).toHaveAttribute('aria-pressed', 'false');
  });

  // The regression this replaced: once indexing finished, the card dropped back to geo-chat's copy
  // — which hasn't caught up yet — so a response that had just succeeded read as never made.
  it('keeps showing an indexed response while geo-chat is still catching up', () => {
    mocks.indexing = { status: 'indexed', pending: { expectedResponse: 'negative' }, runId: 'run-1' };
    mocks.matches = [match({ viewer_response: null, viewer_debate_ready: false })];
    render(<MatchesTab onTabChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^Disagree/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Respond to this claim to debate it.')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Ready to debate this claim' })).toBeEnabled();
    expect(mocks.resetIndexing).not.toHaveBeenCalled();
  });

  it('hands back to the server copy once it agrees', () => {
    mocks.indexing = { status: 'indexed', pending: { expectedResponse: 'negative' }, runId: 'run-1' };
    mocks.matches = [match({ viewer_response: { position: false, position_label: 'Disagree' } })];
    render(<MatchesTab onTabChange={vi.fn()} />);

    expect(mocks.resetIndexing).toHaveBeenCalledWith('run-1');
  });

  it('cannot respond without a connected personal space', () => {
    mocks.isConnected = false;
    render(<MatchesTab onTabChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^Agree/ })).toBeDisabled();
  });

  // geo-chat can return a claim the knowledge graph has never seen. Querying the graph for one
  // fails the whole request, so the card must not offer to respond to it or link to it.
  it('does not offer a response when the claim id is not a graph id', () => {
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

    expect(screen.queryByRole('button', { name: /^Agree/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Leftover fixture claim' })).not.toBeInTheDocument();
    expect(screen.getByText('Claim unavailable')).toBeInTheDocument();
    // Readiness is geo-chat state, so it still works for a claim the graph can't resolve.
    expect(screen.getByRole('switch', { name: 'Ready to debate this claim' })).toBeInTheDocument();
  });

  it('stands down from a claim by turning readiness off, never by clearing a response', () => {
    render(<MatchesTab onTabChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('switch', { name: 'Ready to debate this claim' }));

    expect(mocks.readinessMutate).toHaveBeenCalledWith({
      spaceId: SPACE_ID,
      claimId: CLAIM_ENTITY_ID,
      ready: false,
    });
    expect(mocks.submitResponse).not.toHaveBeenCalled();
  });

  // A request you send while marked unavailable could not be answered, so the design drops the
  // action in that state — kept visible here, with the reason, rather than silently missing.
  it('cannot request a debate while the viewer is unavailable', () => {
    mocks.availableToDebate = false;
    render(<MatchesTab onTabChange={vi.fn()} />);

    const request = screen.getByRole('button', { name: 'Request debate' });
    expect(request).toBeDisabled();
    // Shown rather than a `title`: tooltips never appear on touch and are unreliable on a disabled
    // button, which is exactly when the reason matters.
    expect(screen.getByText('Switch yourself to available to send a request.')).toBeInTheDocument();
  });

  it('requests a debate on the claim and blocks a second concurrent request', () => {
    const { rerender } = render(<MatchesTab onTabChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Request debate' }));
    expect(mocks.createRequestMutate).toHaveBeenCalledWith({ space_id: SPACE_ID, claim_entity_id: CLAIM_ENTITY_ID });

    mocks.outbound = {
      id: 'request-1',
      claim: match().claim,
      expires_at: '2099-01-01T00:00:00.000Z',
      requester: party('user-me', 'You', true, 'Agree'),
      recipient: party('user-them', 'Arturas', false, 'Disagree'),
    };
    rerender(<MatchesTab onTabChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Request debate' })).toBeDisabled();
  });
});
