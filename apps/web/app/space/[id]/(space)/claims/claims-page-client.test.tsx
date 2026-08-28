import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { Entity, Relation } from '~/core/types';

import { ClaimsPageClient } from './claims-page-client';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  nameSet: vi.fn(),
  relationSet: vi.fn(),
  setActiveSpace: vi.fn(),
  bumpReviewVersion: vi.fn(),
  setIsReviewOpen: vi.fn(),
  joinMutate: vi.fn(),
  leaveMutate: vi.fn(),
  responseBatchCalls: [] as unknown[],
  refetchResponseBatch: vi.fn(),
}));

let claims: Entity[] = [];
let claimsLoading = false;
let joinPending = false;
let lastQueryEntitiesOptions: unknown = null;
let debateClaimsResponse: { claims: unknown[] } = { claims: [] };
let responseBatchReady = true;
let responseBatchError = false;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
}));

vi.mock('~/core/state/feature-flags', () => ({
}));

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponseIndexingState: () => 'idle',
  useEntityResponseIndexingSnapshot: () => ({ status: 'idle', pending: null, runId: null }),
  useResetEntityResponseIndexingSnapshot: () => vi.fn(),
}));

vi.mock('~/core/debates/hooks', () => ({
  // Mirrors the real key factory: the readiness machine refetches these families before it
  // retries a `claim_response_required`.
  debateQueryKeys: {
    matchmakingClaimsRoot: (accountKey: string | null) =>
      ['debates', 'account', accountKey, 'matchmaking-claims'] as const,
    matches: (accountKey: string | null) => ['debates', 'account', accountKey, 'matches'] as const,
    rematchRoot: (accountKey: string | null) => ['debates', 'account', accountKey, 'rematch'] as const,
  },
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'account-1' }),
  useDebateClaims: () => ({ data: debateClaimsResponse, error: null }),
  useJoinDebateQueue: () => ({
    mutateAsync: mocks.joinMutate,
    reset: vi.fn(),
    isPending: joinPending,
    error: null,
  }),
  useLeaveDebateQueue: () => ({ mutateAsync: mocks.leaveMutate, isPending: false, error: null }),
}));

vi.mock('~/core/responses/use-claim-response-summaries', () => ({
  ClaimResponseBatchBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
  useClaimResponseSummaryBatch: (options: unknown) => {
    mocks.responseBatchCalls.push(options);
    return {
      isSuccess: responseBatchReady,
      isError: responseBatchError,
      refetch: mocks.refetchResponseBatch,
    };
  },
}));

vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: ({ responseKind }: { responseKind: string }) =>
    !responseBatchReady ? (
      <div data-testid="entity-response-skeleton">Response skeleton</div>
    ) : (
      <div data-testid="entity-response-buttons" data-response-kind={responseKind}>
        Entity response buttons
      </div>
    ),
}));

vi.mock('~/core/state/diff-store', () => ({
  useDiff: () => ({
    setActiveSpace: mocks.setActiveSpace,
    bumpReviewVersion: mocks.bumpReviewVersion,
    setIsReviewOpen: mocks.setIsReviewOpen,
  }),
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: (options: unknown) => {
    lastQueryEntitiesOptions = options;
    const deferUntilFetched = (options as { deferUntilFetched?: boolean }).deferUntilFetched;
    return { entities: claimsLoading && deferUntilFetched ? [] : claims, isLoading: claimsLoading };
  },
}));

vi.mock('~/core/sync/use-mutate', () => ({
  useMutate: () => ({
    storage: {
      entities: { name: { set: mocks.nameSet } },
      relations: { set: mocks.relationSet },
    },
  }),
}));

vi.mock('~/design-system/select-entity-compact', () => ({
  SelectEntityCompact: ({ placeholder }: { placeholder: string }) => (
    <div data-testid={`selector-${placeholder}`}>{placeholder}</div>
  ),
}));

beforeEach(() => {
  claims = [];
  claimsLoading = false;
  joinPending = false;
  lastQueryEntitiesOptions = null;
  debateClaimsResponse = { claims: [] };
  responseBatchReady = true;
  responseBatchError = false;
  vi.clearAllMocks();
  mocks.joinMutate.mockReturnValue(new Promise(() => undefined));
  mocks.leaveMutate.mockReturnValue(new Promise(() => undefined));
  mocks.responseBatchCalls.length = 0;
});

afterEach(() => cleanup());

describe('ClaimsPageClient', () => {
  it('queries Claim entities and renders the empty state', () => {
    renderClaims();

    expect(screen.getByRole('heading', { name: 'Claims' })).toBeInTheDocument();
    expect(screen.getByText('No claims yet')).toBeInTheDocument();
    expect(lastQueryEntitiesOptions).toMatchObject({
      where: {
        spaces: [{ equals: 'space-1' }],
        types: [{ id: { equals: CLAIM_TYPE_ID } }],
      },
      deferUntilFetched: true,
      includeUnpublishedLocal: true,
    });
    expect(lastQueryEntitiesOptions).not.toHaveProperty('placeholderData');
  });

  it('shows loading instead of locally cached claims before the authoritative query resolves', () => {
    claims = [publishedClaim()];
    claimsLoading = true;

    renderClaims();

    expect(screen.getByText('Loading claims...')).toBeInTheDocument();
    expect(screen.queryByText('Public transit should be free')).not.toBeInTheDocument();
    expect(screen.queryByTestId('entity-response-buttons')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Debate' })).not.toBeInTheDocument();
  });

  it('does not retain the previous space claims while the next space loads', () => {
    claims = [publishedClaim()];
    const view = renderClaims();
    expect(screen.getByText('Public transit should be free')).toBeInTheDocument();

    claimsLoading = true;
    view.rerender(<ClaimsPageClient spaceId="space-2" />);

    expect(screen.getByText('Loading claims...')).toBeInTheDocument();
    expect(screen.queryByText('Public transit should be free')).not.toBeInTheDocument();
  });

  it('stages a claim with Claim and Topics relations only', () => {
    renderClaims();

    fireEvent.click(screen.getByRole('button', { name: 'Add claim' }));
    fireEvent.change(screen.getByLabelText('Claim'), {
      target: { value: 'Public transit should be free' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Open proposal' }).closest('form')!);

    expect(mocks.nameSet).toHaveBeenCalledWith(expect.any(String), 'space-1', 'Public transit should be free');
    const relationTypes = mocks.relationSet.mock.calls.map(call => (call[0] as Relation).type.id);
    expect(relationTypes).toContain(SystemIds.TYPES_PROPERTY);
    expect(relationTypes).not.toContain('73609ae8644c4463a50a90a3ee585746');
    expect(relationTypes).not.toContain(TOPICS_PROPERTY_ID);
    expect(mocks.setIsReviewOpen).toHaveBeenCalledWith(true);
  });

  it('enables the readiness switch after a refetch exposes the viewer response', () => {
    claims = [publishedClaim()];
    debateClaimsResponse = {
      claims: [debateClaim({ viewer_response: null })],
    };

    const { rerender } = renderClaims();

    expect(screen.getByTestId('entity-response-buttons')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Debate' })).toBeDisabled();

    debateClaimsResponse = {
      claims: [debateClaim({ viewer_response: { position: true, position_label: 'Agree' } })],
    };
    rerender(<ClaimsPageClient spaceId="space-1" />);

    fireEvent.click(screen.getByRole('switch', { name: 'Debate' }));

    expect(mocks.joinMutate).toHaveBeenCalledWith({ claimId: 'claim-1' });
  });

  it('batches the active response kind for all visible claims and defers their individual requests', () => {
    claims = Array.from({ length: 50 }, (_, index) => publishedClaim(`claim-${index}`, `Claim ${index}`));
    debateClaimsResponse = {
      claims: claims.map((claim, index) =>
        debateClaim({
          claim_entity_id: claim.id,
          response_kind: index % 2 === 0 ? 'stance' : 'veracity',
        })
      ),
    };
    responseBatchReady = false;

    renderClaims();

    expect(mocks.responseBatchCalls).toHaveLength(1);
    expect(mocks.responseBatchCalls[0]).toMatchObject({
      spaceId: 'space-1',
      enabled: true,
      targets: expect.arrayContaining([
        { entityId: 'claim-0', responseKind: 'stance' },
        { entityId: 'claim-1', responseKind: 'veracity' },
      ]),
    });
    expect((mocks.responseBatchCalls[0] as { targets: unknown[] }).targets).toHaveLength(50);
    expect(screen.getAllByTestId('entity-response-skeleton')).toHaveLength(50);
    expect(screen.queryByTestId('entity-response-buttons')).not.toBeInTheDocument();
    expect(screen.getAllByRole('switch', { name: 'Debate' })).toHaveLength(50);
  });

  it('keeps every published claim responsive when geo-chat has not hydrated its readiness snapshot yet', () => {
    claims = [
      publishedClaim('claim-1', 'Existing debate claim'),
      {
        ...publishedClaim('claim-2', 'New factual claim'),
        values: [
          {
            spaceId: 'space-1',
            property: { id: CLAIM_IS_FACTUAL_PROPERTY_ID },
            value: '1',
          },
        ],
      } as Entity,
    ];
    debateClaimsResponse = { claims: [debateClaim()] };

    renderClaims();

    expect(mocks.responseBatchCalls.at(-1)).toMatchObject({
      targets: [
        { entityId: 'claim-1', responseKind: 'stance' },
        { entityId: 'claim-2', responseKind: 'veracity' },
      ],
    });
    expect(screen.getAllByTestId('entity-response-buttons')).toHaveLength(2);
    expect(screen.getAllByTestId('entity-response-buttons')[1]).toHaveAttribute('data-response-kind', 'veracity');
    expect(screen.getAllByRole('switch', { name: 'Debate' })).toHaveLength(2);
    expect(screen.getAllByRole('switch', { name: 'Debate' })[1]).toBeDisabled();
  });

  it('retries only the page response batch after its retries are exhausted', () => {
    claims = [publishedClaim()];
    debateClaimsResponse = { claims: [debateClaim()] };
    responseBatchReady = false;
    responseBatchError = true;

    renderClaims();

    expect(screen.getByTestId('entity-response-skeleton')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.refetchResponseBatch).toHaveBeenCalledOnce();
  });

  it('renders backend response labels and one leave-readiness toggle', () => {
    claims = [publishedClaim()];
    debateClaimsResponse = {
      claims: [
        debateClaim({
          viewer_response: { position: true, position_label: 'Verify' },
          viewer_debate_ready: true,
          response_kind: 'veracity',
          online_choices: [],
        }),
      ],
    };

    renderClaims();

    expect(screen.queryByText('Ready to debate')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'Debate' }));
    expect(mocks.leaveMutate).toHaveBeenCalledWith({ claimId: 'claim-1' });
  });

  it('keeps readiness clickable while joining but unavailable for unpublished or debating claims', () => {
    const published = publishedClaim();
    claims = [published];
    debateClaimsResponse = {
      claims: [debateClaim()],
    };
    joinPending = true;

    const { rerender } = renderClaims();

    expect(screen.getByRole('switch', { name: 'Debate' })).toBeEnabled();
    expect(screen.getByRole('switch', { name: 'Debate' })).toHaveAttribute('aria-busy', 'true');

    joinPending = false;
    claims = [
      {
        ...published,
        relations: [
          {
            type: { id: 'local-change', name: 'Local change' },
            isLocal: true,
            hasBeenPublished: false,
          } as Relation,
        ],
      },
    ];
    rerender(<ClaimsPageClient spaceId="space-1" />);

    expect(screen.getByText('Publish this claim before starting a debate.')).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Debate' })).not.toBeInTheDocument();

    claims = [published];
    debateClaimsResponse = {
      claims: [debateClaim({ active_debate: { id: 'debate-1', status: 'in_progress' } })],
    };
    rerender(<ClaimsPageClient spaceId="space-1" />);

    expect(screen.getByText('Debate in progress')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Debate' })).toBeDisabled();
  });
});

function renderClaims() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<ClaimsPageClient spaceId="space-1" />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

function publishedClaim(id = 'claim-1', name = 'Public transit should be free'): Entity {
  return {
    id,
    name,
    description: null,
    spaces: ['space-1'],
    types: [{ id: CLAIM_TYPE_ID, name: 'Claim' }],
    values: [],
    relations: [],
  };
}

function debateClaim(overrides: Record<string, unknown> = {}) {
  return {
    id: 'debate-claim-1',
    space_id: 'space-1',
    claim_entity_id: 'claim-1',
    claim: 'Public transit should be free',
    description: null,
    response_kind: 'stance',
    viewer_response: { position: true, position_label: 'Agree' },
    viewer_debate_ready: false,
    readiness_disabled_reason: null,
    readiness_changed_at: null,
    online_choices: [],
    active_match: null,
    active_debate: null,
    created_at: '2026-08-06T00:00:00.000Z',
    updated_at: '2026-08-06T00:00:00.000Z',
    ...overrides,
  };
}
