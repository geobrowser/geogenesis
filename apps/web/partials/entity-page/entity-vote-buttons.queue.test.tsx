import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pendingActionsAtom } from '~/core/state/pending-actions';

import { EntityVoteButtons } from './entity-vote-buttons';

const SPACE = '41e851610e13a19441c4d980f2f2ce6b';

const mocks = vi.hoisted(() => ({
  submitResponseAsync: vi.fn(),
  /** Signed in, with no registered personal space yet. */
  personalSpace: { personalSpaceId: null as string | null, isRegistered: false, isLoading: false },
  accountSetupPending: false,
  /** The personal space the response hook knows — null until it registers. */
  responseSpaceId: null as string | null,
  /** The viewer's own indexed side. */
  serverDirection: null as 'positive' | 'negative' | null,
  /** The viewer's side as the index reports it when a replay reads it fresh. */
  freshDirection: null as 'positive' | 'negative' | null,
}));

vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => ({ authenticated: true }),
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
    submitResponseAsync: mocks.submitResponseAsync,
    optimisticResponse: undefined,
    isResponseIndexingDelayed: false,
    isConnected: false,
    personalSpaceId: mocks.responseSpaceId,
  }),
}));
vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: { account: { address: '0xviewer' } } }),
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => mocks.personalSpace }));
vi.mock('~/core/state/pending-personal-space', () => ({
  usePendingPersonalSpace: () => ({ isPending: mocks.accountSetupPending }),
}));
vi.mock('~/core/io/queries', () => ({
  getClaimResponseSummaryPage: () => Effect.succeed([]),
  getEntityResponseCounts: () => Effect.succeed({ positive: 2, negative: 1 }),
  getEntityResponders: () => Effect.succeed([]),
  getSpaces: () => Effect.succeed([]),
  getUserEntityResponse: () => Effect.succeed(mocks.serverDirection),
}));
vi.mock('~/core/io/subgraph/fetch-profile', () => ({ fetchProfilesBySpaceIds: () => Effect.succeed([]) }));
vi.mock('~/core/responses/replay-viewer-response', () => ({
  readViewerResponseForReplay: async () => mocks.freshDirection,
}));
vi.mock('~/core/sync/use-store', () => ({ useQueryEntity: () => ({ entity: null, isLoading: false }) }));
vi.mock('~/partials/entity-page/claim-voter-avatars', () => ({ ClaimResponderAvatars: () => null }));

let store = createStore();
const queued = () => store.get(pendingActionsAtom);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <JotaiProvider store={store}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </JotaiProvider>
  );
}

const upvote = () => screen.getAllByRole('button').find(button => button.className.includes('group/vote'))!;

beforeEach(() => {
  store = createStore();
  mocks.personalSpace = { personalSpaceId: null, isRegistered: false, isLoading: false };
  mocks.accountSetupPending = false;
  mocks.responseSpaceId = null;
  mocks.serverDirection = null;
  mocks.freshDirection = null;
  mocks.submitResponseAsync.mockReset();
  mocks.submitResponseAsync.mockResolvedValue(undefined);
});
afterEach(cleanup);

/** Signed in without a usable space: a vote is held only when a space is on its way. */
describe('a vote from a signed-in account without a personal space', () => {
  it('is queued while a new account’s space is being created', () => {
    mocks.accountSetupPending = true;
    render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="curation" />, { wrapper });

    fireEvent.click(upvote());

    expect(queued()).toEqual([expect.objectContaining({ intent: 'positive', requires: 'personalSpace' })]);
  });

  it('is queued while a returning account’s space is still loading', () => {
    mocks.personalSpace = { ...mocks.personalSpace, isLoading: true };
    render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="curation" />, { wrapper });

    fireEvent.click(upvote());

    expect(queued()).toHaveLength(1);
  });

  // With no space and none on its way, nothing would ever publish it: drawing it as cast would be a
  // vote that silently never lands.
  it('is not queued, and says why, when no space is on its way', () => {
    render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="curation" />, { wrapper });

    fireEvent.click(upvote());

    expect(queued()).toHaveLength(0);
    expect(upvote()).toHaveAttribute('title', 'Finish setting up your account to vote');
  });
});

/**
 * The replay decides whether the viewer already holds the side from their indexed response, which
 * is still loading right after sign-in — and its empty default reads "holds nothing". It waits.
 */
describe('replaying a queued vote', () => {
  it('waits for the viewer’s own side, then skips a side they already hold', async () => {
    mocks.accountSetupPending = true;
    const view = render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="curation" />, {
      wrapper,
    });
    fireEvent.click(upvote());

    const running = Promise.resolve(queued()[0]!.run());
    await Promise.resolve();
    expect(mocks.submitResponseAsync).not.toHaveBeenCalled();

    // The space registers, and the indexed read says they had upvoted already.
    mocks.responseSpaceId = 'profile-1';
    mocks.serverDirection = 'positive';
    view.rerender(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="curation" />);
    await act(() => running);

    expect(mocks.submitResponseAsync).not.toHaveBeenCalled();
  });
});

/** No control on screen when the account is ready: the press's own closure asks the index. */
describe('replaying a queued vote with no control on screen', () => {
  it('skips a side the index says the viewer already holds', async () => {
    mocks.accountSetupPending = true;
    const view = render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="curation" />, { wrapper });
    fireEvent.click(upvote());
    view.unmount();
    mocks.freshDirection = 'positive';

    await queued()[0]!.run();

    expect(mocks.submitResponseAsync).not.toHaveBeenCalled();
  });
});
