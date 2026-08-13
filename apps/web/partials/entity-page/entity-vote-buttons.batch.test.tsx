import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { entityResponseCountsQueryKey, userEntityResponseQueryKey } from '~/core/responses/entity-response';
import {
  ClaimResponseBatchBoundary,
  useClaimResponseSummaryBatch,
} from '~/core/responses/use-claim-response-summaries';

import { EntityVoteButtons } from './entity-vote-buttons';

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
  storeEntity: null as {
    relations: unknown[];
    values: unknown[];
    createdAt?: string;
    updatedAt?: string;
  } | null,
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
  fetchProfilesBySpaceIds: () => Effect.succeed([]),
}));

vi.mock('~/core/state/pending-personal-space', () => ({
  usePendingPersonalSpace: () => ({ isPending: false }),
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: (options: unknown) => {
    mocks.queryEntityOptions.push(options);
    return { entity: mocks.storeEntity, isLoading: false };
  },
}));

vi.mock('~/partials/entity-page/claim-voter-avatars', () => ({
  ClaimResponderAvatars: (props: unknown) => {
    mocks.responderAvatarProps.push(props);
    return null;
  },
}));

beforeEach(() => {
  mocks.storeEntity = null;
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
    queryClient.setQueryData(userEntityResponseQueryKey('profile-1', 'debate-1', 'space-1', 0, 'curation'), 'positive');

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

describe('EntityVoteButtons on unpublished data', () => {
  // The reader is looking at their own draft. Responses are recorded against
  // published data, so there is nothing to respond to — and telling them to
  // publish first is noise on every row of a large import.
  it('renders nothing rather than a publish-first notice', () => {
    // Every row written locally — this entity has no indexed record at all.
    mocks.storeEntity = {
      relations: [
        {
          spaceId: 'space-1',
          type: { id: SystemIds.TYPES_PROPERTY },
          toEntity: { id: CLAIM_TYPE_ID },
          isLocal: true,
          hasBeenPublished: false,
          isDeleted: false,
        },
      ],
      values: [],
    };

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(<EntityVoteButtons entityId="claim-1" spaceId="space-1" />, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    expect(container).toBeEmptyDOMElement();
  });

  // The local-edit flags are never cleared once set, so a published entity that
  // was edited at some point still carries them. Responses belong to the
  // published record, so they stay available.
  it('keeps responses available on a published entity that carries local edits', () => {
    mocks.storeEntity = {
      relations: [
        {
          spaceId: 'space-1',
          type: { id: SystemIds.TYPES_PROPERTY },
          toEntity: { id: CLAIM_TYPE_ID },
          isLocal: true,
          hasBeenPublished: false,
          isDeleted: false,
        },
      ],
      // An indexed row: this entity exists on the server regardless of the
      // local-edit flags above.
      values: [{ spaceId: 'space-1', property: { id: 'name' }, isLocal: false, isDeleted: false }],
    };

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(<EntityVoteButtons entityId="claim-1" spaceId="space-1" />, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    expect(container).not.toBeEmptyDOMElement();
  });
});
