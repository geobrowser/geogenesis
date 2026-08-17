import '@testing-library/jest-dom/vitest';
import { cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrowseSidebarData, BrowseSpaceRow } from '~/core/browse/fetch-browse-sidebar-data';

import { spaceLabel, useSpaceLabels } from './use-space-labels';

const FEATURED = '019fedae-72b6-7ab2-927a-df044d57c566';
const MEMBER = '019fedae-72b6-7ab2-927a-df044d57c567';
const UNKNOWN = '019fedae-72b6-7ab2-927a-df044d57c568';
const UNNAMED = '019fedae-72b6-7ab2-927a-df044d57c569';

const mocks = vi.hoisted(() => ({
  sidebar: null as unknown,
  requestedIds: [] as string[][],
  fetched: new Map<string, { entity: { name: string | null; image: string | null } }>(),
  isLoading: false,
}));

vi.mock('~/core/browse/use-browse-sidebar-cache', () => ({
  useBrowseSidebarQuerySource: () => ({
    personalSpaceId: null,
    walletAddress: undefined,
    keyInput: null,
    isLoading: false,
  }),
  useCachedBrowseSidebarData: () => mocks.sidebar,
}));

vi.mock('./use-spaces-by-ids', () => ({
  useSpacesByIds: (spaceIds: string[]) => {
    mocks.requestedIds.push(spaceIds);
    return { spaces: [], spacesById: mocks.fetched, isLoading: mocks.isLoading };
  },
}));

function row(id: string, name: string, overrides: Partial<BrowseSpaceRow> = {}): BrowseSpaceRow {
  return { id, name, image: `ipfs://${name}`, ...overrides };
}

function sidebar(overrides: Partial<BrowseSidebarData> = {}): BrowseSidebarData {
  return {
    featured: [row(FEATURED, 'Crypto')],
    editorOf: [],
    memberOf: [row(MEMBER, 'Health')],
    documentationImage: null,
    personalSpaceId: null,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.sidebar = sidebar();
  mocks.requestedIds = [];
  mocks.fetched = new Map();
  mocks.isLoading = false;
});

afterEach(cleanup);

/** The ids the hook asked the knowledge graph for on its last render. */
function lastRequestedIds() {
  return mocks.requestedIds[mocks.requestedIds.length - 1];
}

describe('useSpaceLabels', () => {
  // The whole point: the sidebar has carried these names since first paint, so a panel opening
  // beside it should never render a placeholder while it re-fetches them.
  it('names spaces from the browse sidebar without fetching anything', () => {
    const { result } = renderHook(() => useSpaceLabels([FEATURED, MEMBER]));

    expect(spaceLabel(result.current.labelsById, FEATURED)?.name).toBe('Crypto');
    expect(spaceLabel(result.current.labelsById, MEMBER)?.name).toBe('Health');
    expect(lastRequestedIds()).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('carries the sidebar thumbnails through too', () => {
    const { result } = renderHook(() => useSpaceLabels([FEATURED]));

    expect(spaceLabel(result.current.labelsById, FEATURED)?.image).toBe('ipfs://Crypto');
  });

  // Sidebar ids and the ids a panel's facets arrive with don't share a format.
  it('matches ids across hyphen and case differences', () => {
    const { result } = renderHook(() => useSpaceLabels([FEATURED.replace(/-/g, '').toUpperCase()]));

    expect(spaceLabel(result.current.labelsById, FEATURED)?.name).toBe('Crypto');
    expect(lastRequestedIds()).toEqual([]);
  });

  it('fetches only the ids the sidebar cannot answer for', () => {
    renderHook(() => useSpaceLabels([FEATURED, MEMBER, UNKNOWN]));

    expect(lastRequestedIds()).toEqual([UNKNOWN]);
  });

  it('merges fetched names in alongside the sidebar ones', () => {
    mocks.fetched = new Map([[UNKNOWN, { entity: { name: 'Places', image: 'ipfs://Places' } }]]);
    const { result } = renderHook(() => useSpaceLabels([FEATURED, UNKNOWN]));

    expect(spaceLabel(result.current.labelsById, FEATURED)?.name).toBe('Crypto');
    expect(spaceLabel(result.current.labelsById, UNKNOWN)?.name).toBe('Places');
  });

  // An unnamed row's "name" is a fragment of its id — worse than what the graph will return, so it
  // must not stand in for a real one or suppress the lookup that would find it.
  it('does not let an unnamed sidebar row stand in for a real name', () => {
    mocks.sidebar = sidebar({ memberOf: [row(UNNAMED, UNNAMED.slice(0, 8), { unnamed: true })] });
    const { result } = renderHook(() => useSpaceLabels([UNNAMED]));

    expect(spaceLabel(result.current.labelsById, UNNAMED)).toBeUndefined();
    expect(lastRequestedIds()).toEqual([UNNAMED]);
  });

  // A blank name from the graph is not an answer either; leaving it out lets the caller keep
  // rendering its own placeholder rather than an empty label.
  it('ignores a fetched space with no name', () => {
    mocks.fetched = new Map([[UNKNOWN, { entity: { name: '   ', image: null } }]]);
    const { result } = renderHook(() => useSpaceLabels([UNKNOWN]));

    expect(spaceLabel(result.current.labelsById, UNKNOWN)).toBeUndefined();
  });

  it('drops ids that are not real space ids rather than putting them in the query', () => {
    renderHook(() => useSpaceLabels(['not-a-space-id', '', UNKNOWN]));

    expect(lastRequestedIds()).toEqual([UNKNOWN]);
  });

  // Callers pass facet lists that arrive in server order; a reorder is the same set of spaces and
  // must not re-key the query behind it.
  it('asks for the same ids in a stable order', () => {
    const { rerender } = renderHook(({ ids }) => useSpaceLabels(ids), {
      initialProps: { ids: [UNKNOWN, MEMBER] },
    });
    const first = lastRequestedIds();

    rerender({ ids: [MEMBER, UNKNOWN] });

    expect(lastRequestedIds()).toEqual(first);
  });

  // Nothing left to look up means nothing to wait for, whatever a stale query still reports.
  it('reports loading only while an unresolved id is in flight', () => {
    mocks.isLoading = true;

    const { result: resolved } = renderHook(() => useSpaceLabels([FEATURED]));
    expect(resolved.current.isLoading).toBe(false);

    const { result: pending } = renderHook(() => useSpaceLabels([UNKNOWN]));
    expect(pending.current.isLoading).toBe(true);
  });

  it('falls back to the fetch entirely when the sidebar has not loaded', () => {
    mocks.sidebar = null;
    mocks.fetched = new Map([[FEATURED, { entity: { name: 'Crypto', image: null } }]]);
    const { result } = renderHook(() => useSpaceLabels([FEATURED]));

    expect(lastRequestedIds()).toEqual([FEATURED]);
    expect(spaceLabel(result.current.labelsById, FEATURED)?.name).toBe('Crypto');
  });
});
