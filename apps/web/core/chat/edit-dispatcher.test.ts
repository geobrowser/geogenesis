import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Entity, Relation, Value } from '~/core/types';

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
  },
  entities: {
    name: {
      set: vi.fn(),
    },
  },
};

vi.mock('~/core/sync/use-mutate', () => ({ storage }));
vi.mock('~/core/sync/use-sync-engine', () => ({ store: {} }));
vi.mock('~/core/query-client', () => ({ queryClient: {} }));
vi.mock('~/core/state/editable-store', () => ({ useEditable: () => ({ setEditable: vi.fn() }) }));

const findOne = vi.fn<(args: { id: string; spaceId?: string }) => Promise<Entity | null>>();
vi.mock('~/core/sync/orm', () => ({ E: { findOne } }));

// Import AFTER the mocks are registered.
const { applyIntent } = await import('./edit-dispatcher');

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
});

describe('toggleEditMode', () => {
  it('flips edit mode on', async () => {
    await applyIntent({ kind: 'toggleEditMode', mode: 'edit' }, ctx);
    expect(setEditable).toHaveBeenCalledWith(true);
  });

  it('flips edit mode off', async () => {
    await applyIntent({ kind: 'toggleEditMode', mode: 'browse' }, ctx);
    expect(setEditable).toHaveBeenCalledWith(false);
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

    await applyIntent({ kind: 'deleteValue', entityId: 'entity1', spaceId: 'space1', propertyId: 'prop1' }, ctx);

    expect(storage.values.delete).toHaveBeenCalledWith(value);
  });

  it('no-ops when the value does not exist', async () => {
    findOne.mockResolvedValueOnce(makeEntity({ values: [] }));
    await applyIntent({ kind: 'deleteValue', entityId: 'entity1', spaceId: 'space1', propertyId: 'prop1' }, ctx);
    expect(storage.values.delete).not.toHaveBeenCalled();
  });

  it('ignores deleted values', async () => {
    const tombstoned = makeValue({ property: { id: 'prop1', name: 'Name', dataType: 'TEXT' }, isDeleted: true });
    findOne.mockResolvedValueOnce(makeEntity({ values: [tombstoned] }));
    await applyIntent({ kind: 'deleteValue', entityId: 'entity1', spaceId: 'space1', propertyId: 'prop1' }, ctx);
    expect(storage.values.delete).not.toHaveBeenCalled();
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

  it('ABORTS cleanly when parent has no BLOCKS edge — block contents must be preserved', async () => {
    // Canonical production bug: the model passes a wrong parentEntityId (e.g.
    // the space metadata id on a space-home page). Previously we'd tombstone
    // the block's values + outgoing relations BEFORE discovering no BLOCKS
    // edge, orphaning the block on the live graph. The fix reorders: find the
    // BLOCKS edge first, bail if missing, and leave block contents intact.
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

    await applyIntent({ kind: 'deleteBlock', blockId: 'block1', parentEntityId: 'parent1', spaceId: 'space1' }, ctx);

    expect(storage.values.delete).not.toHaveBeenCalled();
    expect(storage.relations.delete).not.toHaveBeenCalled();
  });

  it('ABORTS cleanly when parent entity cannot be resolved at all', async () => {
    findOne.mockImplementation(async () => null);
    await applyIntent({ kind: 'deleteBlock', blockId: 'block1', parentEntityId: 'parent1', spaceId: 'space1' }, ctx);
    expect(storage.values.delete).not.toHaveBeenCalled();
    expect(storage.relations.delete).not.toHaveBeenCalled();
  });
});

describe('setDataBlockFilters', () => {
  it('aborts when the block entity cannot be resolved (guards against stray FILTER writes)', async () => {
    findOne.mockImplementation(async () => null);
    await applyIntent(
      { kind: 'setDataBlockFilters', blockId: 'block1', spaceId: 'space1', filters: [], modesByColumn: {} },
      ctx
    );
    expect(storage.values.set).not.toHaveBeenCalled();
  });

  it('writes the filter value when the block exists', async () => {
    findOne.mockResolvedValue(makeEntity({ id: 'block1' }));
    await applyIntent(
      { kind: 'setDataBlockFilters', blockId: 'block1', spaceId: 'space1', filters: [], modesByColumn: {} },
      ctx
    );
    expect(storage.values.set).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'space1', entity: { id: 'block1', name: null }, value: '' })
    );
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

  it('aborts when the block-relation entity is missing — avoids dual VIEW relations', async () => {
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

    await applyIntent(
      { kind: 'setDataBlockView', blockId: 'block1', parentEntityId: 'parent1', spaceId: 'space1', view: 'GALLERY' },
      ctx
    );

    expect(storage.relations.delete).not.toHaveBeenCalled();
    expect(storage.relations.set).not.toHaveBeenCalled();
  });
});
