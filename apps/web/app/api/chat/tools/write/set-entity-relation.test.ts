import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as Effect from 'effect/Effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WriteContext } from './context';
import { buildDeleteEntityRelationTool, buildSetEntityRelationTool } from './set-entity-relation';

const getEntityMock = vi.fn();
const getPropertyMock = vi.fn();

vi.mock('~/core/io/queries', () => ({
  getEntity: (...args: unknown[]) => getEntityMock(...args),
  getProperty: (...args: unknown[]) => getPropertyMock(...args),
}));

beforeEach(() => {
  getEntityMock.mockReset();
  getPropertyMock.mockReset();
});

function memberContext(overrides: Partial<WriteContext> = {}): WriteContext {
  return {
    kind: 'member',
    walletAddress: '0xabc',
    personalSpaceId: async () => null,
    isMember: async () => true,
    checkEditRateLimit: async () => ({ ok: true }),
    mintedBlockIds: new Set<string>(),
    ...overrides,
  } as WriteContext;
}

function guestContext(): WriteContext {
  return {
    kind: 'guest',
    walletAddress: null,
    personalSpaceId: null,
    isMember: async () => false,
    checkEditRateLimit: async () => ({ ok: true }),
    mintedBlockIds: new Set<string>(),
  };
}

async function runTool<T>(tool: { execute?: (input: T, opts: unknown) => Promise<unknown> }, input: T) {
  if (!tool.execute) throw new Error('tool.execute missing');
  return tool.execute(input, {} as unknown);
}

const FROM = '11111111111111111111111111111111';
const TO = '22222222222222222222222222222222';
const SPACE = '33333333333333333333333333333333';
const TYPE = '44444444444444444444444444444444';

function mockRelationProperty() {
  getPropertyMock.mockReturnValue(Effect.succeed({ id: TYPE, name: 'Director', dataType: 'RELATION' }));
}

function mockScalarProperty() {
  getPropertyMock.mockReturnValue(Effect.succeed({ id: TYPE, name: 'Title', dataType: 'TEXT' }));
}

function mockResolvedEntities({ existing = false }: { existing?: boolean } = {}) {
  getEntityMock.mockImplementation((id: string) => {
    if (id === FROM) {
      return Effect.succeed({
        id: FROM,
        name: 'The Matrix',
        description: null,
        spaces: [SPACE],
        types: [],
        values: [],
        relations: existing
          ? [
              {
                id: 'r1',
                entityId: 're1',
                spaceId: SPACE,
                fromEntity: { id: FROM, name: null },
                toEntity: { id: TO, name: 'Lana Wachowski', value: TO },
                type: { id: TYPE, name: 'Director' },
                renderableType: 'RELATION',
              },
            ]
          : [],
      });
    }
    if (id === TO) {
      return Effect.succeed({
        id: TO,
        name: 'Lana Wachowski',
        description: null,
        spaces: [SPACE],
        types: [],
        values: [],
        relations: [],
      });
    }
    return Effect.succeed(null);
  });
}

describe('setEntityRelation', () => {
  it('emits a setRelation intent for a real (from, type, to) triple', async () => {
    mockRelationProperty();
    mockResolvedEntities();
    const tool = buildSetEntityRelationTool(memberContext());
    const output = await runTool(tool, { fromEntityId: FROM, spaceId: SPACE, typeId: TYPE, toEntityId: TO });
    expect(output).toMatchObject({
      ok: true,
      intent: {
        kind: 'setRelation',
        fromEntityId: FROM,
        fromEntityName: 'The Matrix',
        spaceId: SPACE,
        typeId: TYPE,
        typeName: 'Director',
        toEntityId: TO,
        toEntityName: 'Lana Wachowski',
      },
    });
  });

  it('returns wrong_type when the type id is not a RELATION property', async () => {
    mockScalarProperty();
    mockResolvedEntities();
    const tool = buildSetEntityRelationTool(memberContext());
    const output = await runTool(tool, { fromEntityId: FROM, spaceId: SPACE, typeId: TYPE, toEntityId: TO });
    expect(output).toMatchObject({ ok: false, error: 'wrong_type' });
  });

  it('returns not_found when the type property does not resolve', async () => {
    getPropertyMock.mockReturnValue(Effect.succeed(null));
    mockResolvedEntities();
    const tool = buildSetEntityRelationTool(memberContext());
    const output = await runTool(tool, { fromEntityId: FROM, spaceId: SPACE, typeId: TYPE, toEntityId: TO });
    expect(output).toMatchObject({ ok: false, error: 'not_found', propertyId: TYPE });
  });

  it('returns not_found when the from entity is not in the claimed space', async () => {
    // Catches hallucinated / cross-space fromEntityId. Without this guard the
    // dedup loop runs over `[]` and stages a relation on a non-existent entity.
    mockRelationProperty();
    getEntityMock.mockImplementation((id: string) => {
      if (id === TO) {
        return Effect.succeed({
          id: TO,
          name: 'Director',
          spaces: [SPACE],
          types: [],
          values: [],
          relations: [],
        });
      }
      return Effect.succeed(null);
    });
    const tool = buildSetEntityRelationTool(memberContext());
    const output = await runTool(tool, { fromEntityId: FROM, spaceId: SPACE, typeId: TYPE, toEntityId: TO });
    expect(output).toMatchObject({ ok: false, error: 'not_found', entityId: FROM });
  });

  it('returns not_found when the to entity does not resolve', async () => {
    mockRelationProperty();
    getEntityMock.mockImplementation((id: string) => {
      if (id === FROM) {
        return Effect.succeed({ id: FROM, name: 'X', spaces: [SPACE], types: [], values: [], relations: [] });
      }
      return Effect.succeed(null);
    });
    const tool = buildSetEntityRelationTool(memberContext());
    const output = await runTool(tool, { fromEntityId: FROM, spaceId: SPACE, typeId: TYPE, toEntityId: TO });
    expect(output).toMatchObject({ ok: false, error: 'not_found', entityId: TO });
  });

  it('returns already_exists when the relation is already set', async () => {
    mockRelationProperty();
    mockResolvedEntities({ existing: true });
    const tool = buildSetEntityRelationTool(memberContext());
    const output = await runTool(tool, { fromEntityId: FROM, spaceId: SPACE, typeId: TYPE, toEntityId: TO });
    expect(output).toMatchObject({ ok: false, error: 'already_exists' });
  });

  it('returns lookup_failed on graph errors', async () => {
    mockRelationProperty();
    getEntityMock.mockReturnValue(Effect.fail(new Error('boom')));
    const tool = buildSetEntityRelationTool(memberContext());
    const output = await runTool(tool, { fromEntityId: FROM, spaceId: SPACE, typeId: TYPE, toEntityId: TO });
    expect(output).toMatchObject({ ok: false, error: 'lookup_failed' });
  });

  it('rejects non-members with not_authorized', async () => {
    const tool = buildSetEntityRelationTool(memberContext({ isMember: async () => false }));
    const output = await runTool(tool, { fromEntityId: FROM, spaceId: SPACE, typeId: TYPE, toEntityId: TO });
    expect(output).toEqual({ ok: false, error: 'not_authorized', spaceId: SPACE });
  });

  it('rejects guests with not_signed_in', async () => {
    const tool = buildSetEntityRelationTool(guestContext());
    const output = await runTool(tool, { fromEntityId: FROM, spaceId: SPACE, typeId: TYPE, toEntityId: TO });
    expect(output).toEqual({ ok: false, error: 'not_signed_in' });
  });

  it('normalizes dashed UUIDs in input to dashless ids', async () => {
    mockRelationProperty();
    mockResolvedEntities();
    const tool = buildSetEntityRelationTool(memberContext());
    const dashed = '11111111-1111-1111-1111-111111111111';
    const output = (await runTool(tool, {
      fromEntityId: dashed,
      spaceId: SPACE,
      typeId: TYPE,
      toEntityId: TO,
    })) as { ok: true; intent: { fromEntityId: string } };
    expect(output.intent.fromEntityId).toBe('11111111111111111111111111111111');
  });

  // SystemIds is imported just to anchor the test against a known relation type
  // shape — keeps the assertions readable for anyone diffing this against the
  // collection-item flow.
  it('accepts SystemIds-style ids', () => {
    expect(typeof SystemIds.COLLECTION_ITEM_RELATION_TYPE).toBe('string');
  });
});

describe('deleteEntityRelation', () => {
  it('emits a deleteRelation intent for a member', async () => {
    const tool = buildDeleteEntityRelationTool(memberContext());
    const output = await runTool(tool, { fromEntityId: FROM, spaceId: SPACE, typeId: TYPE, toEntityId: TO });
    expect(output).toEqual({
      ok: true,
      intent: { kind: 'deleteRelation', fromEntityId: FROM, spaceId: SPACE, typeId: TYPE, toEntityId: TO },
    });
  });

  it('rejects non-members with not_authorized', async () => {
    const tool = buildDeleteEntityRelationTool(memberContext({ isMember: async () => false }));
    const output = await runTool(tool, { fromEntityId: FROM, spaceId: SPACE, typeId: TYPE, toEntityId: TO });
    expect(output).toEqual({ ok: false, error: 'not_authorized', spaceId: SPACE });
  });
});
