import { renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClaimPickerEntity } from '../claim-picker-page';
import { agendaRow } from './debate-agenda-fixtures';
import { buildDebateAgendas } from './debate-agendas';
import { useTodaysClaimsList } from './todays-claims-list';

const PUBLISHABLE = 'a0000000000000000000000000000001';
const UNPUBLISHABLE = 'b0000000000000000000000000000002';
const CLAIMS = ['c0000000000000000000000000000001', 'c0000000000000000000000000000002'];
const OTHER = 'c0000000000000000000000000000003';

const rows = [
  agendaRow({ spaceId: PUBLISHABLE, entityId: CLAIMS[0] }),
  agendaRow({ spaceId: PUBLISHABLE, entityId: CLAIMS[1] }),
  agendaRow({ spaceId: UNPUBLISHABLE, sectionId: 'block-2', entityId: OTHER }),
];
const entity = (id: string): ClaimPickerEntity => ({
  id,
  name: id,
  description: null,
  spaces: [],
  values: [],
  relations: [],
});

const mocks = vi.hoisted(() => ({
  agendasLoading: false,
  agendasFailed: false,
  publishableLoading: false,
  counts: { byClaimId: null as Map<string, number> | null, isLoading: false, error: null },
  countCalls: [] as { asks: unknown[]; enabled: boolean }[],
}));

vi.mock('./debate-agendas', async importOriginal => {
  const actual = await importOriginal<typeof import('./debate-agendas')>();
  return {
    ...actual,
    useDebateAgendas: () => ({
      agendasIn: (keep: (spaceId: string) => boolean) =>
        actual.buildDebateAgendas(mocks.agendasFailed ? [] : rows, new Set([...CLAIMS, OTHER]), keep),
      spaceIds: [PUBLISHABLE, UNPUBLISHABLE],
      claimIds: [...CLAIMS, OTHER],
      claimEntities: [...CLAIMS, OTHER].map(entity),
      isLoading: mocks.agendasLoading,
      error: mocks.agendasFailed ? new Error('statement timeout') : null,
      refetch: () => {},
    }),
  };
});
vi.mock('../use-debate-publishable-spaces', async importOriginal => ({
  ...(await importOriginal<typeof import('../use-debate-publishable-spaces')>()),
  useDebatePublishableSpaces: () => ({
    publishableSpaceIds: mocks.publishableLoading ? null : new Set([PUBLISHABLE]),
    isLoading: mocks.publishableLoading,
  }),
}));
vi.mock('./claim-debate-counts', () => ({
  useClaimDebateCounts: (asks: unknown[], enabled: boolean) => {
    mocks.countCalls.push({ asks, enabled });
    return mocks.counts;
  },
}));

afterEach(() => {
  mocks.agendasLoading = false;
  mocks.agendasFailed = false;
  mocks.publishableLoading = false;
  mocks.counts = { byClaimId: null, isLoading: false, error: null };
  mocks.countCalls = [];
});

const claimIdsOf = (sections: ReturnType<typeof useTodaysClaimsList>['sections']) =>
  sections.flatMap(section => section.claims.map(claim => claim.id));

describe('useTodaysClaimsList', () => {
  it('lists only agendas in spaces a debate can be published in', () => {
    mocks.counts.byClaimId = new Map();
    const { result } = renderHook(() => useTodaysClaimsList());
    expect(claimIdsOf(result.current.sections)).toEqual(CLAIMS);
  });

  it('waits for the debate counts before setting the order, then puts debated claims last', () => {
    mocks.counts = { byClaimId: null, isLoading: true, error: null };
    const { result, rerender } = renderHook(() => useTodaysClaimsList());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.sections).toEqual([]);

    mocks.counts = { byClaimId: new Map([[CLAIMS[0]!, 3]]), isLoading: false, error: null };
    rerender();
    expect(result.current.isLoading).toBe(false);
    expect(claimIdsOf(result.current.sections)).toEqual([CLAIMS[1], CLAIMS[0]]);
  });

  it('keeps the order it settled on when the counts refetch in the background', () => {
    mocks.counts = { byClaimId: new Map(), isLoading: false, error: null };
    const { result, rerender } = renderHook(() => useTodaysClaimsList());
    expect(claimIdsOf(result.current.sections)).toEqual(CLAIMS);

    // A debate finished on the first claim; a reconnect refetched the counts.
    mocks.counts = { byClaimId: new Map([[CLAIMS[0]!, 1]]), isLoading: false, error: null };
    rerender();
    expect(claimIdsOf(result.current.sections)).toEqual(CLAIMS);
  });

  it('orders by the counts once agendas that failed load on Try again', () => {
    mocks.agendasFailed = true;
    // Nothing to ask about yet: zero count queries combine to an empty answer.
    mocks.counts = { byClaimId: new Map(), isLoading: false, error: null };
    const { result, rerender } = renderHook(() => useTodaysClaimsList());
    expect(result.current.sections).toEqual([]);

    mocks.agendasFailed = false;
    mocks.counts = { byClaimId: new Map([[CLAIMS[0]!, 1]]), isLoading: false, error: null };
    rerender();
    expect(claimIdsOf(result.current.sections)).toEqual([CLAIMS[1], CLAIMS[0]]);
  });

  it('settles in agenda order for a signed-out guest, who gets no counts', () => {
    // `useClaimDebateCounts` answers an empty map once Privy is ready with nobody signed in.
    mocks.counts = { byClaimId: new Map(), isLoading: false, error: null };
    const { result } = renderHook(() => useTodaysClaimsList());
    expect(result.current.isLoading).toBe(false);
    expect(claimIdsOf(result.current.sections)).toEqual(CLAIMS);
  });

  it('never asks geo-chat for counts when no order is needed (the picker’s count)', () => {
    const { result } = renderHook(() => useTodaysClaimsList({ ordered: false }));
    expect(mocks.countCalls.every(call => call.asks.length === 0 && !call.enabled)).toBe(true);
    expect(claimIdsOf(result.current.sections)).toEqual(CLAIMS);
  });

  it('stays loading while publishability is unknown', () => {
    mocks.publishableLoading = true;
    const { result } = renderHook(() => useTodaysClaimsList({ ordered: false }));
    expect(result.current.isLoading).toBe(true);
  });
});

// Keeps the fixture honest: the unpublishable agenda really does list a claim.
it('fixture lists a claim in the unpublishable space', () => {
  expect(buildDebateAgendas(rows, new Set([OTHER])).spaces[0]?.spaceId).toBe(UNPUBLISHABLE);
});
