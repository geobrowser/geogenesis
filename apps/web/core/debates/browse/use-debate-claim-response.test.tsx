import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateClaim } from '~/core/debates/api';
import type { Entity } from '~/core/types';

import { useDebateClaimResponse } from './use-debate-claim-response';

const mocks = vi.hoisted(() => ({
  controlClaim: null as { claim?: string } | null,
}));

// The real derivation, so the title is built the way the hook builds it; only its reads are stubbed.
vi.mock('~/core/claims/browse/use-claim-response-state', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/claims/browse/use-claim-response-state')>();
  return {
    ...actual,
    useClaimResponseState: ({ claimId, spaceId, title }: { claimId: string; spaceId: string; title?: string }) => ({
      claim: { id: claimId, space_id: spaceId, claim_entity_id: claimId, claim: title },
      positions: [],
      readiness: {},
      isResponseKindResolved: true,
      isViewerResponseResolved: true,
      responseBlockedReason: null,
    }),
  };
});
vi.mock('~/core/debates/matchmaking/matchmaking-claim-card', () => ({
  useClaimPositionControl: ({ claim }: { claim: { claim?: string } }) => {
    mocks.controlClaim = claim;
    return {};
  },
}));

const entity = { id: 'claim-1', name: 'Cities should ban cars downtown' } as unknown as Entity;
const row = {
  claim_entity_id: 'claim-1',
  claim: 'Cities should ban cars downtown (geo-chat)',
} as unknown as DebateClaim;

beforeEach(() => {
  mocks.controlClaim = null;
});

describe('useDebateClaimResponse', () => {
  // GEO-3437: a vote kept on the device is saved under this text, and the save sheet's chip needs it.
  it('names the claim for the vote control from the graph entity', () => {
    renderHook(() => useDebateClaimResponse({ claimId: 'claim-1', spaceId: 'space-1', row, entity }));
    expect(mocks.controlClaim?.claim).toBe('Cities should ban cars downtown');
  });

  it('falls back to geo-chat’s copy while the entity is still loading', () => {
    renderHook(() => useDebateClaimResponse({ claimId: 'claim-1', spaceId: 'space-1', row, entity: null }));
    expect(mocks.controlClaim?.claim).toBe('Cities should ban cars downtown (geo-chat)');
  });
});
