import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MatchmakingClaim } from '../api';
import type { PanelListFilters } from './hub-filters';
import { debatesHubExploreShowAtom, debatesHubMatchesIncludeOfflineAtom } from '~/atoms';

type ListProps = {
  variant?: string;
  atomsFrom?: string;
  panelFilters?: PanelListFilters;
  keepClaim?: (entry: MatchmakingClaim) => boolean;
};

const seen = vi.hoisted(() => ({
  claimsTab: null as ListProps | null,
  matchesList: null as ListProps | null,
  authenticated: true,
}));

vi.mock('../hooks', () => ({ useGeoChatAuth: () => ({ authenticated: seen.authenticated }) }));

// Both lists have their own suites; here it only matters which one each filter draws, and with what.
vi.mock('./claims-tab', () => ({
  ClaimsTab: (props: ListProps) => {
    seen.claimsTab = props;
    return <div data-testid="claims-tab" />;
  },
}));
vi.mock('./matches-list', () => ({
  MatchesList: (props: ListProps) => {
    seen.matchesList = props;
    return <div data-testid="matches-list" />;
  },
}));

const { PanelExploreTab, PanelMatchesTab } = await import('./panel-claim-tabs');

function claim(
  viewerSide: boolean | null,
  agree: { total: number; now: number },
  disagree: { total: number; now: number }
) {
  return {
    viewer_response: viewerSide === null ? null : { position: viewerSide, position_label: '' },
    positions: [
      { position: true, total_count: agree.total, available_now_count: agree.now },
      { position: false, total_count: disagree.total, available_now_count: disagree.now },
    ],
  } as unknown as MatchmakingClaim;
}

function renderTab(ui: React.ReactElement) {
  const store = createStore();
  render(<Provider store={store}>{ui}</Provider>);
  return store;
}

afterEach(() => {
  cleanup();
  seen.claimsTab = null;
  seen.matchesList = null;
  seen.authenticated = true;
});

describe('PanelMatchesTab', () => {
  it('lists geo-chat’s matches, sorted Best by default, with the offline switch off', () => {
    renderTab(<PanelMatchesTab onTabChange={vi.fn()} />);

    const filters = seen.matchesList?.panelFilters;
    expect(filters?.sort.options.map(option => option.label)).toEqual(['Best', 'Newest', 'Most people']);
    expect(filters?.clientSort).toBe('best');
    expect(filters?.toggles?.[0]).toMatchObject({ label: 'Include people who are offline', checked: false });
    expect(seen.claimsTab).toBeNull();
  });

  it('widens to every claim you hold with someone on the other side once offline people are included', () => {
    const store = renderTab(<PanelMatchesTab onTabChange={vi.fn()} />);

    act(() => seen.matchesList?.panelFilters?.toggles?.[0]?.onChange(true));

    expect(store.get(debatesHubMatchesIncludeOfflineAtom)).toBe(true);
    expect(seen.claimsTab).toMatchObject({ variant: 'positions', atomsFrom: 'lobby' });
    const keep = seen.claimsTab!.keepClaim!;
    // Someone offline disagrees: kept, and the card offers Schedule.
    expect(keep(claim(true, { total: 1, now: 0 }, { total: 2, now: 0 }))).toBe(true);
    // Only people on your own side: no match.
    expect(keep(claim(true, { total: 3, now: 1 }, { total: 0, now: 0 }))).toBe(false);

    // Clear all turns it back off.
    act(() => seen.claimsTab?.panelFilters?.onClearExtras?.());
    expect(store.get(debatesHubMatchesIncludeOfflineAtom)).toBe(false);
  });
});

describe('PanelExploreTab', () => {
  it('browses the Debate tag by default: Not answered, ranked server-side', () => {
    renderTab(<PanelExploreTab onTabChange={vi.fn()} />);

    expect(seen.claimsTab).toMatchObject({ variant: 'explore', atomsFrom: 'explore', keepClaim: undefined });
    expect(seen.claimsTab?.panelFilters?.choice).toMatchObject({ heading: 'Show', value: 'unanswered' });
    expect(seen.claimsTab?.panelFilters?.graphOrder).toBe('best');
    expect(seen.claimsTab?.panelFilters?.choice?.options.map(option => option.label)).toEqual([
      'Not answered',
      'All',
      'My positions',
    ]);
  });

  it('shows your own positions under My positions', () => {
    const store = renderTab(<PanelExploreTab onTabChange={vi.fn()} />);

    act(() => store.set(debatesHubExploreShowAtom, 'mine'));

    expect(seen.claimsTab).toMatchObject({ variant: 'positions', atomsFrom: 'explore' });
    expect(seen.claimsTab?.panelFilters?.clientSort).toBe('best');
  });

  it('reads geo-chat’s debate-now list for Someone online, leaving out what you have answered', () => {
    renderTab(<PanelExploreTab onTabChange={vi.fn()} />);

    act(() => seen.claimsTab?.panelFilters?.toggles?.[0]?.onChange(true));

    expect(seen.claimsTab).toMatchObject({ variant: 'lobby', atomsFrom: 'explore' });
    const keep = seen.claimsTab!.keepClaim!;
    expect(keep(claim(null, { total: 1, now: 1 }, { total: 0, now: 0 }))).toBe(true);
    expect(keep(claim(true, { total: 1, now: 1 }, { total: 1, now: 1 }))).toBe(false);
  });

  it('narrows My positions to claims with someone online when both are on', () => {
    const store = renderTab(<PanelExploreTab onTabChange={vi.fn()} />);

    act(() => {
      store.set(debatesHubExploreShowAtom, 'mine');
      seen.claimsTab?.panelFilters?.toggles?.[0]?.onChange(true);
    });

    expect(seen.claimsTab?.variant).toBe('positions');
    const keep = seen.claimsTab!.keepClaim!;
    expect(keep(claim(true, { total: 1, now: 0 }, { total: 1, now: 1 }))).toBe(true);
    expect(keep(claim(true, { total: 1, now: 0 }, { total: 1, now: 0 }))).toBe(false);
  });

  it('clears Show and Someone online with Clear all, leaving Sort', () => {
    const store = renderTab(<PanelExploreTab onTabChange={vi.fn()} />);
    act(() => {
      store.set(debatesHubExploreShowAtom, 'all');
      seen.claimsTab?.panelFilters?.sort.onChange('newest');
    });

    act(() => seen.claimsTab?.panelFilters?.onClearExtras?.());

    expect(store.get(debatesHubExploreShowAtom)).toBe('unanswered');
    expect(seen.claimsTab?.panelFilters?.sort.value).toBe('newest');
  });

  it('offers a signed-out visitor only the tag, with Sort and spaces but no Show or online switch', () => {
    seen.authenticated = false;
    const store = renderTab(<PanelExploreTab onTabChange={vi.fn()} />);
    act(() => store.set(debatesHubExploreShowAtom, 'mine'));

    expect(seen.claimsTab?.variant).toBe('explore');
    expect(seen.claimsTab?.panelFilters?.choice).toBeUndefined();
    expect(seen.claimsTab?.panelFilters?.toggles).toEqual([]);
  });
});
