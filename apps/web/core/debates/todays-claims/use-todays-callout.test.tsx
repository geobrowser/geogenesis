import { act, cleanup, renderHook } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateAgendas } from './debate-agendas';

const mocks = vi.hoisted(() => ({
  auth: { authenticated: true, accountKey: 'acct1' as string | null },
  agendas: null as unknown as DebateAgendas,
  agendasLoading: false,
  rows: [] as Array<{ space_id: string; claim_entity_id: string; viewer_response: { position: boolean } | null }>,
  rowsLoading: false,
  unresolved: new Set<string>(),
  rowGroups: [] as unknown[],
  scores: {} as Record<string, number>,
  scoresLoading: false,
  scoresFailed: false,
  typesPending: false,
  notPublishable: new Set<string>(),
  personalSpaceLoading: false,
  agendaEntityIds: null as string[] | null,
  fetchedIds: [] as string[][],
  entitiesError: null as Error | null,
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({
    personalSpaceId: mocks.personalSpaceLoading ? null : 'me',
    isLoading: mocks.personalSpaceLoading,
  }),
}));
vi.mock('../hooks', () => ({
  useGeoChatAuth: () => mocks.auth,
  useDebateClaimsBySpaces: (groups: unknown[]) => {
    mocks.rowGroups.push(groups);
    return { claims: mocks.rows, isLoading: mocks.rowsLoading, unresolvedSpaceIds: mocks.unresolved };
  },
}));
vi.mock('../claim-picker-page', () => ({
  useClaimEntitiesByIds: (ids: string[]) => {
    if (ids.length > 0) mocks.fetchedIds.push(ids);
    return {
      entities: mocks.entitiesError ? [] : ids.map(id => ({ id, name: `Claim ${id}` })),
      isLoading: false,
      error: mocks.entitiesError,
    };
  },
}));
vi.mock('../use-can-publish-debate-in', () => ({
  useCanPublishDebateIn: () => ({
    canPublishDebateIn: (spaceId: string) => !mocks.notPublishable.has(spaceId),
    allowlistLoading: false,
    typesPending: mocks.typesPending,
  }),
}));
vi.mock('./debate-agendas', async importOriginal => ({
  ...(await importOriginal<typeof import('./debate-agendas')>()),
  useDebateAgendas: (enabled: boolean) => ({
    agendasIn: (keepSpace: (spaceId: string) => boolean) => {
      if (!enabled) return { spaces: [], earlier: [], newestDay: null, listedAtByClaim: new Map() };
      const spaces = mocks.agendas.spaces.filter(space => keepSpace(space.spaceId));
      return { ...mocks.agendas, spaces };
    },
    spaceIds: mocks.agendas.spaces.map(space => space.spaceId),
    claimEntities: (mocks.agendaEntityIds ?? mocks.agendas.spaces.flatMap(space => space.sections[0]!.claimIds)).map(
      id => ({ id, name: `Claim ${id}` })
    ),
    isLoading: enabled && mocks.agendasLoading,
    error: null,
  }),
}));
vi.mock('./claim-debate-counts', () => ({
  useClaimDebateCounts: () => ({ byClaimId: new Map([['a', 3]]), isLoading: false }),
}));
vi.mock('../matchmaking/claim-order-facts', async importOriginal => ({
  ...(await importOriginal<typeof import('../matchmaking/claim-order-facts')>()),
  useClaimOrderFacts: (ids: string[]) => ({
    facts: new Map(ids.map(id => [id, { rankingScore: mocks.scores[id] ?? null, createdAtMs: null }])),
    isLoading: mocks.scoresLoading,
    failed: mocks.scoresFailed,
  }),
}));
vi.mock('./use-debaters-space-membership', () => ({
  useDebatersSpaceMembership: () => ({
    debatersIn: (spaceId: string) => (spaceId === 'member' ? 1 : 0),
    isLoading: false,
  }),
}));

const { useTodaysCallout } = await import('./use-todays-callout');
const { todaysClaimsCalloutAtom } = await import('~/atoms');

function agendasFor(day: string, spaces: Record<string, string[]>): DebateAgendas {
  return {
    spaces: Object.entries(spaces).map(([spaceId, claimIds]) => ({
      spaceId,
      listedOn: day,
      sections: [
        {
          id: `block-${spaceId}`,
          agendaId: `agenda-${spaceId}`,
          spaceId,
          name: `Topic ${spaceId}`,
          claimIds,
          listedOn: day,
          listedAt: day,
        },
      ],
    })),
    earlier: [],
    newestDay: day,
    listedAtByClaim: new Map(
      Object.values(spaces)
        .flat()
        .map(claimId => [claimId, day])
    ),
  };
}

let store: ReturnType<typeof createStore>;
const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;

beforeEach(() => {
  // The set is kept in the browser's storage, which outlives a store.
  window.localStorage.clear();
  store = createStore();
  mocks.auth = { authenticated: true, accountKey: 'acct1' };
  mocks.agendas = agendasFor('2026-10-29', { other: ['x', 'y'], member: ['a', 'b', 'c'] });
  mocks.agendasLoading = false;
  mocks.rows = [];
  mocks.rowsLoading = false;
  mocks.unresolved = new Set();
  mocks.rowGroups = [];
  mocks.scores = {};
  mocks.scoresLoading = false;
  mocks.scoresFailed = false;
  mocks.typesPending = false;
  mocks.notPublishable = new Set();
  mocks.personalSpaceLoading = false;
  mocks.agendaEntityIds = null;
  mocks.fetchedIds = [];
  mocks.entitiesError = null;
});

const storedFor = (accountKey: string) => store.get(todaysClaimsCalloutAtom)[accountKey];
const storedClaim = (claimId: string, spaceId = 'member') => ({
  claimId,
  spaceId,
  agendaId: `agenda-${spaceId}`,
  sectionId: `block-${spaceId}`,
  topic: `topic ${spaceId}`,
  listedOn: '2026-10-29',
});

afterEach(() => cleanup());

describe('useTodaysCallout', () => {
  it('with no scores, keeps Today’s claims order, member spaces first, leaving out answered claims', () => {
    mocks.rows = [{ space_id: 'member', claim_entity_id: 'b', viewer_response: { position: true } }];
    const { result } = renderHook(() => useTodaysCallout(), { wrapper });

    expect(result.current.visible).toBe(true);
    // Member space first; a has been debated since the listing, so it follows c; b is already answered.
    expect(result.current.claims.map(claim => claim.claimId)).toEqual(['c', 'a', 'x', 'y']);
    expect(result.current.claims[1]).toMatchObject({ spaceId: 'member', debatesSinceListing: 3 });
    expect(result.current.step?.current?.claimId).toBe('c');
    expect(storedFor('acct1')).toMatchObject({ day: '2026-10-29', answered: [], dismissed: false });
  });

  it('picks the highest-ranked first', () => {
    mocks.scores = { x: 1, y: 8, a: 5, b: 9, c: 7 };
    const { result } = renderHook(() => useTodaysCallout(), { wrapper });

    expect(result.current.claims.map(claim => claim.claimId)).toEqual(['b', 'y', 'c', 'a', 'x']);
  });

  it('waits for the ranking scores before taking the set', () => {
    mocks.scoresLoading = true;
    const { result, rerender } = renderHook(() => useTodaysCallout(), { wrapper });
    expect(result.current.visible).toBe(false);

    mocks.scoresLoading = false;
    rerender();
    expect(result.current.visible).toBe(true);
  });

  it('waits for the viewer’s sides before taking the set', () => {
    mocks.rowsLoading = true;
    const { result, rerender } = renderHook(() => useTodaysCallout(), { wrapper });
    expect(result.current.visible).toBe(false);

    mocks.rowsLoading = false;
    rerender();
    expect(result.current.visible).toBe(true);
  });

  // Review: one space geo-chat refuses for good must not hold the whole callout back.
  it('leaves out a space whose rows failed, and takes the set from the rest', () => {
    mocks.unresolved = new Set(['member']);
    const { result } = renderHook(() => useTodaysCallout(), { wrapper });

    expect(result.current.visible).toBe(true);
    expect(result.current.claims.map(claim => claim.claimId)).toEqual(['x', 'y']);
  });

  it('takes nothing while no space’s rows have answered', () => {
    mocks.unresolved = new Set(['member', 'other']);
    const { result } = renderHook(() => useTodaysCallout(), { wrapper });

    expect(result.current.visible).toBe(false);
    expect(storedFor('acct1')).toBeUndefined();
  });

  // Review: an agenda only counts in a space a debate could be published in, judged once known.
  it('waits for the spaces’ types, then leaves out agendas in spaces that can’t carry a debate', () => {
    mocks.typesPending = true;
    const { result, rerender } = renderHook(() => useTodaysCallout(), { wrapper });
    expect(result.current.visible).toBe(false);

    mocks.typesPending = false;
    mocks.notPublishable = new Set(['other']);
    rerender();
    expect(result.current.claims.map(claim => claim.claimId)).toEqual(['b', 'c', 'a']);
  });

  // Review: before the viewer's own space is known, nobody is a member of anything.
  it('waits for the viewer’s personal space before taking the set', () => {
    mocks.personalSpaceLoading = true;
    const { result, rerender } = renderHook(() => useTodaysCallout(), { wrapper });
    expect(result.current.visible).toBe(false);

    mocks.personalSpaceLoading = false;
    rerender();
    expect(result.current.visible).toBe(true);
  });

  it('draws the set from the agendas’ claims, and looks up only the ones they no longer hold', () => {
    mocks.agendaEntityIds = ['a', 'b', 'c', 'x'];
    const { result } = renderHook(() => useTodaysCallout(), { wrapper });

    expect(mocks.fetchedIds.at(-1)).toEqual(['y']);
    expect(result.current.entityOf('a')).toMatchObject({ id: 'a' });
    expect(result.current.entityOf('y')).toMatchObject({ id: 'y' });
    expect(result.current.entitiesSettled).toBe(true);
  });

  // Review: a failed lookup is not an answer that a claim is gone.
  it('does not report the claims settled when their lookup failed', () => {
    mocks.agendaEntityIds = ['a', 'b', 'c'];
    mocks.entitiesError = new Error('graph down');
    const { result } = renderHook(() => useTodaysCallout(), { wrapper });

    expect(result.current.entityOf('x')).toBeUndefined();
    expect(result.current.entitiesSettled).toBe(false);
  });

  it('holds the set once taken, as sides are answered and skipped', () => {
    const { result, rerender } = renderHook(() => useTodaysCallout(), { wrapper });
    const taken = result.current.claims;

    act(() => result.current.markAnswered('c'));
    act(() => result.current.skip('a'));
    expect(result.current.claims.map(claim => claim.claimId)).toEqual(['b', 'c', 'a', 'x', 'y']);
    expect(result.current.step?.current?.claimId).toBe('b');
    expect(result.current.step?.done).toEqual([false, true, false, false, false]);

    // A side taken on another surface counts too, without changing the set.
    mocks.rows = [{ space_id: 'member', claim_entity_id: 'b', viewer_response: { position: false } }];
    rerender();
    expect(result.current.claims).toEqual(taken);
    expect(result.current.step?.current?.claimId).toBe('x');
    expect(result.current.step?.done).toEqual([true, true, false, false, false]);
  });

  it('stays dismissed for the day and comes back with the next day’s agenda', () => {
    const { result, rerender } = renderHook(() => useTodaysCallout(), { wrapper });
    act(() => result.current.dismiss());
    expect(result.current.visible).toBe(false);

    rerender();
    expect(result.current.visible).toBe(false);

    mocks.agendas = agendasFor('2026-10-30', { member: ['n'] });
    rerender();
    expect(result.current.visible).toBe(true);
    expect(result.current.claims.map(claim => claim.claimId)).toEqual(['n']);
  });

  // Preston, 30 Oct: the end card stays while the panel is open, and is gone once it reopens.
  it('keeps the end card for the visit that reached it, then not again that day', () => {
    const first = renderHook(() => useTodaysCallout(), { wrapper });
    for (const claimId of ['c', 'a', 'b', 'x']) act(() => first.result.current.markAnswered(claimId));
    expect(first.result.current.step?.current?.claimId).toBe('y');
    expect(storedFor('acct1')?.ended).toBeUndefined();

    act(() => first.result.current.skip('y'));
    expect(first.result.current.step?.current).toBeNull();
    expect(first.result.current.visible).toBe(true);
    expect(storedFor('acct1')).toMatchObject({ ended: true, dismissed: false });
    first.rerender();
    expect(first.result.current.visible).toBe(true);

    // The panel closes and opens again.
    first.unmount();
    const reopened = renderHook(() => useTodaysCallout(), { wrapper });
    expect(reopened.result.current.visible).toBe(false);

    // The next agenda day asks again.
    mocks.agendas = agendasFor('2026-10-30', { member: ['n'] });
    reopened.rerender();
    expect(reopened.result.current.visible).toBe(true);
    expect(reopened.result.current.claims.map(claim => claim.claimId)).toEqual(['n']);
  });

  it('still asks on reopening while claims are left', () => {
    const first = renderHook(() => useTodaysCallout(), { wrapper });
    act(() => first.result.current.markAnswered('c'));
    first.unmount();

    const reopened = renderHook(() => useTodaysCallout(), { wrapper });
    expect(reopened.result.current.visible).toBe(true);
    expect(reopened.result.current.step?.current?.claimId).toBe('b');
  });

  // Copilot: a failed batch must not leave the batches that answered ranked first.
  it('ranks nothing when any score batch failed, keeping Today’s claims order', () => {
    mocks.scores = { y: 9 };
    mocks.scoresFailed = true;
    const { result } = renderHook(() => useTodaysCallout(), { wrapper });

    expect(result.current.claims.map(claim => claim.claimId)).toEqual(['b', 'c', 'a', 'x', 'y']);
  });

  // Copilot: a tab holding yesterday's agendas must not replace the set another tab took today.
  it('keeps a set already taken for a later agenda day', () => {
    const later = {
      day: '2026-10-30',
      claims: [storedClaim('n')],
      answered: ['n'],
      skipped: [],
      dismissed: false,
    };
    store.set(todaysClaimsCalloutAtom, { acct1: later });
    const { result } = renderHook(() => useTodaysCallout(), { wrapper });

    expect(storedFor('acct1')).toEqual(later);
    expect(result.current.visible).toBe(false);
  });

  // Copilot: the visit snapshot is per account.
  it('gives each account its own end card on the same day', () => {
    store.set(todaysClaimsCalloutAtom, {
      acct1: {
        day: '2026-10-29',
        claims: [storedClaim('a')],
        answered: ['a'],
        skipped: [],
        dismissed: false,
        ended: true,
      },
    });
    const { result, rerender } = renderHook(() => useTodaysCallout(), { wrapper });
    expect(result.current.visible).toBe(false);

    mocks.auth = { authenticated: true, accountKey: 'acct2' };
    rerender();
    for (const claimId of ['b', 'c', 'a', 'x', 'y']) act(() => result.current.markAnswered(claimId));
    expect(result.current.step?.current).toBeNull();
    expect(result.current.visible).toBe(true);
  });

  // Copilot: an ended day stays hidden while the sides it was finished with are still loading.
  it('keeps an ended day hidden while the viewer’s sides load', () => {
    store.set(todaysClaimsCalloutAtom, {
      acct1: {
        day: '2026-10-29',
        claims: [storedClaim('a'), storedClaim('b')],
        answered: ['a'],
        skipped: [],
        dismissed: false,
        ended: true,
      },
    });
    mocks.rowsLoading = true;
    const { result } = renderHook(() => useTodaysCallout(), { wrapper });

    expect(result.current.step?.current?.claimId).toBe('b');
    expect(result.current.visible).toBe(false);
  });

  // Review: one browser, two accounts, the same day.
  it('keeps each account’s day apart on the same browser', () => {
    const { result, rerender } = renderHook(() => useTodaysCallout(), { wrapper });
    act(() => result.current.markAnswered('c'));
    act(() => result.current.dismiss());

    mocks.auth = { authenticated: true, accountKey: 'acct2' };
    rerender();
    expect(result.current.visible).toBe(true);
    expect(storedFor('acct2')).toMatchObject({ answered: [], dismissed: false });

    mocks.auth = { authenticated: true, accountKey: 'acct1' };
    rerender();
    expect(result.current.visible).toBe(false);
    expect(storedFor('acct1')).toMatchObject({ answered: ['c'], dismissed: true });
  });

  it('has nothing when every claim is already answered', () => {
    mocks.rows = ['a', 'b', 'c']
      .map(id => ({ space_id: 'member', claim_entity_id: id, viewer_response: { position: true } }))
      .concat(['x', 'y'].map(id => ({ space_id: 'other', claim_entity_id: id, viewer_response: { position: true } })));
    const { result } = renderHook(() => useTodaysCallout(), { wrapper });

    expect(result.current.visible).toBe(false);
  });

  it('shows and takes nothing signed out', () => {
    mocks.auth = { authenticated: false, accountKey: null };
    const signedOut = renderHook(() => useTodaysCallout(), { wrapper });
    expect(signedOut.result.current.visible).toBe(false);
    expect(store.get(todaysClaimsCalloutAtom)).toEqual({});
  });
});
