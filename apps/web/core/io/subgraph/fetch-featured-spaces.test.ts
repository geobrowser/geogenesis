import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchFeaturedSpaces } from './fetch-featured-spaces';

const graphqlMock = vi.fn();

vi.mock('~/core/environment', () => ({
  Environment: {
    getConfig: () => ({ api: 'https://example.com/graphql', bundler: '', chainId: '19411', rpc: '' }),
  },
}));

vi.mock('./graphql', () => ({
  graphql: (...args: unknown[]) => graphqlMock(...args),
}));

// Curated rank ids (from space-ranking): Crypto=2, AI=3.
const AI_SPACE = '41e851610e13a19441c4d980f2f2ce6b';
const CRYPTO_SPACE = 'c9f267dcb0d270718c2a3c45a64afd32';

function spaceNode(id: string, name: string) {
  return { id, page: { id: `page-${id}`, name, relationsList: [] }, members: { totalCount: 1 } };
}

function query(arg: unknown): string {
  return (arg as { query?: string } | undefined)?.query ?? '';
}

describe('fetchFeaturedSpaces', () => {
  beforeEach(() => graphqlMock.mockReset());

  it('walks the subtopic tree, excludes the root topic, and orders by space rank', async () => {
    // Tree: root t0 -> [t1 (AI space), t2 (no space) -> t3 (Crypto space)].
    // BFS discovers AI before Crypto, but the result must be rank-sorted (Crypto 2, AI 3).
    graphqlMock.mockImplementation((arg: unknown) => {
      const q = query(arg);
      if (q.includes('space(id:')) return Effect.succeed({ space: { topicId: 't0' } });
      if (q.includes('"t3"')) {
        return Effect.succeed({
          entities: [
            {
              id: 't3',
              name: 'Crypto',
              spacesByTopicIdConnection: { totalCount: 1, nodes: [spaceNode(CRYPTO_SPACE, 'Crypto')] },
              subtopics: [],
            },
          ],
        });
      }
      if (q.includes('"t1"')) {
        return Effect.succeed({
          entities: [
            {
              id: 't1',
              name: 'AI',
              spacesByTopicIdConnection: { totalCount: 1, nodes: [spaceNode(AI_SPACE, 'AI')] },
              subtopics: [],
            },
            {
              id: 't2',
              name: 'Science',
              spacesByTopicIdConnection: { totalCount: 0, nodes: [] },
              subtopics: [{ toEntity: { id: 't3' } }],
            },
          ],
        });
      }
      // Root topic frontier (t0): no space of its own, two children.
      return Effect.succeed({
        entities: [
          {
            id: 't0',
            name: 'Geo',
            spacesByTopicIdConnection: { totalCount: 0, nodes: [] },
            subtopics: [{ toEntity: { id: 't1' } }, { toEntity: { id: 't2' } }],
          },
        ],
      });
    });

    const result = await fetchFeaturedSpaces();

    expect(result.map(r => r.spaceId)).toEqual([CRYPTO_SPACE, AI_SPACE]);
    expect(result.map(r => r.name)).toEqual(['Crypto', 'AI']);
    // Root topic ("Geo") is only a seed — never featured.
    expect(result.some(r => r.name === 'Geo')).toBe(false);
  });

  it('dedupes a space that claims more than one topic', async () => {
    graphqlMock.mockImplementation((arg: unknown) => {
      const q = query(arg);
      if (q.includes('space(id:')) return Effect.succeed({ space: { topicId: 't0' } });
      if (q.includes('"t1"')) {
        // Both children resolve to the same claiming space.
        return Effect.succeed({
          entities: [
            {
              id: 't1',
              name: 'AI',
              spacesByTopicIdConnection: { totalCount: 1, nodes: [spaceNode(AI_SPACE, 'AI')] },
              subtopics: [],
            },
            {
              id: 't2',
              name: 'AI (alias)',
              spacesByTopicIdConnection: { totalCount: 1, nodes: [spaceNode(AI_SPACE, 'AI')] },
              subtopics: [],
            },
          ],
        });
      }
      return Effect.succeed({
        entities: [
          {
            id: 't0',
            name: 'Geo',
            spacesByTopicIdConnection: { totalCount: 0, nodes: [] },
            subtopics: [{ toEntity: { id: 't1' } }, { toEntity: { id: 't2' } }],
          },
        ],
      });
    });

    const result = await fetchFeaturedSpaces();
    expect(result.map(r => r.spaceId)).toEqual([AI_SPACE]);
  });

  it('returns [] when the root space has no topic', async () => {
    graphqlMock.mockImplementation(() => Effect.succeed({ space: { topicId: null } }));
    expect(await fetchFeaturedSpaces()).toEqual([]);
  });
});
