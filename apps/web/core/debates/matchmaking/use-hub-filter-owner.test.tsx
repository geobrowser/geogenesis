import { act, renderHook } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { beforeEach, describe, expect, it } from 'vitest';

import { useHubFilterOwner } from './use-hub-filter-owner';
import {
  debatesHubExploreSpaceIdsAtom,
  debatesHubExploreSpaceSeedSpentAtom,
  debatesHubFiltersOwnerAtom,
} from '~/atoms';

let store: ReturnType<typeof createStore>;

beforeEach(() => {
  store = createStore();
});

const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;

/** A viewer who has narrowed Explore — the state that must not survive a handover. */
function dirtyFilters() {
  store.set(debatesHubExploreSpaceIdsAtom, ['space-a']);
  store.set(debatesHubExploreSpaceSeedSpentAtom, true);
}

const render = (accountKey: string | null, ready = true) =>
  renderHook(({ key, r }: { key: string | null; r: boolean }) => useHubFilterOwner(key, r), {
    wrapper,
    initialProps: { key: accountKey, r: ready },
  });

describe('useHubFilterOwner', () => {
  it('claims the filters for the viewer on screen, wherever it is called from', () => {
    dirtyFilters();
    render('account-a');

    expect(store.get(debatesHubFiltersOwnerAtom)).toBe('account-a');
  });

  it('keeps the filters on a first sign-in', () => {
    dirtyFilters();
    render('account-a');

    expect(store.get(debatesHubExploreSpaceIdsAtom)).toEqual(['space-a']);
    expect(store.get(debatesHubExploreSpaceSeedSpentAtom)).toBe(true);
  });

  it('clears the filters when the account changes under a claimed session', () => {
    dirtyFilters();
    const { rerender } = render('account-a');

    act(() => rerender({ key: 'account-b', r: true }));

    expect(store.get(debatesHubFiltersOwnerAtom)).toBe('account-b');
    expect(store.get(debatesHubExploreSpaceIdsAtom)).toEqual([]);
    expect(store.get(debatesHubExploreSpaceSeedSpentAtom)).toBe(false);
  });

  /**
   * The reset runs in a passive effect, so the render that first sees B still holds A's filters —
   * drawing then would fire B's first query with A's space ids.
   */
  it('reports the filters unreconciled during the handover render', () => {
    dirtyFilters();
    store.set(debatesHubFiltersOwnerAtom, 'account-a');

    const seen: boolean[] = [];
    renderHook(
      ({ key }: { key: string }) => {
        const reconciled = useHubFilterOwner(key, true);
        seen.push(reconciled);
        return reconciled;
      },
      { wrapper, initialProps: { key: 'account-b' } }
    );

    expect(seen).toContain(false);
    expect(seen.at(-1)).toBe(true);
  });

  // `accountKey` is null before Privy resolves, and a null mid-resolve is not a sign-out.
  it('claims nothing until Privy has resolved', () => {
    dirtyFilters();
    render('account-a', false);

    expect(store.get(debatesHubFiltersOwnerAtom)).toBeNull();
  });

  // Signing out keeps the owner, so the next sign-in is still compared against it.
  it('keeps naming the last account seen after a sign-out', () => {
    const { rerender } = render('account-a');

    act(() => rerender({ key: null, r: true }));

    expect(store.get(debatesHubFiltersOwnerAtom)).toBe('account-a');
  });
});
