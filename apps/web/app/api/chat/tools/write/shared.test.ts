import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as Effect from 'effect/Effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WriteContext } from './context';
import { isEntityId, normalizeEntityId, resolveBlocksEdge } from './shared';

const getEntityMock = vi.fn();
vi.mock('~/core/io/queries', () => ({ getEntity: (...args: unknown[]) => getEntityMock(...args) }));

describe('isEntityId', () => {
  it('accepts a 32-char dashless lowercase hex id', () => {
    expect(isEntityId('a126ca530c8e48d5b88882c734c38935')).toBe(true);
  });

  it('accepts a dashed uuid', () => {
    expect(isEntityId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('rejects uppercase by coercing to case-insensitive match', () => {
    expect(isEntityId('A126CA530C8E48D5B88882C734C38935')).toBe(true);
  });

  it('rejects arbitrary strings', () => {
    expect(isEntityId('hello')).toBe(false);
    expect(isEntityId('')).toBe(false);
    expect(isEntityId('a'.repeat(31))).toBe(false);
    expect(isEntityId('a'.repeat(33))).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isEntityId(null)).toBe(false);
    expect(isEntityId(undefined)).toBe(false);
    expect(isEntityId(1234)).toBe(false);
    expect(isEntityId({})).toBe(false);
  });
});

describe('normalizeEntityId', () => {
  it('strips dashes from a UUID', () => {
    expect(normalizeEntityId('550e8400-e29b-41d4-a716-446655440000')).toBe('550e8400e29b41d4a716446655440000');
  });

  it('lowercases uppercase hex', () => {
    expect(normalizeEntityId('A126CA530C8E48D5B88882C734C38935')).toBe('a126ca530c8e48d5b88882c734c38935');
  });

  it('is idempotent on already-normalized ids', () => {
    const id = 'a126ca530c8e48d5b88882c734c38935';
    expect(normalizeEntityId(id)).toBe(id);
  });
});

describe('resolveBlocksEdge', () => {
  const PARENT = '11111111111111111111111111111111';
  const BLOCK = '22222222222222222222222222222222';
  const SPACE = '33333333333333333333333333333333';

  function memberContext(mintedBlockIds = new Set<string>()): WriteContext {
    return {
      kind: 'member',
      walletAddress: '0xabc',
      personalSpaceId: async () => null,
      isMember: async () => true,
      checkEditRateLimit: async () => ({ ok: true }),
      mintedBlockIds,
    };
  }

  beforeEach(() => {
    getEntityMock.mockReset();
  });

  function makeBlockEntity() {
    return {
      id: BLOCK,
      name: 'Block',
      description: null,
      spaces: [SPACE],
      types: [],
      values: [],
      relations: [],
    };
  }

  it('returns null when the parent has a BLOCKS edge to the block', async () => {
    getEntityMock.mockImplementation((id: string) => {
      if (id === PARENT) {
        return Effect.succeed({
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
        });
      }
      if (id === BLOCK) return Effect.succeed(makeBlockEntity());
      return Effect.succeed(null);
    });
    const result = await resolveBlocksEdge(memberContext(), PARENT, BLOCK, SPACE);
    expect(result).toBeNull();
  });

  it('returns not_found when the parent exists but has no BLOCKS edge to the block', async () => {
    // Block IS in the graph — this is the canonical wrong-parent bug we want
    // to catch. (When the block is NOT in the graph we trust the caller; see
    // the staged-block test below.)
    getEntityMock.mockImplementation((id: string) => {
      if (id === PARENT) {
        return Effect.succeed({
          id: PARENT,
          name: 'Parent',
          description: null,
          spaces: [SPACE],
          types: [],
          values: [],
          relations: [],
        });
      }
      if (id === BLOCK) return Effect.succeed(makeBlockEntity());
      return Effect.succeed(null);
    });
    const result = await resolveBlocksEdge(memberContext(), PARENT, BLOCK, SPACE);
    expect(result).toMatchObject({ ok: false, error: 'not_found', entityId: BLOCK });
  });

  it('proceeds when the block is not in the live graph (cross-session staged block)', async () => {
    // Block was minted by createBlock in a previous chat turn and is staged
    // in the user's local store but not yet published. The client dispatcher
    // resolves merged local+remote state correctly, so trusting the caller
    // is safe — and rejecting would block legitimate setDataBlockView /
    // moveBlock / etc. calls on staged blocks across chat turns.
    getEntityMock.mockImplementation((id: string) => {
      if (id === PARENT) {
        return Effect.succeed({
          id: PARENT,
          name: 'Parent',
          description: null,
          spaces: [SPACE],
          types: [],
          values: [],
          relations: [],
        });
      }
      // Block isn't published — getEntity returns null.
      return Effect.succeed(null);
    });
    const result = await resolveBlocksEdge(memberContext(), PARENT, BLOCK, SPACE);
    expect(result).toBeNull();
  });

  it('returns not_found when the parent entity itself is missing AND block resolves', async () => {
    getEntityMock.mockImplementation((id: string) => {
      if (id === BLOCK) return Effect.succeed(makeBlockEntity());
      return Effect.succeed(null);
    });
    const result = await resolveBlocksEdge(memberContext(), PARENT, BLOCK, SPACE);
    expect(result).toMatchObject({ ok: false, error: 'not_found', entityId: PARENT });
  });

  it('returns lookup_failed when the query throws', async () => {
    getEntityMock.mockImplementation(() => Effect.fail(new Error('boom')));
    const result = await resolveBlocksEdge(memberContext(), PARENT, BLOCK, SPACE);
    expect(result).toMatchObject({ ok: false, error: 'lookup_failed' });
  });

  it('skips the graph lookup for blocks minted earlier in the same request', async () => {
    getEntityMock.mockImplementation(() => {
      throw new Error('should not be called — minted blocks short-circuit');
    });
    const minted = new Set([BLOCK]);
    const result = await resolveBlocksEdge(memberContext(minted), PARENT, BLOCK, SPACE);
    expect(result).toBeNull();
  });

  it('ignores tombstoned BLOCKS edges', async () => {
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
            isDeleted: true,
          },
        ],
      })
    );
    const result = await resolveBlocksEdge(memberContext(), PARENT, BLOCK, SPACE);
    expect(result).toMatchObject({ ok: false, error: 'not_found' });
  });
});
