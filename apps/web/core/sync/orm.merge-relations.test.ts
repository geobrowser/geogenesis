import { SystemIds } from '@geoprotocol/geo-sdk';

import { describe, expect, it } from 'vitest';

import type { Relation } from '../types';
import { mergeRelations } from './orm';

function makeBlockRelation(overrides: Partial<Relation> = {}): Relation {
  return {
    id: 'relation-1',
    entityId: 'relation-entity-1',
    type: { id: SystemIds.BLOCKS, name: 'Blocks' },
    fromEntity: { id: 'page-1', name: 'Page' },
    toEntity: { id: 'block-1', name: null, value: 'block-1' },
    renderableType: 'TEXT',
    position: 'a0',
    verified: false,
    spaceId: 'space-1',
    timestamp: '2023-01-01T00:00:00Z',
    isDeleted: false,
    isLocal: false,
    hasBeenPublished: true,
    ...overrides,
  };
}

describe('mergeRelations', () => {
  it('collapses duplicate remote relations pointing at the same entity', () => {
    const remoteA = makeBlockRelation({ id: 'r1' });
    const remoteB = makeBlockRelation({ id: 'r2' });

    const merged = mergeRelations([], [remoteA, remoteB]);

    expect(merged).toHaveLength(1);
    expect(merged[0].toEntity.id).toBe('block-1');
  });

  it('prefers the local relation over a same-key remote', () => {
    const remote = makeBlockRelation({ id: 'r-remote' });
    const local = makeBlockRelation({ id: 'r-local', isLocal: true, hasBeenPublished: false });

    const merged = mergeRelations([local], [remote]);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('r-local');
  });

  it('keeps relations pointing at different entities', () => {
    const remoteA = makeBlockRelation({ id: 'r1' });
    const remoteB = makeBlockRelation({ id: 'r2', toEntity: { id: 'block-2', name: null, value: 'block-2' } });

    const merged = mergeRelations([], [remoteA, remoteB]);

    expect(merged).toHaveLength(2);
  });

  it('preserves a locally-deleted relation and masks its same-key remote', () => {
    const deletedLocal = makeBlockRelation({ id: 'r-old', isDeleted: true, isLocal: true, hasBeenPublished: false });
    const replacement = makeBlockRelation({ id: 'r-new', isLocal: true, hasBeenPublished: false });
    const remoteOld = makeBlockRelation({ id: 'r-old' });

    const merged = mergeRelations([deletedLocal, replacement], [remoteOld]);

    expect(merged.map(r => r.id).sort()).toEqual(['r-new', 'r-old']);
    expect(merged.find(r => r.id === 'r-old')?.isDeleted).toBe(true);
  });
});
