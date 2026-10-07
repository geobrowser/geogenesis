import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ParticipantPosition } from '../participant-positions';

const VIEWER = '019fedae-72b6-7ab2-927a-df044d57c590';

const mocks = vi.hoisted(() => ({
  personalSpace: { personalSpaceId: null as string | null, isLoading: false },
  positions: {
    byClaim: new Map<string, ParticipantPosition[]>(),
    isLoading: false,
    isPlaceholderData: false,
    error: null as Error | null,
  },
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => mocks.personalSpace }));
vi.mock('../participant-positions', () => ({ useParticipantPositions: () => mocks.positions }));
vi.mock('../claim-picker-page', () => ({ useClaimEntitiesByIds: () => ({ entities: [], isLoading: false }) }));
vi.mock('./use-person-records', () => ({ usePersonRecords: () => new Map() }));
vi.mock('../use-debate-publishable-spaces', () => ({
  useDebatePublishableSpaces: () => ({ publishableSpaceIds: null, isLoading: false }),
  isSpaceDebatePublishable: () => true,
}));

const { usePersonFacts } = await import('./use-person-facts');

const facts = () =>
  renderHook(() => usePersonFacts([], { authenticated: true, rosterUnavailable: false })).result.current;

beforeEach(() => {
  mocks.personalSpace = { personalSpaceId: VIEWER, isLoading: false };
  mocks.positions = { byClaim: new Map(), isLoading: false, isPlaceholderData: false, error: null };
});

describe('usePersonFacts, for surfaces that narrow on matches (GEO-3220)', () => {
  it('knows a viewer with no personal space holds no positions, once the lookup has settled', () => {
    mocks.personalSpace = { personalSpaceId: null, isLoading: false };
    expect(facts().viewerHasPositions).toBe(false);
    expect(facts().matchesLoading).toBe(false);
  });

  it('does not decide while the viewer’s own space is still being looked up', () => {
    mocks.personalSpace = { personalSpaceId: null, isLoading: true };
    expect(facts().viewerHasPositions).toBeNull();
    // Matches only waits rather than judging everyone against nobody.
    expect(facts().matchesLoading).toBe(true);
  });

  it('tells a failed read apart from an answer of no matches', () => {
    mocks.positions = { ...mocks.positions, error: new Error('graph down') };
    expect(facts().matchesUnavailable).toBe(true);

    mocks.positions = { ...mocks.positions, error: null };
    expect(facts().matchesUnavailable).toBe(false);
  });

  it('keeps using rows it already holds when a later read fails', () => {
    const row: ParticipantPosition = {
      profileSpaceId: VIEWER,
      claimId: 'c1',
      spaceId: 's1',
      responseKind: 'stance',
      position: true,
    };
    mocks.positions = { ...mocks.positions, byClaim: new Map([['c1', [row]]]), error: new Error('graph down') };
    expect(facts().matchesUnavailable).toBe(false);
  });
});
