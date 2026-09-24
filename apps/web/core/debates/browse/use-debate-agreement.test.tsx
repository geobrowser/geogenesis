import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateClaim } from '~/core/debates/api';
import type { StackedCard } from '~/core/debates/claim-ticker';
import type { Entity } from '~/core/types';

import { useDebateAgreement } from './use-debate-agreement';

const SPACE = 'space-1';

const mocks = vi.hoisted(() => ({
  summaries: null as Map<string, { counts: { positive: number; negative: number } }> | null,
  batchCalls: [] as { targets: { entityId: string; responseKind: string }[]; enabled: boolean }[],
}));

vi.mock('~/core/responses/use-claim-response-summaries', () => ({
  useClaimResponseSummaryBatch: (args: { targets: { entityId: string; responseKind: string }[]; enabled: boolean }) => {
    mocks.batchCalls.push({ targets: args.targets, enabled: args.enabled });
    return { data: mocks.summaries };
  },
}));

// The kind a claim asks is resolved by the shared rule; what matters here is that whatever it
// says becomes the target's kind and the word on the card.
vi.mock('~/core/claims/browse/use-claim-response-state', () => ({
  resolveClaimResponseKind: (row: { response_kind?: string } | null) => row?.response_kind ?? 'stance',
}));

/** One claim of `slot`'s, whose card has already gone past the playhead. */
const card = (id: string, spaceId: string = SPACE): StackedCard =>
  ({ window: { claim: { id, spaceId } } }) as unknown as StackedCard;

const summary = (positive: number, negative: number) => ({ counts: { positive, negative } });

function agreementFor(
  historyBySlot: Map<number, StackedCard[]>,
  { rows = new Map<string, DebateClaim>(), enabled = true }: { rows?: Map<string, DebateClaim>; enabled?: boolean } = {}
) {
  const { result } = renderHook(() =>
    useDebateAgreement({
      spaceId: SPACE,
      historyBySlot,
      rowsByClaimId: rows,
      entitiesByClaimId: new Map<string, Entity>(),
      enabled,
    })
  );
  return result.current;
}

describe('useDebateAgreement', () => {
  beforeEach(() => {
    mocks.batchCalls = [];
    mocks.summaries = new Map([
      ['a:stance', summary(30, 10)],
      ['b:stance', summary(10, 10)],
      ['c:stance', summary(1, 1)],
      ['d:veracity', summary(9, 1)],
    ]);
  });

  it("pools a debater's claims into one reading", () => {
    const agreement = agreementFor(new Map([[1, [card('a'), card('b')]]]));

    // 40 positive of 60 — the question is whether this person was believed over the whole debate,
    // not how any one claim landed.
    expect(agreement.get(1)).toMatchObject({ positive: 40, negative: 20, total: 60, percent: 67 });
  });

  it('keeps the two debaters separate', () => {
    const agreement = agreementFor(
      new Map([
        [1, [card('a')]],
        [2, [card('b')]],
      ])
    );

    expect(agreement.get(1)?.percent).toBe(75);
    expect(agreement.get(2)?.percent).toBe(50);
  });

  it('will not characterise a split too few people have answered', () => {
    const agreement = agreementFor(new Map([[1, [card('c')]]]));

    // The number is still reported — it is the *reading* that is withheld.
    expect(agreement.get(1)?.percent).toBe(50);
    expect(agreement.get(1)?.meetsFloor).toBe(false);
  });

  it('has no percentage at all where nobody has answered', () => {
    mocks.summaries = new Map();
    expect(agreementFor(new Map([[1, [card('a')]]])).get(1)).toMatchObject({ total: 0, percent: null });
  });

  it("borrows the claims' own vocabulary where they all ask the same question", () => {
    const rows = new Map([['d', { response_kind: 'veracity' } as unknown as DebateClaim]]);
    expect(agreementFor(new Map([[1, [card('d')]]]), { rows }).get(1)?.positiveWord).toBe('verified');
  });

  it('falls back to agreement where a debate mixes the two', () => {
    // Verifying a claim is agreeing that it is true; agreeing with an opinion verifies nothing —
    // so agreement is the label that survives the mix.
    const rows = new Map([['d', { response_kind: 'veracity' } as unknown as DebateClaim]]);
    expect(agreementFor(new Map([[1, [card('a'), card('d')]]]), { rows }).get(1)?.positiveWord).toBe('agreed');
  });

  it('leaves out a claim published somewhere other than the debate', () => {
    const agreement = agreementFor(new Map([[1, [card('a'), card('b', 'space-elsewhere')]]]));

    expect(agreement.get(1)?.total).toBe(40);
  });

  it('asks for nothing at all until the debate has finished', () => {
    agreementFor(new Map([[1, [card('a')]]]), { enabled: false });

    expect(mocks.batchCalls.at(-1)).toMatchObject({ targets: [], enabled: false });
  });

  it('asks for every claim in one batch rather than one request apiece', () => {
    agreementFor(
      new Map([
        [1, [card('a'), card('b')]],
        [2, [card('c')]],
      ])
    );

    expect(mocks.batchCalls.at(-1)?.targets.map(target => target.entityId)).toEqual(['a', 'b', 'c']);
  });
});
