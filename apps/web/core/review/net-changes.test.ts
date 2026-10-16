import { describe, expect, it } from 'vitest';

import type { Entity, Relation, Value } from '~/core/types';

import { getNetRelations, getNetValues } from './net-changes';

function value(overrides: Partial<Value> = {}): Value {
  return {
    id: 'name-value',
    entity: { id: 'profile', name: null },
    property: { id: 'name', name: 'Name', dataType: 'TEXT', relationValueTypes: [] },
    value: 'Alice',
    spaceId: 'personal',
    isLocal: true,
    hasBeenPublished: false,
    ...overrides,
  };
}

function relation(overrides: Partial<Relation> = {}): Relation {
  return {
    id: 'type-relation',
    entityId: 'type-relation-entity',
    fromEntity: { id: 'profile', name: null },
    toEntity: { id: 'person', name: null, value: '' },
    type: { id: 'types', name: 'Types' },
    renderableType: 'RELATION',
    spaceId: 'personal',
    isLocal: true,
    hasBeenPublished: false,
    ...overrides,
  };
}

function baseline(values: Value[] = [], relations: Relation[] = []) {
  return new Map<string, Pick<Entity, 'values' | 'relations'>>([['profile', { values, relations }]]);
}

describe('net review changes', () => {
  it('excludes unchanged personal-space values while retaining edits in another space', () => {
    const personal = value();
    const publicEdit = value({ id: 'public-name', spaceId: 'public', value: 'Updated' });
    const synced = baseline([value({ isLocal: false })]);

    expect(getNetValues([personal, publicEdit], synced)).toEqual([publicEdit]);
  });

  it('excludes personal-space values and relations created then deleted locally', () => {
    expect(getNetValues([value({ isDeleted: true })], new Map())).toEqual([]);
    expect(getNetRelations([relation({ isDeleted: true })], new Map())).toEqual([]);
    // A remote entity may exist without either newly created operation.
    expect(getNetValues([value({ isDeleted: true })], baseline())).toEqual([]);
    expect(getNetRelations([relation({ isDeleted: true })], baseline())).toEqual([]);
  });

  it('retains actual additions, changes, and deletions of remote data', () => {
    const synced = baseline([value({ isLocal: false })], [relation({ isLocal: false })]);
    const changed = value({ value: 'Bob' });
    const deleted = value({ isDeleted: true });
    const newRelation = relation({ id: 'new-relation', toEntity: { id: 'company', name: null, value: '' } });
    const deletedRelation = relation({ isDeleted: true });

    expect(getNetValues([changed, deleted], synced)).toEqual([changed, deleted]);
    expect(getNetRelations([newRelation, deletedRelation], synced)).toEqual([newRelation, deletedRelation]);
    expect(getNetValues([value()], new Map())).toEqual([value()]);
  });

  it('excludes unchanged personal relations while retaining relation-only edits in another space', () => {
    const personal = relation();
    const publicEdit = relation({ id: 'public-type', spaceId: 'public' });
    const synced = baseline([], [relation({ isLocal: false })]);

    expect(getNetRelations([personal, publicEdit], synced)).toEqual([publicEdit]);
  });

  it('excludes delete/recreate pairs that restore the original relation', () => {
    const deleted = relation({ isDeleted: true });
    const recreated = relation({ id: 'replacement' });
    const synced = baseline([], [relation({ isLocal: false })]);

    expect(getNetRelations([deleted, recreated], synced)).toEqual([]);
  });

  it('retains position and destination-space changes', () => {
    const synced = baseline([], [relation({ isLocal: false, position: 'a' })]);
    const reordered = relation({ position: 'b' });
    const redirected = relation({ position: 'a', toSpaceId: 'other' });

    expect(getNetRelations([reordered], synced)).toEqual([reordered]);
    expect(getNetRelations([redirected], synced)).toEqual([redirected]);
  });

  it('does not treat local edits baked into the synced cache as a remote baseline', () => {
    const localValue = value();
    const localRelation = relation();
    const synced = baseline([localValue], [localRelation]);

    expect(getNetValues([localValue], synced)).toEqual([localValue]);
    expect(getNetRelations([localRelation], synced)).toEqual([localRelation]);
  });
});
