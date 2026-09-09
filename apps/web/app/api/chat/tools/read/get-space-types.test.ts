import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as Effect from 'effect/Effect';

const getAllEntities = vi.fn();
vi.mock('~/core/io/queries', () => ({ getAllEntities: (...args: unknown[]) => getAllEntities(...args) }));

const { getSpaceTypes } = await import('./get-space-types');

const SPACE_ID = 'c9f267dcb0d270718c2a3c45a64afd32';

type Options = Parameters<NonNullable<typeof getSpaceTypes.execute>>[1];
const OPTIONS = { toolCallId: 'call_1', messages: [] } as unknown as Options;

function run(input: { spaceId: string; nameContains?: string; limit?: number }) {
  return getSpaceTypes.execute!(input, OPTIONS);
}

function resolvesWith(entities: Array<{ id: string; name: string | null }>, hasNextPage: boolean) {
  getAllEntities.mockReturnValue(
    Effect.succeed({ entities: entities.map(e => ({ ...e, description: null })), endCursor: null, hasNextPage })
  );
}

beforeEach(() => {
  getAllEntities.mockReset();
});

describe('getSpaceTypes', () => {
  it('reports a truncated list as truncated', async () => {
    // The bug this exists for: a space with 53 types returned 25 of them with
    // no marker, and the assistant answered "there's no News Story type" about
    // a space holding 1,569 news stories. Absence has to be distinguishable
    // from a partial page.
    resolvesWith([{ id: 'a'.repeat(32), name: 'Project' }], true);

    await expect(run({ spaceId: SPACE_ID })).resolves.toMatchObject({ hasMore: true });
  });

  it('takes hasMore from the connection, not from how many rows came back', async () => {
    // A short page is not proof there is nothing more, and a full one is not
    // proof there is. Deriving this from `types.length` would be wrong in both
    // directions — the connection already knows.
    resolvesWith([{ id: 'a'.repeat(32), name: 'Project' }], true);
    await expect(run({ spaceId: SPACE_ID })).resolves.toMatchObject({ hasMore: true });

    resolvesWith(
      Array.from({ length: 50 }, (_, i) => ({ id: i.toString(16).padStart(32, '0'), name: `T${i}` })),
      false
    );
    await expect(run({ spaceId: SPACE_ID })).resolves.toMatchObject({ hasMore: false });
  });

  it('asks for 50 by default rather than 25', async () => {
    // 25 returned under half the types of a real measured space.
    resolvesWith([], false);

    await run({ spaceId: SPACE_ID });

    expect(getAllEntities).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
  });

  it('passes nameContains through as a case-insensitive name filter', async () => {
    // The point of the filter: "is there a News Story type here?" becomes one
    // complete answer instead of a page of a list to read through.
    resolvesWith([{ id: 'a'.repeat(32), name: 'News Story' }], false);

    await run({ spaceId: SPACE_ID, nameContains: 'news' });

    expect(getAllEntities).toHaveBeenCalledWith(
      expect.objectContaining({ filter: { name: { includesInsensitive: 'news' } } })
    );
  });

  it('sends no filter when nameContains is absent or blank', async () => {
    resolvesWith([], false);

    await run({ spaceId: SPACE_ID });
    expect(getAllEntities.mock.calls[0][0]).not.toHaveProperty('filter');

    await run({ spaceId: SPACE_ID, nameContains: '   ' });
    expect(getAllEntities.mock.calls[1][0]).not.toHaveProperty('filter');
  });

  it('rejects a spaceId that is not an id', async () => {
    await expect(run({ spaceId: 'not-a-space' })).resolves.toEqual({ error: 'invalid_input' });
    expect(getAllEntities).not.toHaveBeenCalled();
  });

  it('reports a lookup failure instead of an empty list of types', async () => {
    // An empty list would read as "this space defines no types" — the same
    // false-negative shape, arrived at from a different direction.
    getAllEntities.mockReturnValue(Effect.fail(new Error('network')));

    await expect(run({ spaceId: SPACE_ID })).resolves.toEqual({ error: 'lookup_failed' });
  });
});
