import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';
import type { DebateTranscriptClaims } from '~/core/debates/transcript-claims';

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
  summaries: new Map<string, unknown>() as Map<string, unknown> | undefined,
  batchCalls: [] as { spaceId: string; targets: { entityId: string }[]; enabled: boolean }[],
  claimSummary: null as unknown,
}));

vi.mock('~/core/debates/use-debate-transcript-claims', () => ({
  useDebateTranscriptClaims: () => ({ claims: mocks.claims, isLoading: false, error: null }),
}));
vi.mock('~/core/responses/use-claim-response-summaries', () => ({
  useClaimResponseSummaryBatch: (args: { spaceId: string; targets: { entityId: string }[]; enabled: boolean }) => {
    mocks.batchCalls.push(args);
    return { data: mocks.summaries };
  },
}));
vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: () => ({ entities: [] }),
}));
vi.mock('./use-debate-claim-response', () => ({
  useDebateClaimResponse: () => ({ responseKind: 'stance', summary: mocks.claimSummary, control: {} }),
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

const tally = (positive: number, negative: number, userIds: string[]) => ({
  counts: { positive, negative },
  viewerResponse: null,
  responders: userIds.map(userId => ({ userId, direction: 'positive' })),
});

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
    mocks.claimSummary = { positive: 62, negative: 38, total: 100, percent: 62, meetsFloor: true };
    mocks.claims = transcript({
      [STEVE]: [claim('s1', DEBATE_SPACE_HEX), claim('s2', DEBATE_SPACE_HEX), claim('s3', ELSEWHERE)],
      [JONATHAN]: [claim('j1', DEBATE_SPACE_HEX), claim('j2', null)],
    });
    mocks.summaries = new Map([
      [`${CLAIM_HEX}:stance`, tally(62, 38, [])],
      ['s1:stance', tally(20, 30, ['p1', 'p2'])],
      ['s2:stance', tally(24, 26, ['p2', 'p3'])],
      ['s3:stance', tally(900, 0, ['p9'])],
      ['j1:stance', tally(71, 29, ['p4'])],
    ]);
  });

  it("counts only the claims published in the debate's own space", () => {
    // s3 lives in another space, where its votes are too; asking this space about it would report
    // zero, and counting that zero would drag Steve's share down for no reason.
    const { result } = renderHook(() => useDebateEndCard(debate, true));
    const [steve] = result.current.debaters;

    expect(steve.split).toMatchObject({ positive: 44, negative: 56, percent: 44 });
    expect(mocks.batchCalls.at(-1)?.targets.map(target => target.entityId)).not.toContain('s3');
  });

  it('still counts every claim a debater made in the number the card prints', () => {
    const { result } = renderHook(() => useDebateEndCard(debate, true));
    const [steve, jonathan] = result.current.debaters;

    expect(steve.claimCount).toBe(3);
    // j2 was never published at all, and is still a claim Jonathan made.
    expect(jonathan.claimCount).toBe(2);
  });

  it('asks for the claim and every counted claim in one batch, in the debate space', () => {
    renderHook(() => useDebateEndCard(debate, true));
    const call = mocks.batchCalls.at(-1)!;

    expect(call.spaceId).toBe(DEBATE_SPACE_HEX);
    expect(call.targets.map(target => target.entityId)).toEqual([CLAIM_HEX, 's1', 's2', 'j1']);
  });

  it('counts a person once however many of the claims they answered', () => {
    const { result } = renderHook(() => useDebateEndCard(debate, true));
    expect(result.current.debaters[0].responderSpaceIds).toEqual(['p1', 'p2', 'p3']);
  });

  it('finds each side by the position the debater argued, not by slot', () => {
    const { result } = renderHook(() => useDebateEndCard(debate, true));

    expect(result.current.agreeSide?.name).toBe('Steve');
    expect(result.current.disagreeSide?.name).toBe('Jonathan');
    expect(result.current.comparison).toMatchObject({ status: 'ready', claimPercent: 62, argumentsPercent: 38 });
  });

  it('is not ready to report counts until the batch has answered', () => {
    mocks.summaries = undefined;
    const { result } = renderHook(() => useDebateEndCard(debate, true));

    expect(result.current.countsReady).toBe(false);
  });

  it('asks for nothing while held back', () => {
    renderHook(() => useDebateEndCard(debate, false));
    expect(mocks.batchCalls.at(-1)?.enabled).toBe(false);
  });
});
