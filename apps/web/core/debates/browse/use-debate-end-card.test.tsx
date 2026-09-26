import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';
import type { DebateTranscriptClaims } from '~/core/debates/transcript-claims';
import { entityRespondersQueryKey, entityResponseCountsQueryKey } from '~/core/responses/entity-response';

import { useDebateEndCard } from './use-debate-end-card';

const DEBATE_SPACE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DEBATE_SPACE_HEX = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ELSEWHERE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const STEVE = 'cccccccccccccccccccccccccccccccc';
const JONATHAN = 'dddddddddddddddddddddddddddddddd';
const CLAIM_UUID = 'EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE';
const CLAIM_HEX = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

const mocks = vi.hoisted(() => ({
  claims: null as unknown,
  transcriptLoading: false,
  batchCalls: [] as { spaceId: string; targets: { entityId: string }[]; enabled: boolean }[],
  claimSummary: null as unknown,
  /** The `enabled` each entity lookup was made with. */
  entityEnabled: [] as boolean[],
  /** What the batch query reports: whether it has data yet, and whether it failed. */
  batchResult: { data: new Map() as unknown, isError: false },
  /** The entity each render handed the claim's own response state. */
  claimEntity: [] as unknown[],
}));

vi.mock('~/core/debates/use-debate-transcript-claims', () => ({
  useDebateTranscriptClaims: () => ({ claims: mocks.claims, isLoading: mocks.transcriptLoading, error: null }),
}));
// The batch is the fetcher and seeds the per-claim caches; here the test seeds them itself, so what
// is under test is the reading — including a cache a vote has refreshed since.
vi.mock('~/core/responses/use-claim-response-summaries', () => ({
  useClaimResponseSummaryBatch: (args: { spaceId: string; targets: { entityId: string }[]; enabled: boolean }) => {
    mocks.batchCalls.push(args);
    return mocks.batchResult;
  },
}));
vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: ({ enabled }: { enabled: boolean }) => {
    mocks.entityEnabled.push(enabled);
    return { entities: enabled ? [{ id: 'claim-entity' }] : [] };
  },
}));
vi.mock('./use-debate-claim-response', () => ({
  useDebateClaimResponse: ({ entity }: { entity: unknown }) => {
    mocks.claimEntity.push(entity);
    return { responseKind: 'stance', summary: mocks.claimSummary, control: {} };
  },
}));

const claim = (id: string, spaceId: string | null) => ({ id, text: id, spaceId });

function transcript(byAuthor: Record<string, ReturnType<typeof claim>[]>): DebateTranscriptClaims {
  const all = Object.values(byAuthor).flat();
  return {
    all,
    byAuthorSpaceId: new Map(Object.entries(byAuthor)),
    unattributed: [],
    blocks: [],
    totalCount: all.length,
  } as unknown as DebateTranscriptClaims;
}

let queryClient: QueryClient;

/** What the batch writes for one claim, and what a vote on it rewrites. */
function seed(claimId: string, positive: number, negative: number, userIds: string[]) {
  queryClient.setQueryData(entityResponseCountsQueryKey(claimId, DEBATE_SPACE_HEX, 0, 'stance'), {
    positive,
    negative,
  });
  queryClient.setQueryData(
    entityRespondersQueryKey(claimId, DEBATE_SPACE_HEX, 0, 'stance'),
    userIds.map(userId => ({ userId, direction: 'positive' }))
  );
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const render = <P,>(hook: (props: P) => ReturnType<typeof useDebateEndCard>, initialProps?: P) =>
  renderHook(hook, { wrapper, initialProps: initialProps as P });

const debate = {
  id: 'debate-1',
  claim: { space_id: DEBATE_SPACE, claim_entity_id: CLAIM_UUID, claim: 'The claim' },
  participants: [
    { participant_slot: 1, profile_space_id: STEVE, display_name: 'Steve', position: true },
    { participant_slot: 2, profile_space_id: JONATHAN, display_name: 'Jonathan', position: false },
  ],
} as unknown as Debate;

describe('useDebateEndCard', () => {
  beforeEach(() => {
    mocks.batchCalls = [];
    mocks.entityEnabled = [];
    mocks.claimEntity = [];
    mocks.batchResult = { data: new Map(), isError: false };
    mocks.claimSummary = { positive: 62, negative: 38, total: 100, percent: 62, meetsFloor: true };
    mocks.transcriptLoading = false;
    mocks.claims = transcript({
      [STEVE]: [claim('s1', DEBATE_SPACE_HEX), claim('s2', DEBATE_SPACE_HEX), claim('s3', ELSEWHERE)],
      [JONATHAN]: [claim('j1', DEBATE_SPACE_HEX), claim('j2', null)],
    });
    queryClient = new QueryClient();
    seed('s1', 20, 30, ['p1', 'p2']);
    seed('s2', 24, 26, ['p2', 'p3']);
    // Another space's claim, seeded here only to prove it is never read.
    seed('s3', 900, 0, ['p9']);
    seed('j1', 71, 29, ['p4']);
  });

  it("counts only the claims published in the debate's own space", () => {
    // s3 lives in another space, where its votes are too; asking this space about it would report
    // zero, and counting that zero would drag Steve's share down for no reason.
    const { result } = render(() => useDebateEndCard(debate, true));
    const [steve] = result.current.debaters;

    expect(steve.split).toMatchObject({ positive: 44, negative: 56, percent: 44 });
    expect(mocks.batchCalls.at(-1)?.targets.map(target => target.entityId)).not.toContain('s3');
  });

  it('still counts every claim a debater made in the number the card prints', () => {
    const { result } = render(() => useDebateEndCard(debate, true));
    const [steve, jonathan] = result.current.debaters;

    expect(steve.claimCount).toBe(3);
    // j2 was never published at all, and is still a claim Jonathan made.
    expect(jonathan.claimCount).toBe(2);
  });

  it('asks for the claim and every counted claim in one batch, in the debate space', () => {
    render(() => useDebateEndCard(debate, true));
    const call = mocks.batchCalls.at(-1)!;

    expect(call.spaceId).toBe(DEBATE_SPACE_HEX);
    expect(call.targets.map(target => target.entityId)).toEqual([CLAIM_HEX, 's1', 's2', 'j1']);
  });

  it('counts a person once however many of the claims they answered', () => {
    const { result } = render(() => useDebateEndCard(debate, true));
    expect(result.current.debaters[0].responderSpaceIds).toEqual(['p1', 'p2', 'p3']);
  });

  it('finds each side by the position the debater argued, not by slot', () => {
    const { result } = render(() => useDebateEndCard(debate, true));

    expect(result.current.agreeSide?.name).toBe('Steve');
    expect(result.current.disagreeSide?.name).toBe('Jonathan');
    expect(result.current.comparison).toMatchObject({ status: 'ready', claimPercent: 62, argumentsPercent: 38 });
  });

  it('puts the Agree-side debater first whatever slot they recorded in', () => {
    // The card's Agree button, the green end of every bar and the Agree end of the comparison are all
    // on the left; the debater arguing for the claim has to be too.
    const flipped = {
      ...debate,
      participants: [
        { participant_slot: 1, profile_space_id: JONATHAN, display_name: 'Jonathan', position: false },
        { participant_slot: 2, profile_space_id: STEVE, display_name: 'Steve', position: true },
      ],
    } as unknown as Debate;

    const { result } = render(() => useDebateEndCard(flipped, true));
    expect(result.current.debaters.map(debater => debater.name)).toEqual(['Steve', 'Jonathan']);
  });

  it('is not ready to report counts until every counted claim has them', () => {
    queryClient.removeQueries({ queryKey: entityResponseCountsQueryKey('j1', DEBATE_SPACE_HEX, 0, 'stance') });
    const { result } = render(() => useDebateEndCard(debate, true));

    expect(result.current.countsReady).toBe(false);
  });

  it('picks up a vote cast on a debater claim after the card loaded', async () => {
    // A vote refreshes the caches of the claim it was cast on and leaves the batch alone, so a card
    // reading the batch kept the old split. It reads the caches, and moves with them.
    const { result } = render(() => useDebateEndCard(debate, true));
    expect(result.current.debaters[1].split.percent).toBe(71);

    act(() => seed('j1', 72, 28, ['p4', 'p5']));

    // React Query delivers cache changes on its own tick, not inside the write.
    await waitFor(() => expect(result.current.debaters[1].split.percent).toBe(72));
    expect(result.current.debaters[1].responderSpaceIds).toEqual(['p4', 'p5']);
  });

  it('reports no count and no readiness while the transcript is still saying whose claims are whose', () => {
    // Its stand-in is an empty set, and "0 claims · No votes yet" off that would be a fact about the
    // network presented as one about the debate.
    mocks.transcriptLoading = true;
    mocks.claims = transcript({});
    const { result } = render(() => useDebateEndCard(debate, true));

    expect(result.current.debaters.map(debater => debater.claimCount)).toEqual([null, null]);
    expect(result.current.countsReady).toBe(false);
    expect(mocks.batchCalls.at(-1)?.enabled).toBe(false);
  });

  it('keeps asking once the debate has been active, so scrolling past it does not empty the card', () => {
    // Scrolling makes another debate the active one while this card is still on screen. Turning the
    // reads off then emptied the entity lookup — a disabled one answers with nothing — and the
    // comparison box vanished and came back as the viewer scrolled.
    const { rerender } = render(({ enabled }: { enabled: boolean }) => useDebateEndCard(debate, enabled), {
      enabled: true,
    });
    mocks.batchCalls = [];
    mocks.entityEnabled = [];

    rerender({ enabled: false });

    expect(mocks.batchCalls.at(-1)?.enabled).toBe(true);
    expect(mocks.entityEnabled.at(-1)).toBe(true);
  });

  it('holds a different debate back until it too has been active', () => {
    const { rerender } = render(
      ({ current, enabled }: { current: Debate; enabled: boolean }) => useDebateEndCard(current, enabled),
      { current: debate, enabled: true }
    );
    const next = { ...debate, id: 'debate-2' } as Debate;

    rerender({ current: next, enabled: false });
    expect(mocks.batchCalls.at(-1)?.enabled).toBe(false);
  });

  it("holds the claim's own response reads until the batch has seeded them", () => {
    // Handed its entity early, the claim's response state fires its two reads — counts and the
    // viewer's side — and races the batch to the same answers on every debate that becomes active.
    mocks.batchResult = { data: undefined, isError: false };
    const { rerender } = render(() => useDebateEndCard(debate, true));
    expect(mocks.claimEntity.at(-1)).toBeNull();

    mocks.batchResult = { data: new Map(), isError: false };
    rerender(undefined as never);
    expect(mocks.claimEntity.at(-1)).toEqual({ id: 'claim-entity' });
  });

  it('lets the claim ask for itself if the batch fails', () => {
    mocks.batchResult = { data: undefined, isError: true };
    render(() => useDebateEndCard(debate, true));

    expect(mocks.claimEntity.at(-1)).toEqual({ id: 'claim-entity' });
  });

  it('asks for nothing while held back', () => {
    render(() => useDebateEndCard(debate, false));
    expect(mocks.batchCalls.at(-1)?.enabled).toBe(false);
  });
});
