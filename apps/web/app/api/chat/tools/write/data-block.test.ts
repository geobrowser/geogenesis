import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as Effect from 'effect/Effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WriteContext } from './context';
import {
  buildAddCollectionItemTool,
  buildRemoveCollectionItemTool,
  buildSetDataBlockFiltersTool,
  buildSetDataBlockViewTool,
} from './data-block';

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
});

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

const BLOCK = '11111111111111111111111111111111';
const PARENT = '22222222222222222222222222222222';
const SPACE = '33333333333333333333333333333333';

describe('setDataBlockView', () => {
  it('emits an intent with parentEntityId for the client to resolve', async () => {
    mockParentWithBlocksEdge({ parentId: PARENT, blockId: BLOCK, spaceId: SPACE });
    const tool = buildSetDataBlockViewTool(memberContext());
    const output = await runTool(tool, { blockId: BLOCK, parentEntityId: PARENT, spaceId: SPACE, view: 'GALLERY' });
    expect(output).toEqual({
      ok: true,
      intent: {
        kind: 'setDataBlockView',
        blockId: BLOCK,
        parentEntityId: PARENT,
        spaceId: SPACE,
        view: 'GALLERY',
      },
    });
  });

  it('accepts same-turn minted blocks without hitting GraphQL', async () => {
    // A block staged by createBlock earlier in the same request isn't yet in
    // the live graph; the mintedBlockIds short-circuit lets view changes on it
    // succeed without a spurious BLOCKS-edge lookup.
    getEntityMock.mockImplementation(() => {
      throw new Error('should not be called for minted blocks');
    });
    const context = memberContext();
    context.mintedBlockIds.add(BLOCK);
    const tool = buildSetDataBlockViewTool(context);
    const output = await runTool(tool, { blockId: BLOCK, parentEntityId: PARENT, spaceId: SPACE, view: 'TABLE' });
    expect(output).toMatchObject({ ok: true });
  });

  it('rejects with not_found when the block is not under the given parent', async () => {
    getEntityMock.mockImplementation(() =>
      Effect.succeed({
        id: PARENT,
        name: 'Unrelated entity',
        description: null,
        spaces: [SPACE],
        types: [],
        values: [],
        relations: [],
      })
    );
    const tool = buildSetDataBlockViewTool(memberContext());
    const output = (await runTool(tool, {
      blockId: BLOCK,
      parentEntityId: PARENT,
      spaceId: SPACE,
      view: 'TABLE',
    })) as { ok: false; error: string };
    expect(output.ok).toBe(false);
    expect(output.error).toBe('not_found');
  });

  it('rejects non-members with not_authorized', async () => {
    const tool = buildSetDataBlockViewTool(memberContext({ isMember: async () => false }));
    const output = await runTool(tool, { blockId: BLOCK, parentEntityId: PARENT, spaceId: SPACE, view: 'LIST' });
    expect(output).toEqual({ ok: false, error: 'not_authorized', spaceId: SPACE });
  });

  it('rejects guest callers with not_signed_in', async () => {
    const tool = buildSetDataBlockViewTool(guestContext());
    const output = await runTool(tool, { blockId: BLOCK, parentEntityId: PARENT, spaceId: SPACE, view: 'LIST' });
    expect(output).toEqual({ ok: false, error: 'not_signed_in' });
  });

  it('rejects invalid ids', async () => {
    const tool = buildSetDataBlockViewTool(memberContext());
    const output = await runTool(tool, {
      blockId: 'not-a-valid-id',
      parentEntityId: PARENT,
      spaceId: SPACE,
      view: 'TABLE',
    });
    expect(output).toMatchObject({ ok: false, error: 'invalid_input' });
  });
});

describe('setDataBlockFilters', () => {
  it('emits a setDataBlockFilters intent with normalized ids', async () => {
    mockParentWithBlocksEdge({ parentId: PARENT, blockId: BLOCK, spaceId: SPACE });
    const tool = buildSetDataBlockFiltersTool(memberContext());
    const output = await runTool(tool, {
      blockId: BLOCK,
      parentEntityId: PARENT,
      spaceId: SPACE,
      filters: [{ columnId: SystemIds.TYPES_PROPERTY, valueType: 'RELATION', value: PARENT }],
    });
    expect(output).toMatchObject({
      ok: true,
      intent: {
        kind: 'setDataBlockFilters',
        blockId: BLOCK,
        spaceId: SPACE,
        modesByColumn: {},
        filters: [
          expect.objectContaining({
            columnId: SystemIds.TYPES_PROPERTY,
            valueType: 'RELATION',
            value: PARENT,
          }),
        ],
      },
    });
  });

  it('accepts an empty filter list (used to clear filters)', async () => {
    mockParentWithBlocksEdge({ parentId: PARENT, blockId: BLOCK, spaceId: SPACE });
    const tool = buildSetDataBlockFiltersTool(memberContext());
    const output = await runTool(tool, { blockId: BLOCK, parentEntityId: PARENT, spaceId: SPACE, filters: [] });
    expect(output).toMatchObject({ ok: true, intent: { kind: 'setDataBlockFilters', filters: [] } });
  });

  it('rejects non-members with not_authorized', async () => {
    const tool = buildSetDataBlockFiltersTool(memberContext({ isMember: async () => false }));
    const output = await runTool(tool, {
      blockId: BLOCK,
      parentEntityId: PARENT,
      spaceId: SPACE,
      filters: [],
    });
    expect(output).toEqual({ ok: false, error: 'not_authorized', spaceId: SPACE });
  });

  it('rejects when the block is not under the claimed parent', async () => {
    // Both parent and block resolve, but the parent has no BLOCKS edge to the
    // block — typical when the model passes a wrong parentEntityId.
    const OTHER_BLOCK = '44444444444444444444444444444444';
    getEntityMock.mockImplementation((id: string) =>
      id === PARENT
        ? Effect.succeed({
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
                toEntity: { id: OTHER_BLOCK, name: null, value: OTHER_BLOCK },
                type: { id: SystemIds.BLOCKS, name: 'Blocks' },
                renderableType: 'RELATION',
              },
            ],
          })
        : Effect.succeed({
            id: BLOCK,
            name: null,
            description: null,
            spaces: [SPACE],
            types: [],
            values: [],
            relations: [],
          })
    );
    const tool = buildSetDataBlockFiltersTool(memberContext());
    const output = await runTool(tool, { blockId: BLOCK, parentEntityId: PARENT, spaceId: SPACE, filters: [] });
    expect(output).toMatchObject({ ok: false, error: 'not_found', entityId: BLOCK });
  });
});

describe('addCollectionItem', () => {
  const TARGET = '99999999999999999999999999999999';

  function mockBlockWithSourceAndTarget(sourceId: string) {
    getEntityMock.mockImplementation((id: string) => {
      if (id === BLOCK) {
        return Effect.succeed({
          id: BLOCK,
          name: 'Cool Stuff',
          description: null,
          spaces: [SPACE],
          types: [],
          values: [],
          relations: [
            {
              id: 'rs',
              entityId: 'res',
              spaceId: SPACE,
              fromEntity: { id: BLOCK, name: null },
              toEntity: { id: sourceId, name: null, value: sourceId },
              type: { id: SystemIds.DATA_SOURCE_TYPE_RELATION_TYPE, name: 'Source type' },
              renderableType: 'RELATION',
            },
          ],
        });
      }
      if (id === TARGET) {
        return Effect.succeed({
          id: TARGET,
          name: 'Bitcoin',
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

  it('emits a setRelation intent with COLLECTION_ITEM_RELATION_TYPE for a COLLECTION block', async () => {
    mockBlockWithSourceAndTarget(SystemIds.COLLECTION_DATA_SOURCE);
    const tool = buildAddCollectionItemTool(memberContext());
    const output = (await runTool(tool, { blockId: BLOCK, entityId: TARGET, spaceId: SPACE })) as {
      ok: true;
      intent: { kind: string; fromEntityId: string; typeId: string; toEntityId: string; toEntityName: string | null };
    };
    expect(output.ok).toBe(true);
    expect(output.intent.kind).toBe('setRelation');
    expect(output.intent.fromEntityId).toBe(BLOCK);
    expect(output.intent.typeId).toBe(SystemIds.COLLECTION_ITEM_RELATION_TYPE);
    expect(output.intent.toEntityId).toBe(TARGET);
    expect(output.intent.toEntityName).toBe('Bitcoin');
  });

  it('rejects with wrong_type when the block is not a COLLECTION source', async () => {
    // The model picked a QUERY-source block — collection items wouldn't render
    // there. Surface the error so the model can switch source first.
    mockBlockWithSourceAndTarget(SystemIds.SPACES_DATA_SOURCE);
    const tool = buildAddCollectionItemTool(memberContext());
    const output = (await runTool(tool, { blockId: BLOCK, entityId: TARGET, spaceId: SPACE })) as {
      ok: false;
      error: string;
    };
    expect(output.ok).toBe(false);
    expect(output.error).toBe('wrong_type');
  });

  it('rejects when the target entity does not exist', async () => {
    getEntityMock.mockImplementation((id: string) => {
      if (id === BLOCK) {
        return Effect.succeed({
          id: BLOCK,
          name: 'Cool Stuff',
          description: null,
          spaces: [SPACE],
          types: [],
          values: [],
          relations: [
            {
              id: 'rs',
              entityId: 'res',
              spaceId: SPACE,
              fromEntity: { id: BLOCK, name: null },
              toEntity: { id: SystemIds.COLLECTION_DATA_SOURCE, name: null, value: SystemIds.COLLECTION_DATA_SOURCE },
              type: { id: SystemIds.DATA_SOURCE_TYPE_RELATION_TYPE, name: 'Source type' },
              renderableType: 'RELATION',
            },
          ],
        });
      }
      return Effect.succeed(null);
    });
    const tool = buildAddCollectionItemTool(memberContext());
    const output = (await runTool(tool, { blockId: BLOCK, entityId: TARGET, spaceId: SPACE })) as {
      ok: false;
      error: string;
      entityId: string;
    };
    expect(output.ok).toBe(false);
    expect(output.error).toBe('not_found');
    expect(output.entityId).toBe(TARGET);
  });

  it('proceeds when the block is not in the live graph (cross-session staged blocks)', async () => {
    // Block was staged in a previous chat turn and not yet published — server
    // can't see it, but the client dispatcher resolves it from local state.
    // Trust the caller and write the relation; the source-type check is best
    // effort (only enforced when the block IS visible in the graph).
    getEntityMock.mockImplementation((id: string) => {
      if (id === TARGET) {
        return Effect.succeed({
          id: TARGET,
          name: 'Bitcoin',
          description: null,
          spaces: [SPACE],
          types: [],
          values: [],
          relations: [],
        });
      }
      // Block lookup returns null — staged but not published.
      return Effect.succeed(null);
    });
    const tool = buildAddCollectionItemTool(memberContext());
    const output = (await runTool(tool, { blockId: BLOCK, entityId: TARGET, spaceId: SPACE })) as {
      ok: true;
      intent: { typeId: string };
    };
    expect(output.ok).toBe(true);
    expect(output.intent.typeId).toBe(SystemIds.COLLECTION_ITEM_RELATION_TYPE);
  });

  it('skips the source-type check for same-turn minted blocks', async () => {
    // Just-created COLLECTION block — its source-type relation isn't on the
    // live graph yet, but we trust createBlock's defaulting.
    getEntityMock.mockImplementation((id: string) => {
      if (id === TARGET) {
        return Effect.succeed({
          id: TARGET,
          name: 'Ethereum',
          description: null,
          spaces: [SPACE],
          types: [],
          values: [],
          relations: [],
        });
      }
      throw new Error(`should not be called for minted block: ${id}`);
    });
    const context = memberContext();
    context.mintedBlockIds.add(BLOCK);
    const tool = buildAddCollectionItemTool(context);
    const output = (await runTool(tool, { blockId: BLOCK, entityId: TARGET, spaceId: SPACE })) as {
      ok: true;
      intent: { typeId: string };
    };
    expect(output.ok).toBe(true);
    expect(output.intent.typeId).toBe(SystemIds.COLLECTION_ITEM_RELATION_TYPE);
  });
});

describe('removeCollectionItem', () => {
  it('emits a deleteRelation intent for the COLLECTION_ITEM relation', async () => {
    const tool = buildRemoveCollectionItemTool(memberContext());
    const output = (await runTool(tool, {
      blockId: BLOCK,
      entityId: PARENT,
      spaceId: SPACE,
    })) as {
      ok: true;
      intent: { kind: string; fromEntityId: string; typeId: string; toEntityId: string };
    };
    expect(output.ok).toBe(true);
    expect(output.intent).toEqual({
      kind: 'deleteRelation',
      fromEntityId: BLOCK,
      spaceId: SPACE,
      typeId: SystemIds.COLLECTION_ITEM_RELATION_TYPE,
      toEntityId: PARENT,
    });
  });

  it('succeeds even when the block is not in the live graph (cross-session staged blocks)', async () => {
    // The block might have been staged in a previous chat turn and not yet
    // published. The dispatcher's deleteRelation no-ops if the relation isn't
    // there, so it's safe to proceed without server-side block validation.
    getEntityMock.mockImplementation(() => Effect.succeed(null));
    const tool = buildRemoveCollectionItemTool(memberContext());
    const output = (await runTool(tool, {
      blockId: BLOCK,
      entityId: PARENT,
      spaceId: SPACE,
    })) as { ok: boolean };
    expect(output.ok).toBe(true);
  });
});
