import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { db as database } from '~/core/database/indexeddb';
import { GeoEventStream } from '~/core/sync/stream';
import type { Relation, Value } from '~/core/types';

import type { PersistenceEngine as Engine } from './persistence-engine';

// Only `restore` reads the store's atoms; the module itself pulls in the whole app.
vi.mock('~/core/sync/store', () => ({ reactiveValues: {}, reactiveRelations: {} }));

let db: typeof database;
let PersistenceEngine: typeof Engine;

beforeAll(async () => {
  globalThis.indexedDB = indexedDB;
  globalThis.IDBKeyRange = IDBKeyRange;
  ({ db } = await import('~/core/database/indexeddb'));
  ({ PersistenceEngine } = await import('./persistence-engine'));
});

afterEach(async () => {
  vi.useRealTimers();
  await db.values.clear();
  await db.relations.clear();
});

const value = { id: 'v-1', spaceId: 's-1', isLocal: true, hasBeenPublished: false } as unknown as Value;
const relation = { id: 'r-1', spaceId: 's-1', isLocal: true, hasBeenPublished: false } as unknown as Relation;

describe('PersistenceEngine', () => {
  it('drops rows published before their flush, so they never come back as local edits', async () => {
    vi.useFakeTimers();
    const stream = new GeoEventStream();
    new PersistenceEngine(stream);

    stream.emit({ type: GeoEventStream.VALUES_CREATED, value });
    stream.emit({ type: GeoEventStream.RELATION_CREATED, relation });
    stream.emit({ type: GeoEventStream.CHANGES_PUBLISHED, valueIds: [value.id], relationIds: [relation.id] });
    await vi.advanceTimersByTimeAsync(1000);
    vi.useRealTimers();

    expect(await db.values.count()).toBe(0);
    expect(await db.relations.count()).toBe(0);
  });

  it('still persists unpublished rows', async () => {
    vi.useFakeTimers();
    const stream = new GeoEventStream();
    new PersistenceEngine(stream);

    stream.emit({ type: GeoEventStream.VALUES_CREATED, value });
    await vi.advanceTimersByTimeAsync(1000);
    vi.useRealTimers();

    await vi.waitFor(async () => expect(await db.values.count()).toBe(1));
  });
});
