import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExploreFeedRow } from '~/core/explore/explore-card-item';

import { GalleryClaimCard } from './gallery-claim-card';

/**
 * Both claim lookups answer with nothing, which is the state the tag used to be hidden behind.
 *
 * `isResponseKindResolved` is `row !== null || entity !== null`, so this is the case where it never
 * becomes true — a claim geo-chat does not index whose entity read also comes back empty.
 */
vi.mock('~/core/debates/hooks', () => ({
  useDebateClaims: () => ({ data: { claims: [] }, isLoading: false, error: null }),
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: () => ({ entity: null, isLoading: false }),
}));

/**
 * `isResponseKindResolved: false` is the state under test — set here rather than inferred from the
 * two lookups above, so the case cannot quietly stop being reachable if the hook's definition of
 * "resolved" changes. The real hook also reaches wagmi, which this suite has no use for.
 */
vi.mock('~/core/claims/browse/use-claim-response-state', () => ({
  useClaimResponseState: () => ({
    claim: { id: 'claim-1', space_id: 'space-1', claim_entity_id: 'claim-1', claim: 'A claim', description: null },
    positions: [],
    readiness: {
      response_kind: 'stance',
      viewer_response: null,
      viewer_debate_ready: false,
      readiness_disabled_reason: null,
    },
    isResponseKindResolved: false,
    isViewerResponseResolved: false,
    responseBlockedReason: null,
  }),
}));

vi.mock('~/core/hooks/use-near-viewport', () => ({
  useNearViewport: () => [vi.fn(), true] as const,
}));

vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => vi.fn() }));

/** The card under test only has to hand the note down; the pills themselves are another suite's. */
vi.mock('~/core/debates/matchmaking/matchmaking-claim-card', () => ({
  MatchmakingClaimCard: ({ noteFor }: { noteFor?: (position: boolean) => React.ReactNode }) => (
    <div data-testid="card">
      {noteFor?.(true)}
      {noteFor?.(false)}
    </div>
  ),
}));

const row = {
  entityId: '3bf9b841187f8c71b74f892ba4e83b75',
  spaceId: 'c9f267dcb0d270718c2a3c45a64afd32',
} as unknown as ExploreFeedRow;

afterEach(cleanup);

/**
 * The tag reports how *this person* answered, and the caller already knows — it comes from their
 * record, not from the claim.
 *
 * It used to be held back until the claim's response kind resolved, because a factual claim would
 * have read "agrees" for a beat and then corrected itself to "verifies". Every claim asks the same
 * question now, so the wait cannot change the wording — and on a claim whose lookups never answer,
 * `isResponseKindResolved` never flips, so the wait was permanent rather than a beat.
 */
describe('GalleryClaimCard response tag', () => {
  it('names the side even when neither claim lookup ever answers', () => {
    render(<GalleryClaimCard row={row} response={{ stance: 'agree' }} personName="Susan" />);

    expect(screen.getByText('agrees')).toBeInTheDocument();
  });

  it('says nothing for a claim the person has not answered', () => {
    render(<GalleryClaimCard row={row} response={undefined} personName="Susan" />);

    expect(screen.queryByText('agrees')).not.toBeInTheDocument();
    expect(screen.queryByText('disagrees')).not.toBeInTheDocument();
  });
});
