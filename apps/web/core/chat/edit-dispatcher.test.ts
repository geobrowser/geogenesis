import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DATA_TYPE_PROPERTY, RENDERABLE_TYPE_PROPERTY } from '~/core/constants';
import type { Entity, Property, Relation, Value } from '~/core/types';

// Mock the storage mutator and the E ORM so we can assert on tombstones / sets
// without a real sync engine. `vi.mock` is hoisted, so these run before the
// dispatcher module imports them.
const storage = {
  values: {
    set: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
  },
  relations: {
    set: vi.fn(),
    delete: vi.fn(),
  },
  properties: {
    create: vi.fn(),
    setDataType: vi.fn(),
  },
  entities: {
    name: {
      set: vi.fn(),
    },
  },
};

vi.mock('~/core/sync/use-mutate', () => ({ storage }));

const localStore = {
  getProperty: vi.fn<(id: string) => Property | null>(),
  getEntity: vi.fn<(id: string) => Entity | null>(),
  getStableDataType: vi.fn<(id: string) => 'TEXT' | 'RELATION' | null>(),
  // Defaults to empty so the dispatcher's relation-index fallback in
  // applyDeleteBlock / applySetDataBlockView / etc. is a no-op unless a test
  // explicitly stages relations.
  getResolvedRelations: vi.fn<(entityId: string, includeDeleted?: boolean) => Relation[]>(() => []),
  // Used by applyDeleteEntity for backlink + orphan-cascade lookups. Default
  // empty; tests stub per-case.
  getRelationsToEntity: vi.fn<(entityId: string, spaceId?: string, includeDeleted?: boolean) => Relation[]>(() => []),
};
vi.mock('~/core/sync/use-sync-engine', () => ({ store: localStore }));
vi.mock('~/core/query-client', () => ({
  queryClient: {
    fetchQuery: vi.fn(({ queryFn }: { queryKey: unknown[]; queryFn: (ctx: { signal: unknown }) => Promise<unknown> }) =>
      queryFn({ signal: undefined })
    ),
  },
}));
vi.mock('~/core/state/editable-store', () => ({ useEditable: () => ({ setEditable: vi.fn() }) }));

const getEntityMock = vi.fn();
const getPropertyMock = vi.fn();
// edit-dispatcher transitively imports `~/core/blocks/data/filters`, which
// pulls in several queries we don't actually exercise. Stub them to keep the
// import graph happy under both vitest and bun test (bun doesn't support
// vi.importActual).
const noopEffect = () => ({ _tag: 'Success', value: null }) as unknown;
vi.mock('~/core/io/queries', () => ({
  getEntity: (...args: unknown[]) => getEntityMock(...args),
  getProperty: (...args: unknown[]) => getPropertyMock(...args),
  getProperties: () => noopEffect(),
  getBatchEntities: () => noopEffect(),
  getSpace: () => noopEffect(),
  getRelation: () => noopEffect(),
  getResultsPage: () => noopEffect(),
  getAllEntities: () => noopEffect(),
  getEntitiesOrderedByProperty: () => noopEffect(),
  getEntityNames: () => noopEffect(),
  getResults: () => noopEffect(),
  getSpaces: () => noopEffect(),
  getSpaceByAddress: () => noopEffect(),
  getSpacesWhereMember: () => noopEffect(),
  getEntityVoteCount: () => noopEffect(),
}));

const findOne = vi.fn<(args: { id: string; spaceId?: string }) => Promise<Entity | null>>();
vi.mock('~/core/sync/orm', () => ({ E: { findOne } }));

// Import AFTER the mocks are registered.
const { applyIntent, useEditDispatcher } = await import('./edit-dispatcher');
const { waitForFlush } = await import('./apply-queue');

const setEditable = vi.fn();
const bumpEditorVersion = vi.fn();
const ctx = { setEditable, bumpEditorVersion };

function makeValue(overrides: Partial<Value> = {}): Value {
  return {
    id: 'v1',
    entity: { id: 'entity1', name: 'Entity' },
    property: { id: 'prop1', name: 'Property', dataType: 'TEXT' },
    spaceId: 'space1',
    value: 'old',
    ...overrides,
  };
}

function makeRelation(overrides: Partial<Relation> = {}): Relation {
  return {
    id: 'r1',
    entityId: 're1',
    type: { id: 'type1', name: 'Type' },
    fromEntity: { id: 'from1', name: 'From' },
    toEntity: { id: 'to1', name: 'To', value: 'to1' },
    renderableType: 'RELATION',
    spaceId: 'space1',
    ...overrides,
  };
}

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'entity1',
    name: 'Entity',
    description: null,
    spaces: ['space1'],
    types: [],
    relations: [],
    values: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findOne.mockReset();
  getEntityMock.mockReset();
  getPropertyMock.mockReset();
  localStore.getProperty.mockReset();
  localStore.getEntity.mockReset();
  localStore.getStableDataType.mockReset();
  localStore.getResolvedRelations.mockReset();
  localStore.getResolvedRelations.mockReturnValue([]);
  localStore.getRelationsToEntity.mockReset();
  localStore.getRelationsToEntity.mockReturnValue([]);
});

describe('toggleEditMode', () => {
  it('flips edit mode on and returns ok', async () => {
    const result = await applyIntent({ kind: 'toggleEditMode', mode: 'edit' }, ctx);
    expect(setEditable).toHaveBeenCalledWith(true);
    expect(result).toEqual({ ok: true });
  });

  it('flips edit mode off and returns ok', async () => {
    const result = await applyIntent({ kind: 'toggleEditMode', mode: 'browse' }, ctx);
    expect(setEditable).toHaveBeenCalledWith(false);
    expect(result).toEqual({ ok: true });
  });
});

describe('setValue', () => {
  it('writes the value with the resolved property shape', async () => {
    await applyIntent(
      {
        kind: 'setValue',
        entityId: 'entity1',
        spaceId: 'space1',
        propertyId: 'prop1',
        propertyName: 'Name',
        dataType: 'TEXT',
        value: 'hello',
        entityName: 'Entity',
      },
      ctx
    );
    expect(storage.values.set).toHaveBeenCalledWith({
      spaceId: 'space1',
      entity: { id: 'entity1', name: 'Entity' },
      property: { id: 'prop1', name: 'Name', dataType: 'TEXT' },
      value: 'hello',
    });
  });
});

describe('deleteValue', () => {
  it('tombstones the matching value fetched from merged entity state', async () => {
    const value = makeValue({ id: 'v-remote', property: { id: 'prop1', name: 'Name', dataType: 'TEXT' } });
    findOne.mockResolvedValueOnce(makeEntity({ values: [value] }));

    const result = await applyIntent(
      { kind: 'deleteValue', entityId: 'entity1', spaceId: 'space1', propertyId: 'prop1' },
      ctx
    );

    expect(storage.values.delete).toHaveBeenCalledWith(value);
    expect(result).toEqual({ ok: true });
  });

  // Deletes are intentionally idempotent — "already absent" is the goal state.
  it('no-ops with ok:true when the value does not exist (idempotent delete)', async () => {
    findOne.mockResolvedValueOnce(makeEntity({ values: [] }));
    const result = await applyIntent(
      { kind: 'deleteValue', entityId: 'entity1', spaceId: 'space1', propertyId: 'prop1' },
      ctx
    );
    expect(storage.values.delete).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it('ignores deleted values', async () => {
    const tombstoned = makeValue({ property: { id: 'prop1', name: 'Name', dataType: 'TEXT' }, isDeleted: true });
    findOne.mockResolvedValueOnce(makeEntity({ values: [tombstoned] }));
    const result = await applyIntent(
      { kind: 'deleteValue', entityId: 'entity1', spaceId: 'space1', propertyId: 'prop1' },
      ctx
    );
    expect(storage.values.delete).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });
});

describe('setRelation', () => {
  it('writes a new relation with the intent shape', async () => {
    await applyIntent(
      {
        kind: 'setRelation',
        fromEntityId: 'from1',
        fromEntityName: 'From',
        spaceId: 'space1',
        typeId: 'type1',
        typeName: 'Type',
        toEntityId: 'to1',
        toEntityName: 'To',
      },
      ctx
    );
    expect(storage.relations.set).toHaveBeenCalledTimes(1);
    const written = storage.relations.set.mock.calls[0][0];
    expect(written).toMatchObject({
      spaceId: 'space1',
      renderableType: 'RELATION',
      type: { id: 'type1', name: 'Type' },
      fromEntity: { id: 'from1', name: 'From' },
      toEntity: { id: 'to1', name: 'To', value: 'to1' },
    });
  });
});

describe('deleteRelation', () => {
  it('tombstones the matching relation from merged entity state', async () => {
    const match = makeRelation({
      fromEntity: { id: 'from1', name: null },
      type: { id: 'type1', name: null },
      toEntity: { id: 'to1', name: null, value: 'to1' },
      spaceId: 'space1',
    });
    findOne.mockResolvedValueOnce(makeEntity({ relations: [match] }));

    await applyIntent(
      {
        kind: 'deleteRelation',
        fromEntityId: 'from1',
        spaceId: 'space1',
        typeId: 'type1',
        toEntityId: 'to1',
      },
      ctx
    );

    expect(storage.relations.delete).toHaveBeenCalledWith(match);
  });

  it('does not match relations in a different space', async () => {
    const otherSpace = makeRelation({
      fromEntity: { id: 'from1', name: null },
      type: { id: 'type1', name: null },
      toEntity: { id: 'to1', name: null, value: 'to1' },
      spaceId: 'space2',
    });
    findOne.mockResolvedValueOnce(makeEntity({ relations: [otherSpace] }));

    await applyIntent(
      {
        kind: 'deleteRelation',
        fromEntityId: 'from1',
        spaceId: 'space1',
        typeId: 'type1',
        toEntityId: 'to1',
      },
      ctx
    );
    expect(storage.relations.delete).not.toHaveBeenCalled();
  });
});

describe('createProperty', () => {
  it('delegates to storage.properties.create with mapped fields', async () => {
    await applyIntent(
      {
        kind: 'createProperty',
        propertyId: 'p1',
        spaceId: 'space1',
        name: 'Status',
        dataType: 'TEXT',
        renderableTypeId: null,
      },
      ctx
    );
    expect(storage.properties.create).toHaveBeenCalledWith({
      entityId: 'p1',
      spaceId: 'space1',
      name: 'Status',
      dataType: 'TEXT',
      renderableTypeId: null,
    });
  });
});

describe('createBlock — same-URL idempotency', () => {
  // The chat orchestrator can land createBlock twice (retry on stream error, or
  // a duplicate tool call after a verifier reset). We catch the second hit by
  // scanning the parent's existing blocks for IMAGE_URL_PROPERTY === url before
  // staging a new block — preventing two identical image blocks from stacking
  // on the page.
  const PARENT = 'parent1';
  const EXISTING_BLOCK = 'existing-block-1';
  const URL = 'https://example.com/cover.jpg';

  function setupParentWithImageBlock(url: string) {
    const blocksEdge = makeRelation({
      id: 'r-existing-blocks',
      fromEntity: { id: PARENT, name: null },
      type: { id: SystemIds.BLOCKS, name: 'Blocks' },
      toEntity: { id: EXISTING_BLOCK, name: null, value: EXISTING_BLOCK },
      spaceId: 'space1',
    });
    const parent = makeEntity({ id: PARENT, relations: [blocksEdge] });
    const blockUrlValue = makeValue({
      id: 'v-image-url',
      entity: { id: EXISTING_BLOCK, name: null },
      property: { id: SystemIds.IMAGE_URL_PROPERTY, name: 'IPFS URL', dataType: 'TEXT' },
      value: url,
    });
    const existingBlock = makeEntity({ id: EXISTING_BLOCK, values: [blockUrlValue] });
    findOne.mockImplementation(async ({ id }) => {
      if (id === PARENT) return parent;
      if (id === EXISTING_BLOCK) return existingBlock;
      return null;
    });
  }

  it('returns apply_failed when an image block with the same URL is already on the parent', async () => {
    setupParentWithImageBlock(URL);

    const result = await applyIntent(
      {
        kind: 'createBlock',
        parentEntityId: PARENT,
        spaceId: 'space1',
        blockId: 'new-block-1',
        content: { kind: 'image', url: URL, title: null },
      },
      ctx
    );

    expect(result).toMatchObject({ ok: false, error: 'apply_failed' });
    expect(storage.values.set).not.toHaveBeenCalled();
    expect(storage.relations.set).not.toHaveBeenCalled();
  });

  it('treats video blocks the same — same URL on the parent rejects', async () => {
    setupParentWithImageBlock(URL);

    const result = await applyIntent(
      {
        kind: 'createBlock',
        parentEntityId: PARENT,
        spaceId: 'space1',
        blockId: 'new-block-1',
        content: { kind: 'video', url: URL, title: null },
      },
      ctx
    );

    expect(result).toMatchObject({ ok: false, error: 'apply_failed' });
    expect(storage.values.set).not.toHaveBeenCalled();
    expect(storage.relations.set).not.toHaveBeenCalled();
  });

  it('does not flag a different-URL block on the same parent', async () => {
    setupParentWithImageBlock(URL);

    const result = await applyIntent(
      {
        kind: 'createBlock',
        parentEntityId: PARENT,
        spaceId: 'space1',
        blockId: 'new-block-1',
        // Video — skips the preflight branch that depends on a working <img>
        // loader (jsdom does not fire onload/onerror), so the test exercises
        // the no-duplicate path without hanging on the 8s preflight timeout.
        content: { kind: 'video', url: 'https://example.com/different.mp4', title: null },
      },
      ctx
    );

    expect(result).toEqual({ ok: true });
    // BLOCKS edge + type relation + value all written for the new block.
    expect(storage.values.set).toHaveBeenCalled();
    expect(storage.relations.set).toHaveBeenCalled();
  });
});

describe('deleteBlock', () => {
  it('tombstones block values, outgoing relations, and the parent BLOCKS edge', async () => {
    const blockValue = makeValue({ id: 'v-block-md', entity: { id: 'block1', name: null } });
    const blockOutgoing = makeRelation({
      id: 'r-block-type',
      fromEntity: { id: 'block1', name: null },
      type: { id: 'some-type', name: null },
      toEntity: { id: 'some-target', name: null, value: 'some-target' },
      spaceId: 'space1',
    });
    const blockEntity = makeEntity({ id: 'block1', values: [blockValue], relations: [blockOutgoing] });

    const parentBlocksEdge = makeRelation({
      id: 'r-parent-blocks',
      fromEntity: { id: 'parent1', name: null },
      type: { id: SystemIds.BLOCKS, name: 'Blocks' },
      toEntity: { id: 'block1', name: null, value: 'block1' },
      spaceId: 'space1',
    });
    const parentEntity = makeEntity({ id: 'parent1', relations: [parentBlocksEdge] });

    findOne.mockImplementation(async ({ id }) => {
      if (id === 'block1') return blockEntity;
      if (id === 'parent1') return parentEntity;
      return null;
    });

    await applyIntent({ kind: 'deleteBlock', blockId: 'block1', parentEntityId: 'parent1', spaceId: 'space1' }, ctx);

    expect(storage.values.delete).toHaveBeenCalledWith(blockValue);
    expect(storage.relations.delete).toHaveBeenCalledWith(blockOutgoing);
    expect(storage.relations.delete).toHaveBeenCalledWith(parentBlocksEdge);
  });

  it('returns apply_failed when parent has no BLOCKS edge — block contents preserved', async () => {
    // Canonical production bug: the model passes a wrong parentEntityId (e.g.
    // the space metadata id on a space-home page). Tombstoning the block's
    // values + outgoing relations BEFORE discovering no BLOCKS edge would
    // orphan it on the live graph. We must find the edge first, surface
    // apply_failed if missing, and leave block contents intact.
    const blockValue = makeValue({ id: 'v-block-md', entity: { id: 'block1', name: null } });
    const blockOutgoing = makeRelation({
      id: 'r-block-type',
      fromEntity: { id: 'block1', name: null },
      type: { id: 'some-type', name: null },
      toEntity: { id: 'some-target', name: null, value: 'some-target' },
      spaceId: 'space1',
    });
    const blockEntity = makeEntity({ id: 'block1', values: [blockValue], relations: [blockOutgoing] });
    const unrelatedParent = makeEntity({ id: 'parent1', relations: [] });

    findOne.mockImplementation(async ({ id }) => {
      if (id === 'block1') return blockEntity;
      if (id === 'parent1') return unrelatedParent;
      return null;
    });

    const result = await applyIntent(
      { kind: 'deleteBlock', blockId: 'block1', parentEntityId: 'parent1', spaceId: 'space1' },
      ctx
    );

    expect(storage.values.delete).not.toHaveBeenCalled();
    expect(storage.relations.delete).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, error: 'apply_failed' });
  });

  it('returns apply_failed when parent entity cannot be resolved at all', async () => {
    findOne.mockImplementation(async () => null);
    const result = await applyIntent(
      { kind: 'deleteBlock', blockId: 'block1', parentEntityId: 'parent1', spaceId: 'space1' },
      ctx
    );
    expect(storage.values.delete).not.toHaveBeenCalled();
    expect(storage.relations.delete).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, error: 'apply_failed' });
  });

  it('relation-index fallback: parent record absent but BLOCKS edge in local index → succeeds', async () => {
    // Same-turn case: createBlock just staged the BLOCKS edge in the relation
    // index, but the parent's E.findOne hasn't picked it up yet. The fallback
    // scan keeps deleteBlock working in that window instead of apply_failed.
    const blocksEdge = makeRelation({
      id: 'r-blocks-staged',
      entityId: 'block-rel-1',
      fromEntity: { id: 'parent1', name: null },
      type: { id: SystemIds.BLOCKS, name: 'Blocks' },
      toEntity: { id: 'block1', name: null, value: 'block1' },
      spaceId: 'space1',
    });
    findOne.mockImplementation(async ({ id }) => {
      if (id === 'parent1') return makeEntity({ id: 'parent1', relations: [] });
      return null;
    });
    localStore.getResolvedRelations.mockImplementation(entityId => (entityId === 'parent1' ? [blocksEdge] : []));

    const result = await applyIntent(
      { kind: 'deleteBlock', blockId: 'block1', parentEntityId: 'parent1', spaceId: 'space1' },
      ctx
    );

    expect(result).toEqual({ ok: true });
    expect(storage.relations.delete).toHaveBeenCalledWith(blocksEdge);
  });
});

describe('setDataBlockFilters', () => {
  it('returns apply_failed when block cannot be resolved (guards against stray FILTER writes)', async () => {
    findOne.mockImplementation(async () => null);
    const result = await applyIntent(
      { kind: 'setDataBlockFilters', blockId: 'block1', spaceId: 'space1', filters: [], mode: 'AND' },
      ctx
    );
    expect(storage.values.set).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, error: 'apply_failed' });
  });

  it('writes the filter value when the block exists', async () => {
    findOne.mockResolvedValue(makeEntity({ id: 'block1' }));
    const result = await applyIntent(
      { kind: 'setDataBlockFilters', blockId: 'block1', spaceId: 'space1', filters: [], mode: 'AND' },
      ctx
    );
    expect(storage.values.set).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'space1', entity: { id: 'block1', name: null }, value: '' })
    );
    expect(result).toEqual({ ok: true });
  });
});

describe('setDataBlockView', () => {
  it('writes the VIEW relation when block + block-relation both resolve (same-turn happy path)', async () => {
    // The most important production scenario: createBlock just staged a data
    // block with a fresh blockRelationEntityId, then setDataBlockView lands
    // in the same turn. Both must resolve from merged local+remote state for
    // the VIEW relation to actually be written.
    const blocksEdge = makeRelation({
      id: 'r-blocks',
      entityId: 'block-rel-fresh',
      fromEntity: { id: 'parent1', name: null },
      toEntity: { id: 'block-fresh', name: null, value: 'block-fresh' },
      type: { id: SystemIds.BLOCKS, name: 'Blocks' },
      spaceId: 'space1',
    });
    const parentEntity = makeEntity({ id: 'parent1', relations: [blocksEdge] });
    const blockRelationEntity = makeEntity({ id: 'block-rel-fresh', relations: [] });
    findOne.mockImplementation(async ({ id }) => {
      if (id === 'parent1') return parentEntity;
      if (id === 'block-rel-fresh') return blockRelationEntity;
      return null;
    });

    await applyIntent(
      {
        kind: 'setDataBlockView',
        blockId: 'block-fresh',
        parentEntityId: 'parent1',
        spaceId: 'space1',
        view: 'GALLERY',
      },
      ctx
    );

    // Should write a new VIEW relation pointing at the gallery system id,
    // hanging off the block-relation entity (not the block itself).
    expect(storage.relations.set).toHaveBeenCalledWith(
      expect.objectContaining({
        type: { id: SystemIds.VIEW_PROPERTY, name: 'View' },
        fromEntity: { id: 'block-rel-fresh', name: null },
        toEntity: expect.objectContaining({ id: SystemIds.GALLERY_VIEW }),
        spaceId: 'space1',
      })
    );
  });

  it('returns apply_failed when block-relation entity is missing — avoids dual VIEW relations', async () => {
    // The parent's BLOCKS edge resolves, but the block-relation entity itself
    // can't be fetched. Writing a new VIEW without tombstoning the old one
    // leaves two VIEW_PROPERTY relations — previously a silent corruption.
    const blocksEdge = makeRelation({
      entityId: 'block-rel-1',
      fromEntity: { id: 'parent1', name: null },
      toEntity: { id: 'block1', name: null, value: 'block1' },
      type: { id: SystemIds.BLOCKS, name: 'Blocks' },
      spaceId: 'space1',
    });
    const parentEntity = makeEntity({ id: 'parent1', relations: [blocksEdge] });
    findOne.mockImplementation(async ({ id }) => {
      if (id === 'parent1') return parentEntity;
      return null; // block-relation entity is missing
    });

    const result = await applyIntent(
      { kind: 'setDataBlockView', blockId: 'block1', parentEntityId: 'parent1', spaceId: 'space1', view: 'GALLERY' },
      ctx
    );

    expect(storage.relations.delete).not.toHaveBeenCalled();
    expect(storage.relations.set).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, error: 'apply_failed' });
  });

  it('returns apply_failed when no BLOCKS edge under parent', async () => {
    findOne.mockImplementation(async ({ id }) => {
      if (id === 'parent1') return makeEntity({ id: 'parent1', relations: [] });
      return null;
    });
    const result = await applyIntent(
      { kind: 'setDataBlockView', blockId: 'block1', parentEntityId: 'parent1', spaceId: 'space1', view: 'GALLERY' },
      ctx
    );
    expect(result).toMatchObject({ ok: false, error: 'apply_failed' });
  });
});

describe('moveEntityToSpace / cloneEntityToSpace', () => {
  const ENTITY = 'eeee0000eeee0000eeee0000eeee0000';
  const SOURCE = 'ssss1111ssss1111ssss1111ssss1111';
  const TARGET = 'tttt2222tttt2222tttt2222tttt2222';

  it('cloneEntityToSpace copies values + outgoing relations into target without source delete', async () => {
    const value = makeValue({
      id: 'v-1',
      entity: { id: ENTITY, name: 'X' },
      property: { id: 'prop1', name: 'Name', dataType: 'TEXT' },
      spaceId: SOURCE,
    });
    const outgoing = makeRelation({
      id: 'r-out',
      fromEntity: { id: ENTITY, name: null },
      type: { id: 'some-type', name: null },
      toEntity: { id: 'target-entity', name: null, value: 'target-entity' },
      spaceId: SOURCE,
    });
    findOne.mockResolvedValue(makeEntity({ id: ENTITY, values: [value], relations: [outgoing] }));

    await applyIntent({ kind: 'cloneEntityToSpace', entityId: ENTITY, spaceId: SOURCE, targetSpaceId: TARGET }, ctx);

    const valueSets = storage.values.set.mock.calls.map(c => c[0]);
    expect(valueSets.some(v => v.spaceId === TARGET && v.value === 'old')).toBe(true);
    const relSets = storage.relations.set.mock.calls.map(c => c[0]);
    expect(relSets.some(r => r.spaceId === TARGET && r.fromEntity.id === ENTITY)).toBe(true);
    // Source delete must NOT happen for clone.
    expect(storage.values.delete).not.toHaveBeenCalled();
    expect(storage.relations.delete).not.toHaveBeenCalled();
  });

  it('moveEntityToSpace clones AND tombstones source values + outgoing relations', async () => {
    const value = makeValue({
      id: 'v-1',
      entity: { id: ENTITY, name: 'X' },
      spaceId: SOURCE,
    });
    const outgoing = makeRelation({
      id: 'r-out',
      fromEntity: { id: ENTITY, name: null },
      type: { id: 'some-type', name: null },
      toEntity: { id: 'target-entity', name: null, value: 'target-entity' },
      spaceId: SOURCE,
    });
    findOne.mockResolvedValue(makeEntity({ id: ENTITY, values: [value], relations: [outgoing] }));
    localStore.getRelationsToEntity.mockReturnValue([]);

    await applyIntent({ kind: 'moveEntityToSpace', entityId: ENTITY, spaceId: SOURCE, targetSpaceId: TARGET }, ctx);

    // Cloned into target.
    const valueSets = storage.values.set.mock.calls.map(c => c[0]);
    expect(valueSets.some(v => v.spaceId === TARGET)).toBe(true);
    // Source-side tombstoned.
    expect(storage.values.delete).toHaveBeenCalledWith(value);
    expect(storage.relations.delete).toHaveBeenCalledWith(outgoing);
  });

  it('moveEntityToSpace does not tombstone backlinks in OTHER spaces', async () => {
    const otherSpaceBacklink = makeRelation({
      id: 'r-other-space',
      fromEntity: { id: 'unrelated', name: null },
      type: { id: 'mentions', name: null },
      toEntity: { id: ENTITY, name: null, value: ENTITY },
      // Backlink lives in a different space than the move source.
      spaceId: 'pppp3333pppp3333pppp3333pppp3333',
    });
    findOne.mockResolvedValue(makeEntity({ id: ENTITY, values: [], relations: [] }));
    // Space-scoped lookup (the move uses scopeBacklinksToSpace = true) — we
    // verify that ONLY relations matching the source space are returned to
    // the cascade by mocking the 2-arg form.
    localStore.getRelationsToEntity.mockImplementation((_id, scope) => {
      if (scope === SOURCE) return [];
      return [otherSpaceBacklink];
    });

    await applyIntent({ kind: 'moveEntityToSpace', entityId: ENTITY, spaceId: SOURCE, targetSpaceId: TARGET }, ctx);

    expect(storage.relations.delete).not.toHaveBeenCalledWith(otherSpaceBacklink);
  });
});

describe('createTab / renameTab', () => {
  const PARENT = 'pppppppppppppppppppppppppppppppp';
  const SPACE = 'ssssssssssssssssssssssssssssssss';
  const TAB = 'tttttttttttttttttttttttttttttttt';

  it("createTab sets the tab name, the parent's TABS_PROPERTY edge, and a Page type relation", async () => {
    findOne.mockResolvedValue(makeEntity({ id: PARENT, relations: [] }));

    await applyIntent({ kind: 'createTab', parentEntityId: PARENT, spaceId: SPACE, tabId: TAB, name: 'Music' }, ctx);

    expect(storage.entities.name.set).toHaveBeenCalledWith(TAB, SPACE, 'Music');
    const sets = storage.relations.set.mock.calls.map(c => c[0]);
    const tabsEdge = sets.find(r => r.type.id === SystemIds.TABS_PROPERTY);
    const typesEdge = sets.find(r => r.type.id === SystemIds.TYPES_PROPERTY);
    expect(tabsEdge).toMatchObject({
      fromEntity: { id: PARENT },
      toEntity: expect.objectContaining({ id: TAB }),
      spaceId: SPACE,
    });
    expect(typesEdge).toMatchObject({
      fromEntity: { id: TAB },
      toEntity: expect.objectContaining({ id: SystemIds.PAGE_TYPE }),
      spaceId: SPACE,
    });
  });

  it('createTab appends after the last existing tab', async () => {
    const existingTab = makeRelation({
      id: 'r-existing',
      fromEntity: { id: PARENT, name: null },
      type: { id: SystemIds.TABS_PROPERTY, name: 'Tabs' },
      toEntity: { id: 'old-tab', name: null, value: 'old-tab' },
      spaceId: SPACE,
      position: 'a0',
    });
    findOne.mockResolvedValue(makeEntity({ id: PARENT, relations: [existingTab] }));

    await applyIntent({ kind: 'createTab', parentEntityId: PARENT, spaceId: SPACE, tabId: TAB, name: 'New' }, ctx);

    const sets = storage.relations.set.mock.calls.map(c => c[0]);
    const tabsEdge = sets.find(r => r.type.id === SystemIds.TABS_PROPERTY);
    expect(typeof tabsEdge.position).toBe('string');
    // New tab's position keys lexicographically after the existing one (append).
    expect((tabsEdge.position as string) > 'a0').toBe(true);
  });

  it('renameTab calls storage.entities.name.set', async () => {
    await applyIntent({ kind: 'renameTab', tabId: TAB, spaceId: SPACE, name: 'Updates' }, ctx);
    expect(storage.entities.name.set).toHaveBeenCalledWith(TAB, SPACE, 'Updates');
  });
});

describe('deleteEntity', () => {
  const ENTITY = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  const SPACE = 'ssssssssssssssssssssssssssssssss';

  it('returns apply_failed when the entity does not resolve at all', async () => {
    findOne.mockImplementation(async () => null);
    const result = await applyIntent({ kind: 'deleteEntity', entityId: ENTITY, spaceId: SPACE }, ctx);
    expect(result).toMatchObject({ ok: false, error: 'apply_failed' });
    expect(storage.values.delete).not.toHaveBeenCalled();
    expect(storage.relations.delete).not.toHaveBeenCalled();
  });

  it('tombstones values, outgoing relations, and backlinks', async () => {
    const value = makeValue({ id: 'v-1', entity: { id: ENTITY, name: 'X' }, spaceId: SPACE });
    const outgoing = makeRelation({
      id: 'r-out',
      fromEntity: { id: ENTITY, name: null },
      type: { id: 'some-type', name: null },
      toEntity: { id: 'target', name: null, value: 'target' },
      spaceId: SPACE,
    });
    const backlink = makeRelation({
      id: 'r-back',
      fromEntity: { id: 'other-entity', name: null },
      type: { id: 'mentions', name: null },
      toEntity: { id: ENTITY, name: null, value: ENTITY },
      spaceId: SPACE,
    });
    findOne.mockResolvedValue(makeEntity({ id: ENTITY, values: [value], relations: [outgoing] }));
    localStore.getRelationsToEntity.mockImplementation(id => (id === ENTITY ? [backlink] : []));

    const result = await applyIntent({ kind: 'deleteEntity', entityId: ENTITY, spaceId: SPACE }, ctx);

    expect(result).toEqual({ ok: true });
    expect(storage.values.delete).toHaveBeenCalledWith(value);
    expect(storage.relations.delete).toHaveBeenCalledWith(outgoing);
    expect(storage.relations.delete).toHaveBeenCalledWith(backlink);
  });

  it('cascades to orphaned BLOCKS children but spares shared blocks', async () => {
    const ORPHAN_BLOCK = 'aaaa1111aaaa1111aaaa1111aaaa1111';
    const SHARED_BLOCK = 'bbbb2222bbbb2222bbbb2222bbbb2222';
    const orphanEdge = makeRelation({
      id: 'r-orphan-edge',
      fromEntity: { id: ENTITY, name: null },
      type: { id: SystemIds.BLOCKS, name: 'Blocks' },
      toEntity: { id: ORPHAN_BLOCK, name: null, value: ORPHAN_BLOCK },
      spaceId: SPACE,
    });
    const sharedEdge = makeRelation({
      id: 'r-shared-edge',
      fromEntity: { id: ENTITY, name: null },
      type: { id: SystemIds.BLOCKS, name: 'Blocks' },
      toEntity: { id: SHARED_BLOCK, name: null, value: SHARED_BLOCK },
      spaceId: SPACE,
    });
    const externalEdge = makeRelation({
      id: 'r-external',
      fromEntity: { id: 'other-page', name: null },
      type: { id: SystemIds.BLOCKS, name: 'Blocks' },
      toEntity: { id: SHARED_BLOCK, name: null, value: SHARED_BLOCK },
      spaceId: SPACE,
    });
    const orphanValue = makeValue({ id: 'v-orphan', entity: { id: ORPHAN_BLOCK, name: null }, spaceId: SPACE });

    findOne.mockImplementation(async ({ id }) => {
      if (id === ENTITY) {
        return makeEntity({ id: ENTITY, relations: [orphanEdge, sharedEdge] });
      }
      if (id === ORPHAN_BLOCK) {
        return makeEntity({ id: ORPHAN_BLOCK, values: [orphanValue], relations: [] });
      }
      return null;
    });
    localStore.getRelationsToEntity.mockImplementation(id => {
      if (id === ENTITY) return [];
      if (id === ORPHAN_BLOCK) return [orphanEdge];
      if (id === SHARED_BLOCK) return [sharedEdge, externalEdge];
      return [];
    });

    const result = await applyIntent({ kind: 'deleteEntity', entityId: ENTITY, spaceId: SPACE }, ctx);

    expect(result).toEqual({ ok: true });
    expect(storage.relations.delete).toHaveBeenCalledWith(orphanEdge);
    expect(storage.relations.delete).toHaveBeenCalledWith(sharedEdge);
    // Orphan block's value got cascaded; shared block's didn't.
    expect(storage.values.delete).toHaveBeenCalledWith(orphanValue);
  });

  it('handles cycles via the visited set without runaway', async () => {
    const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const aToB = makeRelation({
      id: 'r-a-b',
      fromEntity: { id: A, name: null },
      type: { id: SystemIds.BLOCKS, name: 'Blocks' },
      toEntity: { id: B, name: null, value: B },
      spaceId: SPACE,
    });
    const bToA = makeRelation({
      id: 'r-b-a',
      fromEntity: { id: B, name: null },
      type: { id: SystemIds.BLOCKS, name: 'Blocks' },
      toEntity: { id: A, name: null, value: A },
      spaceId: SPACE,
    });
    findOne.mockImplementation(async ({ id }) => {
      if (id === A) return makeEntity({ id: A, relations: [aToB] });
      if (id === B) return makeEntity({ id: B, relations: [bToA] });
      return null;
    });
    localStore.getRelationsToEntity.mockImplementation(id => {
      if (id === A) return [bToA];
      if (id === B) return [aToB];
      return [];
    });

    const result = await applyIntent({ kind: 'deleteEntity', entityId: A, spaceId: SPACE }, ctx);
    expect(result).toEqual({ ok: true });
  });
});

describe('setDataBlockShownColumns', () => {
  const COL_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const COL_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

  it('tombstones existing SHOWN_COLUMNS / PROPERTIES and sets new ones in order', async () => {
    const blocksEdge = makeRelation({
      id: 'r-blocks',
      entityId: 'block-rel-1',
      fromEntity: { id: 'parent1', name: null },
      toEntity: { id: 'block1', name: null, value: 'block1' },
      type: { id: SystemIds.BLOCKS, name: 'Blocks' },
      spaceId: 'space1',
    });
    const oldShownColumn = makeRelation({
      id: 'r-old-shown',
      entityId: 'old-shown-entity',
      fromEntity: { id: 'block-rel-1', name: null },
      type: { id: SystemIds.SHOWN_COLUMNS, name: null },
      toEntity: { id: 'old-prop', name: null, value: 'old-prop' },
      spaceId: 'space1',
    });
    const oldProperty = makeRelation({
      id: 'r-old-prop',
      entityId: 'old-prop-entity',
      fromEntity: { id: 'block-rel-1', name: null },
      type: { id: SystemIds.PROPERTIES, name: null },
      toEntity: { id: 'old-prop-2', name: null, value: 'old-prop-2' },
      spaceId: 'space1',
    });
    const parentEntity = makeEntity({ id: 'parent1', relations: [blocksEdge] });
    const blockRelationEntity = makeEntity({
      id: 'block-rel-1',
      relations: [oldShownColumn, oldProperty],
    });

    findOne.mockImplementation(async ({ id }) => {
      if (id === 'parent1') return parentEntity;
      if (id === 'block-rel-1') return blockRelationEntity;
      return null;
    });

    await applyIntent(
      {
        kind: 'setDataBlockShownColumns',
        blockId: 'block1',
        parentEntityId: 'parent1',
        spaceId: 'space1',
        propertyIds: [COL_A, COL_B],
      },
      ctx
    );

    expect(storage.relations.delete).toHaveBeenCalledWith(oldShownColumn);
    expect(storage.relations.delete).toHaveBeenCalledWith(oldProperty);
    expect(storage.relations.set).toHaveBeenCalledTimes(2);
    const sets = storage.relations.set.mock.calls.map(c => c[0]);
    expect(sets[0]).toMatchObject({
      type: { id: SystemIds.PROPERTIES },
      fromEntity: { id: 'block-rel-1' },
      toEntity: expect.objectContaining({ id: COL_A }),
      spaceId: 'space1',
    });
    expect(sets[1]).toMatchObject({
      toEntity: expect.objectContaining({ id: COL_B }),
    });
    // Positions strictly ascending so display order matches array order.
    expect(typeof sets[0].position).toBe('string');
    expect(typeof sets[1].position).toBe('string');
    expect((sets[0].position as string) < (sets[1].position as string)).toBe(true);
  });

  it('returns apply_failed when no BLOCKS edge — avoids writing columns onto an unrelated entity', async () => {
    findOne.mockImplementation(async () => null);
    const result = await applyIntent(
      {
        kind: 'setDataBlockShownColumns',
        blockId: 'block1',
        parentEntityId: 'parent1',
        spaceId: 'space1',
        propertyIds: [COL_A],
      },
      ctx
    );
    expect(storage.relations.set).not.toHaveBeenCalled();
    expect(storage.relations.delete).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, error: 'apply_failed' });
  });

  it('returns apply_failed when block-relation entity is missing', async () => {
    const blocksEdge = makeRelation({
      entityId: 'block-rel-1',
      fromEntity: { id: 'parent1', name: null },
      toEntity: { id: 'block1', name: null, value: 'block1' },
      type: { id: SystemIds.BLOCKS, name: 'Blocks' },
      spaceId: 'space1',
    });
    const parentEntity = makeEntity({ id: 'parent1', relations: [blocksEdge] });
    findOne.mockImplementation(async ({ id }) => {
      if (id === 'parent1') return parentEntity;
      return null;
    });

    const result = await applyIntent(
      {
        kind: 'setDataBlockShownColumns',
        blockId: 'block1',
        parentEntityId: 'parent1',
        spaceId: 'space1',
        propertyIds: [COL_A],
      },
      ctx
    );
    expect(storage.relations.set).not.toHaveBeenCalled();
    expect(storage.relations.delete).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, error: 'apply_failed' });
  });

  it('empty propertyIds tombstones existing columns without setting any new ones', async () => {
    const blocksEdge = makeRelation({
      entityId: 'block-rel-1',
      fromEntity: { id: 'parent1', name: null },
      toEntity: { id: 'block1', name: null, value: 'block1' },
      type: { id: SystemIds.BLOCKS, name: 'Blocks' },
      spaceId: 'space1',
    });
    const oldColumn = makeRelation({
      entityId: 'old-shown-entity',
      fromEntity: { id: 'block-rel-1', name: null },
      type: { id: SystemIds.SHOWN_COLUMNS, name: null },
      toEntity: { id: 'old-prop', name: null, value: 'old-prop' },
      spaceId: 'space1',
    });
    const parentEntity = makeEntity({ id: 'parent1', relations: [blocksEdge] });
    const blockRelationEntity = makeEntity({ id: 'block-rel-1', relations: [oldColumn] });
    findOne.mockImplementation(async ({ id }) => {
      if (id === 'parent1') return parentEntity;
      if (id === 'block-rel-1') return blockRelationEntity;
      return null;
    });

    await applyIntent(
      {
        kind: 'setDataBlockShownColumns',
        blockId: 'block1',
        parentEntityId: 'parent1',
        spaceId: 'space1',
        propertyIds: [],
      },
      ctx
    );
    expect(storage.relations.delete).toHaveBeenCalledWith(oldColumn);
    expect(storage.relations.set).not.toHaveBeenCalled();
  });
});

describe('changePropertyDataType', () => {
  it('tombstones existing DATA_TYPE / RENDERABLE_TYPE relations, registers the new dataType, and writes a fresh DATA_TYPE relation', async () => {
    const oldDataType = makeRelation({
      id: 'old-dt',
      type: { id: DATA_TYPE_PROPERTY, name: 'Data Type' },
      fromEntity: { id: 'prop-1', name: 'Prop' },
      toEntity: { id: 'old-tt', name: 'TEXT', value: 'old-tt' },
      spaceId: 'space1',
    });
    const oldRenderable = makeRelation({
      id: 'old-rt',
      type: { id: RENDERABLE_TYPE_PROPERTY, name: 'Renderable Type' },
      fromEntity: { id: 'prop-1', name: 'Prop' },
      toEntity: { id: 'old-rtt', name: null, value: 'old-rtt' },
      spaceId: 'space1',
    });
    findOne.mockResolvedValue(
      makeEntity({
        id: 'prop-1',
        name: 'Prop',
        relations: [oldDataType, oldRenderable],
      })
    );

    const result = await applyIntent(
      {
        kind: 'changePropertyDataType',
        propertyId: 'prop-1',
        propertyName: 'Prop',
        spaceId: 'space1',
        dataType: 'INTEGER',
        renderableTypeId: null,
      },
      ctx
    );

    expect(result).toEqual({ ok: true });
    expect(storage.relations.delete).toHaveBeenCalledWith(oldDataType);
    expect(storage.relations.delete).toHaveBeenCalledWith(oldRenderable);
    expect(storage.properties.setDataType).toHaveBeenCalledWith('prop-1', 'INTEGER');
    // One new DATA_TYPE_PROPERTY relation, no renderable since none was passed.
    const setCalls = storage.relations.set.mock.calls;
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0][0]).toMatchObject({
      type: { id: DATA_TYPE_PROPERTY },
      fromEntity: { id: 'prop-1' },
      spaceId: 'space1',
    });
  });

  it('also writes a RENDERABLE_TYPE_PROPERTY relation when renderableTypeId is provided', async () => {
    findOne.mockResolvedValue(makeEntity({ id: 'prop-1', name: 'Prop', relations: [] }));

    const result = await applyIntent(
      {
        kind: 'changePropertyDataType',
        propertyId: 'prop-1',
        propertyName: 'Prop',
        spaceId: 'space1',
        dataType: 'TEXT',
        renderableTypeId: SystemIds.URL,
      },
      ctx
    );

    expect(result).toEqual({ ok: true });
    const setCalls = storage.relations.set.mock.calls;
    expect(setCalls).toHaveLength(2);
    expect(setCalls[1][0]).toMatchObject({
      type: { id: RENDERABLE_TYPE_PROPERTY },
      fromEntity: { id: 'prop-1' },
      toEntity: { id: SystemIds.URL },
    });
  });

  it('returns apply_failed when the property entity cannot be resolved', async () => {
    findOne.mockResolvedValue(null);
    const result = await applyIntent(
      {
        kind: 'changePropertyDataType',
        propertyId: 'missing',
        propertyName: 'Missing',
        spaceId: 'space1',
        dataType: 'TEXT',
        renderableTypeId: null,
      },
      ctx
    );
    expect(result).toMatchObject({ ok: false, error: 'apply_failed' });
    expect(storage.properties.setDataType).not.toHaveBeenCalled();
    expect(storage.relations.set).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Planning-phase tests: useEditDispatcher reads write tool calls in
// `input-available` state, hits /api/chat/authorize-write, runs planWriteTool,
// applies the intent, and emits the addToolResult callback.
// -----------------------------------------------------------------------------

const ENTITY_ID = '11111111111111111111111111111111';
const SPACE_ID = '22222222222222222222222222222222';
const PROPERTY_ID = '33333333333333333333333333333333';
const TYPE_ID = '44444444444444444444444444444444';
const TARGET_ID = '55555555555555555555555555555555';

type FetchMock = ReturnType<typeof vi.fn>;

function mockAuthorizeFetch(response: { ok: boolean; error?: string; retryAfter?: number }) {
  const fetchMock: FetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => response,
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function makeWriteToolPart(toolName: string, input: Record<string, unknown>, toolCallId = 'tc-1') {
  return {
    type: `tool-${toolName}`,
    toolCallId,
    state: 'input-available',
    input,
  };
}

function makeMessage(parts: ReturnType<typeof makeWriteToolPart>[]): UIMessage {
  return {
    id: 'm-1',
    role: 'assistant',
    parts,
  } as unknown as UIMessage;
}

// Bun's native test runner runs without happy-dom, so renderHook crashes on
// `document is not defined`. Vitest provides the DOM environment and runs
// these. Skip when no DOM is available rather than failing the bun-test run.
const describeWithDom = typeof document === 'undefined' ? describe.skip : describe;

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describeWithDom('useEditDispatcher: planning phase', () => {
  it('setEntityValue against a locally-minted property succeeds end-to-end', async () => {
    // Local store resolves the property (its dataType lives in pendingDataTypes
    // until publish), and E.findOne resolves the entity.
    localStore.getProperty.mockReturnValue({
      id: PROPERTY_ID,
      name: 'Compass orientation',
      dataType: 'TEXT',
    });
    findOne.mockResolvedValueOnce({
      id: ENTITY_ID,
      name: 'Specter',
      description: null,
      spaces: [SPACE_ID],
      types: [],
      relations: [],
      values: [],
    });
    mockAuthorizeFetch({ ok: true });
    const addToolResult = vi.fn();
    const ref = { current: addToolResult };

    const messages: UIMessage[] = [
      makeMessage([
        makeWriteToolPart('setEntityValue', {
          entityId: ENTITY_ID,
          spaceId: SPACE_ID,
          propertyId: PROPERTY_ID,
          value: 'Due north',
        }),
      ]),
    ];
    renderHook(() => useEditDispatcher(messages, ref));
    await waitForFlush();
    await waitFor(() => expect(addToolResult).toHaveBeenCalled());

    expect(addToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'setEntityValue',
        toolCallId: 'tc-1',
        output: expect.objectContaining({
          ok: true,
          intent: expect.objectContaining({ kind: 'setValue', value: 'Due north' }),
        }),
      })
    );
    // Apply happened — value was written to local storage.
    expect(storage.values.set).toHaveBeenCalled();
  });

  it('setEntityRelation against a locally-minted typeId resolves through local store', async () => {
    localStore.getProperty.mockReturnValue({ id: TYPE_ID, name: 'Skills', dataType: 'RELATION' });
    findOne
      .mockResolvedValueOnce({
        id: ENTITY_ID,
        name: 'Specter',
        description: null,
        spaces: [SPACE_ID],
        types: [],
        relations: [],
        values: [],
      })
      .mockResolvedValueOnce({
        id: TARGET_ID,
        name: 'Pattern recognition',
        description: null,
        spaces: [SPACE_ID],
        types: [],
        relations: [],
        values: [],
      });
    mockAuthorizeFetch({ ok: true });
    const addToolResult = vi.fn();
    const ref = { current: addToolResult };

    const messages: UIMessage[] = [
      makeMessage([
        makeWriteToolPart('setEntityRelation', {
          fromEntityId: ENTITY_ID,
          spaceId: SPACE_ID,
          typeId: TYPE_ID,
          toEntityId: TARGET_ID,
        }),
      ]),
    ];
    renderHook(() => useEditDispatcher(messages, ref));
    await waitForFlush();
    await waitFor(() => expect(addToolResult).toHaveBeenCalled());
    expect(addToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({
          ok: true,
          intent: expect.objectContaining({ kind: 'setRelation', typeName: 'Skills' }),
        }),
      })
    );
    expect(storage.relations.set).toHaveBeenCalled();
  });

  it('updateBlock against a locally-staged data block (not in remote graph) succeeds', async () => {
    findOne.mockResolvedValue(null); // staged-block path
    mockAuthorizeFetch({ ok: true });
    const addToolResult = vi.fn();
    const ref = { current: addToolResult };

    const PARENT_ID = '66666666666666666666666666666666';
    const BLOCK_ID = '77777777777777777777777777777777';

    const messages: UIMessage[] = [
      makeMessage([
        makeWriteToolPart('updateBlock', {
          blockId: BLOCK_ID,
          parentEntityId: PARENT_ID,
          spaceId: SPACE_ID,
          blockKind: 'data',
          title: 'Daily observations',
        }),
      ]),
    ];
    renderHook(() => useEditDispatcher(messages, ref));
    await waitForFlush();
    await waitFor(() => expect(addToolResult).toHaveBeenCalled());
    expect(addToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({
          ok: true,
          intent: expect.objectContaining({ kind: 'updateBlock' }),
        }),
      })
    );
  });

  it('forwards an authorize-write rate_limited response without applying', async () => {
    mockAuthorizeFetch({ ok: false, error: 'rate_limited', retryAfter: 5 });
    const addToolResult = vi.fn();
    const ref = { current: addToolResult };

    const messages: UIMessage[] = [
      makeMessage([
        makeWriteToolPart('setEntityValue', {
          entityId: ENTITY_ID,
          spaceId: SPACE_ID,
          propertyId: PROPERTY_ID,
          value: 'x',
        }),
      ]),
    ];
    renderHook(() => useEditDispatcher(messages, ref));
    await waitForFlush();
    await waitFor(() => expect(addToolResult).toHaveBeenCalled());
    expect(addToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({ ok: false, error: 'rate_limited', retryAfter: 5 }),
      })
    );
    expect(storage.values.set).not.toHaveBeenCalled();
  });

  it('forwards a planner not_found without applying', async () => {
    localStore.getProperty.mockReturnValue(null);
    findOne.mockResolvedValue(null);
    getPropertyMock.mockReturnValue({ _tag: 'Failure' }); // any non-Effect won't pollute — we only need it to not throw

    // Override: make the property remote fetch return null so planner returns
    // not_found.
    const { Effect } = await import('effect');
    getPropertyMock.mockReturnValue(Effect.succeed(null));
    getEntityMock.mockReturnValue(Effect.succeed(null));

    mockAuthorizeFetch({ ok: true });
    const addToolResult = vi.fn();
    const ref = { current: addToolResult };

    const messages: UIMessage[] = [
      makeMessage([
        makeWriteToolPart('setEntityValue', {
          entityId: ENTITY_ID,
          spaceId: SPACE_ID,
          propertyId: PROPERTY_ID,
          value: 'x',
        }),
      ]),
    ];
    renderHook(() => useEditDispatcher(messages, ref));
    await waitForFlush();
    await waitFor(() => expect(addToolResult).toHaveBeenCalled());
    expect(addToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({ ok: false, error: 'not_found' }),
      })
    );
    expect(storage.values.set).not.toHaveBeenCalled();
  });

  it('toggleEditMode planning skips spaceId, calls authorize once, applies intent', async () => {
    const fetchMock = mockAuthorizeFetch({ ok: true });
    const addToolResult = vi.fn();
    const ref = { current: addToolResult };

    const messages: UIMessage[] = [makeMessage([makeWriteToolPart('toggleEditMode', { mode: 'edit' })])];
    renderHook(() => useEditDispatcher(messages, ref));
    await waitForFlush();
    await waitFor(() => expect(addToolResult).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(addToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({ ok: true, intent: { kind: 'toggleEditMode', mode: 'edit' } }),
      })
    );
  });

  it('passes a real AbortSignal through to the authorize-write fetch', async () => {
    // PLAN §6.5: stop() / unmount must be able to cancel an in-flight
    // authorize-write fetch. The dispatcher creates a single AbortController
    // per mount and threads its signal into every fetch — no signal means
    // unmount can't abort the network call.
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
      // Capture init for assertion.
      _init: init,
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    localStore.getProperty.mockReturnValue({ id: PROPERTY_ID, name: 'Title', dataType: 'TEXT' });
    findOne.mockResolvedValue({
      id: ENTITY_ID,
      name: 'X',
      description: null,
      spaces: [SPACE_ID],
      types: [],
      relations: [],
      values: [],
    });
    const addToolResult = vi.fn();
    const ref = { current: addToolResult };
    const messages: UIMessage[] = [
      makeMessage([
        makeWriteToolPart('setEntityValue', {
          entityId: ENTITY_ID,
          spaceId: SPACE_ID,
          propertyId: PROPERTY_ID,
          value: 'x',
        }),
      ]),
    ];
    renderHook(() => useEditDispatcher(messages, ref));
    await waitForFlush();
    await waitFor(() => expect(addToolResult).toHaveBeenCalled());
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('treats a non-2xx authorize-write response as lookup_failed', async () => {
    // Defensive: any non-200 response (transport failure, build skew) should
    // surface to the model as lookup_failed, not be silently cast / parsed.
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'internal' }),
    })) as unknown as typeof fetch;
    const addToolResult = vi.fn();
    const ref = { current: addToolResult };
    const messages: UIMessage[] = [
      makeMessage([
        makeWriteToolPart('setEntityValue', {
          entityId: ENTITY_ID,
          spaceId: SPACE_ID,
          propertyId: PROPERTY_ID,
          value: 'x',
        }),
      ]),
    ];
    renderHook(() => useEditDispatcher(messages, ref));
    await waitForFlush();
    await waitFor(() => expect(addToolResult).toHaveBeenCalled());
    expect(addToolResult).toHaveBeenCalledWith(
      expect.objectContaining({ output: expect.objectContaining({ ok: false, error: 'lookup_failed' }) })
    );
    // Validators never run for an auth failure.
    expect(storage.values.set).not.toHaveBeenCalled();
  });

  it('dedupes by toolCallId — the same input-available part is not re-dispatched on rerender', async () => {
    localStore.getProperty.mockReturnValue({ id: PROPERTY_ID, name: 'Title', dataType: 'TEXT' });
    findOne.mockResolvedValue({
      id: ENTITY_ID,
      name: 'X',
      description: null,
      spaces: [SPACE_ID],
      types: [],
      relations: [],
      values: [],
    });
    const fetchMock = mockAuthorizeFetch({ ok: true });
    const addToolResult = vi.fn();
    const ref = { current: addToolResult };

    const messages: UIMessage[] = [
      makeMessage([
        makeWriteToolPart('setEntityValue', {
          entityId: ENTITY_ID,
          spaceId: SPACE_ID,
          propertyId: PROPERTY_ID,
          value: 'one',
        }),
      ]),
    ];
    const { rerender } = renderHook(({ msgs }: { msgs: UIMessage[] }) => useEditDispatcher(msgs, ref), {
      initialProps: { msgs: messages },
    });
    rerender({ msgs: [...messages] });
    await waitForFlush();
    await waitFor(() => expect(addToolResult).toHaveBeenCalled());
    expect(fetchMock.mock.calls.length).toBe(1);
    expect(addToolResult.mock.calls.length).toBe(1);
  });
});

// Reference React to keep the import live for JSX-free tests.
void React;
