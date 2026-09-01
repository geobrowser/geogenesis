import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import { Effect } from 'effect';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Entity } from '../types';
import { useEntity } from './entities';

const mocks = vi.hoisted(() => ({
  entity: null as Entity | null,
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: () => ({ entity: mocks.entity, isLoading: false }),
}));

vi.mock('../sync/orm', () => ({ E: { findMany: vi.fn(() => Effect.succeed([])) } }));
vi.mock('../io/queries', () => ({ getProperties: vi.fn(() => Effect.succeed([])) }));
vi.mock('../sync/use-sync-engine', () => ({ store: {} }));
vi.mock('../query-client', () => ({ queryClient: {} }));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * GEO-2778. `useQueryEntity` is handed a `spaceId`, so the entity it returns already carries values
 * filtered to that space *and* a name resolved with the cross-space fallback applied. Re-deriving
 * the name from those filtered values threw the fallback away: a space that had never named the
 * entity rendered it untitled while the graph had a perfectly good name.
 */
describe('useEntity name and description', () => {
  beforeEach(() => {
    mocks.entity = null;
  });

  it('keeps the resolved name when this space contributed no name value', () => {
    mocks.entity = {
      id: 'entity-1',
      // What `getEntity` resolved: this space had none, so it fell back to the graph.
      name: 'Root wording',
      description: 'Root description',
      // Filtered to the viewing space, which wrote neither field.
      values: [],
      relations: [],
      types: [],
      spaces: ['space-1'],
    } as unknown as Entity;

    const { result } = renderHook(() => useEntity({ id: 'entity-1', spaceId: 'space-1' }), { wrapper });

    expect(result.current.name).toBe('Root wording');
    expect(result.current.description).toBe('Root description');
  });

  it('reports nothing when the entity itself has neither', () => {
    mocks.entity = {
      id: 'entity-1',
      name: null,
      description: null,
      values: [],
      relations: [],
      types: [],
      spaces: [],
    } as unknown as Entity;

    const { result } = renderHook(() => useEntity({ id: 'entity-1', spaceId: 'space-1' }), { wrapper });

    expect(result.current.name).toBeNull();
    expect(result.current.description).toBeNull();
  });
});
