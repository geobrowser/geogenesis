import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MatchmakingClaim } from '../api';
import type { PanelListFilters } from './hub-filters';
import { debatesHubExploreShowAtom, debatesHubMatchesIncludeOfflineAtom } from '~/atoms';

type ListProps = {
  warm?: boolean;
  variant?: string;
  atomsFrom?: string;
  panelFilters?: PanelListFilters;
  keepClaim?: (entry: MatchmakingClaim) => boolean;
  collapsesAnswered?: boolean;
  notice?: React.ReactNode | ((listHasRows: boolean) => React.ReactNode);
};

const seen = vi.hoisted(() => ({
  claimsTab: null as ListProps | null,
  matchesList: null as ListProps | null,
  authenticated: true,
  available: true,
  matches: [{}] as unknown[],
  matchesLoading: false,
  matchesFetching: false,
  /** Whether the stubbed ClaimsTab has rows to draw under its notice. */
  claimsTabHasRows: true,
  turnOn: vi.fn(),
}));

vi.mock('../hooks', () => ({
  useGeoChatAuth: () => ({ authenticated: seen.authenticated }),
  useDebateActivity: () => ({ data: { available_to_debate: seen.available } }),
  useUpdateDebateAvailability: () => ({ mutate: seen.turnOn, isPending: false }),
}));
vi.mock('./hooks', () => ({
  useMatchmakingMatches: () => ({
    data: seen.matchesLoading ? undefined : { matches: seen.matches },
    isLoading: seen.matchesLoading,
    isFetching: seen.matchesFetching,
    error: null,
  }),
}));

// Both lists have their own suites; here it only matters which one each filter draws, and with what.
vi.mock('./claims-tab', () => ({
  ClaimsTab: (props: ListProps) => {
    seen.claimsTab = props;
    const { notice } = props;
    return <div data-testid="claims-tab">{typeof notice === 'function' ? notice(seen.claimsTabHasRows) : notice}</div>;
  },
}));
vi.mock('./matches-list', () => ({
  MatchesList: (props: ListProps) => {
    seen.matchesList = props;
    return <div data-testid="matches-list">{props.notice as React.ReactNode}</div>;
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
  seen.available = true;
  seen.matches = [{}];
  seen.matchesLoading = false;
  seen.matchesFetching = false;
  seen.claimsTabHasRows = true;
});

describe('PanelMatchesTab', () => {
  it('lists geo-chat’s matches, sorted Best by default, with the offline switch off', () => {
    renderTab(<PanelMatchesTab onTabChange={vi.fn()} />);

    const filters = seen.matchesList?.panelFilters;
    expect(filters?.sort.options.map(option => option.label)).toEqual(['Best', 'Newest', 'Most people']);
    expect(filters?.clientSort).toBe('best');
    expect(filters?.toggles?.[0]).toMatchObject({ label: 'Include people who are offline', checked: false });
    expect(seen.matchesList?.atomsFrom).toBe('panelMatches');
    expect(seen.claimsTab).toBeNull();
  });

  it('widens to every claim you hold with someone on the other side once offline people are included', () => {
    const store = renderTab(<PanelMatchesTab onTabChange={vi.fn()} />);

    act(() => seen.matchesList?.panelFilters?.toggles?.[0]?.onChange(true));

    expect(store.get(debatesHubMatchesIncludeOfflineAtom)).toBe(true);
    expect(seen.claimsTab).toMatchObject({ variant: 'positions', atomsFrom: 'panelMatches' });
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

// Preston, 23 Oct: with nobody who disagrees online, Matches shows who you could schedule with
// instead of a bare empty state, without flipping the stored switch.
describe('PanelMatchesTab empty and unavailable', () => {
  it('shows the wider list on its own, under a line saying why, once the match list settles empty', () => {
    seen.matches = [];
    const store = renderTab(<PanelMatchesTab onTabChange={vi.fn()} />);

    expect(seen.claimsTab).toMatchObject({ variant: 'positions', atomsFrom: 'panelMatches' });
    expect(screen.getByTestId('matches-nobody-online')).toHaveTextContent('Nobody who disagrees with you is online');
    expect(store.get(debatesHubMatchesIncludeOfflineAtom)).toBe(false);
  });

  // Over "You haven't taken a position…", the line saying these claims have someone opposite was false.
  it('says nothing about the wider list when it has no rows either', () => {
    seen.matches = [];
    seen.claimsTabHasRows = false;
    renderTab(<PanelMatchesTab onTabChange={vi.fn()} />);

    expect(seen.claimsTab).toMatchObject({ variant: 'positions' });
    expect(screen.queryByTestId('matches-nobody-online')).not.toBeInTheDocument();
  });

  // 26 Oct: every background refresh swapped to the bare match list and back, flashing its empty state.
  it('keeps the wider list through a background refresh of an empty match list', () => {
    seen.matches = [];
    seen.matchesFetching = true;
    renderTab(<PanelMatchesTab onTabChange={vi.fn()} />);

    expect(seen.claimsTab).toMatchObject({ variant: 'positions' });
    expect(screen.queryByTestId('matches-list')).not.toBeInTheDocument();
  });

  it('waits for the match list to answer before swapping lists', () => {
    seen.matches = [];
    seen.matchesLoading = true;
    renderTab(<PanelMatchesTab onTabChange={vi.fn()} />);

    expect(screen.getByTestId('matches-list')).toBeInTheDocument();
    expect(seen.claimsTab).toBeNull();
  });

  it('leads with a Turn on card when the viewer is not available', () => {
    seen.available = false;
    renderTab(<PanelMatchesTab onTabChange={vi.fn()} />);

    const card = screen.getByTestId('matches-not-available');
    expect(card).toHaveTextContent('You’re not available now');
    fireEvent.click(within(card).getByRole('button', { name: 'Turn on' }));
    expect(seen.turnOn).toHaveBeenCalledWith(true);
  });

  it('points somewhere useful when nobody holds the other side of anything either', () => {
    seen.matches = [];
    const onTabChange = vi.fn();
    renderTab(<PanelMatchesTab onTabChange={onTabChange} />);

    const empty = seen.claimsTab?.panelFilters?.emptyPredicate;
    expect(empty?.message).toMatch(/Nobody holds the other side/);
    empty?.action?.onClick();
    expect(onTabChange).toHaveBeenCalledWith('explore');
  });
});

describe('PanelExploreTab', () => {
  it('browses the Debate tag by default: Not answered, ranked server-side', () => {
    renderTab(<PanelExploreTab onTabChange={vi.fn()} />);

    expect(seen.claimsTab).toMatchObject({ variant: 'explore', atomsFrom: 'panelExplore', keepClaim: undefined });
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

    expect(seen.claimsTab).toMatchObject({ variant: 'positions', atomsFrom: 'panelExplore' });
    expect(seen.claimsTab?.panelFilters?.clientSort).toBe('best');
  });

  it('reads geo-chat’s debate-now list for Someone online, folding away what you have answered', () => {
    const store = renderTab(<PanelExploreTab onTabChange={vi.fn()} />);

    act(() => seen.claimsTab?.panelFilters?.toggles?.[0]?.onChange(true));

    // Folded by Explore's own collapse, which holds a claim you answer in front of you, rather than
    // a filter that drops it on the next refetch.
    expect(seen.claimsTab).toMatchObject({
      variant: 'lobby',
      atomsFrom: 'panelExplore',
      keepClaim: undefined,
      collapsesAnswered: true,
    });

    act(() => store.set(debatesHubExploreShowAtom, 'all'));
    expect(seen.claimsTab?.collapsesAnswered).toBe(false);
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
    // Only people on your own side online: nobody to debate.
    expect(keep(claim(true, { total: 3, now: 2 }, { total: 1, now: 0 }))).toBe(false);
  });

  // Review, 27 Oct: an empty list here offered "Explore claims", which is this tab, so it did nothing.
  it('turns Someone online back off from an empty list it narrowed', () => {
    renderTab(<PanelExploreTab onTabChange={vi.fn()} />);
    act(() => seen.claimsTab?.panelFilters?.toggles?.[0]?.onChange(true));

    const action = seen.claimsTab?.panelFilters?.emptyAction;
    expect(action?.label).toBe('Turn off Someone online');
    act(() => action?.onClick());

    expect(seen.claimsTab?.variant).toBe('explore');
  });

  it('shows every claim from an empty My positions', () => {
    const store = renderTab(<PanelExploreTab onTabChange={vi.fn()} />);
    act(() => store.set(debatesHubExploreShowAtom, 'mine'));

    const action = seen.claimsTab?.panelFilters?.emptyAction;
    expect(action?.label).toBe('Show all claims');
    act(() => action?.onClick());

    expect(store.get(debatesHubExploreShowAtom)).toBe('all');
    expect(seen.claimsTab?.variant).toBe('explore');
  });

  it('turns Someone online off when it alone emptied My positions', () => {
    const store = renderTab(<PanelExploreTab onTabChange={vi.fn()} />);
    act(() => {
      store.set(debatesHubExploreShowAtom, 'mine');
      seen.claimsTab?.panelFilters?.toggles?.[0]?.onChange(true);
    });

    const empty = seen.claimsTab?.panelFilters?.emptyPredicate;
    expect(empty?.action?.label).toBe('Turn off Someone online');
    act(() => empty?.action?.onClick());

    expect(seen.claimsTab?.keepClaim).toBeUndefined();
    expect(store.get(debatesHubExploreShowAtom)).toBe('mine');
  });

  it('leaves the plain Explore list’s empty state alone', () => {
    renderTab(<PanelExploreTab onTabChange={vi.fn()} />);

    expect(seen.claimsTab?.panelFilters?.emptyAction).toBeUndefined();
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

  // 26 Oct: the warming copy ran with full screen's settings and seeded the viewer's spaces into
  // Explore's selection, which the panel's AND then read as a filter nobody set.
  it('warms with the panel’s own settings, so it never seeds a selection', () => {
    renderTab(<PanelExploreTab onTabChange={vi.fn()} warm />);

    expect(seen.claimsTab).toMatchObject({ warm: true, variant: 'explore', atomsFrom: 'panelExplore' });
    expect(seen.claimsTab?.panelFilters).toBeDefined();
  });
});
