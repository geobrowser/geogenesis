import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EntityVoteButtons } from './entity-vote-buttons';

const SPACE = '41e851610e13a19441c4d980f2f2ce6b';

const mocks = vi.hoisted(() => ({ countReads: 0 }));

vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => ({ ready: true, authenticated: false }),
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
    isResponseIndexingDelayed: false,
    isConnected: false,
    personalSpaceId: null,
  }),
}));
vi.mock('~/core/hooks/use-smart-account', () => ({ useSmartAccount: () => ({ smartAccount: null }) }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: null, isRegistered: false, isLoading: false }),
}));
vi.mock('~/core/state/pending-personal-space', () => ({
  usePendingPersonalSpace: () => ({ isPending: false }),
}));
vi.mock('~/core/io/queries', () => ({
  getClaimResponseSummaryPage: () => Effect.succeed([]),
  getEntityResponseCounts: () => {
    mocks.countReads++;
    return Effect.succeed({ positive: 5, negative: 1 });
  },
  getEntityResponders: () => Effect.succeed([]),
  getSpaces: () => Effect.succeed([]),
  getUserEntityResponse: () => Effect.succeed(null),
}));
vi.mock('~/core/io/subgraph/fetch-profile', () => ({ fetchProfilesBySpaceIds: () => Effect.succeed([]) }));
vi.mock('~/core/sync/use-store', () => ({ useQueryEntity: () => ({ entity: null, isLoading: false }) }));
vi.mock('~/partials/entity-page/claim-voter-avatars', () => ({ ClaimResponderAvatars: () => null }));

const store = createStore();
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function wrapper({ children }: { children: ReactNode }) {
  return (
    <JotaiProvider store={store}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </JotaiProvider>
  );
}

const voteButtons = () => screen.queryAllByRole('button').filter(button => button.className.includes('group/vote'));

afterEach(cleanup);

describe('vote counts on a control far from the viewport', () => {
  it('are not read, and draw the loading state rather than a zero, until the control comes near', async () => {
    const view = render(
      <EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="curation" nearViewport={false} />,
      {
        wrapper,
      }
    );

    expect(voteButtons()).toHaveLength(0);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(mocks.countReads).toBe(0);

    view.rerender(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="curation" nearViewport />);

    await waitFor(() => expect(screen.getByText('4')).toBeInTheDocument());
    expect(mocks.countReads).toBe(1);

    // Leaving the window again keeps what it loaded.
    view.rerender(
      <EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="curation" nearViewport={false} />
    );
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(voteButtons()).toHaveLength(2);
  });
});
