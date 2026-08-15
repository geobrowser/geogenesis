import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CommunityQueryError, collectConnection, runQuery } from './community-graphql';

const mocks = vi.hoisted(() => ({
  graphql: vi.fn(),
}));

vi.mock('~/core/io/subgraph/graphql', () => ({
  graphql: (...args: unknown[]) => mocks.graphql(...args),
}));

beforeEach(() => {
  mocks.graphql.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const connectionPage = (nodes: { id: string }[], hasNextPage = false, endCursor: string | null = null) => ({
  things: { nodes, pageInfo: { hasNextPage, endCursor } },
});

describe('runQuery', () => {
  it('returns the payload when the query succeeds', async () => {
    mocks.graphql.mockReturnValue(Effect.succeed({ ok: true }));

    await expect(runQuery('label', 'query {}')).resolves.toEqual({ ok: true });
  });

  it('throws instead of resolving null when the query fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.graphql.mockReturnValue(Effect.fail(new Error('upstream is down')));

    // Resolving null here is what made an outage look like a quiet space
    await expect(runQuery('curator votes', 'query {}')).rejects.toBeInstanceOf(CommunityQueryError);
  });

  it('names the failing query on the error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.graphql.mockReturnValue(Effect.fail(new Error('upstream is down')));

    await expect(runQuery('curator votes', 'query {}')).rejects.toMatchObject({ label: 'curator votes' });
  });
});

describe('collectConnection', () => {
  it('accumulates nodes across pages', async () => {
    mocks.graphql
      .mockReturnValueOnce(Effect.succeed(connectionPage([{ id: 'a' }], true, 'cursor-1')))
      .mockReturnValueOnce(Effect.succeed(connectionPage([{ id: 'b' }])));

    const nodes = await collectConnection<{ id: string }>(
      'things',
      after => `query { ${after ?? ''} }`,
      data => data.things
    );

    expect(nodes.map(node => node.id)).toEqual(['a', 'b']);
  });

  it('propagates a failure rather than returning the pages it already had', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.graphql
      .mockReturnValueOnce(Effect.succeed(connectionPage([{ id: 'a' }], true, 'cursor-1')))
      .mockReturnValueOnce(Effect.fail(new Error('upstream is down')));

    // A truncated list is indistinguishable from a complete one downstream
    await expect(
      collectConnection<{ id: string }>(
        'things',
        after => `query { ${after ?? ''} }`,
        data => data.things
      )
    ).rejects.toBeInstanceOf(CommunityQueryError);
  });

  it('ends pagination when the response carries no connection', async () => {
    mocks.graphql.mockReturnValue(Effect.succeed({}));

    const nodes = await collectConnection<{ id: string }>(
      'things',
      () => 'query {}',
      data => data.things
    );

    expect(nodes).toEqual([]);
  });
});
