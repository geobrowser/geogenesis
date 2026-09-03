import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import type { DebateRematchParticipant } from './api';
import type { ParticipantPosition, PendingParticipantPosition } from './participant-positions';
import {
  applyPendingPositions,
  fetchParticipantPositions,
  groupParticipantPositions,
  isParticipantPositionsQueryKey,
  participantPositionsQueryKey,
  participantSidesOn,
  useParticipantPositions,
} from './participant-positions';

const mocks = vi.hoisted(() => ({ graphql: vi.fn(), attention: true }));

// The hook's own `queryFn` calls the real `fetchParticipantPositions`, which reaches the graph
// through this module — so this is the seam for a hook-level test. The pure-function tests below
// inject `fetchPage` directly and are unaffected.
vi.mock('~/core/io/graphql-client', () => ({
  graphql: (...args: unknown[]) => mocks.graphql(...args),
}));
vi.mock('./debate-attention', () => ({ useDebateAttention: () => mocks.attention }));

const LOCAL: DebateRematchParticipant = {
  user_id: 'user-local',
  profile_space_id: '019fedae72b67ab2927adf044d57c566',
  display_name: 'You',
  avatar_cid: null,
  participant_slot: 1,
  consented_at: '2026-07-10T10:00:00.000Z',
};
const REMOTE: DebateRematchParticipant = {
  ...LOCAL,
  user_id: 'user-remote',
  profile_space_id: '019fedae72b67ab2927adf044d57c567',
  display_name: 'Salina',
  participant_slot: 2,
};

describe('fetchParticipantPositions', () => {
  // Positions are on-chain claim responses, which the graph indexes as `userVotes` keyed on the
  // responder's personal space. One filter for both people, active responses only, both kinds.
  it('asks for both participants’ active stance and veracity responses in one filter', async () => {
    const fetchPage = vi.fn().mockResolvedValue([]);

    await fetchParticipantPositions([LOCAL.profile_space_id, REMOTE.profile_space_id], undefined, fetchPage);

    expect(fetchPage).toHaveBeenCalledOnce();
    expect(fetchPage.mock.calls[0]![0]).toEqual({
      userId: { in: [LOCAL.profile_space_id, REMOTE.profile_space_id] },
      objectType: { is: 0 },
      voteType: { in: [0, 1] },
      voteKind: { in: [1, 2] },
    });
  });

  it('asks nothing for no participants', async () => {
    const fetchPage = vi.fn();
    await expect(fetchParticipantPositions([], undefined, fetchPage)).resolves.toEqual([]);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('decodes rows into sides, dropping anything that is not an active stance or veracity response', async () => {
    const fetchPage = vi.fn().mockResolvedValue([
      { userId: LOCAL.profile_space_id, objectId: 'claim-1', spaceId: 'space-1', voteType: 0, voteKind: 1 },
      { userId: REMOTE.profile_space_id, objectId: 'claim-1', spaceId: 'space-1', voteType: 1, voteKind: 2 },
      // A curation vote is not a position.
      { userId: REMOTE.profile_space_id, objectId: 'claim-2', spaceId: 'space-1', voteType: 0, voteKind: 0 },
      // Nor is a withdrawn response.
      { userId: REMOTE.profile_space_id, objectId: 'claim-3', spaceId: 'space-1', voteType: 2, voteKind: 1 },
    ]);

    await expect(
      fetchParticipantPositions([LOCAL.profile_space_id, REMOTE.profile_space_id], undefined, fetchPage)
    ).resolves.toEqual([
      {
        profileSpaceId: LOCAL.profile_space_id,
        claimId: 'claim-1',
        spaceId: 'space-1',
        responseKind: 'stance',
        position: true,
      },
      {
        profileSpaceId: REMOTE.profile_space_id,
        claimId: 'claim-1',
        spaceId: 'space-1',
        responseKind: 'veracity',
        position: false,
      },
    ]);
  });

  it('pages until a short page comes back', async () => {
    const full = Array.from({ length: 500 }, (_, index) => ({
      userId: LOCAL.profile_space_id,
      objectId: `claim-${index}`,
      spaceId: 'space-1',
      voteType: 0,
      voteKind: 1,
    }));
    const fetchPage = vi.fn().mockResolvedValueOnce(full).mockResolvedValueOnce(full.slice(0, 3));

    const positions = await fetchParticipantPositions([LOCAL.profile_space_id], undefined, fetchPage);

    expect(positions).toHaveLength(503);
    expect(fetchPage.mock.calls.map(call => call[2])).toEqual([0, 500]);
  });
});

describe('participantSidesOn', () => {
  // geo-chat validates a request against the claim's home space, and the card publishes there; a
  // response in some other space that merely cites the claim is not a side on this claim.
  it('reads each participant’s side in the claim’s space only, matching ids in either form', () => {
    const byClaim = groupParticipantPositions([
      {
        profileSpaceId: LOCAL.profile_space_id,
        claimId: 'claim-1',
        spaceId: 'space-1',
        responseKind: 'stance',
        position: true,
      },
      {
        profileSpaceId: '019fedae-72b6-7ab2-927a-df044d57c567',
        claimId: 'claim-1',
        spaceId: 'SPACE-1',
        responseKind: 'stance',
        position: false,
      },
      {
        profileSpaceId: REMOTE.profile_space_id,
        claimId: 'claim-2',
        spaceId: 'space-9',
        responseKind: 'stance',
        position: true,
      },
    ]);

    expect(participantSidesOn(byClaim, 'claim-1', 'space-1', [LOCAL, REMOTE])).toEqual([
      { participant: LOCAL, position: true, responseKind: 'stance' },
      { participant: REMOTE, position: false, responseKind: 'stance' },
    ]);
    // Answered in a different space: no side here.
    expect(participantSidesOn(byClaim, 'claim-2', 'space-1', [LOCAL, REMOTE])).toEqual([
      { participant: LOCAL, position: null, responseKind: null },
      { participant: REMOTE, position: null, responseKind: null },
    ]);
  });
});

// Outside `'debates'`, so the mutations that invalidate that root leave it alone; the gateway
// reaches it by its own predicate.
it('keys the query outside the debates family, in participant order', () => {
  const key = participantPositionsQueryKey(['b', 'a']);
  expect(key[0]).not.toBe('debates');
  expect(key).toEqual(participantPositionsQueryKey(['a', 'b']));
  expect(isParticipantPositionsQueryKey(key)).toBe(true);
  expect(isParticipantPositionsQueryKey(['debates', 'claims'])).toBe(false);
});

/**
 * GEO-2599. Preston: "randomly the positions also dissapear. I just lost all of Dovile's positions
 * without doing anything whilst I was typing."
 *
 * The list is grouped from `query.data`, which is `undefined` for any key the cache has not seen —
 * so a key change emptied the whole thing rather than showing the previous answer. And the trigger
 * need not be a real change: `enabled` is `profileSpaceIds.length > 0`, so a session refetch that
 * momentarily yields no participants swaps to the empty-ids key, which holds no data.
 */
describe('useParticipantPositions holding its list', () => {
  const row = (userId: string, objectId: string) => ({
    userId,
    objectId,
    spaceId: '019fedae72b67ab2927adf044d57c560',
    voteType: 0,
    voteKind: 1,
  });

  const renderPositions = (initial: DebateRematchParticipant[]) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return renderHook(({ participants }) => useParticipantPositions(participants), {
      initialProps: { participants: initial },
      wrapper: ({ children }) => React.createElement(QueryClientProvider, { client }, children),
    });
  };

  it('keeps the previous positions on screen while a new set loads', async () => {
    mocks.attention = true;
    // One page, short, so `fetchParticipantPositions` stops after it.
    // `graphql()` returns an Effect of the *decoded* rows — the real one applies the decoder
    // internally, so succeeding with the decoded shape is the honest stub.
    mocks.graphql.mockImplementation(() => Effect.succeed([row(LOCAL.profile_space_id, 'claim-1')]));

    const { result, rerender } = renderPositions([LOCAL, REMOTE]);
    await waitFor(() => expect(result.current.byClaim.size).toBe(1));

    // A different participant set is a different query key, so the cache has nothing for it. The
    // list must not blank in the meantime — that is the reported bug.
    // Never settles, so the new key stays pending and only the placeholder can satisfy the assert.
    mocks.graphql.mockImplementation(() => Effect.never);
    rerender({ participants: [LOCAL] });

    expect(result.current.byClaim.size).toBe(1);
  });
});

/** Confirmed position overlays remain active until participant positions are refetched. */
describe('useParticipantPositions holding a settled write (GEO-2807)', () => {
  const CLAIM = 'claim-1';
  const SPACE = '019fedae72b67ab2927adf044d57c560';
  const INDEXING_KEY = ['entity-response-indexing', LOCAL.profile_space_id, CLAIM, SPACE, 'stance'] as const;

  const snapshot = (status: 'reconciling' | 'indexed', expectedResponse: 'positive' | 'negative' | null) => ({
    status,
    pending: {
      entityId: CLAIM,
      expectedResponse,
      personalSpaceId: LOCAL.profile_space_id,
      responseKind: 'stance',
      spaceId: SPACE,
    },
    runId: 'run-1',
  });

  const sideOf = (result: { current: { byClaim: Map<string, unknown> } }) =>
    participantSidesOn(result.current.byClaim as ReturnType<typeof groupParticipantPositions>, CLAIM, SPACE, [
      LOCAL,
      REMOTE,
    ])[0]!.position;

  const renderPositions = (client: QueryClient) =>
    renderHook(() => useParticipantPositions([LOCAL, REMOTE], LOCAL.profile_space_id), {
      wrapper: ({ children }) => React.createElement(QueryClientProvider, { client }, children),
    });

  it('keeps the position on screen between the write confirming and the refetch landing', async () => {
    mocks.attention = true;
    // The graph has not returned the new position yet.
    mocks.graphql.mockImplementation(() => Effect.succeed([]));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderPositions(client);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => void client.setQueryData(INDEXING_KEY, snapshot('reconciling', 'positive')));
    expect(sideOf(result)).toBe(true);

    // Retire the indexing snapshot before the participant refetch completes.
    await act(async () => void client.setQueryData(INDEXING_KEY, snapshot('indexed', 'positive')));
    await act(async () => void client.setQueryData(INDEXING_KEY, { status: 'idle', pending: null, runId: null }));

    expect(sideOf(result)).toBe(true);
  });

  /**
   * The release, asserted where it is observable: the fetch has to *contradict* the overlay, or a
   * held row and a released one look identical. A refetch returning the same answer proves nothing,
   * and neither does the row count — the overlay and the fetched row share a `positionKey`, so the
   * merge cannot produce two of them whatever it does.
   */
  it('hands back to the fetched list once it agrees, and stops asserting anything after that', async () => {
    mocks.attention = true;
    const graphRow = (voteType: number) => [
      { userId: LOCAL.profile_space_id, objectId: CLAIM, spaceId: SPACE, voteType, voteKind: 1 },
    ];
    const refetch = () =>
      act(async () => {
        await client.invalidateQueries({
          queryKey: participantPositionsQueryKey([LOCAL.profile_space_id, REMOTE.profile_space_id]),
        });
      });

    mocks.graphql.mockImplementation(() => Effect.succeed(graphRow(0)));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderPositions(client);
    await waitFor(() => expect(sideOf(result)).toBe(true));

    // The viewer switches sides, it confirms, and the snapshot retires.
    await act(async () => void client.setQueryData(INDEXING_KEY, snapshot('indexed', 'negative')));
    await act(async () => void client.setQueryData(INDEXING_KEY, { status: 'idle', pending: null, runId: null }));
    expect(sideOf(result)).toBe(false);

    // The graph catches up, which is what the overlay was waiting for.
    mocks.graphql.mockImplementation(() => Effect.succeed(graphRow(1)));
    await refetch();
    expect(sideOf(result)).toBe(false);

    // Handing back is only observable afterwards: a row still held would keep asserting the side it
    // was retired with, whatever the graph goes on to say.
    mocks.graphql.mockImplementation(() => Effect.succeed(graphRow(0)));
    await refetch();
    await waitFor(() => expect(sideOf(result)).toBe(true));
  });

  /**
   * The half that made the old release rule wrong: `dataUpdatedAt` is when a response *landed*, so
   * any newer response released the overlay — including a poll that was already in flight when the
   * write confirmed and therefore carries rows from before it. Landing is not agreeing.
   */
  it('is not released by a fetch that still holds the pre-write rows', async () => {
    mocks.attention = true;
    mocks.graphql.mockImplementation(() =>
      Effect.succeed([{ userId: LOCAL.profile_space_id, objectId: CLAIM, spaceId: SPACE, voteType: 0, voteKind: 1 }])
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderPositions(client);
    await waitFor(() => expect(sideOf(result)).toBe(true));

    // A fetch that will answer with the pre-write rows, held open across the confirmation.
    let answer: (rows: unknown[]) => void = () => {};
    mocks.graphql.mockImplementation(() => Effect.promise(() => new Promise(resolve => (answer = resolve))));
    void client.refetchQueries({
      queryKey: participantPositionsQueryKey([LOCAL.profile_space_id, REMOTE.profile_space_id]),
    });
    await waitFor(() =>
      expect(
        client.getQueryState(participantPositionsQueryKey([LOCAL.profile_space_id, REMOTE.profile_space_id]))
          ?.fetchStatus
      ).toBe('fetching')
    );

    await act(async () => void client.setQueryData(INDEXING_KEY, snapshot('indexed', 'negative')));
    await act(async () => void client.setQueryData(INDEXING_KEY, { status: 'idle', pending: null, runId: null }));
    expect(sideOf(result)).toBe(false);

    await act(async () => {
      answer([{ userId: LOCAL.profile_space_id, objectId: CLAIM, spaceId: SPACE, voteType: 0, voteKind: 1 }]);
      await Promise.resolve();
    });

    expect(sideOf(result)).toBe(false);
  });

  // Keep a removal tombstone until the fetched data reflects the removal.
  it('keeps a removal hidden until the refetch confirms it', async () => {
    mocks.attention = true;
    mocks.graphql.mockImplementation(() =>
      Effect.succeed([{ userId: LOCAL.profile_space_id, objectId: CLAIM, spaceId: SPACE, voteType: 0, voteKind: 1 }])
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderPositions(client);
    await waitFor(() => expect(sideOf(result)).toBe(true));

    await act(async () => void client.setQueryData(INDEXING_KEY, snapshot('indexed', null)));
    expect(sideOf(result)).toBe(null);

    await act(async () => void client.setQueryData(INDEXING_KEY, { status: 'idle', pending: null, runId: null }));
    expect(sideOf(result)).toBe(null);
  });

  // A retained row carries the profile space it was written for, so it cannot outlive that viewer.
  it('drops retained rows when the viewer goes away', async () => {
    mocks.attention = true;
    mocks.graphql.mockImplementation(() => Effect.succeed([]));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(
      ({ profileSpaceId }: { profileSpaceId: string | null }) =>
        useParticipantPositions([LOCAL, REMOTE], profileSpaceId),
      {
        initialProps: { profileSpaceId: LOCAL.profile_space_id as string | null },
        wrapper: ({ children }) => React.createElement(QueryClientProvider, { client }, children),
      }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => void client.setQueryData(INDEXING_KEY, snapshot('indexed', 'positive')));
    await act(async () => void client.setQueryData(INDEXING_KEY, { status: 'idle', pending: null, runId: null }));
    expect(sideOf(result)).toBe(true);

    await act(async () => rerender({ profileSpaceId: null }));
    expect(sideOf(result)).toBe(null);
  });

  /**
   * An `entity-response-indexing` query has no observers, so react-query garbage collects it on its
   * own schedule — five minutes after the write started, whatever state it is in. That arrives as a
   * `removed` event, and a hook watching only `updated` kept the row overlaid for the rest of the
   * session: a write that never indexed, still drawn as a position and still gated on.
   */
  it('drops a position whose snapshot is garbage collected', async () => {
    mocks.attention = true;
    mocks.graphql.mockImplementation(() => Effect.succeed([]));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderPositions(client);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => void client.setQueryData(INDEXING_KEY, snapshot('reconciling', 'positive')));
    expect(sideOf(result)).toBe(true);

    await act(async () => client.removeQueries({ queryKey: INDEXING_KEY }));
    expect(sideOf(result)).toBe(null);
  });

  // A response that returns to idle without reaching indexed was rolled back.
  it('drops a rolled-back write immediately', async () => {
    mocks.attention = true;
    mocks.graphql.mockImplementation(() => Effect.succeed([]));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderPositions(client);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => void client.setQueryData(INDEXING_KEY, snapshot('reconciling', 'positive')));
    expect(sideOf(result)).toBe(true);

    await act(async () => void client.setQueryData(INDEXING_KEY, { status: 'idle', pending: null, runId: null }));
    expect(sideOf(result)).toBe(null);
  });
});

describe('applyPendingPositions (GEO-2784)', () => {
  const FETCHED: ParticipantPosition[] = [
    { profileSpaceId: 'me', claimId: 'c1', spaceId: 's1', responseKind: 'stance', position: true },
    { profileSpaceId: 'them', claimId: 'c2', spaceId: 's1', responseKind: 'stance', position: false },
  ];

  it('shows an in-flight position that the fetch has not returned yet', () => {
    const pending: ParticipantPosition[] = [
      { profileSpaceId: 'me', claimId: 'c9', spaceId: 's1', responseKind: 'stance', position: true },
    ];
    const merged = applyPendingPositions(FETCHED, pending);
    expect(merged).toHaveLength(3);
    expect(merged.find(r => r.claimId === 'c9')?.position).toBe(true);
  });

  it('a pending write overrides a stale fetched row for the same claim', () => {
    const pending: ParticipantPosition[] = [
      { profileSpaceId: 'me', claimId: 'c1', spaceId: 's1', responseKind: 'stance', position: false },
    ];
    const merged = applyPendingPositions(FETCHED, pending);
    expect(merged).toHaveLength(2);
    expect(merged.find(r => r.claimId === 'c1')?.position).toBe(false);
  });

  /* The removal case, and the reason a tombstone is carried rather than dropped: without it the
     stale fetched row keeps the position on screen until the next refetch. */
  it('a pending removal hides the fetched row immediately', () => {
    const pending: PendingParticipantPosition[] = [
      { profileSpaceId: 'me', claimId: 'c1', spaceId: 's1', responseKind: 'stance', position: null },
    ];
    const merged = applyPendingPositions(FETCHED, pending);
    expect(merged.map(r => r.claimId)).toEqual(['c2']);
  });

  it('matches ids regardless of dash spelling, like every other comparison here', () => {
    const pending: ParticipantPosition[] = [
      { profileSpaceId: 'ME', claimId: 'C1', spaceId: 's1', responseKind: 'stance', position: false },
    ];
    expect(applyPendingPositions(FETCHED, pending)).toHaveLength(2);
  });

  it('leaves the fetched list untouched when nothing is in flight', () => {
    expect(applyPendingPositions(FETCHED, [])).toBe(FETCHED);
  });

  it("does not touch the opponent's rows", () => {
    const pending: ParticipantPosition[] = [
      { profileSpaceId: 'me', claimId: 'c2', spaceId: 's1', responseKind: 'stance', position: true },
    ];
    const merged = applyPendingPositions(FETCHED, pending);
    expect(merged.filter(r => r.claimId === 'c2')).toHaveLength(2);
  });
});
