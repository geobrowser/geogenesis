import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as Effect from 'effect/Effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCreateBlockTool, buildDeleteBlockTool, buildUpdateBlockTool } from './blocks';
import type { WriteContext } from './context';

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

// Helper so tests can assert what resolveBlocksEdge sees without re-deriving
// the Effect runtime. The helper wraps a plain value as a synchronous Effect.
function mockParentWithBlocksEdge({
  parentId,
  blockId,
  spaceId,
}: {
  parentId: string;
  blockId: string;
  spaceId: string;
}) {
  getEntityMock.mockImplementation(() =>
    Effect.succeed({
      id: parentId,
      name: 'Parent',
      description: null,
      spaces: [spaceId],
      types: [],
      values: [],
      relations: [
        {
          id: 'r1',
          entityId: 're1',
          spaceId,
          fromEntity: { id: parentId, name: null },
          toEntity: { id: blockId, name: null, value: blockId },
          type: { id: SystemIds.BLOCKS, name: 'Blocks' },
          renderableType: 'RELATION',
        },
      ],
    })
  );
}

async function runTool<T>(tool: { execute?: (input: T, opts: unknown) => Promise<unknown> }, input: T) {
  if (!tool.execute) throw new Error('tool.execute missing');
  return tool.execute(input, {} as unknown);
}

const PARENT = '11111111111111111111111111111111';
const BLOCK = '22222222222222222222222222222222';
const SPACE = '33333333333333333333333333333333';

beforeEach(() => {
  getEntityMock.mockReset();
});

describe('createBlock (data)', () => {
  it('forwards a title when provided', async () => {
    const tool = buildCreateBlockTool(memberContext());
    const output = (await runTool(tool, {
      parentEntityId: PARENT,
      spaceId: SPACE,
      blockKind: 'data',
      source: 'QUERY',
      view: 'GALLERY',
      title: 'People',
    })) as { ok: true; intent: { content: { kind: 'data'; title?: string } } };
    expect(output.ok).toBe(true);
    expect(output.intent.content.title).toBe('People');
  });

  it('omits title when blank so the dispatcher fallback kicks in', async () => {
    const tool = buildCreateBlockTool(memberContext());
    const output = (await runTool(tool, {
      parentEntityId: PARENT,
      spaceId: SPACE,
      blockKind: 'data',
      title: '   ',
    })) as { ok: true; intent: { content: Record<string, unknown> } };
    expect(output.ok).toBe(true);
    expect(output.intent.content).not.toHaveProperty('title');
  });

  it('forwards only the fields the caller set (no default stamping)', async () => {
    // Partial create is unusual, but the helper should still not invent
    // source/view defaults on the server — the dispatcher owns that.
    const tool = buildCreateBlockTool(memberContext());
    const output = (await runTool(tool, {
      parentEntityId: PARENT,
      spaceId: SPACE,
      blockKind: 'data',
      title: 'Reading List',
    })) as { ok: true; intent: { content: Record<string, unknown> } };
    expect(output.ok).toBe(true);
    expect(output.intent.content).toEqual({ kind: 'data', title: 'Reading List' });
  });
});

describe('createBlock (text) auto-split', () => {
  it('splits multi-line text markdown into a createBlocks intent', async () => {
    const tool = buildCreateBlockTool(memberContext());
    const output = (await runTool(tool, {
      parentEntityId: PARENT,
      spaceId: SPACE,
      blockKind: 'text',
      markdown: '**Event:** System initialized\n**Status:** Success\n**Details:** All services started.',
    })) as {
      ok: true;
      intent: { kind: 'createBlocks'; blocks: Array<{ blockId: string; content: { kind: 'text'; markdown: string } }> };
    };
    expect(output.ok).toBe(true);
    expect(output.intent.kind).toBe('createBlocks');
    expect(output.intent.blocks.map(b => b.content.markdown)).toEqual([
      '**Event:** System initialized',
      '**Status:** Success',
      '**Details:** All services started.',
    ]);
    expect(new Set(output.intent.blocks.map(b => b.blockId)).size).toBe(3);
  });

  it('keeps a single createBlock intent when text has no newlines', async () => {
    const tool = buildCreateBlockTool(memberContext());
    const output = (await runTool(tool, {
      parentEntityId: PARENT,
      spaceId: SPACE,
      blockKind: 'text',
      markdown: 'Just one paragraph.',
    })) as { ok: true; intent: { kind: string; content?: { markdown?: string } } };
    expect(output.intent.kind).toBe('createBlock');
    expect(output.intent.content?.markdown).toBe('Just one paragraph.');
  });

  it('preserves newlines in code blocks (no auto-split)', async () => {
    const tool = buildCreateBlockTool(memberContext());
    const output = (await runTool(tool, {
      parentEntityId: PARENT,
      spaceId: SPACE,
      blockKind: 'code',
      markdown: 'function foo() {\n  return 1;\n}',
    })) as { ok: true; intent: { kind: string; content?: { markdown?: string } } };
    expect(output.intent.kind).toBe('createBlock');
    expect(output.intent.content?.markdown).toBe('function foo() {\n  return 1;\n}');
  });
});

describe('updateBlock (data) partial updates', () => {
  it('title-only update emits just the title — the dispatcher preserves source', async () => {
    // The bugfix this covers: previously buildContent defaulted missing
    // source to COLLECTION, and the dispatcher would tombstone + rewrite the
    // source relation, silently converting a GEO / QUERY block into a
    // COLLECTION one on a title-only rename.
    mockParentWithBlocksEdge({ parentId: PARENT, blockId: BLOCK, spaceId: SPACE });
    const tool = buildUpdateBlockTool(memberContext());
    const output = (await runTool(tool, {
      blockId: BLOCK,
      parentEntityId: PARENT,
      spaceId: SPACE,
      blockKind: 'data',
      title: 'Geo Spaces Directory',
    })) as { ok: true; intent: { content: Record<string, unknown> } };
    expect(output.ok).toBe(true);
    expect(output.intent.content).toEqual({ kind: 'data', title: 'Geo Spaces Directory' });
  });

  it('source-only update emits just the source', async () => {
    mockParentWithBlocksEdge({ parentId: PARENT, blockId: BLOCK, spaceId: SPACE });
    const tool = buildUpdateBlockTool(memberContext());
    const output = (await runTool(tool, {
      blockId: BLOCK,
      parentEntityId: PARENT,
      spaceId: SPACE,
      blockKind: 'data',
      source: 'GEO',
    })) as { ok: true; intent: { content: Record<string, unknown> } };
    expect(output.ok).toBe(true);
    expect(output.intent.content).toEqual({ kind: 'data', source: 'GEO' });
  });
});

describe('block-edge validation (shared across deleteBlock / updateBlock / etc)', () => {
  it('deleteBlock rejects with not_found when blockId is not a child of parentEntityId', async () => {
    // The canonical production bug: the model passes a space-metadata id as
    // parentEntityId; that entity exists but has no BLOCKS relations to the
    // block. The tool must reject instead of silently returning ok — otherwise
    // the dispatcher tombstones block contents while the real parent's BLOCKS
    // edge survives in the live graph.
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
    const tool = buildDeleteBlockTool(memberContext());
    const output = (await runTool(tool, {
      blockId: BLOCK,
      parentEntityId: PARENT,
      spaceId: SPACE,
    })) as { ok: false; error: string; entityId?: string };
    expect(output.ok).toBe(false);
    expect(output.error).toBe('not_found');
    expect(output.entityId).toBe(BLOCK);
  });

  it('deleteBlock accepts same-turn minted blocks without hitting GraphQL', async () => {
    // Blocks staged by createBlock earlier in the same request live only in
    // local state; the live-graph BLOCKS edge check would falsely fail.
    getEntityMock.mockImplementation(() => {
      throw new Error('should not be called — minted block should short-circuit');
    });
    const context = memberContext();
    context.mintedBlockIds.add(BLOCK);
    const tool = buildDeleteBlockTool(context);
    const output = (await runTool(tool, {
      blockId: BLOCK,
      parentEntityId: PARENT,
      spaceId: SPACE,
    })) as { ok: true };
    expect(output.ok).toBe(true);
  });

  it('deleteBlock returns lookup_failed when the GraphQL query errors', async () => {
    getEntityMock.mockImplementation(() => Effect.fail(new Error('boom')));
    const tool = buildDeleteBlockTool(memberContext());
    const output = (await runTool(tool, {
      blockId: BLOCK,
      parentEntityId: PARENT,
      spaceId: SPACE,
    })) as { ok: false; error: string };
    expect(output.ok).toBe(false);
    expect(output.error).toBe('lookup_failed');
  });

  it('deleteBlock rejects when the parent is missing AND the block resolves', async () => {
    // Parent missing only matters when the block is actually in the graph —
    // otherwise we trust the caller (the block may be staged from a previous
    // session). Here we make the block resolve so the wrong-parent guard fires.
    getEntityMock.mockImplementation((id: string) => {
      if (id === BLOCK) {
        return Effect.succeed({
          id: BLOCK,
          name: 'Block',
          description: null,
          spaces: [SPACE],
          types: [],
          values: [],
          relations: [],
        });
      }
      return Effect.succeed(null);
    });
    const tool = buildDeleteBlockTool(memberContext());
    const output = (await runTool(tool, {
      blockId: BLOCK,
      parentEntityId: PARENT,
      spaceId: SPACE,
    })) as { ok: false; error: string; entityId?: string };
    expect(output.ok).toBe(false);
    expect(output.error).toBe('not_found');
    expect(output.entityId).toBe(PARENT);
  });

  it('deleteBlock accepts a staged block (block not in live graph)', async () => {
    // Cross-session staged-block path: block was minted in a previous chat
    // turn and isn't published yet. The dispatcher resolves merged
    // local+remote state correctly, so trusting the caller is safe.
    getEntityMock.mockImplementation(() => Effect.succeed(null));
    const tool = buildDeleteBlockTool(memberContext());
    const output = (await runTool(tool, {
      blockId: BLOCK,
      parentEntityId: PARENT,
      spaceId: SPACE,
    })) as { ok: true };
    expect(output.ok).toBe(true);
  });

  it('updateBlock rejects with not_found when the block is not under the given parent', async () => {
    getEntityMock.mockImplementation(() =>
      Effect.succeed({
        id: PARENT,
        name: 'Some other entity',
        description: null,
        spaces: [SPACE],
        types: [],
        values: [],
        relations: [],
      })
    );
    const tool = buildUpdateBlockTool(memberContext());
    const output = (await runTool(tool, {
      blockId: BLOCK,
      parentEntityId: PARENT,
      spaceId: SPACE,
      blockKind: 'text',
      markdown: 'hello',
    })) as { ok: false; error: string };
    expect(output.ok).toBe(false);
    expect(output.error).toBe('not_found');
  });
});

describe('createBlock tracks minted ids', () => {
  it('adds the newly minted blockId to context.mintedBlockIds so follow-up intents skip the live-graph check', async () => {
    const context = memberContext();
    const tool = buildCreateBlockTool(context);
    const output = (await runTool(tool, {
      parentEntityId: PARENT,
      spaceId: SPACE,
      blockKind: 'text',
      markdown: '# Hello',
    })) as { ok: true; intent: { blockId: string } };
    expect(output.ok).toBe(true);
    expect(context.mintedBlockIds.has(output.intent.blockId)).toBe(true);
  });
});
