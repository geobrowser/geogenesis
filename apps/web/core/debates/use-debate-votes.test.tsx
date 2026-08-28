import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate, DebateParticipant } from '~/core/debates/api';
import type { Entity, Relation } from '~/core/types';

import { TYPES_PROPERTY_ID, VOTE_DEBATES_PROPERTY_ID, VOTE_WINNER_PROPERTY_ID } from './ontology';
import { resetDebateVotePublishStateForTests, useDebateVotes } from './use-debate-votes';

const VOTER_SPACE = 'voterspace0000000000000000000001';
const ALICE_SPACE = 'alicespace0000000000000000000001';
const BOB_SPACE = 'bobspace000000000000000000000001';
const DEBATE_ID = 'debate00000000000000000000000001';

const mocks = vi.hoisted(() => ({
  voteEntities: [] as unknown[],
  publishedRelations: [] as unknown[][],
  publishEdit: vi.fn(),
  sendUserOperation: vi.fn(),
  idCounter: 0,
  // Fails the publish at the one step that isn't wrapped in a retry schedule. Rejecting
  // `publishEdit` instead would sit in Effect.retry for a minute before surfacing.
  prepareFails: false,
  gate: null as null | Promise<'ok' | 'fail'>,
  openPrivySignIn: vi.fn(),
  /** Whether a usable smart account exists. Null also means "restoring" or "failed". */
  signedIn: true,
  accountLoading: false,
  accountError: null as Error | null,
  /** Privy's answer, which is the authority on whether anyone is signed in. */
  authenticated: true,
  authReady: true,
  reportError: vi.fn(),
  enqueuePendingAction: vi.fn(),
}));

vi.mock('@geoprotocol/geo-sdk', () => ({
  personalSpace: { publishEdit: (...args: unknown[]) => mocks.publishEdit(...args) },
}));

vi.mock('@geoprotocol/geo-sdk/lite', async importOriginal => {
  const actual = await importOriginal<typeof import('@geoprotocol/geo-sdk/lite')>();
  return {
    ...actual,
    // Deterministic so a test can name the exact relation id it expects to see deleted.
    IdUtils: { ...actual.IdUtils, generate: () => `generated-${++mocks.idCounter}` },
    Position: { ...actual.Position, generate: () => 'position' },
  };
});

// The seam the assertions read: whatever relations the hook decided to publish.
vi.mock('~/core/utils/publish', () => ({
  Publish: {
    prepareLocalDataForPublishing: (_values: unknown, relations: unknown[]) => {
      mocks.publishedRelations.push(relations);
      const gate = mocks.gate;
      if (gate) {
        mocks.gate = null;
        return Effect.tryPromise({
          try: async () => {
            if ((await gate) === 'fail') throw new Error('publish failed');
            return [{ op: 'noop' }];
          },
          catch: error => error,
        });
      }
      return mocks.prepareFails ? Effect.fail(new Error('publish failed')) : Effect.succeed([{ op: 'noop' }]);
    },
  },
}));

vi.mock('~/core/io/queries', () => ({
  getDebateVoteEntities: () => Effect.succeed(mocks.voteEntities),
  checkEntityExists: () => Effect.succeed(true),
}));

vi.mock('~/core/io/subgraph/fetch-profile', () => ({
  fetchProfilesBySpaceIds: () => Effect.succeed([]),
}));

vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({
    smartAccount: mocks.signedIn
      ? {
          account: { address: '0xabc' },
          sendUserOperation: (...args: unknown[]) => mocks.sendUserOperation(...args),
        }
      : null,
    isLoading: mocks.accountLoading,
    error: mocks.accountError,
  }),
}));

vi.mock('~/core/state/pending-actions', () => ({
  useEnqueuePendingAction: () => mocks.enqueuePendingAction,
}));

vi.mock('~/core/debates/hooks', () => ({
  useGeoChatAuth: () => ({ ready: mocks.authReady, authenticated: mocks.authenticated, accountKey: 'user-a' }),
}));

vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: () => mocks.openPrivySignIn,
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: VOTER_SPACE, isRegistered: true, isLoading: false }),
}));

vi.mock('~/core/hooks/use-geo-profile', () => ({ useGeoProfile: () => ({ profile: { name: 'Voter' } }) }));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, vi.fn()] }));
vi.mock('~/core/state/status-bar-store', () => ({ useReportError: () => mocks.reportError }));

function participant(spaceId: string, name: string, slot: number): DebateParticipant {
  return { profile_space_id: spaceId, display_name: name, participant_slot: slot } as DebateParticipant;
}

const ALICE = participant(ALICE_SPACE, 'Alice', 1);
const BOB = participant(BOB_SPACE, 'Bob', 2);

const debate = {
  id: DEBATE_ID,
  claim: { claim: 'Cats beat dogs' },
  participants: [ALICE, BOB],
} as unknown as Debate;

/** A Vote entity as the indexer would return it, already pointing at `winnerSpaceId`. */
function voteEntity(entityId: string, winnerSpaceId: string, winnerRelationId: string): Entity {
  return {
    id: entityId,
    spaces: [VOTER_SPACE],
    relations: [
      { id: winnerRelationId, type: { id: VOTE_WINNER_PROPERTY_ID }, toEntity: { id: winnerSpaceId } },
      { id: 'debates-rel', type: { id: VOTE_DEBATES_PROPERTY_ID }, toEntity: { id: DEBATE_ID } },
    ],
  } as unknown as Entity;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** The relations from the Nth publish, split into the deletes and the winner creates. */
function publishAt(index: number) {
  const relations = (mocks.publishedRelations[index] ?? []) as Relation[];
  return {
    all: relations,
    deleted: relations.filter(relation => relation.isDeleted),
    winnerCreates: relations.filter(relation => !relation.isDeleted && relation.type?.id === VOTE_WINNER_PROPERTY_ID),
  };
}

/** Two hooks on one debate under one QueryClient — the feed and its claims panel. */
async function renderTwoSurfaces() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = renderHook(() => ({ feed: useDebateVotes(debate), panel: useDebateVotes(debate) }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await waitFor(() => expect(view.result.current.feed).toBeDefined());
  return view;
}

async function renderVotes() {
  const view = renderHook(() => useDebateVotes(debate), { wrapper });
  await waitFor(() => expect(view.result.current).toBeDefined());
  return view;
}

beforeEach(() => {
  resetDebateVotePublishStateForTests();
  // Not mock fns, so no automatic reset restores them.
  mocks.signedIn = true;
  mocks.accountLoading = false;
  mocks.accountError = null;
  mocks.authenticated = true;
  mocks.authReady = true;
  mocks.openPrivySignIn.mockClear();
  mocks.reportError.mockClear();
  mocks.enqueuePendingAction.mockClear();
  mocks.voteEntities = [];
  mocks.publishedRelations = [];
  mocks.idCounter = 0;
  mocks.prepareFails = false;
  mocks.gate = null;
  mocks.publishEdit.mockReset();
  mocks.publishEdit.mockResolvedValue({ to: '0xto', calldata: '0xdata' });
  mocks.sendUserOperation.mockReset();
  mocks.sendUserOperation.mockResolvedValue('0xhash');
});

describe('useDebateVotes castVote', () => {
  // Signed out is a step, not an error: a toast saying "connect your wallet" left the viewer to
  // find the way in themselves, so the pill opens the login the upvote control opens.
  it('opens the sign-in instead of publishing when the viewer is signed out', async () => {
    mocks.signedIn = false;
    mocks.authenticated = false;
    const view = await renderVotes();

    await act(async () => {
      await view.result.current.castVote(ALICE);
    });

    expect(mocks.openPrivySignIn).toHaveBeenCalledOnce();
    expect(mocks.publishEdit).not.toHaveBeenCalled();
  });

  // The pick is real work. Coming back from a login to an unchanged debate, with nothing said, is
  // worse than the toast this replaced — so it is queued for the runner to replay.
  it('queues the pick so signing in does not lose it', async () => {
    mocks.signedIn = false;
    mocks.authenticated = false;
    const view = await renderVotes();

    await act(async () => {
      await view.result.current.castVote(ALICE);
    });

    expect(mocks.enqueuePendingAction).toHaveBeenCalledOnce();
    const action = mocks.enqueuePendingAction.mock.calls[0]![0] as {
      id: string;
      requires: string;
      run: () => Promise<void>;
    };
    // A personal space, not just auth: the vote is published from it.
    expect(action.requires).toBe('personalSpace');

    // Replaying once the account exists publishes the vote it was queued for.
    mocks.signedIn = true;
    mocks.authenticated = true;
    view.rerender();
    await act(async () => {
      await action.run();
    });

    await waitFor(() => expect(mocks.publishEdit).toHaveBeenCalled());
  });

  // `smartAccount` is null while the account restores too, and a login there would clear the
  // viewer's half-finished onboarding to fix a problem they do not have.
  it('waits rather than opening the sign-in while the account is still restoring', async () => {
    mocks.signedIn = false;
    mocks.accountLoading = true;
    const view = await renderVotes();

    await act(async () => {
      await view.result.current.castVote(ALICE);
    });

    expect(mocks.openPrivySignIn).not.toHaveBeenCalled();
    expect(mocks.publishEdit).not.toHaveBeenCalled();
  });

  // Null again, and `isLoading` is false by then — the case the hook's own comment calls
  // indistinguishable from logged out. A login cannot fix it, so say what happened.
  it('reports an account initialization failure rather than asking the viewer to sign in', async () => {
    mocks.signedIn = false;
    mocks.accountError = new Error('zerodev unreachable');
    const view = await renderVotes();

    await act(async () => {
      await view.result.current.castVote(ALICE);
    });

    expect(mocks.openPrivySignIn).not.toHaveBeenCalled();
    expect(mocks.reportError).toHaveBeenCalledOnce();
    expect(mocks.publishEdit).not.toHaveBeenCalled();
  });

  it('publishes a whole Vote entity on a first vote', async () => {
    const view = await renderVotes();

    await act(async () => {
      await view.result.current.castVote(ALICE);
    });

    const { all, deleted, winnerCreates } = publishAt(0);
    // Nothing to remove yet, and the entity needs its Types and Debates relations too.
    expect(deleted).toHaveLength(0);
    expect(all).toHaveLength(3);
    expect(winnerCreates[0]?.toEntity.id).toBe(ALICE_SPACE);
  });

  it('re-emits anchor relations and swaps the winner when changing a pick', async () => {
    mocks.voteEntities = [voteEntity('vote-1', ALICE_SPACE, 'winner-rel-1')];
    const view = await renderVotes();
    await waitFor(() => expect(view.result.current.hasVoted).toBe(true));

    await act(async () => {
      await view.result.current.castVote(BOB);
    });

    const { all, deleted, winnerCreates } = publishAt(0);
    const created = all.filter(relation => !relation.isDeleted);
    // Anchors are emitted on every path so the entity can never land unreachable.
    expect(all).toHaveLength(4);
    expect(deleted.map(relation => relation.id)).toEqual(['winner-rel-1']);
    expect(created.map(relation => relation.type?.id)).toEqual([
      TYPES_PROPERTY_ID,
      VOTE_DEBATES_PROPERTY_ID,
      VOTE_WINNER_PROPERTY_ID,
    ]);
    expect(winnerCreates[0]?.toEntity.id).toBe(BOB_SPACE);
  });

  it('shares in-flight state across surfaces so a second vote cannot start mid-publish', async () => {
    const view = await renderTwoSurfaces();

    let settleFeedVote: (outcome: 'ok' | 'fail') => void = () => {};
    mocks.gate = new Promise(resolve => {
      settleFeedVote = resolve;
    });

    let feedVote: Promise<void>;
    await act(async () => {
      feedVote = view.result.current.feed.castVote(ALICE);
      await Promise.resolve();
    });

    // Both mounts read the same registry, so the panel's pills disable with the feed's.
    await waitFor(() => {
      expect(view.result.current.feed.isVoting).toBe(true);
      expect(view.result.current.panel.isVoting).toBe(true);
    });

    await act(async () => {
      await view.result.current.panel.castVote(BOB);
    });

    // The panel no-ops rather than publishing a second edit off the optimistic row.
    expect(mocks.publishedRelations).toHaveLength(1);
    expect(view.result.current.feed.isMyPick(ALICE)).toBe(true);
    expect(view.result.current.panel.isMyPick(BOB)).toBe(false);

    await act(async () => {
      settleFeedVote('ok');
      await feedVote;
    });

    await waitFor(() => {
      expect(view.result.current.feed.isVoting).toBe(false);
      expect(view.result.current.panel.isVoting).toBe(false);
    });
  });

  it('reuses the existing Vote entity rather than minting a second one', async () => {
    mocks.voteEntities = [voteEntity('vote-1', ALICE_SPACE, 'winner-rel-1')];
    const view = await renderVotes();
    await waitFor(() => expect(view.result.current.hasVoted).toBe(true));

    await act(async () => {
      await view.result.current.castVote(BOB);
    });

    // Every relation in the edit hangs off the Vote that already exists.
    expect(publishAt(0).all.every(relation => relation.fromEntity.id === 'vote-1')).toBe(true);
  });

  it('does nothing when re-picking the debater already chosen', async () => {
    mocks.voteEntities = [voteEntity('vote-1', ALICE_SPACE, 'winner-rel-1')];
    const view = await renderVotes();
    await waitFor(() => expect(view.result.current.hasVoted).toBe(true));

    await act(async () => {
      await view.result.current.castVote(ALICE);
    });

    // A delete-then-create resolving to the state already on screen is not worth a transaction.
    expect(mocks.publishedRelations).toHaveLength(0);
    expect(mocks.publishEdit).not.toHaveBeenCalled();
  });

  it('deletes the right relation when switching twice before the indexer catches up', async () => {
    const view = await renderVotes();

    await act(async () => {
      await view.result.current.castVote(ALICE);
    });
    await act(async () => {
      await view.result.current.castVote(BOB);
    });

    // The second switch reads the optimistic row, which is the only record of the relation the
    // first vote just created. If it carried no relation id, nothing would be deleted here and
    // the Vote would end up holding two winners.
    const firstWinnerRelationId = publishAt(0).winnerCreates[0]?.id;
    expect(firstWinnerRelationId).toBeDefined();
    expect(publishAt(1).deleted.map(relation => relation.id)).toEqual([firstWinnerRelationId]);
    expect(publishAt(1).winnerCreates[0]?.toEntity.id).toBe(BOB_SPACE);
  });

  it('restores the previous pick when a change fails to publish', async () => {
    mocks.voteEntities = [voteEntity('vote-1', ALICE_SPACE, 'winner-rel-1')];
    mocks.prepareFails = true;
    const view = await renderVotes();
    await waitFor(() => expect(view.result.current.hasVoted).toBe(true));

    await act(async () => {
      await view.result.current.castVote(BOB);
    });

    // Rolling back to "no vote" would strand the viewer without the pick they already had.
    await waitFor(() => expect(view.result.current.isMyPick(ALICE)).toBe(true));
    expect(view.result.current.isMyPick(BOB)).toBe(false);
  });
});
