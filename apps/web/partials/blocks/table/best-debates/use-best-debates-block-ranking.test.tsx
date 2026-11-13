import { renderHook } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import { useBestDebatesBlockRanking } from './use-best-debates-block-ranking';

const mocks = vi.hoisted(() => ({ composeArgs: null as null | Record<string, unknown> }));

vi.mock('~/core/blocks/ranking/use-ranking-submissions', () => ({
  useRankingSubmissions: () => ({
    myLastSubmission: null,
    myGrades: new Map(),
    saveMySubmission: vi.fn(),
    isSaving: false,
    isLoading: false,
    ballotReadError: null,
    unsavedDraft: null,
  }),
}));
vi.mock('~/core/blocks/ranking/use-my-pushed-down-debates', () => ({
  useMyPushedDownDebates: () => ({ debates: [] }),
  useBestDebatesBallotPublisher: () => ({ publish: vi.fn(), isPublishing: false }),
}));
vi.mock('~/core/blocks/ranking/use-ranking-entry-entities', () => ({
  useRankingEntryEntities: () => ({ entries: [] }),
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId: 'me' }) }));
vi.mock('./use-best-debates-push-down-slot', () => ({
  useBestDebatesPushDownSlot: () => ({ slot: undefined, binding: () => null }),
}));
vi.mock('./best-debate-grading', async importOriginal => ({
  ...(await importOriginal<typeof import('./best-debate-grading')>()),
  useRecordGrade: () => vi.fn(),
}));
vi.mock('./use-best-debates-compose', () => ({
  useBestDebatesCompose: (args: Record<string, unknown>) => {
    mocks.composeArgs = args;
    return {
      publish: vi.fn(),
      whenPublishesSettle: () => Promise.resolve(),
      requestPushDown: vi.fn(),
      placeFromTeam: vi.fn(),
      dialogs: null,
      activeEntityId: null,
      toRankCoverage: null,
    };
  },
}));

describe('the Best debates block’s publishing (GEO-3729)', () => {
  it('queues its publishes, each built on the base it was queued with', () => {
    renderHook(() => useBestDebatesBlockRanking({ enabled: true, blockId: 'b', spaceId: 's', isMobile: false }));
    expect(mocks.composeArgs?.serialPublishes).toBe(true);
    expect(typeof mocks.composeArgs?.getPublishedBase).toBe('function');
    expect(mocks.composeArgs?.publishOnDone).toBe(true);
  });
});
