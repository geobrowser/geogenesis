import { QueryClient } from '@tanstack/react-query';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Relation, Value } from '~/core/types';

import { SyncEngine } from './engine';
import { GeoStore, reactiveRelations, reactiveValues, syncedEntities } from './store';
import { GeoEventStream } from './stream';

const queries = vi.hoisted(() => ({ batch: vi.fn(), names: vi.fn() }));
vi.mock('~/core/io/queries', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/io/queries')>()),
  getBatchEntities: (...args: unknown[]) => queries.batch(...args),
  getEntityNames: (...args: unknown[]) => queries.names(...args),
}));
vi.mock('./use-sync-engine', () => ({}));
vi.mock('./use-store', () => ({}));

const deletedValue: Value = {
  id: 'deleted-value',
  entity: { id: 'new-entity', name: null },
  property: { id: 'name', name: 'Name', dataType: 'TEXT' },
  value: 'New',
  spaceId: 'personal',
  isLocal: true,
  hasBeenPublished: false,
  isDeleted: true,
};
const deletedRelation: Relation = {
  id: 'deleted-relation',
  entityId: 'relation-entity',
  fromEntity: { id: 'new-entity', name: null },
  toEntity: { id: 'person', name: null, value: '' },
  type: { id: 'types', name: 'Types' },
  renderableType: 'RELATION',
  spaceId: 'personal',
  isLocal: true,
  hasBeenPublished: false,
  isDeleted: true,
};

let engine: SyncEngine;
let cache: QueryClient;
let stream: GeoEventStream;
let store: GeoStore;

beforeEach(() => {
  vi.useFakeTimers();
  queries.batch.mockReset().mockReturnValue(Effect.succeed([]));
  queries.names.mockReset().mockReturnValue(Effect.succeed([]));
  syncedEntities.clear();
  reactiveValues.set([deletedValue]);
  reactiveRelations.set([deletedRelation]);
  stream = new GeoEventStream();
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  store = new GeoStore(stream);
  engine = new SyncEngine(stream, cache, store);
});

afterEach(() => {
  engine.stop();
  cache.clear();
  vi.useRealTimers();
});

describe('sync of canceled edits', () => {
  it.each(['values', 'relations', 'both'])(
    'records confirmed absence for %s even when no merged entity survives',
    async kind => {
      if (kind === 'values') reactiveRelations.set([]);
      if (kind === 'relations') reactiveValues.set([]);
      stream.emit({ type: GeoEventStream.HYDRATE, entities: ['new-entity'] });
      await vi.advanceTimersByTimeAsync(200);
      expect(queries.batch).toHaveBeenCalled();
      expect(syncedEntities.has('new-entity')).toBe(true);
      expect(syncedEntities.get('new-entity')).toBeNull();
      expect(store.getEntity('new-entity')).toBeUndefined();
    }
  );

  it('keeps a failed request unknown', async () => {
    queries.batch.mockReturnValue(Effect.fail(new Error('network unavailable')));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      stream.emit({ type: GeoEventStream.HYDRATE, entities: ['new-entity'] });
      await vi.advanceTimersByTimeAsync(200);
      expect(queries.batch).toHaveBeenCalled();
      expect(syncedEntities.has('new-entity')).toBe(false);
    } finally {
      log.mockRestore();
    }
  });

  it('allows a later server seed to replace confirmed absence', async () => {
    stream.emit({ type: GeoEventStream.HYDRATE, entities: ['new-entity'] });
    await vi.advanceTimersByTimeAsync(200);
    store.seedFromServer([
      {
        id: 'new-entity',
        name: 'Published',
        description: null,
        types: [],
        spaces: ['personal'],
        values: [{ ...deletedValue, isLocal: false, isDeleted: false, hasBeenPublished: true }],
        relations: [],
      },
    ]);
    expect(store.getEntity('new-entity')?.name).toBe('Published');
  });

  it('does not throttle absence confirmation after a local-only entity loses its last value', async () => {
    reactiveValues.set([{ ...deletedValue, isDeleted: false }]);
    reactiveRelations.set([]);
    stream.emit({ type: GeoEventStream.HYDRATE, entities: ['new-entity'] });
    await vi.advanceTimersByTimeAsync(200);
    expect(syncedEntities.has('new-entity')).toBe(false);

    reactiveValues.set([deletedValue]);
    stream.emit({ type: GeoEventStream.VALUES_DELETED, value: deletedValue });
    await vi.advanceTimersByTimeAsync(200);
    expect(syncedEntities.has('new-entity')).toBe(true);
    expect(syncedEntities.get('new-entity')).toBeNull();
  });

  it('does not mistake a decode omission for absence when the id still exists remotely', async () => {
    queries.names.mockReturnValue(Effect.succeed([{ id: 'new-entity', name: 'Remote' }]));
    stream.emit({ type: GeoEventStream.HYDRATE, entities: ['new-entity'] });
    await vi.advanceTimersByTimeAsync(200);
    expect(syncedEntities.has('new-entity')).toBe(false);
  });

  it('keeps a failed absence confirmation unknown', async () => {
    queries.names.mockReturnValue(Effect.fail(new Error('confirmation unavailable')));
    stream.emit({ type: GeoEventStream.HYDRATE, entities: ['new-entity'] });
    await vi.advanceTimersByTimeAsync(200);
    expect(queries.names).toHaveBeenCalled();
    expect(syncedEntities.has('new-entity')).toBe(false);
  });
});
