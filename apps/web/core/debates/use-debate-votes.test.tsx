import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate, DebateParticipant } from '~/core/debates/api';
import type { Entity, Relation } from '~/core/types';

import { VOTE_DEBATES_PROPERTY_ID, VOTE_WINNER_PROPERTY_ID } from './ontology';
import { useDebateVotes } from './use-debate-votes';

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
    smartAccount: {
      account: { address: '0xabc' },
      sendUserOperation: (...args: unknown[]) => mocks.sendUserOperation(...args),
    },
  }),
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: VOTER_SPACE, isRegistered: true, isLoading: false }),
}));

vi.mock('~/core/hooks/use-geo-profile', () => ({ useGeoProfile: () => ({ profile: { name: 'Voter' } }) }));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, vi.fn()] }));
vi.mock('~/core/state/status-bar-store', () => ({ useReportError: () => vi.fn() }));

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

async function renderVotes() {
  const view = renderHook(() => useDebateVotes(debate), { wrapper });
  await waitFor(() => expect(view.result.current).toBeDefined());
  return view;
}

beforeEach(() => {
  mocks.voteEntities = [];
  mocks.publishedRelations = [];
  mocks.idCounter = 0;
  mocks.prepareFails = false;
  mocks.publishEdit.mockReset();
  mocks.publishEdit.mockResolvedValue({ to: '0xto', calldata: '0xdata' });
  mocks.sendUserOperation.mockReset();
  mocks.sendUserOperation.mockResolvedValue('0xhash');
});

describe('useDebateVotes castVote', () => {
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

  it('swaps only the winner relation when changing a pick', async () => {
    mocks.voteEntities = [voteEntity('vote-1', ALICE_SPACE, 'winner-rel-1')];
    const view = await renderVotes();
    await waitFor(() => expect(view.result.current.hasVoted).toBe(true));

    await act(async () => {
      await view.result.current.castVote(BOB);
    });

    const { all, deleted, winnerCreates } = publishAt(0);
    // The old winner goes and the new one arrives in the same edit — Types and Debates are
    // already on the entity, so re-creating them would duplicate them.
    expect(all).toHaveLength(2);
    expect(deleted.map(relation => relation.id)).toEqual(['winner-rel-1']);
    expect(winnerCreates[0]?.toEntity.id).toBe(BOB_SPACE);
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
