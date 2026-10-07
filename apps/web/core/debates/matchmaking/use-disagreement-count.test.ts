import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ParticipantPositionsByClaim } from '../participant-positions';

const VIEWER = '5a1b7c2d3e4f40a18b9c0d1e2f3a4b5c';
const PEER = '6b2c8d3e4f5a41b29c0d1e2f3a4b5c6d';

let result: {
  byClaim: ParticipantPositionsByClaim;
  isLoading: boolean;
  isPlaceholderData: boolean;
  error: Error | null;
};
const calls: unknown[][] = [];
vi.mock('../participant-positions', () => ({
  useParticipantPositions: (...args: unknown[]) => {
    calls.push(args);
    return result;
  },
}));

const { useDisagreementCount } = await import('./use-disagreement-count');

const row = (profileSpaceId: string, claimId: string, position: boolean) => ({
  profileSpaceId,
  claimId,
  spaceId: 'space-1',
  responseKind: 'stance' as const,
  position,
});

beforeEach(() => {
  calls.length = 0;
  result = {
    byClaim: new Map([
      ['claim-1', [row(VIEWER, 'claim-1', true), row(PEER, 'claim-1', false)]],
      ['claim-2', [row(VIEWER, 'claim-2', true), row(PEER, 'claim-2', false)]],
      // Agreeing is not a match.
      ['claim-3', [row(VIEWER, 'claim-3', true), row(PEER, 'claim-3', true)]],
    ]) as unknown as ParticipantPositionsByClaim,
    isLoading: false,
    isPlaceholderData: false,
    error: null,
  };
});

describe('useDisagreementCount', () => {
  it('counts the claims the pair hold opposite positions on', () => {
    const { result: hook } = renderHook(() => useDisagreementCount(VIEWER, PEER));
    expect(hook.current).toBe(2);
    expect(calls.at(-1)?.[0]).toEqual([{ profile_space_id: VIEWER }, { profile_space_id: PEER }]);
  });

  it('is zero, not unknown, for a settled pair with nothing opposed', () => {
    result.byClaim = new Map() as unknown as ParticipantPositionsByClaim;
    const { result: hook } = renderHook(() => useDisagreementCount(VIEWER, PEER));
    expect(hook.current).toBe(0);
  });

  it.each([
    ['still loading', { isLoading: true }],
    ['showing the last pair', { isPlaceholderData: true }],
    ['failed', { error: new Error('boom') }],
  ])('is unknown while %s', (_, overrides) => {
    Object.assign(result, overrides);
    const { result: hook } = renderHook(() => useDisagreementCount(VIEWER, PEER));
    expect(hook.current).toBeNull();
  });

  it('asks for nothing without a viewer, or for the viewer against themselves', () => {
    expect(renderHook(() => useDisagreementCount(null, PEER)).result.current).toBeNull();
    expect(renderHook(() => useDisagreementCount(VIEWER, VIEWER)).result.current).toBeNull();
    expect(calls.every(call => (call[0] as unknown[]).length === 0)).toBe(true);
  });
});
