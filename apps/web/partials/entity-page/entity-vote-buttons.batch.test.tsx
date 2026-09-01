import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  entityRespondersQueryKey,
  entityResponseCountsQueryKey,
  userEntityResponseQueryKey,
} from '~/core/responses/entity-response';
import {
  ClaimResponseBatchBoundary,
  useClaimResponseSummaryBatch,
} from '~/core/responses/use-claim-response-summaries';

import { EntityVoteButtons, RespondersPopoverContent } from './entity-vote-buttons';

const mocks = vi.hoisted(() => ({
  getCounts: vi.fn(),
  getResponders: vi.fn(),
  getSummaryPage: vi.fn(),
  getViewerResponse: vi.fn(),
  optimisticResponse: undefined as 'positive' | 'negative' | null | undefined,
  queryEntityOptions: [] as unknown[],
  smartAccount: null as object | null,
  submitResponse: vi.fn(),
  responderAvatarProps: [] as unknown[],
  getProfiles: vi.fn(),
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
    submitResponse: mocks.submitResponse,
    optimisticResponse: mocks.optimisticResponse,
    isResponseIndexingDelayed: false,
    isConnected: true,
    personalSpaceId: 'profile-1',
  }),
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: 'profile-1', isRegistered: true, isLoading: false }),
}));

vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: mocks.smartAccount }),
}));

vi.mock('~/core/io/queries', () => ({
  getClaimResponseSummaryPage: (...args: unknown[]) => Effect.succeed(mocks.getSummaryPage(...args)),
  getEntityResponseCounts: (...args: unknown[]) => Effect.succeed(mocks.getCounts(...args)),
  getEntityResponders: (...args: unknown[]) => Effect.succeed(mocks.getResponders(...args)),
  getSpaces: () => Effect.succeed([]),
  getUserEntityResponse: (...args: unknown[]) => Effect.succeed(mocks.getViewerResponse(...args)),
}));

vi.mock('~/core/io/subgraph/fetch-profile', () => ({
  fetchProfilesBySpaceIds: (...args: unknown[]) => Effect.succeed(mocks.getProfiles(...args)),
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
  ClaimResponderAvatars: (props: unknown) => {
    mocks.responderAvatarProps.push(props);
    return null;
  },
}));

beforeEach(() => {
  mocks.getCounts.mockReset();
  mocks.getCounts.mockReturnValue({ positive: 2, negative: 1 });
  mocks.getResponders.mockReset();
  mocks.getResponders.mockReturnValue([]);
  mocks.getSummaryPage.mockReset();
  mocks.getSummaryPage.mockReturnValue([]);
  mocks.getViewerResponse.mockReset();
  mocks.getViewerResponse.mockReturnValue('positive');
  mocks.optimisticResponse = undefined;
  mocks.queryEntityOptions.length = 0;
  mocks.smartAccount = null;
  mocks.submitResponse.mockReset();
  mocks.responderAvatarProps.length = 0;
  mocks.getProfiles.mockReset();
  mocks.getProfiles.mockReturnValue([]);
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

  it('renders factual claims with the original chevron controls and no explanatory label', () => {
    const view = renderButtons(true, true, 'veracity');

    expect(view.queryByText('Is factual')).not.toBeInTheDocument();
    const responseIcons = [...view.container.querySelectorAll('svg')];
    expect(responseIcons).toHaveLength(2);
    expect(responseIcons.every(icon => icon.getAttribute('viewBox') === '0 0 16 16')).toBe(true);
  });

  it('renders persisted curation state in the fullscreen debate pill', () => {
    mocks.smartAccount = {};
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(entityResponseCountsQueryKey('debate-1', 'space-1', 0, 'curation'), {
      positive: 8,
      negative: 1,
    });
    queryClient.setQueryData(
      userEntityResponseQueryKey('profile-1', 'debate-1', 'space-1', 0, 'curation'),
      'positive'
    );

    const view = render(
      <ClaimResponseBatchBoundary ready>
        <EntityVoteButtons
          entityId="debate-1"
          spaceId="space-1"
          responseKind="curation"
          presentation="debate-vertical"
        />
      </ClaimResponseBatchBoundary>,
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );

    expect(view.getByText('7')).toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Remove upvote' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(view.getByRole('button', { name: 'Downvote' }));
    expect(mocks.submitResponse).toHaveBeenLastCalledWith('negative', expect.any(Object));
  });

  it('passes the optimistic viewer response to responder avatars immediately', () => {
    mocks.optimisticResponse = 'negative';

    renderButtons(true, true);

    expect(mocks.responderAvatarProps.at(-1)).toMatchObject({
      optimisticViewerResponse: 'negative',
      totalResponders: 3,
      viewerSpaceId: 'profile-1',
    });
  });

  it('wires optimistic claim response changes without blocking subsequent clicks', () => {
    mocks.smartAccount = {};
    const view = renderButtons(true, true);

    fireEvent.click(view.getByTitle('Remove agreement'));
    expect(mocks.submitResponse).toHaveBeenLastCalledWith('clear', expect.any(Object));

    mocks.optimisticResponse = 'negative';
    view.rerender(
      <ClaimResponseBatchBoundary ready>
        <EntityVoteButtons entityId="claim-1" spaceId="space-1" responseKind="stance" />
      </ClaimResponseBatchBoundary>
    );
    fireEvent.click(view.getByTitle('Agree'));
    expect(mocks.submitResponse).toHaveBeenLastCalledWith('positive', expect.any(Object));

    mocks.optimisticResponse = 'positive';
    view.rerender(
      <ClaimResponseBatchBoundary ready>
        <EntityVoteButtons entityId="claim-1" spaceId="space-1" responseKind="stance" />
      </ClaimResponseBatchBoundary>
    );
    fireEvent.click(view.getByTitle('Disagree'));
    expect(mocks.submitResponse).toHaveBeenLastCalledWith('negative', expect.any(Object));
  });

  it('renders 50 batched claims with one summary request and no individual response requests', async () => {
    const targets = Array.from({ length: 50 }, (_, index) => ({
      entityId: `claim-${index}`,
      responseKind: index % 2 === 0 ? ('stance' as const) : ('veracity' as const),
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const view = render(<BatchedClaims targets={targets} />, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    await waitFor(() => expect(view.container.querySelector('.animate-pulse')).not.toBeInTheDocument());
    expect(mocks.getSummaryPage).toHaveBeenCalledOnce();
    expect(mocks.getCounts).not.toHaveBeenCalled();
    expect(mocks.getViewerResponse).not.toHaveBeenCalled();
    expect(mocks.getResponders).not.toHaveBeenCalled();
    expect(mocks.queryEntityOptions.length).toBeGreaterThanOrEqual(50);
    expect(mocks.queryEntityOptions.every(option => (option as { enabled: boolean }).enabled === false)).toBe(true);
    expect(new Set(mocks.queryEntityOptions.map(option => (option as { id: string }).id)).size).toBe(50);
  });
});

function BatchedClaims({ targets }: { targets: Array<{ entityId: string; responseKind: 'stance' | 'veracity' }> }) {
  const batch = useClaimResponseSummaryBatch({ spaceId: 'space-1', targets, enabled: true });
  return (
    <ClaimResponseBatchBoundary ready={batch.isSuccess}>
      {targets.map(target => (
        <EntityVoteButtons
          key={target.entityId}
          entityId={target.entityId}
          spaceId="space-1"
          responseKind={target.responseKind}
        />
      ))}
    </ClaimResponseBatchBoundary>
  );
}

function renderButtons(ready: boolean, seedCaches = false, responseKind: 'stance' | 'veracity' = 'stance') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seedCaches) {
    queryClient.setQueryData(entityResponseCountsQueryKey('claim-1', 'space-1', 0, responseKind), {
      positive: 2,
      negative: 1,
    });
    queryClient.setQueryData(
      userEntityResponseQueryKey('profile-1', 'claim-1', 'space-1', 0, responseKind),
      'positive'
    );
  }
  return render(
    <ClaimResponseBatchBoundary ready={ready}>
      <EntityVoteButtons entityId="claim-1" spaceId="space-1" responseKind={responseKind} />
    </ClaimResponseBatchBoundary>,
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    }
  );
}

/**
 * The responder list is the one read here that must not stand down for the batch.
 *
 * Every other query on this page defers to `ClaimResponseBatchBoundary`, because the batch primes
 * its key and a page of rows would otherwise fetch one apiece. This content is different in the way
 * that matters: it lives inside a `Popover.Content`, so it mounts for a single claim when a reader
 * opens the list, and there is no per-row cost to protect. Deferring bought nothing and cost an
 * answer — the profiles are primed by a *second* query that runs after the batch resolves and is
 * not part of the boundary's `ready`.
 */
describe('RespondersPopoverContent under a batch', () => {
  const renderPopover = (queryClient: QueryClient) =>
    render(
      <ClaimResponseBatchBoundary ready>
        <RespondersPopoverContent entityId="claim-1" spaceId="space-1" objectType={0} responseKind="stance" />
      </ClaimResponseBatchBoundary>,
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );

  it('fetches the profiles the batch has not primed instead of reporting nobody', async () => {
    // Responders primed by the batch; their profiles not, which is the window between the batch
    // resolving and its metadata query landing — and the permanent state if that query fails.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(entityRespondersQueryKey('claim-1', 'space-1', 0, 'stance'), [
      { userId: 'profile-9', direction: 'positive' },
    ]);
    mocks.getProfiles.mockReturnValue([{ id: 'profile-9', name: 'Dovile', avatarUrl: null }]);

    const view = renderPopover(queryClient);

    await waitFor(() => expect(view.getByText('Dovile')).toBeInTheDocument());
    // Not the empty state, which is what a disabled profile query rendered over a real responder.
    expect(view.queryByText('No responses yet')).not.toBeInTheDocument();
    expect(mocks.getProfiles).toHaveBeenCalled();
  });

  it('still answers from the batch’s cache without refetching the responders', async () => {
    // The saving the batch exists for survives: a primed key is fresh against the same `staleTime`,
    // so an enabled query serves it without a request.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(entityRespondersQueryKey('claim-1', 'space-1', 0, 'stance'), [
      { userId: 'profile-9', direction: 'positive' },
    ]);
    mocks.getProfiles.mockReturnValue([{ id: 'profile-9', name: 'Dovile', avatarUrl: null }]);

    const view = renderPopover(queryClient);

    await waitFor(() => expect(view.getByText('Dovile')).toBeInTheDocument());
    expect(mocks.getResponders).not.toHaveBeenCalled();
  });

  it('contains its own scrolling rather than chaining to the page behind', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(entityRespondersQueryKey('claim-1', 'space-1', 0, 'stance'), [
      { userId: 'profile-9', direction: 'positive' },
    ]);
    mocks.getProfiles.mockReturnValue([{ id: 'profile-9', name: 'Dovile', avatarUrl: null }]);

    const view = renderPopover(queryClient);

    await waitFor(() => expect(view.getByText('Dovile')).toBeInTheDocument());
    expect(view.container.querySelector('.overflow-y-auto')?.className).toContain('overscroll-contain');
  });
});
