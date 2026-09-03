import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { Entity, Relation } from '~/core/types';

import { ClaimsPageClient } from './claims-page-client';

// The rows render the shared claim card now, whose response controls reach this module. Its
// top-level `atomWithStorage` runs on import, and under Node's own webstorage — which shadows
// jsdom's with an object that has no getItem — that import takes the suite down before a test runs.
vi.mock('~/core/state/pending-personal-space', () => ({
  usePendingPersonalSpace: () => ({ isPending: false, pending: null }),
  pendingPersonalSpaceId: (topicId: string) => `pending:${topicId}`,
  isPendingPersonalSpaceId: () => false,
  PENDING_PERSONAL_SPACE_PREFIX: 'pending:',
}));

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  nameSet: vi.fn(),
  relationSet: vi.fn(),
  setActiveSpace: vi.fn(),
  bumpReviewVersion: vi.fn(),
  setIsReviewOpen: vi.fn(),
  responseBatchCalls: [] as unknown[],
  refetchResponseBatch: vi.fn(),
}));

let claims: Entity[] = [];
let claimsLoading = false;
let lastQueryEntitiesOptions: unknown = null;
let debateClaimsResponse: { claims: unknown[] } = { claims: [] };
let responseBatchReady = true;
let responseBatchError = false;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
}));

vi.mock('~/core/state/feature-flags', () => ({}));

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponseIndexingState: () => 'idle',
  useEntityResponseIndexingSnapshot: () => ({ status: 'idle', pending: null, runId: null }),
  useResetEntityResponseIndexingSnapshot: () => vi.fn(),
}));

vi.mock('~/core/debates/hooks', () => ({
  // Mirrors the real key factory: `vi.mock` replaces the whole module, so every query key read
  // below this needs one here.
  debateQueryKeys: {
    matchmakingClaimsRoot: (accountKey: string | null) =>
      ['debates', 'account', accountKey, 'matchmaking-claims'] as const,
    matches: (accountKey: string | null) => ['debates', 'account', accountKey, 'matches'] as const,
    rematchRoot: (accountKey: string | null) => ['debates', 'account', accountKey, 'rematch'] as const,
  },
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'account-1' }),
  useDebateClaims: () => ({ data: debateClaimsResponse, error: null }),
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

// The row derives its position summaries from this; the hook reaches the personal-space lookup and
// through it Wagmi, which this suite has no provider for. The page's own batching is what these
// tests are about, and that is stubbed separately below.
vi.mock('~/core/claims/browse/claim-response-summary', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/claims/browse/claim-response-summary')>()),
  useClaimResponseSummary: () => ({
    positive: 0,
    negative: 0,
    total: 0,
    percent: null,
    meetsFloor: false,
    isControversial: false,
    // Follows the batch, as the real hook does: under a boundary the individual reads stand down,
    // so the batch's own readiness is what says whether there is anything to draw yet. Stubbing
    // this `false` unconditionally is what let the card look answerable with the batch still out.
    isLoading: !responseBatchReady,
    // Same swap the real hook makes under a batch: the viewer's own side is primed by the batch
    // too, so the batch's readiness is the only thing either flag waits on.
    isViewerResponseLoading: !responseBatchReady,
    // The batch is what answers under a boundary, so it is what makes the counts an answer.
    hasCounts: responseBatchReady,
    viewerDirection: null,
    viewerSpaceId: null,
  }),
}));

// Mirrors the real card's contract rather than inventing one. An earlier version rendered a
// "response skeleton" whenever the batch was unready — a thing `MatchmakingClaimCard` has never
// drawn, so the assertions that looked for it were reading the mock back to itself. What the card
// really does with an unready batch is refuse to answer: `answersReady` is false, because the
// viewer's own side is unknown until the batch lands and pressing the side they already hold would
// republish it rather than clear it.
vi.mock('~/core/debates/matchmaking/matchmaking-claim-card', () => ({
  MatchmakingClaimCard: ({
    claim,
    readiness,
    answersReady = true,
  }: {
    claim: { claim: string };
    readiness: { response_kind: string };
    answersReady?: boolean;
  }) => (
    <div
      data-testid="entity-response-buttons"
      data-response-kind={readiness.response_kind}
      data-answers-ready={String(answersReady)}
    >
      {claim.claim}
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
  lastQueryEntitiesOptions = null;
  debateClaimsResponse = { claims: [] };
  responseBatchReady = true;
  responseBatchError = false;
  vi.clearAllMocks();
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

    // Answerable even with the batch still out, because every claim here has a geo-chat row and a
    // row carries the viewer's own side. The batch supplies the counts; it is not the only thing
    // that can say which side the viewer holds.
    const cards = screen.getAllByTestId('entity-response-buttons');
    expect(cards).toHaveLength(50);
    expect(cards.every(card => card.getAttribute('data-answers-ready') === 'true')).toBe(true);
  });

  it('will not let anyone answer a rowless claim while the batch is still out', () => {
    // Without a row, the viewer's side comes from the batch alone. Drawn from an unready batch it
    // reads as "no response", so a viewer who already answered sees their own side unselected — and
    // pressing it republishes the response they hold instead of clearing it.
    claims = [publishedClaim()];
    debateClaimsResponse = { claims: [] };
    responseBatchReady = false;

    renderClaims();
    expect(screen.getByTestId('entity-response-buttons').getAttribute('data-answers-ready')).toBe('false');

    cleanup();
    responseBatchReady = true;
    renderClaims();
    expect(screen.getByTestId('entity-response-buttons').getAttribute('data-answers-ready')).toBe('true');
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
  });

  it('retries only the page response batch after its retries are exhausted', () => {
    claims = [publishedClaim()];
    debateClaimsResponse = { claims: [debateClaim()] };
    responseBatchReady = false;
    responseBatchError = true;

    renderClaims();

    expect(screen.getByTestId('entity-response-buttons')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.refetchResponseBatch).toHaveBeenCalledOnce();
  });

  it('tells the viewer to publish before an unpublished claim offers a debate', () => {
    const published = publishedClaim();
    claims = [published];
    debateClaimsResponse = {
      claims: [debateClaim()],
    };
    const { rerender } = renderClaims();

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
    // A draft has no on-chain identity to respond to, so it gets the notice instead of the card.
    expect(screen.queryByTestId('entity-response-buttons')).not.toBeInTheDocument();

    claims = [published];
    debateClaimsResponse = {
      claims: [debateClaim({ active_debate: { id: 'debate-1', status: 'in_progress' } })],
    };
    rerender(<ClaimsPageClient spaceId="space-1" />);

    // "Debate in progress" is gone. The card's end slot turns the same `active_debate` into a
    // "Watch live" link, so the page no longer prints a sentence describing it — one fact, one
    // rendering, and the rendering you can press.
    expect(screen.queryByText('Debate in progress')).not.toBeInTheDocument();
    expect(screen.getByTestId('entity-response-buttons')).toBeInTheDocument();
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
