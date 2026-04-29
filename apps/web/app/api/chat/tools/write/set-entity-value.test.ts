import * as Effect from 'effect/Effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WriteContext } from './context';
import { buildAddPropertyToEntityTool, buildDeleteEntityValueTool, buildSetEntityValueTool } from './set-entity-value';

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

const ENTITY = '11111111111111111111111111111111';
const SPACE = '22222222222222222222222222222222';
const PROPERTY = '33333333333333333333333333333333';

function mockTextProperty() {
  getPropertyMock.mockReturnValue(Effect.succeed({ id: PROPERTY, name: 'Title', dataType: 'TEXT' }));
}

function mockRelationProperty() {
  getPropertyMock.mockReturnValue(Effect.succeed({ id: PROPERTY, name: 'Director', dataType: 'RELATION' }));
}

function mockEntity() {
  getEntityMock.mockReturnValue(
    Effect.succeed({
      id: ENTITY,
      name: 'Movie',
      description: null,
      spaces: [SPACE],
      types: [],
      values: [],
      relations: [],
    })
  );
}

describe('setEntityValue', () => {
  it('emits a setValue intent for a member with a real entity + scalar property', async () => {
    mockTextProperty();
    mockEntity();
    const tool = buildSetEntityValueTool(memberContext());
    const output = await runTool(tool, { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY, value: 'The One' });
    expect(output).toMatchObject({
      ok: true,
      intent: {
        kind: 'setValue',
        entityId: ENTITY,
        spaceId: SPACE,
        propertyId: PROPERTY,
        propertyName: 'Title',
        dataType: 'TEXT',
        value: 'The One',
        entityName: 'Movie',
      },
    });
  });

  it('rejects RELATION-typed properties with wrong_type', async () => {
    mockRelationProperty();
    mockEntity();
    const tool = buildSetEntityValueTool(memberContext());
    const output = await runTool(tool, { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY, value: 'x' });
    expect(output).toMatchObject({ ok: false, error: 'wrong_type' });
  });

  it('returns not_found when the property does not resolve', async () => {
    getPropertyMock.mockReturnValue(Effect.succeed(null));
    mockEntity();
    const tool = buildSetEntityValueTool(memberContext());
    const output = await runTool(tool, { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY, value: 'x' });
    expect(output).toMatchObject({ ok: false, error: 'not_found', propertyId: PROPERTY });
  });

  it('returns not_found when the entity does not resolve in the claimed space', async () => {
    // This guard catches hallucinated / cross-space entity ids — without it
    // the tool would happily stage a value against an id that lives nowhere.
    mockTextProperty();
    getEntityMock.mockReturnValue(Effect.succeed(null));
    const tool = buildSetEntityValueTool(memberContext());
    const output = await runTool(tool, { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY, value: 'x' });
    expect(output).toMatchObject({ ok: false, error: 'not_found', entityId: ENTITY });
  });

  it('returns lookup_failed on graph errors', async () => {
    mockTextProperty();
    getEntityMock.mockReturnValue(Effect.fail(new Error('boom')));
    const tool = buildSetEntityValueTool(memberContext());
    const output = await runTool(tool, { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY, value: 'x' });
    expect(output).toMatchObject({ ok: false, error: 'lookup_failed' });
  });

  it('rejects values longer than the cap', async () => {
    const tool = buildSetEntityValueTool(memberContext());
    const big = 'a'.repeat(10_001);
    const output = await runTool(tool, { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY, value: big });
    expect(output).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('rejects non-members with not_authorized', async () => {
    const tool = buildSetEntityValueTool(memberContext({ isMember: async () => false }));
    const output = await runTool(tool, { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY, value: 'x' });
    expect(output).toEqual({ ok: false, error: 'not_authorized', spaceId: SPACE });
  });

  it('rejects guests with not_signed_in', async () => {
    const tool = buildSetEntityValueTool(guestContext());
    const output = await runTool(tool, { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY, value: 'x' });
    expect(output).toEqual({ ok: false, error: 'not_signed_in' });
  });
});

describe('deleteEntityValue', () => {
  it('emits a deleteValue intent for a member', async () => {
    const tool = buildDeleteEntityValueTool(memberContext());
    const output = await runTool(tool, { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY });
    expect(output).toEqual({
      ok: true,
      intent: { kind: 'deleteValue', entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY },
    });
  });

  it('rejects non-members with not_authorized', async () => {
    const tool = buildDeleteEntityValueTool(memberContext({ isMember: async () => false }));
    const output = await runTool(tool, { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY });
    expect(output).toEqual({ ok: false, error: 'not_authorized', spaceId: SPACE });
  });
});

describe('addPropertyToEntity', () => {
  it('emits a setValue intent with the initialValue', async () => {
    mockTextProperty();
    mockEntity();
    const tool = buildAddPropertyToEntityTool(memberContext());
    const output = await runTool(tool, {
      entityId: ENTITY,
      spaceId: SPACE,
      propertyId: PROPERTY,
      initialValue: 'Hi',
    });
    expect(output).toMatchObject({ ok: true, intent: { kind: 'setValue', value: 'Hi' } });
  });

  it('defaults value to empty string when no initialValue is passed', async () => {
    mockTextProperty();
    mockEntity();
    const tool = buildAddPropertyToEntityTool(memberContext());
    const output = await runTool(tool, { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY });
    expect(output).toMatchObject({ ok: true, intent: { value: '' } });
  });

  it('rejects RELATION-typed properties', async () => {
    mockRelationProperty();
    mockEntity();
    const tool = buildAddPropertyToEntityTool(memberContext());
    const output = await runTool(tool, { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY });
    expect(output).toMatchObject({ ok: false, error: 'wrong_type' });
  });

  it('returns not_found when the entity does not resolve', async () => {
    mockTextProperty();
    getEntityMock.mockReturnValue(Effect.succeed(null));
    const tool = buildAddPropertyToEntityTool(memberContext());
    const output = await runTool(tool, { entityId: ENTITY, spaceId: SPACE, propertyId: PROPERTY });
    expect(output).toMatchObject({ ok: false, error: 'not_found', entityId: ENTITY });
  });
});
