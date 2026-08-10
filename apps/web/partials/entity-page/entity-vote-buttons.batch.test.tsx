import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { entityResponseCountsQueryKey, userEntityResponseQueryKey } from '~/core/responses/entity-response';
import { ClaimResponseBatchBoundary } from '~/core/responses/use-claim-response-summaries';

import { EntityVoteButtons } from './entity-vote-buttons';

const mocks = vi.hoisted(() => ({
  getCounts: vi.fn(),
  getResponders: vi.fn(),
  getViewerResponse: vi.fn(),
  queryEntityOptions: [] as unknown[],
}));

vi.mock('@geogenesis/auth', () => ({
  useGeoLogin: () => ({ login: vi.fn() }),
}));

vi.mock('~/core/analytics', () => ({
  downvoted: vi.fn(),
  trackPrivyAuth: vi.fn(),
  upvoted: vi.fn(),
  voteCast: vi.fn(),
}));

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponse: () => ({
    submitResponse: vi.fn(),
    optimisticResponse: undefined,
    isResponseIndexingDelayed: false,
    isConnected: true,
    personalSpaceId: 'profile-1',
  }),
}));

vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: null }),
}));

vi.mock('~/core/io/queries', () => ({
  getEntityResponseCounts: (...args: unknown[]) => Effect.succeed(mocks.getCounts(...args)),
  getEntityResponders: (...args: unknown[]) => Effect.succeed(mocks.getResponders(...args)),
  getUserEntityResponse: (...args: unknown[]) => Effect.succeed(mocks.getViewerResponse(...args)),
}));

vi.mock('~/core/io/subgraph/fetch-profile', () => ({
  fetchProfilesBySpaceIds: () => Effect.succeed([]),
}));

vi.mock('~/core/state/pending-personal-space', () => ({
  usePendingPersonalSpace: () => ({ isPending: false }),
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: (options: unknown) => {
    mocks.queryEntityOptions.push(options);
    return { entity: null, isLoading: false };
  },
}));

vi.mock('~/partials/entity-page/claim-voter-avatars', () => ({
  ClaimResponderAvatars: () => null,
}));

beforeEach(() => {
  mocks.getCounts.mockReset();
  mocks.getCounts.mockReturnValue({ positive: 2, negative: 1 });
  mocks.getResponders.mockReset();
  mocks.getResponders.mockReturnValue([]);
  mocks.getViewerResponse.mockReset();
  mocks.getViewerResponse.mockReturnValue('positive');
  mocks.queryEntityOptions.length = 0;
});

afterEach(cleanup);

describe('EntityVoteButtons claims-page batching', () => {
  it('skips entity hydration and all individual response queries while the page batch is unresolved', async () => {
    const view = renderButtons(false);

    expect(view.container.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(mocks.queryEntityOptions.at(-1)).toMatchObject({ enabled: false });
    await Promise.resolve();
    expect(mocks.getCounts).not.toHaveBeenCalled();
    expect(mocks.getViewerResponse).not.toHaveBeenCalled();
    expect(mocks.getResponders).not.toHaveBeenCalled();
  });

  it('uses the batch-seeded caches without fetching or hydrating Entity once batching resolves', async () => {
    renderButtons(true, true);

    await waitFor(() => expect(mocks.queryEntityOptions).toHaveLength(1));
    expect(mocks.getCounts).not.toHaveBeenCalled();
    expect(mocks.getViewerResponse).not.toHaveBeenCalled();
    expect(mocks.queryEntityOptions.at(-1)).toMatchObject({ enabled: false });
  });
});

function renderButtons(ready: boolean, seedCaches = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seedCaches) {
    queryClient.setQueryData(entityResponseCountsQueryKey('claim-1', 'space-1', 0, 'stance'), {
      positive: 2,
      negative: 1,
    });
    queryClient.setQueryData(userEntityResponseQueryKey('profile-1', 'claim-1', 'space-1', 0, 'stance'), 'positive');
  }
  return render(
    <ClaimResponseBatchBoundary ready={ready}>
      <EntityVoteButtons entityId="claim-1" spaceId="space-1" responseKind="stance" />
    </ClaimResponseBatchBoundary>,
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    }
  );
}
