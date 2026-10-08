import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearLocalVotes, readLocalVotes, toggleLocalVote } from '~/core/state/local-votes';
import { pendingActionsAtom } from '~/core/state/pending-actions';
import { closeSaveVotesPrompt, readSaveVotesPrompt } from '~/core/state/save-votes-prompt';

import { EntityVoteButtons } from './entity-vote-buttons';

const SPACE = '41e851610e13a19441c4d980f2f2ce6b';

const mocks = vi.hoisted(() => ({
  submitResponseAsync: vi.fn(),
  authReady: true,
  /** Signed in, with no registered personal space yet. */
  personalSpace: { personalSpaceId: null as string | null, isRegistered: false, isLoading: false },
  accountSetupPending: false,
  /** The personal space the response hook knows — null until it registers. */
  responseSpaceId: null as string | null,
  /** The viewer's own indexed side. */
  serverDirection: null as 'positive' | 'negative' | null,
  /** The viewer's side as the index reports it when a replay reads it fresh. */
  freshDirection: null as 'positive' | 'negative' | null,
  /** A fresh read held open, so a test can act while it is in flight. */
  freshRead: null as Promise<'positive' | 'negative' | null> | null,
}));

vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => ({ ready: mocks.authReady, authenticated: false }),
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
vi.mock('~/core/hooks/use-smart-account', () => ({ useSmartAccount: () => ({ smartAccount: null }) }));
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
  readViewerResponseForReplay: () => mocks.freshRead ?? Promise.resolve(mocks.freshDirection),
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
  mocks.freshRead = null;
  mocks.submitResponseAsync.mockReset();
  mocks.submitResponseAsync.mockResolvedValue(undefined);
  clearLocalVotes();
  mocks.authReady = true;
  closeSaveVotesPrompt();
  window.sessionStorage.clear();
});
afterEach(cleanup);

const downvote = () => screen.getAllByRole('button').filter(button => button.className.includes('group/vote'))[1]!;

/** GEO-3214: signed out, the arrows vote on this device like the claim pills, with no sign-in in the way. */
describe('a vote from a signed-out visitor', () => {
  it('is kept on this device and drawn as theirs, without moving the score', async () => {
    render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="curation" />, { wrapper });
    expect(await screen.findByText('1')).toBeInTheDocument();

    fireEvent.click(upvote());

    expect(readLocalVotes().votes).toMatchObject([
      { entityId: 'entity-1', responseKind: 'curation', direction: 'positive' },
    ]);
    expect(queued()).toHaveLength(0);
    expect(upvote()).toHaveAttribute('title', 'Only on this device. Save it to count.');
    // 2 up, 1 down: still 1, because a vote on this device isn't counted until it is saved.
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  // Copilot on #2785: before Privy has restored a session, signed out is not known yet.
  it('drops a press while a session is still being restored', () => {
    mocks.authReady = false;
    render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="curation" />, { wrapper });

    fireEvent.click(upvote());

    expect(readLocalVotes().votes).toEqual([]);
    expect(queued()).toHaveLength(0);
  });

  it('switches and takes back, like the arrows do signed in', () => {
    render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="curation" />, { wrapper });

    fireEvent.click(upvote());
    fireEvent.click(downvote());
    expect(readLocalVotes().votes).toMatchObject([{ direction: 'negative' }]);

    fireEvent.click(downvote());
    expect(readLocalVotes().votes).toEqual([]);
  });

  it('counts toward the same save ask as sides on claims', () => {
    toggleLocalVote({
      entityId: 'claim-1',
      spaceId: SPACE,
      responseKind: 'stance',
      direction: 'positive',
      title: 'A claim',
    });
    render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="curation" />, { wrapper });

    fireEvent.click(upvote());

    expect(readSaveVotesPrompt()).toBe('threshold');
  });
});
