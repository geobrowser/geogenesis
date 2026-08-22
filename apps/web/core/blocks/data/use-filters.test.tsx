import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Filter } from './filters';

const SPACE_ID = '019fedae72b67ab2927adf044d57c566';
const BLOCK_ID = '019fedb10c417f3e9a112c7d5e8b4419';
const TOPICS_PROPERTY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
const CRYPTO = 'e7d737c536764c609fa16aa64a8c90ad';
const PODCASTS = 'b5a31f8182b042437ede0f84ee02f104';

const mocks = vi.hoisted(() => ({
  /** The persisted filter string, which `storage.values.set` rewrites the way the real store does. */
  filterValue: '',
  namesById: new Map<string, string>(),
  resolveCalls: 0,
}));

vi.mock('~/core/sync/use-store', () => ({
  useValues: () =>
    mocks.filterValue === ''
      ? []
      : [
          {
            entity: { id: BLOCK_ID },
            property: { id: 'filter', dataType: 'TEXT' },
            spaceId: SPACE_ID,
            value: mocks.filterValue,
          },
        ],
}));

vi.mock('~/core/sync/use-mutate', () => ({
  useMutate: () => ({
    storage: {
      values: {
        set: (value: { value: string }) => {
          mocks.filterValue = value.value;
        },
      },
    },
  }),
}));

vi.mock('./use-data-block', () => ({
  useDataBlockInstance: () => ({ entityId: BLOCK_ID, spaceId: SPACE_ID }),
}));

vi.mock('~/core/state/editor/use-editor', () => ({
  useEditorStoreLite: () => ({ initialBlockEntities: [], blockRelations: [] }),
}));

vi.mock('~/core/sync/store', () => ({ reactiveRelations: { getSnapshot: () => [], subscribe: () => () => {} } }));
vi.mock('~/core/sync/use-sync-engine', () => ({ store: {} }));
vi.mock('@xstate/store/react', () => ({ useSelector: () => [] }));
vi.mock('~/core/database/entities', () => ({ getSchemaFromTypeIds: async () => [] }));
vi.mock('~/core/utils/property/properties', () => ({ mergeRelationValueTypesFromStore: (p: unknown) => p }));

vi.mock('./filters', async importOriginal => {
  const actual = await importOriginal<typeof import('./filters')>();
  return {
    ...actual,
    // Stands in for the network lookup: names arrive only for ids the "server" knows.
    resolveFilterDisplayNames: async (filters: Filter[]) => {
      mocks.resolveCalls += 1;
      return filters.map(f => ({
        ...f,
        columnName: f.columnName ?? 'Topics',
        valueName: f.valueName ?? mocks.namesById.get(f.value) ?? null,
      }));
    },
  };
});

const { useFilters } = await import('./use-filters');
const { toGeoFilterState } = await import('./filters');

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function relationFilter(value: string): Filter {
  return { columnId: TOPICS_PROPERTY, columnName: null, valueType: 'RELATION', value, valueName: null } as Filter;
}

beforeEach(() => {
  mocks.filterValue = toGeoFilterState([relationFilter(CRYPTO)], 'AND');
  mocks.namesById = new Map([
    [CRYPTO, 'Crypto'],
    [PODCASTS, 'Podcasts'],
  ]);
  mocks.resolveCalls = 0;
});

afterEach(() => vi.clearAllMocks());

describe('useFilters', () => {
  // The reported bug: adding a filter blanked out the names of the ones already on screen, because
  // callers build the next list from the raw parse and that carries no names at all.
  it('keeps an existing filter’s name when another filter is added', async () => {
    const { result } = renderHook(() => useFilters(true), { wrapper });

    await waitFor(() => expect(result.current.resolvedFilterState[0]?.valueName).toBe('Crypto'));

    // Exactly what the filter picker does: rebuild from `filterState`, which has no names.
    act(() => {
      result.current.setFilterState([...result.current.filterState, relationFilter(PODCASTS)]);
    });

    // Before the re-resolve lands, the existing filter must still read as Crypto rather than
    // reverting to its entity id.
    expect(result.current.resolvedFilterState.map(f => f.valueName)).toEqual(['Crypto', null]);

    await waitFor(() =>
      expect(result.current.resolvedFilterState.map(f => f.valueName)).toEqual(['Crypto', 'Podcasts'])
    );
  });

  it('resolves names on first load', async () => {
    const { result } = renderHook(() => useFilters(true), { wrapper });

    expect(result.current.isFilterResolving).toBe(true);
    await waitFor(() => expect(result.current.isFilterResolving).toBe(false));
    expect(result.current.resolvedFilterState[0]?.valueName).toBe('Crypto');
  });

  it('reports nothing resolving when there are no filters', async () => {
    mocks.filterValue = '';

    const { result } = renderHook(() => useFilters(true), { wrapper });

    expect(result.current.resolvedFilterState).toEqual([]);
    expect(result.current.isFilterResolving).toBe(false);
  });
});
