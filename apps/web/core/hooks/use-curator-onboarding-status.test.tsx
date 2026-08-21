import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  personalSpaceId: 'space-1' as string | null,
  isFetched: true,
  memberSpaces: [] as Array<{ type: string }>,
  hasRsvp: false,
  hasVote: false,
  entitiesByType: new Map<string, boolean>(),
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId, isFetched: mocks.isFetched }),
}));

vi.mock('~/core/io/queries', () => ({
  getSpacesWhereMember: () => Effect.succeed(mocks.memberSpaces),
  getUserHasEntityVote: () => Effect.succeed(mocks.hasVote),
  getAllEntities: ({ typeId }: { typeId: string }) =>
    Effect.succeed({ entities: mocks.entitiesByType.get(typeId) ? [{ id: 'e1' }] : [] }),
}));

const { useCuratorOnboardingStatus } = await import('./use-curator-onboarding-status');
const { RANK_TYPE_ID } = await import('~/core/ranking-block-ids');
const { COMMENT_TYPE_ID } = await import('~/core/comment-ids');

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mocks.personalSpaceId = 'space-1';
  mocks.isFetched = true;
  mocks.memberSpaces = [];
  mocks.hasRsvp = false;
  mocks.hasVote = false;
  mocks.entitiesByType = new Map();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ hasRsvp: mocks.hasRsvp }) }))
  );
});

afterEach(() => vi.unstubAllGlobals());

function completeEverything() {
  mocks.memberSpaces = [{ type: 'DAO' }];
  mocks.hasRsvp = true;
  mocks.hasVote = true;
  mocks.entitiesByType = new Map([
    [RANK_TYPE_ID, true],
    [COMMENT_TYPE_ID, true],
  ]);
}

describe('useCuratorOnboardingStatus', () => {
  it('keeps the checklist visible while steps are still open', async () => {
    mocks.memberSpaces = [{ type: 'DAO' }];

    const { result } = renderHook(() => useCuratorOnboardingStatus(), { wrapper });

    await waitFor(() => expect(result.current.completedCount).toBe(1));
    expect(result.current.allComplete).toBe(false);
    expect(result.current.isVisible).toBe(true);
  });

  // Reports done rather than hiding: the section folds itself down and keeps showing 100%.
  it('reports every step done, and stays visible', async () => {
    completeEverything();

    const { result } = renderHook(() => useCuratorOnboardingStatus(), { wrapper });

    await waitFor(() => expect(result.current.allComplete).toBe(true));
    expect(result.current.progressPercent).toBe(100);
    expect(result.current.isVisible).toBe(true);
  });

  // Completion reads all-false until the query settles, so nothing downstream may act on it yet.
  it('is not complete while the answer is still unknown', () => {
    completeEverything();

    const { result } = renderHook(() => useCuratorOnboardingStatus(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.allComplete).toBe(false);
  });

  it('stays hidden without a personal space, complete or not', async () => {
    mocks.personalSpaceId = null;
    completeEverything();

    const { result } = renderHook(() => useCuratorOnboardingStatus(), { wrapper });

    await waitFor(() => expect(result.current.isVisible).toBe(false));
  });
});
