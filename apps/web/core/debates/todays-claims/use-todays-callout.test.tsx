import { act, cleanup, renderHook } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateAgendas } from './debate-agendas';

const mocks = vi.hoisted(() => ({
  flag: true,
  auth: { authenticated: true, accountKey: 'acct1' as string | null },
  agendas: null as unknown as DebateAgendas,
  agendasLoading: false,
  rows: [] as Array<{ space_id: string; claim_entity_id: string; viewer_response: { position: boolean } | null }>,
  rowsLoading: false,
  unresolved: new Set<string>(),
  rowGroups: [] as unknown[],
}));

vi.mock('~/core/state/feature-flags', () => ({ useFeatureFlag: () => mocks.flag }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId: 'me' }) }));
vi.mock('../hooks', () => ({
  useGeoChatAuth: () => mocks.auth,
  useDebateClaimsBySpaces: (groups: unknown[]) => {
    mocks.rowGroups.push(groups);
    return { claims: mocks.rows, isLoading: mocks.rowsLoading, unresolvedSpaceIds: mocks.unresolved };
  },
}));
vi.mock('../claim-picker-page', () => ({
  useClaimEntitiesByIds: (ids: string[]) => ({
    entities: ids.map(id => ({ id, name: `Claim ${id}` })),
    isLoading: false,
  }),
}));
vi.mock('../use-debate-publishable-spaces', () => ({
  useDebatePublishableSpaces: () => ({ publishableSpaceIds: null, isLoading: false }),
  isSpaceDebatePublishable: () => true,
}));
vi.mock('./debate-agendas', () => ({
  useDebateAgendas: (enabled: boolean) => ({
    agendasIn: () =>
      enabled ? mocks.agendas : { spaces: [], earlier: [], newestDay: null, listedAtByClaim: new Map() },
    claimEntities: [],
    isLoading: enabled && mocks.agendasLoading,
  }),
}));
vi.mock('./claim-debate-counts', () => ({
  useClaimDebateCounts: () => ({ byClaimId: new Map([['a', 3]]), isLoading: false }),
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
        { id: `block-${spaceId}`, agendaId: `agenda-${spaceId}`, spaceId, name: 'Topic', claimIds, listedAt: day },
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
  mocks.flag = true;
  mocks.auth = { authenticated: true, accountKey: 'acct1' };
  mocks.agendas = agendasFor('2026-10-29', { other: ['x', 'y'], member: ['a', 'b', 'c'] });
  mocks.agendasLoading = false;
  mocks.rows = [];
  mocks.rowsLoading = false;
  mocks.unresolved = new Set();
  mocks.rowGroups = [];
});

afterEach(() => cleanup());

describe('useTodaysCallout', () => {
  it('takes the day’s set in Today’s claims order, member spaces first, leaving out answered claims', () => {
    mocks.rows = [{ space_id: 'member', claim_entity_id: 'b', viewer_response: { position: true } }];
    const { result } = renderHook(() => useTodaysCallout(), { wrapper });

    expect(result.current.visible).toBe(true);
    // a has been debated since the listing, so it follows c; b is already answered.
    expect(result.current.claims.map(claim => claim.claimId)).toEqual(['c', 'a', 'x', 'y']);
    expect(result.current.claims[1]).toMatchObject({ spaceId: 'member', debatesSinceListing: 3 });
    expect(result.current.step?.current?.claimId).toBe('c');
    expect(store.get(todaysClaimsCalloutAtom)).toMatchObject({ day: '2026-10-29', accountKey: 'acct1' });
  });

  it('waits for the viewer’s sides before taking the set', () => {
    mocks.rowsLoading = true;
    const { result, rerender } = renderHook(() => useTodaysCallout(), { wrapper });
    expect(result.current.visible).toBe(false);

    mocks.unresolved = new Set(['member']);
    mocks.rowsLoading = false;
    rerender();
    expect(result.current.visible).toBe(false);

    mocks.unresolved = new Set();
    rerender();
    expect(result.current.visible).toBe(true);
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

  it('starts over for a different account on the same browser', () => {
    const { result, rerender } = renderHook(() => useTodaysCallout(), { wrapper });
    act(() => result.current.markAnswered('c'));

    mocks.auth = { authenticated: true, accountKey: 'acct2' };
    rerender();
    expect(store.get(todaysClaimsCalloutAtom)).toMatchObject({ accountKey: 'acct2', answered: [] });
  });

  it('has nothing when every claim is already answered', () => {
    mocks.rows = ['a', 'b', 'c']
      .map(id => ({ space_id: 'member', claim_entity_id: id, viewer_response: { position: true } }))
      .concat(['x', 'y'].map(id => ({ space_id: 'other', claim_entity_id: id, viewer_response: { position: true } })));
    const { result } = renderHook(() => useTodaysCallout(), { wrapper });

    expect(result.current.visible).toBe(false);
  });

  it('shows nothing signed out or with the flag off', () => {
    mocks.auth = { authenticated: false, accountKey: null };
    const signedOut = renderHook(() => useTodaysCallout(), { wrapper });
    expect(signedOut.result.current.visible).toBe(false);

    mocks.auth = { authenticated: true, accountKey: 'acct1' };
    mocks.flag = false;
    const flagOff = renderHook(() => useTodaysCallout(), { wrapper });
    expect(flagOff.result.current.visible).toBe(false);
    expect(store.get(todaysClaimsCalloutAtom).day).toBeNull();
  });
});
