import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type { ReactElement } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateClaimPositionSummary, DebateClaimSummary, MatchmakingReadiness } from '../api';
import { MatchmakingClaimCard } from './matchmaking-claim-card';

// Claim and space ids are knowledge-graph ids, so the fixtures have to be real ones — the card
// refuses to touch the graph for anything else. The space id is hoisted because `vi.mock` factories
// are lifted above every module-level declaration, so a mock that reads it can't use a plain const.
const mocks = vi.hoisted(() => ({
  joinMutateAsync: vi.fn(),
  leaveMutateAsync: vi.fn(),
  submitResponse: vi.fn(),
  spaceName: 'Crypto',
  spaceId: '019fedae-72b6-7ab2-927a-df044d57c566',
}));

// The readiness switch shares the entity page's queue-backed machine, so it needs geo-chat auth
// and the join/leave mutations rather than the hub's old one-shot readiness mutation.
vi.mock('../hooks', () => ({
  useGeoChatAuth: () => ({ authenticated: true, accountKey: 'account-1' }),
  useJoinDebateQueue: () => ({ mutateAsync: mocks.joinMutateAsync, reset: vi.fn(), isPending: false, error: null }),
  useLeaveDebateQueue: () => ({ mutateAsync: mocks.leaveMutateAsync, isPending: false, error: null }),
}));

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponse: () => ({
    submitResponse: mocks.submitResponse,
    optimisticResponse: undefined,
    isProcessingResponse: false,
    isResponseIndexingDelayed: false,
    isConnected: true,
    personalSpaceId: 'personal-space',
  }),
  useEntityResponseIndexingSnapshot: () => ({ status: 'idle', pending: null, runId: null }),
  useResetEntityResponseIndexingSnapshot: () => vi.fn(),
}));

vi.mock('~/core/hooks/use-spaces-by-ids', () => ({
  useSpacesByIds: () => ({
    spaces: [],
    spacesById: new Map([[mocks.spaceId, { entity: { name: mocks.spaceName, image: null } }]]),
    isLoading: false,
  }),
}));

vi.mock('~/core/state/pending-personal-space', () => ({
  usePendingPersonalSpace: () => ({ isPending: false }),
}));

const SPACE_ID = mocks.spaceId;
const CLAIM_ENTITY_ID = '019fedb1-0c41-7f3e-9a11-2c7d5e8b4419';
const CLAIM_TEXT = 'Chips are better than fries';

const claim: DebateClaimSummary = {
  id: 'debate-claim-1',
  space_id: SPACE_ID,
  claim_entity_id: CLAIM_ENTITY_ID,
  claim: CLAIM_TEXT,
  description: null,
};

const positions: DebateClaimPositionSummary[] = [
  { position: true, position_label: 'Agree', total_count: 2, available_now_count: 1, participants: [] },
  { position: false, position_label: 'Disagree', total_count: 3, available_now_count: 2, participants: [] },
];

function readiness(overrides: Partial<MatchmakingReadiness> = {}): MatchmakingReadiness {
  return {
    response_kind: 'stance',
    viewer_response: { position: true, position_label: 'Agree' } as MatchmakingReadiness['viewer_response'],
    viewer_debate_ready: true,
    readiness_disabled_reason: null,
    ...overrides,
  };
}

const toggleName = 'Ready to debate this claim';

function renderCard(card: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{card}</QueryClientProvider>);
}

beforeEach(() => {
  mocks.joinMutateAsync.mockReset();
  mocks.joinMutateAsync.mockResolvedValue({ claim: null, match: null });
  mocks.leaveMutateAsync.mockReset();
  mocks.leaveMutateAsync.mockResolvedValue({ claim: null, match: null });
  mocks.submitResponse.mockReset();
  mocks.spaceName = 'Crypto';
});

afterEach(cleanup);

describe('MatchmakingClaimCard', () => {
  it('puts the debate toggle in the card header beside the space name', () => {
    renderCard(<MatchmakingClaimCard claim={claim} positions={positions} readiness={readiness()} />);

    const toggle = screen.getByRole('switch', { name: toggleName });
    const spaceName = screen.getByText('Crypto');

    // The header row is the toggle's own row: the space chip and the toggle share it, which is
    // what puts the toggle top-right rather than below the response buttons.
    const headerRow = toggle.parentElement?.parentElement;
    expect(headerRow).not.toBeNull();
    expect(headerRow?.contains(spaceName)).toBe(true);

    // ...and the header sits above the claim, so the toggle precedes it in the document.
    const claimText = screen.getByText(CLAIM_TEXT);
    expect(toggle.compareDocumentPosition(claimText) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the toggle above the response buttons', () => {
    renderCard(<MatchmakingClaimCard claim={claim} positions={positions} readiness={readiness()} />);

    const toggle = screen.getByRole('switch', { name: toggleName });
    const agree = screen.getByRole('button', { name: /^Agree/ });

    expect(toggle.compareDocumentPosition(agree) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('still heads the card with the toggle when the claim is not on the graph', () => {
    const offGraph = { ...claim, claim_entity_id: 'not-a-graph-id' };
    renderCard(<MatchmakingClaimCard claim={offGraph} positions={positions} readiness={readiness()} />);

    const toggle = screen.getByRole('switch', { name: toggleName });
    expect(toggle.parentElement?.parentElement?.contains(screen.getByText('Crypto'))).toBe(true);
    // The unavailable notice loses the toggle it used to sit beside, but must still be shown.
    expect(screen.getByText('Claim unavailable')).toBeInTheDocument();
  });

  it('explains why the toggle is unavailable without a response', () => {
    renderCard(
      <MatchmakingClaimCard
        claim={claim}
        positions={positions}
        readiness={readiness({ viewer_response: null, viewer_debate_ready: false })}
      />
    );

    expect(screen.getByRole('switch', { name: toggleName })).toBeDisabled();
    expect(screen.getByText('Respond to this claim to debate it.')).toBeInTheDocument();
  });
});
