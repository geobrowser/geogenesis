import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { Effect } from 'effect';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateClaimPositionSummary, DebateClaimSummary, MatchmakingReadiness } from '~/core/debates/api';
import { MatchmakingClaimCard } from '~/core/debates/matchmaking/matchmaking-claim-card';
import type { EntityResponseIndexingState } from '~/core/hooks/use-entity-vote';

import { EntityVoteButtons } from './entity-vote-buttons';

const SPACE = '019fedae-72b6-7ab2-927a-df044d57c566';
const CLAIM_ENTITY_ID = '019fedb1-0c41-7f3e-9a11-2c7d5e8b4419';

const mocks = vi.hoisted(() => ({
  submitResponse: vi.fn(),
  indexing: { status: 'idle', pending: null, runId: null } as EntityResponseIndexingState,
}));

vi.mock('~/core/hooks/use-entity-vote', async () => {
  const { isAwaitingResponseSubmission } = await import('~/core/responses/entity-response');
  return {
    useEntityResponse: () => ({
      submitResponse: mocks.submitResponse,
      submitResponseAsync: vi.fn(),
      optimisticResponse: mocks.indexing.pending?.expectedResponse ?? undefined,
      isSubmittingResponse: isAwaitingResponseSubmission(mocks.indexing),
      isProcessingResponse: mocks.indexing.status !== 'idle',
      isResponseIndexingDelayed: false,
      isConnected: true,
      personalSpaceId: 'profile-1',
    }),
    useEntityResponseIndexingSnapshot: () => mocks.indexing,
    useResetEntityResponseIndexingSnapshot: () => vi.fn(),
  };
});

vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => ({ ready: true, authenticated: true, user: { id: 'user-1' } }),
  useGeoLogin: () => ({ login: vi.fn() }),
}));

vi.mock('~/core/analytics', () => ({
  capture: vi.fn(),
  downvoted: vi.fn(),
  trackPrivyAuth: vi.fn(),
  upvoted: vi.fn(),
  voteCast: vi.fn(),
}));

vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: { account: { address: '0xviewer' } } }),
}));

vi.mock('~/core/io/queries', () => ({
  getClaimResponseSummaryPage: () => Effect.succeed({ items: [], endCursor: null, hasNextPage: false }),
  getEntityResponseCounts: () => Effect.succeed({ positive: 2, negative: 1 }),
  getEntityResponders: () => Effect.succeed([]),
  getSpaces: () => Effect.succeed([]),
  getUserEntityResponse: () => Effect.succeed(null),
}));

vi.mock('~/core/io/subgraph/fetch-profile', () => ({ fetchProfilesBySpaceIds: () => Effect.succeed([]) }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: 'profile-1', isRegistered: true, isLoading: false }),
}));
vi.mock('~/core/state/pending-personal-space', () => ({ usePendingPersonalSpace: () => ({ isPending: false }) }));
vi.mock('~/core/sync/use-store', () => ({ useQueryEntity: () => ({ entity: null, isLoading: false }) }));
vi.mock('~/partials/entity-page/claim-voter-avatars', () => ({ ClaimResponderAvatars: () => null }));

vi.mock('~/core/debates/matchmaking/hub-ask-context', () => ({ useHubAsk: () => undefined }));
vi.mock('~/core/debates/hooks', () => ({
  useDebateSchedule: () => ({ blocks: [], isSet: false }),
  useSaveDebateSchedule: () => ({ mutate: vi.fn(), isPending: false }),
  debateQueryKeys: {
    matchmakingClaimsRoot: (accountKey: string | null) =>
      ['debates', 'account', accountKey, 'matchmaking-claims'] as const,
    matches: (accountKey: string | null) => ['debates', 'account', accountKey, 'matches'] as const,
    rematchRoot: (accountKey: string | null) => ['debates', 'account', accountKey, 'rematch'] as const,
  },
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'account-1' }),
}));
vi.mock('~/core/claims/browse/use-claim-matchup', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/claims/browse/use-claim-matchup')>()),
  useClaimMatchup: () => ({
    match: null,
    blockedReason: undefined,
    isRequesting: false,
    requestError: null,
    request: vi.fn(),
  }),
}));
vi.mock('~/core/claims/browse/claim-response-summary', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/claims/browse/claim-response-summary')>();
  return {
    ...actual,
    useClaimResponseSummary: () => ({
      ...actual.summarizeClaimResponses(0, 0),
      isLoading: false,
      isViewerResponseLoading: false,
      hasCounts: true,
      viewerDirection: mocks.indexing.pending?.expectedResponse ?? null,
      indexedViewerDirection: null,
    }),
  };
});
vi.mock('~/core/hooks/use-near-viewport', () => ({ useNearViewport: () => ({ ref: vi.fn(), nearViewport: true }) }));
vi.mock('~/core/browse/use-browse-sidebar-cache', () => ({
  useBrowseSidebarQuerySource: () => ({
    personalSpaceId: null,
    walletAddress: undefined,
    keyInput: null,
    isLoading: false,
  }),
  useCachedBrowseSidebarData: () => null,
}));
vi.mock('~/core/hooks/use-profiles-by-space-ids', () => ({
  useProfilesBySpaceIds: () => ({ profilesBySpaceId: new Map(), isLoading: false }),
}));
vi.mock('~/core/hooks/use-spaces-by-ids', () => ({
  useSpacesByIds: () => ({ spaces: [], spacesById: new Map(), isLoading: false }),
}));
vi.mock('~/core/responses/replay-viewer-response', () => ({
  readViewerResponseForReplay: () => Promise.resolve(null),
}));

const claim: DebateClaimSummary = {
  id: 'debate-claim-1',
  space_id: SPACE,
  claim_entity_id: CLAIM_ENTITY_ID,
  claim: 'Chips are better than fries',
  description: null,
};

const positions: DebateClaimPositionSummary[] = [
  {
    position: true,
    position_label: 'Agree',
    total_count: 1,
    available_now_count: 0,
    present_count: 0,
    participants: [],
  },
  {
    position: false,
    position_label: 'Disagree',
    total_count: 0,
    available_now_count: 0,
    present_count: 0,
    participants: [],
  },
];

const readiness: MatchmakingReadiness = {
  response_kind: 'stance',
  viewer_response: null,
  viewer_debate_ready: false,
  readiness_disabled_reason: null,
};

function landingPositive(submitted: boolean): EntityResponseIndexingState {
  return {
    status: 'reconciling',
    pending: { expectedResponse: 'positive' } as Extract<
      EntityResponseIndexingState,
      { status: 'reconciling' }
    >['pending'],
    runId: 'run-1',
    submitted,
  };
}

function renderArrowsAndPills() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <JotaiProvider store={createStore()}>
      <QueryClientProvider client={client}>
        <div data-testid="arrows">
          <EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="stance" />
        </div>
        <div data-testid="pills">
          <MatchmakingClaimCard claim={claim} positions={positions} readiness={readiness} />
        </div>
      </QueryClientProvider>
    </JotaiProvider>
  );

  const [, downArrow] = within(screen.getByTestId('arrows'))
    .getAllByRole('button')
    .filter(button => button.className.includes('group/vote'));
  return {
    downArrow: downArrow!,
    disagreePill: within(screen.getByTestId('pills')).getByRole('button', { name: /^Disagree/ }),
  };
}

beforeEach(() => {
  mocks.submitResponse.mockReset();
  mocks.indexing = { status: 'idle', pending: null, runId: null };

  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the arrow and pill submission window', () => {
  it('both drop a change of mind while the write is still reaching the bundler', () => {
    mocks.indexing = landingPositive(false);
    const { downArrow, disagreePill } = renderArrowsAndPills();

    fireEvent.click(downArrow);
    fireEvent.click(disagreePill);

    expect(mocks.submitResponse).not.toHaveBeenCalled();
  });

  it('both submit a change of mind once the bundler has the write, before indexing', () => {
    mocks.indexing = landingPositive(true);
    const { downArrow, disagreePill } = renderArrowsAndPills();

    fireEvent.click(downArrow);
    fireEvent.click(disagreePill);

    expect(mocks.submitResponse.mock.calls.map(([direction]) => direction)).toEqual(['negative', 'negative']);
  });
});
