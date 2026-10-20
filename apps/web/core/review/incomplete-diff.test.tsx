import { cleanup, renderHook, waitFor } from '@testing-library/react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLocalChanges } from '~/core/hooks/use-local-changes';
import { GeoStore, reactiveRelations, reactiveValues, syncedEntities } from '~/core/sync/store';
import { GeoEventStream } from '~/core/sync/stream';
import type { Entity, Relation, Value } from '~/core/types';

import { useNetChanges } from './use-net-changes';

const queries = vi.hoisted(() => ({ batch: vi.fn() }));
vi.mock('~/core/io/queries', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/io/queries')>()),
  getBatchEntities: (...args: unknown[]) => queries.batch(...args),
}));
vi.mock('~/core/sync/use-sync-engine', () => ({}));
vi.mock('~/core/sync/use-store', () => ({}));

const value: Value = {
  id: 'value',
  entity: { id: 'entity', name: 'Entity' },
  property: { id: 'property', name: 'Property', dataType: 'TEXT' },
  value: 'Saved',
  spaceId: 'space',
  isLocal: true,
  isDeleted: true,
  hasBeenPublished: false,
};
const relation: Relation = {
  id: 'relation',
  entityId: 'relation-entity',
  fromEntity: { id: 'entity', name: 'Entity' },
  toEntity: { id: 'target', name: 'Target', value: '' },
  type: { id: 'property', name: 'Property' },
  position: 'a',
  renderableType: 'RELATION',
  spaceId: 'space',
  isLocal: true,
  isDeleted: true,
  hasBeenPublished: false,
};
let remote: Entity;

beforeEach(() => {
  syncedEntities.clear();
  reactiveValues.set([]);
  reactiveRelations.set([]);
  remote = {
    id: 'entity',
    name: 'Entity',
    description: null,
    types: [],
    spaces: ['space'],
    values: [],
    relations: [],
    valuesComplete: false,
    relationsComplete: false,
  };
  queries.batch.mockImplementation(() => Effect.succeed([remote]));
});
afterEach(cleanup);

describe('incomplete baselines in displayed review', () => {
  it.each(['text', 'number', 'relation'] as const)('shows the only pending %s deletion as a review row', async kind => {
    const deleted =
      kind === 'number'
        ? { ...value, property: { ...value.property, dataType: 'INTEGER' as const }, value: '42' }
        : value;
    new GeoStore(new GeoEventStream()).hydrateWith([remote]);
    if (kind === 'relation') reactiveRelations.set([relation]);
    else reactiveValues.set([deleted]);
    const { result } = renderHook(() => ({ net: useNetChanges(), review: useLocalChanges('space') }));
    await waitFor(() => expect(result.current.review[1]).toBe(false));
    expect(result.current.net.spaceIds).toEqual(['space']);
    expect(result.current.review[0]).toHaveLength(1);
    if (kind === 'relation')
      expect(result.current.review[0][0].relations).toEqual([
        expect.objectContaining({
          relationId: relation.id,
          changeType: 'REMOVE',
          before: expect.objectContaining({ toEntityId: 'target', position: 'a' }),
          after: null,
        }),
      ]);
    else
      expect(result.current.review[0][0].values).toEqual([
        expect.objectContaining({ propertyId: 'property', before: deleted.value, after: null }),
      ]);
  });

  it.each(['value', 'relation'])('shows a deletion outside the remote response’s space', async kind => {
    remote = { ...remote, queriedSpaceId: 'other-space', valuesComplete: true, relationsComplete: true };
    new GeoStore(new GeoEventStream()).hydrateWith([remote]);
    if (kind === 'relation') reactiveRelations.set([relation]);
    else reactiveValues.set([value]);
    const { result } = renderHook(() => ({ net: useNetChanges(), review: useLocalChanges('space') }));
    await waitFor(() => expect(result.current.review[1]).toBe(false));
    expect(result.current.net.spaceIds).toEqual(['space']);
    expect(result.current.review[0]).toHaveLength(1);
  });

  it.each(['value', 'relation'])('still excludes a canceled %s deletion when coverage is complete', async kind => {
    remote = { ...remote, valuesComplete: true, relationsComplete: true };
    new GeoStore(new GeoEventStream()).hydrateWith([remote]);
    if (kind === 'relation') reactiveRelations.set([relation]);
    else reactiveValues.set([value]);
    const { result } = renderHook(() => ({ net: useNetChanges(), review: useLocalChanges('space') }));
    await waitFor(() => expect(result.current.review[1]).toBe(false));
    expect(result.current.net.spaceIds).toEqual([]);
    expect(result.current.review[0]).toEqual([]);
  });

  it.each(['value', 'relation'])(
    'prefers the remote %s before-state when it is present in a partial response',
    async kind => {
      remote = {
        ...remote,
        values: [{ ...value, value: 'Server', isLocal: false, isDeleted: false }],
        relations: [{ ...relation, position: 'server-position', isLocal: false, isDeleted: false }],
      };
      new GeoStore(new GeoEventStream()).hydrateWith([remote]);
      if (kind === 'relation') reactiveRelations.set([relation]);
      else reactiveValues.set([value]);
      const { result } = renderHook(() => useLocalChanges('space'));
      await waitFor(() => expect(result.current[1]).toBe(false));
      expect(result.current[0]).toHaveLength(1);
      if (kind === 'relation') expect(result.current[0][0].relations[0].before?.position).toBe('server-position');
      else expect(result.current[0][0].values[0].before).toBe('Server');
    }
  );
});
