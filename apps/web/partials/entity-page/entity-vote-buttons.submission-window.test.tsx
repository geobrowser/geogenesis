import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityVoteButtons } from './entity-vote-buttons';
import { ResponseButton } from './response-button';

const SPACE = '41e851610e13a19441c4d980f2f2ce6b';

const mocks = vi.hoisted(() => ({
  response: {
    isSubmittingResponse: false,
    isProcessingResponse: false,
  },
}));

vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => ({ authenticated: false }),
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
    submitResponseAsync: vi.fn(),
    optimisticResponse: undefined,
    isSubmittingResponse: mocks.response.isSubmittingResponse,
    isProcessingResponse: mocks.response.isProcessingResponse,
    isResponseIndexingDelayed: false,
    isConnected: true,
    personalSpaceId: 'profile-1',
  }),
}));

vi.mock('~/core/hooks/use-smart-account', () => ({ useSmartAccount: () => ({ smartAccount: {} }) }));

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

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderArrowAndPill() {
  render(
    <>
      <EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="stance" />
      <ResponseButton
        selected={false}
        pending={mocks.response.isSubmittingResponse}
        onPress={vi.fn()}
        ariaLabel="pill"
        className="test-pill"
      >
        pill
      </ResponseButton>
    </>,
    { wrapper }
  );

  const [arrow] = screen.getAllByRole('button').filter(button => button.className.includes('group/vote'));
  const pill = screen.getByRole('button', { name: 'pill' });
  return { arrow: arrow!, pill };
}

const ignoresPresses = (button: HTMLElement) =>
  button.getAttribute('aria-disabled') === 'true' && button.className.includes('cursor-progress');

beforeEach(() => {
  mocks.response = { isSubmittingResponse: false, isProcessingResponse: false };
});

afterEach(cleanup);

describe('the arrow and pill submission window', () => {
  it('both take a change of mind once the bundler has the write, before indexing', () => {
    mocks.response = { isSubmittingResponse: false, isProcessingResponse: true };
    const { arrow, pill } = renderArrowAndPill();

    expect(ignoresPresses(arrow)).toBe(false);
    expect(ignoresPresses(pill)).toBe(false);
    expect(ignoresPresses(arrow)).toBe(ignoresPresses(pill));
  });

  it('both ignore presses while the write is still reaching the bundler', () => {
    mocks.response = { isSubmittingResponse: true, isProcessingResponse: true };
    const { arrow, pill } = renderArrowAndPill();

    expect(ignoresPresses(arrow)).toBe(true);
    expect(ignoresPresses(pill)).toBe(true);
    expect(ignoresPresses(arrow)).toBe(ignoresPresses(pill));
  });
});
