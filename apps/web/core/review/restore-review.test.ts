import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PersistenceEngine } from '~/core/database/persistence-engine';
import { SyncEngine } from '~/core/sync/engine';
import { GeoStore, reactiveRelations, reactiveValues, syncedEntities } from '~/core/sync/store';
import { GeoEventStream } from '~/core/sync/stream';
import type { Relation, Value } from '~/core/types';

import { useNetChanges } from './use-net-changes';

const mocks = vi.hoisted(() => ({
  values: [] as Value[],
  relations: [] as Relation[],
  batch: vi.fn(),
  names: vi.fn(),
}));
vi.mock('~/core/database/indexeddb', () => ({
  db: {
    values: { toArray: async () => mocks.values },
    relations: { toArray: async () => mocks.relations },
  },
}));
vi.mock('~/core/io/queries', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/io/queries')>()),
  getBatchEntities: (...args: unknown[]) => mocks.batch(...args),
  getEntityNames: (...args: unknown[]) => mocks.names(...args),
}));
vi.mock('~/core/sync/use-sync-engine', () => ({}));
vi.mock('~/core/sync/use-store', () => ({}));

const value: Value = {
  id: 'value',
  entity: { id: 'restored', name: null },
  property: { id: 'name', name: 'Name', dataType: 'TEXT' },
  value: 'Restored',
  spaceId: 'space',
  isLocal: true,
  hasBeenPublished: false,
  isDeleted: true,
};
const relation: Relation = {
  id: 'relation',
  entityId: 'relation-entity',
  fromEntity: { id: 'restored', name: null },
  toEntity: { id: 'target', name: null, value: '' },
  type: { id: 'type', name: null },
  renderableType: 'RELATION',
  spaceId: 'space',
  isLocal: true,
  hasBeenPublished: false,
  isDeleted: true,
};
let engine: SyncEngine;
let cache: QueryClient;
let persistence: PersistenceEngine;

beforeEach(() => {
  vi.useFakeTimers();
  mocks.values = [];
  mocks.relations = [];
  mocks.batch.mockReset().mockReturnValue(Effect.succeed([]));
  mocks.names.mockReset().mockReturnValue(Effect.succeed([]));
  syncedEntities.clear();
  reactiveValues.set([]);
  reactiveRelations.set([]);
  const stream = new GeoEventStream();
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  engine = new SyncEngine(stream, cache, new GeoStore(stream));
  persistence = new PersistenceEngine(stream);
});

afterEach(() => {
  cleanup();
  engine.stop();
  cache.clear();
  vi.useRealTimers();
});

describe('restoring pending edits into review', () => {
  it.each(['values', 'relations', 'both'])(
    'reconciles canceled restored %s without visiting the entity',
    async kind => {
      if (kind !== 'relations') mocks.values = [value];
      if (kind !== 'values') mocks.relations = [relation];
      const { result } = renderHook(useNetChanges);
      await act(async () => {
        expect(await persistence.restore()).toBe(true);
      });
      expect(result.current.spaceIds).toEqual(['space']);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(mocks.batch).toHaveBeenCalledWith(['restored']);
      expect(result.current.spaceIds).toEqual([]);
    }
  );

  it('retains a restored deletion when the record exists remotely', async () => {
    mocks.values = [value];
    mocks.batch.mockReturnValue(
      Effect.succeed([
        {
          id: 'restored',
          name: 'Remote',
          description: null,
          spaces: ['space'],
          types: [],
          values: [{ ...value, isLocal: false, isDeleted: false }],
          relations: [],
        },
      ])
    );
    const { result } = renderHook(useNetChanges);
    await act(async () => {
      await persistence.restore();
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(mocks.batch).toHaveBeenCalledWith(['restored']);
    expect(result.current.values).toEqual([value]);
    expect(result.current.spaceIds).toEqual(['space']);
  });
});
