// Tests for the client-side write validators / planner — the same surface
// the previous server-side per-tool execute paths used to cover.
//
// Strategy: mock E.findOne (merged-store reader) to return either a Property
// for property lookups or an Entity for entity lookups, and a fake GeoStore
// for the local-first short-circuit path. The validators then run end-to-end
// without a real sync engine.
import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as Effect from 'effect/Effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Entity, Property, Relation } from '~/core/types';

const findOne = vi.fn<(args: { id: string; spaceId?: string }) => Promise<Entity | null>>();
vi.mock('~/core/sync/orm', () => ({ E: { findOne } }));

const getEntityMock = vi.fn();
const getPropertyMock = vi.fn();
const getSpaceMock = vi.fn();
vi.mock('~/core/io/queries', () => ({
  getEntity: (...args: unknown[]) => getEntityMock(...args),
  getProperty: (...args: unknown[]) => getPropertyMock(...args),
  getSpace: (...args: unknown[]) => getSpaceMock(...args),
}));

// Stub the cache: passes through to the queryFn so we can assert it ran when
// we expect the remote fallback to fire.
const cache = {
  fetchQuery: vi.fn(({ queryFn }: { queryKey: unknown[]; queryFn: (ctx: { signal: unknown }) => Promise<unknown> }) =>
    queryFn({ signal: undefined })
  ),
};

// Minimal GeoStore mock — only the methods the validators read.
const localStore = {
  getProperty: vi.fn<(id: string) => Property | null>(),
  getEntity: vi.fn<(id: string) => Entity | null>(),
  getStableDataType: vi.fn<(id: string) => 'TEXT' | 'RELATION' | null>(),
  // Used by planChangePropertyDataType's refuse-if-values guard.
  getValuesByProperty: vi.fn<(id: string, includeDeleted?: boolean) => unknown[]>(() => []),
};

const ctx = { store: localStore as never, cache: cache as never };

const { planWriteTool, resolveProperty, resolveEntity, checkRelationDedup, isEntityId, normalizeEntityId } =
  await import('./write-validators');

const ENTITY = '11111111111111111111111111111111';
const SPACE = '22222222222222222222222222222222';
const PROPERTY = '33333333333333333333333333333333';
const TYPE = '44444444444444444444444444444444';
const TARGET = '55555555555555555555555555555555';
const PARENT = '66666666666666666666666666666666';
const BLOCK = '77777777777777777777777777777777';

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: ENTITY,
    name: 'Entity',
    description: null,
    spaces: [SPACE],
    types: [],
    relations: [],
    values: [],
    ...overrides,
  };
}

function makeRelation(overrides: Partial<Relation> = {}): Relation {
  return {
    id: 'r1',
    entityId: 're1',
    spaceId: SPACE,
    fromEntity: { id: ENTITY, name: null },
    toEntity: { id: TARGET, name: null, value: TARGET },
    type: { id: TYPE, name: null },
    renderableType: 'RELATION',
    ...overrides,
  };
}

beforeEach(() => {
  findOne.mockReset();
  getEntityMock.mockReset();
  getPropertyMock.mockReset();
  getSpaceMock.mockReset();
  // Default: the id under test is NOT a space id. Individual tests that
  // exercise the space-id-vs-entity-id guard override this.
  getSpaceMock.mockReturnValue(Effect.succeed(null));
  cache.fetchQuery.mockClear();
  localStore.getProperty.mockReset();
  localStore.getEntity.mockReset();
  localStore.getStableDataType.mockReset();
  localStore.getValuesByProperty.mockReset();
  localStore.getValuesByProperty.mockReturnValue([]);
});

describe('isEntityId / normalizeEntityId', () => {
  it('accepts dashless and dashed forms case-insensitively', () => {
    expect(isEntityId('a126ca530c8e48d5b88882c734c38935')).toBe(true);
    expect(isEntityId('A126CA530C8E48D5B88882C734C38935')).toBe(true);
    expect(isEntityId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });
  it('strips dashes and lowercases', () => {
    expect(normalizeEntityId('A1B2-c3d4-e5f6-0000-111122223333')).toBe('a1b2c3d4e5f60000111122223333');
  });
});

describe('resolveProperty', () => {
  it('returns the local property when available (covers user-minted properties)', async () => {
    localStore.getProperty.mockReturnValue({ id: PROPERTY, name: 'Compass orientation', dataType: 'TEXT' });
    const result = await resolveProperty(PROPERTY, ctx);
    expect(result).toMatchObject({ id: PROPERTY, dataType: 'TEXT' });
    // No network call when the property is locally minted.
    expect(cache.fetchQuery).not.toHaveBeenCalled();
    expect(getPropertyMock).not.toHaveBeenCalled();
  });

  it('falls back to the remote property when not in the local store', async () => {
    localStore.getProperty.mockReturnValue(null);
    findOne.mockResolvedValueOnce(null);
    getPropertyMock.mockReturnValue(Effect.succeed({ id: PROPERTY, name: 'Title', dataType: 'TEXT' }));
    const result = await resolveProperty(PROPERTY, ctx);
    expect(result).toMatchObject({ id: PROPERTY, name: 'Title', dataType: 'TEXT' });
  });

  it('uses the merged entity name when the dataType is in stableDataTypes (published-but-not-locally-staged)', async () => {
    // Covers the path where the property is published — `E.findOne` returns
    // the entity, `getStableDataType` returns its dataType — and we should
    // construct the Property without burning the remote `getProperty` query.
    localStore.getProperty.mockReturnValue(null);
    findOne.mockResolvedValueOnce({
      id: PROPERTY,
      name: 'Status',
      description: null,
      spaces: [SPACE],
      types: [],
      relations: [],
      values: [],
    });
    localStore.getStableDataType.mockReturnValue('TEXT');
    const result = await resolveProperty(PROPERTY, ctx);
    expect(result).toMatchObject({ id: PROPERTY, name: 'Status', dataType: 'TEXT' });
    // No remote getProperty call — we resolved entirely from the merged ORM.
    expect(getPropertyMock).not.toHaveBeenCalled();
  });

  it('falls through to remote when E.findOne finds the entity but stableDataType is null', async () => {
    localStore.getProperty.mockReturnValue(null);
    findOne.mockResolvedValueOnce({
      id: PROPERTY,
      name: 'NoStableType',
      description: null,
      spaces: [SPACE],
      types: [],
      relations: [],
      values: [],
    });
    localStore.getStableDataType.mockReturnValue(null);
    getPropertyMock.mockReturnValue(Effect.succeed({ id: PROPERTY, name: 'NoStableType', dataType: 'INTEGER' }));
    const result = await resolveProperty(PROPERTY, ctx);
    expect(result).toMatchObject({ id: PROPERTY, dataType: 'INTEGER' });
    expect(getPropertyMock).toHaveBeenCalled();
  });

  it('returns not_found when neither local nor remote resolve', async () => {
    localStore.getProperty.mockReturnValue(null);
    findOne.mockResolvedValueOnce(null);
    getPropertyMock.mockReturnValue(Effect.succeed(null));
    const result = await resolveProperty(PROPERTY, ctx);
    expect(result).toMatchObject({ ok: false, error: 'not_found', propertyId: PROPERTY });
  });

  it('returns lookup_failed when the remote query throws', async () => {
    localStore.getProperty.mockReturnValue(null);
    findOne.mockResolvedValueOnce(null);
    getPropertyMock.mockReturnValue(Effect.fail(new Error('boom')));
    const result = await resolveProperty(PROPERTY, ctx);
    expect(result).toMatchObject({ ok: false, error: 'lookup_failed' });
  });
});

describe('resolveEntity', () => {
  it('returns the merged entity when E.findOne resolves it', async () => {
    findOne.mockResolvedValueOnce(makeEntity({ name: 'Specter' }));
    const result = await resolveEntity(ENTITY, SPACE, ctx);
    expect(result).toMatchObject({ id: ENTITY, name: 'Specter' });
  });

  it('retries without a space scope when the scoped lookup misses', async () => {
    findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(makeEntity({ name: 'NoScope' }));
    const result = await resolveEntity(ENTITY, SPACE, ctx);
    expect(result).toMatchObject({ id: ENTITY, name: 'NoScope' });
    expect(findOne).toHaveBeenCalledTimes(2);
  });

  it('falls through to the remote query when both findOne attempts miss', async () => {
    findOne.mockResolvedValue(null);
    getEntityMock.mockReturnValue(Effect.succeed(makeEntity({ name: 'Remote' })));
    const result = await resolveEntity(ENTITY, SPACE, ctx);
    expect(result).toMatchObject({ id: ENTITY, name: 'Remote' });
  });

  it('returns not_found after every layer misses', async () => {
    findOne.mockResolvedValue(null);
    getEntityMock.mockReturnValue(Effect.succeed(null));
    const result = await resolveEntity(ENTITY, SPACE, ctx);
    expect(result).toMatchObject({ ok: false, error: 'not_found', entityId: ENTITY });
  });
});

describe('checkRelationDedup', () => {
  it('returns duplicate when an active matching relation already exists', () => {
    const entity = makeEntity({ relations: [makeRelation({ type: { id: TYPE, name: null } })] });
    expect(checkRelationDedup(entity, TYPE, TARGET, SPACE)).toBe('duplicate');
  });
  it('ignores tombstoned relations', () => {
    const entity = makeEntity({
      relations: [makeRelation({ type: { id: TYPE, name: null }, isDeleted: true })],
    });
    expect(checkRelationDedup(entity, TYPE, TARGET, SPACE)).toBe('ok');
  });
  it('ignores cross-space relations', () => {
    const entity = makeEntity({
      relations: [makeRelation({ type: { id: TYPE, name: null }, spaceId: 'other-space' })],
    });
    expect(checkRelationDedup(entity, TYPE, TARGET, SPACE)).toBe('ok');
  });
});

describe('planWriteTool: setEntityValue', () => {
  it('emits a setValue intent for a real entity + scalar property', async () => {
    localStore.getProperty.mockReturnValue({ id: PROPERTY, name: 'Title', dataType: 'TEXT' });
    findOne.mockResolvedValueOnce(makeEntity({ name: 'Movie' }));
    const out = await planWriteTool(
      'setEntityValue',
      { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY, value: 'The One' },
      ctx
    );
    expect(out).toMatchObject({
      ok: true,
      intent: { kind: 'setValue', value: 'The One', propertyName: 'Title', dataType: 'TEXT', entityName: 'Movie' },
    });
  });

  it('rejects RELATION-typed properties with wrong_type', async () => {
    localStore.getProperty.mockReturnValue({ id: PROPERTY, name: 'Director', dataType: 'RELATION' });
    findOne.mockResolvedValueOnce(makeEntity());
    const out = await planWriteTool(
      'setEntityValue',
      { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY, value: 'x' },
      ctx
    );
    expect(out).toMatchObject({ ok: false, error: 'wrong_type' });
  });

  it('rejects when the property does not resolve anywhere', async () => {
    localStore.getProperty.mockReturnValue(null);
    findOne.mockResolvedValue(null);
    getPropertyMock.mockReturnValue(Effect.succeed(null));
    const out = await planWriteTool(
      'setEntityValue',
      { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY, value: 'x' },
      ctx
    );
    expect(out).toMatchObject({ ok: false, error: 'not_found', propertyId: PROPERTY });
  });

  it('rejects when the entity does not resolve in the claimed space', async () => {
    localStore.getProperty.mockReturnValue({ id: PROPERTY, name: 'Title', dataType: 'TEXT' });
    findOne.mockResolvedValue(null);
    getEntityMock.mockReturnValue(Effect.succeed(null));
    const out = await planWriteTool(
      'setEntityValue',
      { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY, value: 'x' },
      ctx
    );
    expect(out).toMatchObject({ ok: false, error: 'not_found', entityId: ENTITY });
  });

  it('rejects values longer than the cap', async () => {
    const out = await planWriteTool(
      'setEntityValue',
      { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY, value: 'a'.repeat(10_001) },
      ctx
    );
    expect(out).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('§1 success-criteria case: locally-minted property + locally-minted entity → succeeds', async () => {
    // Both ids are locally minted: store.getProperty resolves the property,
    // E.findOne resolves the entity (covers same-turn createEntity / createProperty).
    localStore.getProperty.mockReturnValue({ id: PROPERTY, name: 'Compass orientation', dataType: 'TEXT' });
    findOne.mockResolvedValueOnce(makeEntity({ name: 'Specter' }));
    const out = await planWriteTool(
      'setEntityValue',
      { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY, value: 'Due north' },
      ctx
    );
    expect(out).toMatchObject({ ok: true, intent: { kind: 'setValue', value: 'Due north' } });
    // No remote getProperty call for a locally-minted property.
    expect(getPropertyMock).not.toHaveBeenCalled();
  });
});

describe('planWriteTool: addPropertyToEntity', () => {
  it('emits a setValue intent with initialValue', async () => {
    localStore.getProperty.mockReturnValue({ id: PROPERTY, name: 'Title', dataType: 'TEXT' });
    findOne.mockResolvedValueOnce(makeEntity());
    const out = await planWriteTool(
      'addPropertyToEntity',
      { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY, initialValue: 'Hi' },
      ctx
    );
    expect(out).toMatchObject({ ok: true, intent: { kind: 'setValue', value: 'Hi' } });
  });

  it('defaults to empty value when no initialValue is passed', async () => {
    localStore.getProperty.mockReturnValue({ id: PROPERTY, name: 'Title', dataType: 'TEXT' });
    findOne.mockResolvedValueOnce(makeEntity());
    const out = await planWriteTool(
      'addPropertyToEntity',
      { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY },
      ctx
    );
    expect(out).toMatchObject({ ok: true, intent: { value: '' } });
  });
});

describe('planWriteTool: setEntityRelation', () => {
  it('emits a setRelation intent for a valid (from, type, to) triple', async () => {
    localStore.getProperty.mockReturnValue({ id: TYPE, name: 'Director', dataType: 'RELATION' });
    findOne
      .mockResolvedValueOnce(makeEntity({ id: ENTITY, name: 'Matrix', relations: [] }))
      .mockResolvedValueOnce(makeEntity({ id: TARGET, name: 'Lana W.' }));
    const out = await planWriteTool(
      'setEntityRelation',
      { fromEntityId: ENTITY, spaceId: SPACE, typeId: TYPE, toEntityId: TARGET },
      ctx
    );
    expect(out).toMatchObject({
      ok: true,
      intent: {
        kind: 'setRelation',
        fromEntityName: 'Matrix',
        toEntityName: 'Lana W.',
        typeName: 'Director',
      },
    });
  });

  it('rejects non-RELATION typeId with wrong_type', async () => {
    localStore.getProperty.mockReturnValue({ id: TYPE, name: 'Title', dataType: 'TEXT' });
    findOne.mockResolvedValue(makeEntity());
    const out = await planWriteTool(
      'setEntityRelation',
      { fromEntityId: ENTITY, spaceId: SPACE, typeId: TYPE, toEntityId: TARGET },
      ctx
    );
    expect(out).toMatchObject({ ok: false, error: 'wrong_type' });
  });

  it('returns already_exists when the relation is already set', async () => {
    localStore.getProperty.mockReturnValue({ id: TYPE, name: 'Director', dataType: 'RELATION' });
    findOne
      .mockResolvedValueOnce(
        makeEntity({
          relations: [
            makeRelation({
              type: { id: TYPE, name: 'Director' },
              toEntity: { id: TARGET, name: null, value: TARGET },
            }),
          ],
        })
      )
      .mockResolvedValueOnce(makeEntity({ id: TARGET, name: 'X' }));
    const out = await planWriteTool(
      'setEntityRelation',
      { fromEntityId: ENTITY, spaceId: SPACE, typeId: TYPE, toEntityId: TARGET },
      ctx
    );
    expect(out).toMatchObject({ ok: false, error: 'already_exists' });
  });

  it('§1 success-criteria case: locally-minted typeId resolves through local store', async () => {
    localStore.getProperty.mockReturnValue({ id: TYPE, name: 'Skills', dataType: 'RELATION' });
    findOne
      .mockResolvedValueOnce(makeEntity({ id: ENTITY, name: 'Specter' }))
      .mockResolvedValueOnce(makeEntity({ id: TARGET, name: 'Pattern recognition' }));
    const out = await planWriteTool(
      'setEntityRelation',
      { fromEntityId: ENTITY, spaceId: SPACE, typeId: TYPE, toEntityId: TARGET },
      ctx
    );
    expect(out).toMatchObject({ ok: true, intent: { kind: 'setRelation', typeName: 'Skills' } });
  });

  it('rejects with not_found when toEntityId is a space id whose home entity is different', async () => {
    // Guards the bug where a `/space/<id>` URL was used as a relation target —
    // the bare space id resolves as an "entity" (the space metadata record),
    // but the actual content lives on the home/topic entity.
    localStore.getProperty.mockReturnValue({ id: TYPE, name: 'Related Spaces', dataType: 'RELATION' });
    findOne
      .mockResolvedValueOnce(makeEntity({ id: ENTITY, name: 'Specter' }))
      .mockResolvedValueOnce(makeEntity({ id: TARGET, name: 'Space record' }));
    getSpaceMock.mockReturnValue(
      Effect.succeed({
        id: TARGET,
        topicId: null,
        // Home entity differs from the space id — this is the misuse case.
        entity: { id: 'b68d8bdbe2054856a9b2575a236c1da3' },
      })
    );
    const out = await planWriteTool(
      'setEntityRelation',
      { fromEntityId: ENTITY, spaceId: SPACE, typeId: TYPE, toEntityId: TARGET },
      ctx
    );
    expect(out).toMatchObject({
      ok: false,
      error: 'not_found',
      message: expect.stringContaining('b68d8bdbe2054856a9b2575a236c1da3'),
    });
  });

  it('passes through when the space id IS the home entity id (legacy spaces)', async () => {
    localStore.getProperty.mockReturnValue({ id: TYPE, name: 'Related Spaces', dataType: 'RELATION' });
    findOne
      .mockResolvedValueOnce(makeEntity({ id: ENTITY, name: 'Specter' }))
      .mockResolvedValueOnce(makeEntity({ id: TARGET, name: 'Legacy Space' }));
    getSpaceMock.mockReturnValue(
      Effect.succeed({
        id: TARGET,
        topicId: null,
        entity: { id: TARGET },
      })
    );
    const out = await planWriteTool(
      'setEntityRelation',
      { fromEntityId: ENTITY, spaceId: SPACE, typeId: TYPE, toEntityId: TARGET },
      ctx
    );
    expect(out).toMatchObject({ ok: true });
  });
});

describe('planWriteTool: setEntityImage', () => {
  const VALID_URL = 'https://example.com/poster.jpg';

  it('emits a setEntityImage intent for a valid RELATION+IMAGE property', async () => {
    localStore.getProperty.mockReturnValue({
      id: PROPERTY,
      name: 'Cover',
      dataType: 'RELATION',
      renderableTypeStrict: 'IMAGE',
    });
    findOne.mockResolvedValueOnce(makeEntity({ name: 'Matrix' }));
    const out = await planWriteTool(
      'setEntityImage',
      { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY, sourceUrl: VALID_URL },
      ctx
    );
    expect(out).toMatchObject({
      ok: true,
      intent: {
        kind: 'setEntityImage',
        entityId: ENTITY,
        entityName: 'Matrix',
        spaceId: SPACE,
        propertyId: PROPERTY,
        propertyName: 'Cover',
        sourceUrl: VALID_URL,
      },
    });
  });

  it('passes through when renderableTypeStrict is unset (legacy image properties)', async () => {
    localStore.getProperty.mockReturnValue({ id: PROPERTY, name: 'Avatar', dataType: 'RELATION' });
    findOne.mockResolvedValueOnce(makeEntity({ name: 'User' }));
    const out = await planWriteTool(
      'setEntityImage',
      { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY, sourceUrl: VALID_URL },
      ctx
    );
    expect(out).toMatchObject({ ok: true, intent: { kind: 'setEntityImage' } });
  });

  it('rejects with invalid when sourceUrl is empty', async () => {
    const out = await planWriteTool(
      'setEntityImage',
      { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY, sourceUrl: '   ' },
      ctx
    );
    expect(out).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(findOne).not.toHaveBeenCalled();
  });

  it('rejects with invalid when sourceUrl is over 4096 chars', async () => {
    const longUrl = `https://example.com/${'a'.repeat(4_100)}.jpg`;
    const out = await planWriteTool(
      'setEntityImage',
      { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY, sourceUrl: longUrl },
      ctx
    );
    expect(out).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it.each([
    ['ftp://example.com/x.jpg'],
    ['file:///etc/passwd'],
    ['javascript:alert(1)'],
    ['data:image/png;base64,abc'],
  ])('rejects non-http/ipfs scheme: %s', async badUrl => {
    const out = await planWriteTool(
      'setEntityImage',
      { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY, sourceUrl: badUrl },
      ctx
    );
    expect(out).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('accepts ipfs:// URLs (already-pinned fast-path)', async () => {
    localStore.getProperty.mockReturnValue({
      id: PROPERTY,
      name: 'Cover',
      dataType: 'RELATION',
      renderableTypeStrict: 'IMAGE',
    });
    findOne.mockResolvedValueOnce(makeEntity({ name: 'Matrix' }));
    const out = await planWriteTool(
      'setEntityImage',
      {
        entityId: ENTITY,
        spaceId: SPACE,
        propertyId: PROPERTY,
        sourceUrl: 'ipfs://bafybeigdyrztktx5jpr3evnpzqpkk4tlxbmnpzqtttttttttttttttttttttt',
      },
      ctx
    );
    expect(out).toMatchObject({ ok: true, intent: { kind: 'setEntityImage' } });
  });

  it('rejects with wrong_type when propertyId is not a RELATION', async () => {
    localStore.getProperty.mockReturnValue({ id: PROPERTY, name: 'Title', dataType: 'TEXT' });
    const out = await planWriteTool(
      'setEntityImage',
      { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY, sourceUrl: VALID_URL },
      ctx
    );
    expect(out).toMatchObject({ ok: false, error: 'wrong_type' });
  });

  it('rejects with wrong_type when renderableTypeStrict is set but not IMAGE', async () => {
    localStore.getProperty.mockReturnValue({
      id: PROPERTY,
      name: 'Director',
      dataType: 'RELATION',
      renderableTypeStrict: 'VIDEO',
    });
    findOne.mockResolvedValueOnce(makeEntity());
    const out = await planWriteTool(
      'setEntityImage',
      { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY, sourceUrl: VALID_URL },
      ctx
    );
    expect(out).toMatchObject({ ok: false, error: 'wrong_type' });
  });

  it('rejects with not_found when entityId is a space id whose home entity differs', async () => {
    localStore.getProperty.mockReturnValue({
      id: PROPERTY,
      name: 'Cover',
      dataType: 'RELATION',
      renderableTypeStrict: 'IMAGE',
    });
    findOne.mockResolvedValueOnce(makeEntity({ name: 'Space record' }));
    getSpaceMock.mockReturnValue(
      Effect.succeed({
        id: ENTITY,
        topicId: null,
        entity: { id: 'b68d8bdbe2054856a9b2575a236c1da3' },
      })
    );
    const out = await planWriteTool(
      'setEntityImage',
      { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY, sourceUrl: VALID_URL },
      ctx
    );
    expect(out).toMatchObject({
      ok: false,
      error: 'not_found',
      message: expect.stringContaining('b68d8bdbe2054856a9b2575a236c1da3'),
    });
  });
});

describe('planWriteTool: deleteEntityValue', () => {
  it('emits a deleteValue intent with no graph lookup', async () => {
    const out = await planWriteTool(
      'deleteEntityValue',
      { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY },
      ctx
    );
    expect(out).toEqual({
      ok: true,
      intent: { kind: 'deleteValue', entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY },
    });
    expect(findOne).not.toHaveBeenCalled();
    expect(getPropertyMock).not.toHaveBeenCalled();
  });
});

describe('planWriteTool: deleteEntityRelation', () => {
  it('emits a deleteRelation intent with no graph lookup', async () => {
    const out = await planWriteTool(
      'deleteEntityRelation',
      { fromEntityId: ENTITY, spaceId: SPACE, typeId: TYPE, toEntityId: TARGET },
      ctx
    );
    expect(out).toEqual({
      ok: true,
      intent: {
        kind: 'deleteRelation',
        fromEntityId: ENTITY,
        spaceId: SPACE,
        typeId: TYPE,
        toEntityId: TARGET,
      },
    });
  });
});

describe('planWriteTool: createEntity', () => {
  it('mints an id, trims name, and forwards typeIds', async () => {
    const out = (await planWriteTool(
      'createEntity',
      { spaceId: SPACE, name: '  Acme Corp.  ', description: 'A company', typeIds: [TYPE] },
      ctx
    )) as { ok: true; intent: { entityId: string; name: string; description?: string; typeIds?: string[] } };
    expect(out.ok).toBe(true);
    expect(out.intent.name).toBe('Acme Corp');
    expect(out.intent.description).toBe('A company.');
    expect(out.intent.typeIds).toEqual([TYPE]);
    expect(out.intent.entityId).toMatch(/^[a-f0-9]{32}$/);
  });

  it('rejects empty name', async () => {
    const out = await planWriteTool('createEntity', { spaceId: SPACE, name: '   ' }, ctx);
    expect(out).toMatchObject({ ok: false, error: 'invalid_input' });
  });
});

describe('planWriteTool: createProperty', () => {
  it('emits a createProperty intent for a TEXT property', async () => {
    const out = (await planWriteTool(
      'createProperty',
      { spaceId: SPACE, name: 'Status', propertyType: 'TEXT' },
      ctx
    )) as {
      ok: true;
      intent: { kind: string; spaceId: string; name: string; dataType: string };
    };
    expect(out.intent).toMatchObject({ kind: 'createProperty', spaceId: SPACE, name: 'Status', dataType: 'TEXT' });
  });
});

describe('planWriteTool: createBlock', () => {
  it('emits createBlock for single-line text', async () => {
    const out = (await planWriteTool(
      'createBlock',
      { parentEntityId: PARENT, spaceId: SPACE, blockKind: 'text', markdown: 'One line.' },
      ctx
    )) as { ok: true; intent: { kind: string; content: { kind: string; markdown: string } } };
    expect(out.intent.kind).toBe('createBlock');
    expect(out.intent.content).toEqual({ kind: 'text', markdown: 'One line.' });
  });

  it('auto-splits multi-line text into createBlocks', async () => {
    const out = (await planWriteTool(
      'createBlock',
      { parentEntityId: PARENT, spaceId: SPACE, blockKind: 'text', markdown: 'a\nb\nc' },
      ctx
    )) as { ok: true; intent: { kind: string; blocks: Array<{ blockId: string; content: { markdown: string } }> } };
    expect(out.intent.kind).toBe('createBlocks');
    expect(out.intent.blocks.map(b => b.content.markdown)).toEqual(['a', 'b', 'c']);
  });

  it('keeps newlines in code blocks (no auto-split)', async () => {
    const out = (await planWriteTool(
      'createBlock',
      { parentEntityId: PARENT, spaceId: SPACE, blockKind: 'code', markdown: 'function f() {\n  return 1;\n}' },
      ctx
    )) as { ok: true; intent: { kind: string; content: { markdown: string } } };
    expect(out.intent.kind).toBe('createBlock');
    expect(out.intent.content.markdown).toBe('function f() {\n  return 1;\n}');
  });
});

describe('planWriteTool: updateBlock', () => {
  it('rejects when the block is not under the given parent', async () => {
    findOne.mockImplementation(async ({ id }) => {
      if (id === PARENT) return makeEntity({ id: PARENT, relations: [] });
      if (id === BLOCK) return makeEntity({ id: BLOCK });
      return null;
    });
    const out = await planWriteTool(
      'updateBlock',
      { blockId: BLOCK, parentEntityId: PARENT, spaceId: SPACE, blockKind: 'text', markdown: 'hi' },
      ctx
    );
    expect(out).toMatchObject({ ok: false, error: 'not_found' });
  });

  it('passes when parent has the BLOCKS edge to the block', async () => {
    const blocksEdge = makeRelation({
      fromEntity: { id: PARENT, name: null },
      toEntity: { id: BLOCK, name: null, value: BLOCK },
      type: { id: SystemIds.BLOCKS, name: 'Blocks' },
    });
    findOne.mockImplementation(async ({ id }) => {
      if (id === PARENT) return makeEntity({ id: PARENT, relations: [blocksEdge] });
      if (id === BLOCK) return makeEntity({ id: BLOCK });
      return null;
    });
    const out = await planWriteTool(
      'updateBlock',
      { blockId: BLOCK, parentEntityId: PARENT, spaceId: SPACE, blockKind: 'text', markdown: 'hi' },
      ctx
    );
    expect(out).toMatchObject({ ok: true, intent: { kind: 'updateBlock' } });
  });

  it('§1 success-criteria case: locally-staged block (not in remote graph) is trusted', async () => {
    // E.findOne returns null for both — block was staged in a previous turn
    // and isn't in the live graph yet. We trust the caller (parity with the
    // server's old short-circuit on mintedBlockIds).
    findOne.mockResolvedValue(null);
    const out = await planWriteTool(
      'updateBlock',
      { blockId: BLOCK, parentEntityId: PARENT, spaceId: SPACE, blockKind: 'data', title: 'Daily observations' },
      ctx
    );
    expect(out).toMatchObject({ ok: true, intent: { kind: 'updateBlock' } });
  });
});

describe('planWriteTool: setDataBlockView / setDataBlockFilters', () => {
  it('setDataBlockView emits an intent for a valid block', async () => {
    findOne.mockResolvedValue(null); // staged block path
    const out = await planWriteTool(
      'setDataBlockView',
      { blockId: BLOCK, parentEntityId: PARENT, spaceId: SPACE, view: 'GALLERY' },
      ctx
    );
    expect(out).toMatchObject({ ok: true, intent: { kind: 'setDataBlockView', view: 'GALLERY' } });
  });

  it('setDataBlockFilters normalizes RELATION columnIds', async () => {
    findOne.mockResolvedValue(null);
    const out = (await planWriteTool(
      'setDataBlockFilters',
      {
        blockId: BLOCK,
        parentEntityId: PARENT,
        spaceId: SPACE,
        filters: [{ columnId: SystemIds.TYPES_PROPERTY, valueType: 'RELATION', value: TARGET }],
      },
      ctx
    )) as { ok: true; intent: { filters: Array<{ valueType: string; value: string }> } };
    expect(out.intent.filters[0]).toMatchObject({ valueType: 'RELATION', value: TARGET });
  });
});

describe('planWriteTool: changePropertyDataType', () => {
  it('emits a changePropertyDataType intent for a property with no values', async () => {
    localStore.getProperty.mockReturnValue({ id: PROPERTY, name: 'Headcount', dataType: 'TEXT' });
    const out = (await planWriteTool(
      'changePropertyDataType',
      { propertyId: PROPERTY, spaceId: SPACE, propertyType: 'INTEGER' },
      ctx
    )) as { ok: true; intent: { kind: string; dataType: string; renderableTypeId: string | null } };
    expect(out.intent.kind).toBe('changePropertyDataType');
    expect(out.intent.dataType).toBe('INTEGER');
    expect(out.intent.renderableTypeId).toBeNull();
  });

  it('returns wrong_type when the property has active values', async () => {
    localStore.getProperty.mockReturnValue({ id: PROPERTY, name: 'Headcount', dataType: 'TEXT' });
    localStore.getValuesByProperty.mockReturnValue([{ id: 'v-1' }, { id: 'v-2' }]);
    const out = await planWriteTool(
      'changePropertyDataType',
      { propertyId: PROPERTY, spaceId: SPACE, propertyType: 'INTEGER' },
      ctx
    );
    expect(out).toMatchObject({ ok: false, error: 'wrong_type' });
  });

  it('preserves the renderableTypeId for non-default mappings (e.g. URL)', async () => {
    localStore.getProperty.mockReturnValue({ id: PROPERTY, name: 'Website', dataType: 'TEXT' });
    const out = (await planWriteTool(
      'changePropertyDataType',
      { propertyId: PROPERTY, spaceId: SPACE, propertyType: 'URL' },
      ctx
    )) as { ok: true; intent: { dataType: string; renderableTypeId: string | null } };
    expect(out.intent.dataType).toBe('TEXT');
    expect(typeof out.intent.renderableTypeId).toBe('string');
  });
});

describe('planWriteTool: deleteProperty', () => {
  it('emits a deleteProperty intent when the target resolves as a property', async () => {
    localStore.getProperty.mockReturnValue({ id: PROPERTY, name: 'Compass orientation', dataType: 'TEXT' });
    const out = await planWriteTool('deleteProperty', { propertyId: PROPERTY, spaceId: SPACE }, ctx);
    expect(out).toMatchObject({ ok: true, intent: { kind: 'deleteProperty', propertyId: PROPERTY } });
  });

  it('refuses when the target is not a property anywhere', async () => {
    localStore.getProperty.mockReturnValue(null);
    findOne.mockResolvedValue(null);
    getPropertyMock.mockReturnValue(Effect.succeed(null));
    const out = await planWriteTool('deleteProperty', { propertyId: PROPERTY, spaceId: SPACE }, ctx);
    expect(out).toMatchObject({ ok: false, error: 'not_found' });
  });
});

describe('planWriteTool: createTab / renameTab', () => {
  it('createTab mints a tabId and returns a createTab intent', async () => {
    const out = (await planWriteTool('createTab', { parentEntityId: PARENT, spaceId: SPACE, name: 'Music' }, ctx)) as {
      ok: true;
      intent: { kind: string; tabId: string; name: string };
    };
    expect(out.intent.kind).toBe('createTab');
    expect(out.intent.name).toBe('Music');
    expect(out.intent.tabId).toMatch(/^[a-f0-9]{32}$/i);
  });

  it('createTab strips trailing periods from the name (parity with createEntity)', async () => {
    const out = (await planWriteTool('createTab', { parentEntityId: PARENT, spaceId: SPACE, name: 'Music.' }, ctx)) as {
      ok: true;
      intent: { name: string };
    };
    expect(out.intent.name).toBe('Music');
  });

  it('createTab rejects empty name', async () => {
    const out = await planWriteTool('createTab', { parentEntityId: PARENT, spaceId: SPACE, name: '   ' }, ctx);
    expect(out).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('renameTab emits a renameTab intent with normalized name', async () => {
    const out = (await planWriteTool('renameTab', { tabId: TARGET, spaceId: SPACE, name: 'Updates' }, ctx)) as {
      ok: true;
      intent: { kind: string; name: string; tabId: string };
    };
    expect(out.intent.kind).toBe('renameTab');
    expect(out.intent.name).toBe('Updates');
    expect(out.intent.tabId).toBe(TARGET);
  });
});

describe('planWriteTool: moveEntityToSpace / cloneEntityToSpace', () => {
  const TARGET_SPACE = '99999999999999999999999999999999';

  it('moveEntityToSpace emits a moveEntityToSpace intent for a real entity', async () => {
    findOne.mockResolvedValue({
      id: ENTITY,
      name: 'Specter',
      description: null,
      spaces: [SPACE],
      types: [],
      relations: [],
      values: [],
    });
    const out = await planWriteTool(
      'moveEntityToSpace',
      { entityId: ENTITY, spaceId: SPACE, targetSpaceId: TARGET_SPACE },
      ctx
    );
    expect(out).toMatchObject({
      ok: true,
      intent: { kind: 'moveEntityToSpace', entityId: ENTITY, spaceId: SPACE, targetSpaceId: TARGET_SPACE },
    });
  });

  it('rejects same-space moves', async () => {
    const out = await planWriteTool(
      'moveEntityToSpace',
      { entityId: ENTITY, spaceId: SPACE, targetSpaceId: SPACE },
      ctx
    );
    expect(out).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('cloneEntityToSpace returns cloneEntityToSpace intent', async () => {
    findOne.mockResolvedValue({
      id: ENTITY,
      name: 'Specter',
      description: null,
      spaces: [SPACE],
      types: [],
      relations: [],
      values: [],
    });
    const out = await planWriteTool(
      'cloneEntityToSpace',
      { entityId: ENTITY, spaceId: SPACE, targetSpaceId: TARGET_SPACE },
      ctx
    );
    expect(out).toMatchObject({
      ok: true,
      intent: { kind: 'cloneEntityToSpace', entityId: ENTITY, spaceId: SPACE, targetSpaceId: TARGET_SPACE },
    });
  });
});

describe('planWriteTool: deleteEntity', () => {
  it('emits a deleteEntity intent without any graph lookup', async () => {
    const out = await planWriteTool('deleteEntity', { entityId: ENTITY, spaceId: SPACE }, ctx);
    expect(out).toMatchObject({
      ok: true,
      intent: { kind: 'deleteEntity', entityId: ENTITY, spaceId: SPACE },
    });
    expect(findOne).not.toHaveBeenCalled();
  });

  it('rejects malformed ids', async () => {
    const out = await planWriteTool('deleteEntity', { entityId: 'not-a-uuid', spaceId: SPACE }, ctx);
    expect(out).toMatchObject({ ok: false, error: 'invalid_input' });
  });
});

describe('planWriteTool: setDataBlockShownColumns', () => {
  const COL_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const COL_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

  it('emits an intent with normalized property ids', async () => {
    findOne.mockResolvedValue(null); // staged block path
    const out = (await planWriteTool(
      'setDataBlockShownColumns',
      { blockId: BLOCK, parentEntityId: PARENT, spaceId: SPACE, propertyIds: [COL_A, COL_B] },
      ctx
    )) as { ok: true; intent: { kind: string; propertyIds: string[] } };
    expect(out.intent.kind).toBe('setDataBlockShownColumns');
    expect(out.intent.propertyIds).toEqual([COL_A, COL_B]);
  });

  it('drops the Name property silently — Name is implicit', async () => {
    findOne.mockResolvedValue(null);
    const out = (await planWriteTool(
      'setDataBlockShownColumns',
      {
        blockId: BLOCK,
        parentEntityId: PARENT,
        spaceId: SPACE,
        propertyIds: [SystemIds.NAME_PROPERTY, COL_A],
      },
      ctx
    )) as { ok: true; intent: { propertyIds: string[] } };
    expect(out.intent.propertyIds).toEqual([COL_A]);
  });

  it('dedupes repeated ids while preserving first-seen order', async () => {
    findOne.mockResolvedValue(null);
    const out = (await planWriteTool(
      'setDataBlockShownColumns',
      { blockId: BLOCK, parentEntityId: PARENT, spaceId: SPACE, propertyIds: [COL_A, COL_B, COL_A] },
      ctx
    )) as { ok: true; intent: { propertyIds: string[] } };
    expect(out.intent.propertyIds).toEqual([COL_A, COL_B]);
  });

  it('rejects when a propertyId is not a valid id', async () => {
    findOne.mockResolvedValue(null);
    const out = await planWriteTool(
      'setDataBlockShownColumns',
      { blockId: BLOCK, parentEntityId: PARENT, spaceId: SPACE, propertyIds: ['not-an-id'] },
      ctx
    );
    expect(out).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('accepts empty propertyIds (hides all columns except Name)', async () => {
    findOne.mockResolvedValue(null);
    const out = (await planWriteTool(
      'setDataBlockShownColumns',
      { blockId: BLOCK, parentEntityId: PARENT, spaceId: SPACE, propertyIds: [] },
      ctx
    )) as { ok: true; intent: { propertyIds: string[] } };
    expect(out.intent.propertyIds).toEqual([]);
  });
});

describe('planWriteTool: addCollectionItem', () => {
  it('rejects when block is not COLLECTION-source', async () => {
    findOne.mockImplementation(async ({ id }) => {
      if (id === BLOCK) {
        return makeEntity({
          id: BLOCK,
          relations: [
            makeRelation({
              fromEntity: { id: BLOCK, name: null },
              type: { id: SystemIds.DATA_SOURCE_TYPE_RELATION_TYPE, name: 'Source' },
              toEntity: {
                id: SystemIds.QUERY_DATA_SOURCE,
                name: null,
                value: SystemIds.QUERY_DATA_SOURCE,
              },
            }),
          ],
        });
      }
      if (id === TARGET) return makeEntity({ id: TARGET, name: 'Bitcoin' });
      return null;
    });
    const out = await planWriteTool('addCollectionItem', { blockId: BLOCK, entityId: TARGET, spaceId: SPACE }, ctx);
    expect(out).toMatchObject({ ok: false, error: 'wrong_type' });
  });

  it('emits a setRelation intent with the COLLECTION_ITEM type for a COLLECTION block', async () => {
    findOne.mockImplementation(async ({ id }) => {
      if (id === BLOCK) {
        return makeEntity({
          id: BLOCK,
          relations: [
            makeRelation({
              fromEntity: { id: BLOCK, name: null },
              type: { id: SystemIds.DATA_SOURCE_TYPE_RELATION_TYPE, name: 'Source' },
              toEntity: {
                id: SystemIds.COLLECTION_DATA_SOURCE,
                name: null,
                value: SystemIds.COLLECTION_DATA_SOURCE,
              },
            }),
          ],
        });
      }
      if (id === TARGET) return makeEntity({ id: TARGET, name: 'Bitcoin' });
      return null;
    });
    const out = (await planWriteTool(
      'addCollectionItem',
      { blockId: BLOCK, entityId: TARGET, spaceId: SPACE },
      ctx
    )) as { ok: true; intent: { kind: string; typeId: string; toEntityName: string | null } };
    expect(out.intent.kind).toBe('setRelation');
    expect(out.intent.typeId).toBe(SystemIds.COLLECTION_ITEM_RELATION_TYPE);
    expect(out.intent.toEntityName).toBe('Bitcoin');
  });

  it('§1 success-criteria case: locally-staged block (not in remote graph) is trusted', async () => {
    findOne.mockImplementation(async ({ id }) => {
      if (id === TARGET) return makeEntity({ id: TARGET, name: 'Pattern recognition' });
      return null; // block isn't in the graph (staged earlier)
    });
    const out = (await planWriteTool(
      'addCollectionItem',
      { blockId: BLOCK, entityId: TARGET, spaceId: SPACE },
      ctx
    )) as { ok: true; intent: { kind: string; typeId: string } };
    expect(out.intent.typeId).toBe(SystemIds.COLLECTION_ITEM_RELATION_TYPE);
  });
});

describe('planWriteTool: removeCollectionItem', () => {
  it('emits a deleteRelation intent without any graph lookup', async () => {
    const out = await planWriteTool('removeCollectionItem', { blockId: BLOCK, entityId: TARGET, spaceId: SPACE }, ctx);
    expect(out).toMatchObject({
      ok: true,
      intent: {
        kind: 'deleteRelation',
        fromEntityId: BLOCK,
        toEntityId: TARGET,
        typeId: SystemIds.COLLECTION_ITEM_RELATION_TYPE,
      },
    });
    expect(findOne).not.toHaveBeenCalled();
  });
});

describe('planWriteTool: moveBlock / moveRelation', () => {
  it('moveBlock requires a referenceBlockId for before/after', async () => {
    const out = await planWriteTool(
      'moveBlock',
      { blockId: BLOCK, parentEntityId: PARENT, spaceId: SPACE, target: 'after' },
      ctx
    );
    expect(out).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('moveBlock builds a position for first / last', async () => {
    findOne.mockResolvedValue(null);
    const out = (await planWriteTool(
      'moveBlock',
      { blockId: BLOCK, parentEntityId: PARENT, spaceId: SPACE, target: 'first' },
      ctx
    )) as { ok: true; intent: { kind: string; position: { kind: string } } };
    expect(out.intent.position).toEqual({ kind: 'first' });
  });

  it('moveRelation requires a different referenceToEntityId', async () => {
    const out = await planWriteTool(
      'moveRelation',
      {
        fromEntityId: ENTITY,
        typeId: TYPE,
        toEntityId: TARGET,
        spaceId: SPACE,
        target: 'after',
        referenceToEntityId: TARGET,
      },
      ctx
    );
    expect(out).toMatchObject({ ok: false, error: 'invalid_input' });
  });
});

describe('planWriteTool: toggleEditMode', () => {
  it('emits a toggleEditMode intent', async () => {
    const out = await planWriteTool('toggleEditMode', { mode: 'edit' }, ctx);
    expect(out).toEqual({ ok: true, intent: { kind: 'toggleEditMode', mode: 'edit' } });
  });
});
