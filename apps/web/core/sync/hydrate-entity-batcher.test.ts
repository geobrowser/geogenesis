import { QueryClient } from '@tanstack/react-query';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoEventStream } from './stream';

const mocks = vi.hoisted(() => ({ syncMany: vi.fn(), syncOne: vi.fn() }));

vi.mock('./orm', () => ({
  E: {
    syncMany: (...args: unknown[]) => mocks.syncMany(...args),
    syncOne: (...args: unknown[]) => mocks.syncOne(...args),
  },
}));
vi.mock('./use-sync-engine.tsx', () => ({}));
vi.mock('./use-store.tsx', () => ({}));
vi.mock('../database/entities', () => ({ readTypes: () => [] }));

import { hydrateEntityBatched } from './hydrate-entity-batcher';

import type { GeoStore } from './store';

function entity(id: string, name = id) {
  return { id, name, description: null, spaces: [], types: [], relations: [], values: [] };
}

/**
 * `useHydrateEntity` is reached from ~48 call sites through `useQueryEntity`, so it runs once per
 * rendered row. Before this batcher that was one `Entity` request each — 42 on an entity page, 66
 * on explore — for data a single `EntitiesBatch` returns.
 */
describe('hydrateEntityBatched', () => {
  let cache: QueryClient;
  const store = {} as GeoStore;
  let emitted: unknown[];
  let stream: GeoEventStream;

  beforeEach(() => {
    vi.clearAllMocks();
    cache = new QueryClient();
    emitted = [];
    stream = { emit: (e: unknown) => emitted.push(e), on: vi.fn() } as unknown as GeoEventStream;
  });

  it('turns many ids requested in a tick into one batched read', async () => {
    mocks.syncMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => ({
      merged: where.id.in.map(id => entity(id)),
      remote: where.id.in.map(id => entity(id)),
    }));

    const ids = Array.from({ length: 42 }, (_, i) => `entity-${i}`);
    const results = await Promise.all(ids.map(id => hydrateEntityBatched({ id, store, cache, stream })));

    // The whole point: 42 callers, one request.
    expect(mocks.syncMany).toHaveBeenCalledTimes(1);
    expect(mocks.syncMany.mock.calls[0][0].where).toEqual({ id: { in: ids } });
    // And each caller still gets its own entity back.
    expect(results.map(r => r?.id)).toEqual(ids);
  });

  it('gives each caller its own entity, not the first one resolved', async () => {
    mocks.syncMany.mockResolvedValue({
      // Deliberately out of request order — resolution must be by id, not by position.
      merged: [entity('b', 'B'), entity('a', 'A')],
      remote: [],
    });

    const [a, b] = await Promise.all([
      hydrateEntityBatched({ id: 'a', store, cache, stream }),
      hydrateEntityBatched({ id: 'b', store, cache, stream }),
    ]);

    expect(a?.name).toBe('A');
    expect(b?.name).toBe('B');
  });

  it('resolves null for an id the batch did not return rather than hanging', async () => {
    // A caller left pending forever would leave its row loading with no error and no timeout.
    mocks.syncMany.mockResolvedValue({ merged: [entity('a')], remote: [] });

    const [a, missing] = await Promise.all([
      hydrateEntityBatched({ id: 'a', store, cache, stream }),
      hydrateEntityBatched({ id: 'missing', store, cache, stream }),
    ]);

    expect(a?.id).toBe('a');
    expect(missing).toBeNull();
  });

  it('rejects every caller when the shared read fails, so each row keeps its own error state', async () => {
    // Batching makes failure shared where it used to be per entity. Each caller must still see it.
    mocks.syncMany.mockRejectedValue(new Error('network down'));

    const results = await Promise.allSettled([
      hydrateEntityBatched({ id: 'a', store, cache, stream }),
      hydrateEntityBatched({ id: 'b', store, cache, stream }),
    ]);

    expect(results.map(r => r.status)).toEqual(['rejected', 'rejected']);
  });

  it('emits one synced event for the batch rather than one per entity', async () => {
    mocks.syncMany.mockResolvedValue({ merged: [entity('a'), entity('b')], remote: [entity('a')] });

    await Promise.all([
      hydrateEntityBatched({ id: 'a', store, cache, stream }),
      hydrateEntityBatched({ id: 'b', store, cache, stream }),
    ]);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      type: GeoEventStream.ENTITIES_SYNCED,
      entities: [{ id: 'a' }, { id: 'b' }],
    });
  });

  it('does not query by space, leaving the engine to filter as it receives events', async () => {
    mocks.syncMany.mockResolvedValue({ merged: [entity('a')], remote: [] });

    await hydrateEntityBatched({ id: 'a', store, cache, stream });

    expect(mocks.syncMany.mock.calls[0][0].spaceId).toBeUndefined();
  });

  it('keeps separate query clients in separate batches', async () => {
    // Two engines must never resolve each other's ids. The app has one; tests build their own.
    mocks.syncMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => ({
      merged: where.id.in.map(id => entity(id)),
      remote: [],
    }));
    const otherCache = new QueryClient();

    await Promise.all([
      hydrateEntityBatched({ id: 'a', store, cache, stream }),
      hydrateEntityBatched({ id: 'b', store, cache: otherCache, stream }),
    ]);

    expect(mocks.syncMany).toHaveBeenCalledTimes(2);
    const batched = mocks.syncMany.mock.calls.map(call => call[0].where.id.in);
    expect(batched).toContainEqual(['a']);
    expect(batched).toContainEqual(['b']);
  });

  it('starts a fresh batch once the previous one has flushed', async () => {
    mocks.syncMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => ({
      merged: where.id.in.map(id => entity(id)),
      remote: [],
    }));

    await hydrateEntityBatched({ id: 'a', store, cache, stream });
    await hydrateEntityBatched({ id: 'b', store, cache, stream });

    // Rows that mount later — a virtualised list scrolling, a feed paging in — must still hydrate.
    expect(mocks.syncMany).toHaveBeenCalledTimes(2);
  });
  it('tops up an entity whose relations the batch truncated', async () => {
    // `EntitiesBatch` caps relationsList at 1000 and does not paginate, while the singular
    // `getEntity` drains its connection to completion. Batching without accounting for that drops
    // relations past the cap silently — nothing errors, the entity is just missing some.
    const capped = { ...entity('big'), relations: Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}` })) };
    mocks.syncMany.mockResolvedValue({ merged: [entity('big'), entity('small')], remote: [capped, entity('small')] });
    mocks.syncOne.mockResolvedValue({
      merged: { ...entity('big'), relations: Array.from({ length: 2500 }, (_, i) => ({ id: `r${i}` })) },
      remote: null,
    });

    const [big, small] = await Promise.all([
      hydrateEntityBatched({ id: 'big', store, cache, stream }),
      hydrateEntityBatched({ id: 'small', store, cache, stream }),
    ]);

    // Only the capped entity pays for a second read.
    expect(mocks.syncOne).toHaveBeenCalledTimes(1);
    expect(mocks.syncOne.mock.calls[0][0].id).toBe('big');
    // And the drained result is what the caller gets, not the truncated one.
    expect(big?.relations).toHaveLength(2500);
    expect(small?.id).toBe('small');
  });

  it('emits the topped-up entity so the store gets the complete relation set', async () => {
    // `syncOne` hands the entity back without writing it anywhere, and the store is only updated by
    // this event — `useQueryEntity` reads `store.getEntity(...)`, not the resolved promise. Without
    // the emit the complete relations reach the caller and nothing else, and the store keeps the
    // truncated version the batch already emitted.
    const capped = { ...entity('big'), relations: Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}` })) };
    const drained = { ...entity('big'), relations: Array.from({ length: 2500 }, (_, i) => ({ id: `r${i}` })) };
    mocks.syncMany.mockResolvedValue({ merged: [entity('big')], remote: [capped] });
    mocks.syncOne.mockResolvedValue({ merged: drained, remote: drained });

    await hydrateEntityBatched({ id: 'big', store, cache, stream });

    // Two events: the batch, then the correction.
    expect(emitted).toHaveLength(2);
    const correction = emitted[1] as { entities: { relations: unknown[] }[]; remoteEntities: unknown[] };
    expect(correction.entities[0].relations).toHaveLength(2500);
    // The raw remote goes too, so the synced baseline is not left truncated either.
    expect(correction.remoteEntities).toHaveLength(1);
  });

  it('does not emit a correction when nothing was topped up', async () => {
    mocks.syncMany.mockResolvedValue({ merged: [entity('a')], remote: [entity('a')] });

    await hydrateEntityBatched({ id: 'a', store, cache, stream });

    expect(emitted).toHaveLength(1);
  });

  it('does not top up entities that came back under the cap', async () => {
    mocks.syncMany.mockResolvedValue({ merged: [entity('a')], remote: [{ ...entity('a'), relations: [{ id: 'r1' }] }] });

    await hydrateEntityBatched({ id: 'a', store, cache, stream });

    expect(mocks.syncOne).not.toHaveBeenCalled();
  });

  it('still resolves the caller when a top-up fails', async () => {
    // The top-up is a correctness improvement, not a new way for hydration to fail outright.
    const capped = { ...entity('big'), relations: Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}` })) };
    mocks.syncMany.mockResolvedValue({ merged: [entity('big')], remote: [capped] });
    mocks.syncOne.mockRejectedValue(new Error('top-up failed'));

    const big = await hydrateEntityBatched({ id: 'big', store, cache, stream });

    expect(big?.id).toBe('big');
  });
});
