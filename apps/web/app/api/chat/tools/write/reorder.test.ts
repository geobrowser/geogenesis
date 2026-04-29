import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as Effect from 'effect/Effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WriteContext } from './context';
import { buildMoveBlockTool, buildMoveRelationTool } from './reorder';

const getEntityMock = vi.fn();
vi.mock('~/core/io/queries', () => ({ getEntity: (...args: unknown[]) => getEntityMock(...args) }));

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

beforeEach(() => {
  getEntityMock.mockReset();
  // Default: return a parent entity whose BLOCKS relations include BLOCK →
  // covers every existing happy-path test unchanged. Tests that need to probe
  // the rejection path override mockImplementation themselves.
  getEntityMock.mockImplementation(() =>
    Effect.succeed({
      id: PARENT,
      name: 'Parent',
      description: null,
      spaces: [SPACE],
      types: [],
      values: [],
      relations: [
        {
          id: 'r1',
          entityId: 're1',
          spaceId: SPACE,
          fromEntity: { id: PARENT, name: null },
          toEntity: { id: BLOCK, name: null, value: BLOCK },
          type: { id: SystemIds.BLOCKS, name: 'Blocks' },
          renderableType: 'RELATION',
        },
      ],
    })
  );
});

async function runTool<T>(tool: { execute?: (input: T, opts: unknown) => Promise<unknown> }, input: T) {
  if (!tool.execute) throw new Error('tool.execute missing');
  return tool.execute(input, {} as unknown);
}

const BLOCK = '11111111111111111111111111111111';
const PARENT = '22222222222222222222222222222222';
const SPACE = '33333333333333333333333333333333';
const REF = '44444444444444444444444444444444';
const FROM = '55555555555555555555555555555555';
const TYPE = '66666666666666666666666666666666';
const TO = '77777777777777777777777777777777';
const REF_TO = '88888888888888888888888888888888';

describe('moveBlock', () => {
  it('builds a moveBlock intent with RelativePosition for first / last', async () => {
    const tool = buildMoveBlockTool(memberContext());
    const first = (await runTool(tool, {
      blockId: BLOCK,
      parentEntityId: PARENT,
      spaceId: SPACE,
      target: 'first',
    })) as { ok: true; intent: { kind: 'moveBlock'; position: { kind: string } } };
    expect(first.intent.position).toEqual({ kind: 'first' });

    const last = (await runTool(tool, {
      blockId: BLOCK,
      parentEntityId: PARENT,
      spaceId: SPACE,
      target: 'last',
    })) as { ok: true; intent: { position: { kind: string } } };
    expect(last.intent.position).toEqual({ kind: 'last' });
  });

  it('builds a moveBlock intent with before/after + referenceBlockId', async () => {
    const tool = buildMoveBlockTool(memberContext());
    const output = (await runTool(tool, {
      blockId: BLOCK,
      parentEntityId: PARENT,
      spaceId: SPACE,
      target: 'before',
      referenceBlockId: REF,
    })) as { ok: true; intent: { position: { kind: string; referenceId: string } } };
    expect(output.intent.position).toEqual({ kind: 'before', referenceId: REF });
  });

  it('requires a referenceBlockId for before/after', async () => {
    const tool = buildMoveBlockTool(memberContext());
    const output = await runTool(tool, {
      blockId: BLOCK,
      parentEntityId: PARENT,
      spaceId: SPACE,
      target: 'after',
    });
    expect(output).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('rejects when referenceBlockId equals the moving block', async () => {
    const tool = buildMoveBlockTool(memberContext());
    const output = await runTool(tool, {
      blockId: BLOCK,
      parentEntityId: PARENT,
      spaceId: SPACE,
      target: 'after',
      referenceBlockId: BLOCK,
    });
    expect(output).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('rejects invalid ids', async () => {
    const tool = buildMoveBlockTool(memberContext());
    const output = await runTool(tool, {
      blockId: 'bad',
      parentEntityId: PARENT,
      spaceId: SPACE,
      target: 'first',
    });
    expect(output).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('rejects non-members', async () => {
    const tool = buildMoveBlockTool(memberContext({ isMember: async () => false }));
    const output = await runTool(tool, {
      blockId: BLOCK,
      parentEntityId: PARENT,
      spaceId: SPACE,
      target: 'first',
    });
    expect(output).toEqual({ ok: false, error: 'not_authorized', spaceId: SPACE });
  });

  it('rejects guests', async () => {
    const tool = buildMoveBlockTool(guestContext());
    const output = await runTool(tool, {
      blockId: BLOCK,
      parentEntityId: PARENT,
      spaceId: SPACE,
      target: 'first',
    });
    expect(output).toEqual({ ok: false, error: 'not_signed_in' });
  });

  it('rejects with not_found when the block is not under the given parent', async () => {
    // Canonical bug: model passes a space-metadata id as parentEntityId; parent
    // exists but has no BLOCKS relation for this block.
    getEntityMock.mockImplementation(() =>
      Effect.succeed({
        id: PARENT,
        name: 'Wrong parent',
        description: null,
        spaces: [SPACE],
        types: [],
        values: [],
        relations: [],
      })
    );
    const tool = buildMoveBlockTool(memberContext());
    const output = (await runTool(tool, {
      blockId: BLOCK,
      parentEntityId: PARENT,
      spaceId: SPACE,
      target: 'first',
    })) as { ok: false; error: string };
    expect(output.ok).toBe(false);
    expect(output.error).toBe('not_found');
  });
});

describe('moveRelation', () => {
  it('builds a moveRelation intent with RelativePosition', async () => {
    const tool = buildMoveRelationTool(memberContext());
    const output = (await runTool(tool, {
      fromEntityId: FROM,
      typeId: TYPE,
      toEntityId: TO,
      spaceId: SPACE,
      target: 'before',
      referenceToEntityId: REF_TO,
    })) as { ok: true; intent: { kind: 'moveRelation'; position: { kind: string; referenceId: string } } };
    expect(output.intent.kind).toBe('moveRelation');
    expect(output.intent.position).toEqual({ kind: 'before', referenceId: REF_TO });
  });

  it('rejects when referenceToEntityId equals toEntityId', async () => {
    const tool = buildMoveRelationTool(memberContext());
    const output = await runTool(tool, {
      fromEntityId: FROM,
      typeId: TYPE,
      toEntityId: TO,
      spaceId: SPACE,
      target: 'after',
      referenceToEntityId: TO,
    });
    expect(output).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('requires a referenceToEntityId for before/after', async () => {
    const tool = buildMoveRelationTool(memberContext());
    const output = await runTool(tool, {
      fromEntityId: FROM,
      typeId: TYPE,
      toEntityId: TO,
      spaceId: SPACE,
      target: 'before',
    });
    expect(output).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('rejects non-members', async () => {
    const tool = buildMoveRelationTool(memberContext({ isMember: async () => false }));
    const output = await runTool(tool, {
      fromEntityId: FROM,
      typeId: TYPE,
      toEntityId: TO,
      spaceId: SPACE,
      target: 'last',
    });
    expect(output).toEqual({ ok: false, error: 'not_authorized', spaceId: SPACE });
  });
});
