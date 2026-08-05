import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FEATURED_TAG_ID, ROOT_SPACE, TAG_PROPERTY_ID } from '~/core/constants';

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

function featuredTags(isFeatured = true, spaceId = ROOT_SPACE) {
  return isFeatured ? [{ spaceId, toEntity: { id: FEATURED_TAG_ID } }] : [];
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
              featuredTags: featuredTags(),
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
              featuredTags: featuredTags(),
              subtopics: [],
            },
            {
              id: 't2',
              name: 'Science',
              spacesByTopicIdConnection: { totalCount: 0, nodes: [] },
              featuredTags: featuredTags(false),
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
            featuredTags: featuredTags(false),
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

    const frontierQueries = graphqlMock.mock.calls
      .map(([arg]) => query(arg))
      .filter(q => q.includes('entities(filter:'));
    expect(frontierQueries[0]).toContain(TAG_PROPERTY_ID);
    expect(frontierQueries[0]).toContain(FEATURED_TAG_ID);
    expect(frontierQueries[0]).toContain(`spaceId: { is: "${ROOT_SPACE}" }`);
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
              featuredTags: featuredTags(),
              subtopics: [],
            },
            {
              id: 't2',
              name: 'AI (alias)',
              spacesByTopicIdConnection: { totalCount: 1, nodes: [spaceNode(AI_SPACE, 'AI')] },
              featuredTags: featuredTags(),
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
            featuredTags: featuredTags(false),
            subtopics: [{ toEntity: { id: 't1' } }, { toEntity: { id: 't2' } }],
          },
        ],
      });
    });

    const result = await fetchFeaturedSpaces();
    expect(result.map(r => r.spaceId)).toEqual([AI_SPACE]);
  });

  it('skips untagged topics but still traverses them to find featured descendants', async () => {
    const untaggedSpace = '11111111111111111111111111111111';

    graphqlMock.mockImplementation((arg: unknown) => {
      const q = query(arg);
      if (q.includes('space(id:')) return Effect.succeed({ space: { topicId: 'root' } });
      if (q.includes('"featured-child"')) {
        return Effect.succeed({
          entities: [
            {
              id: 'featured-child',
              name: 'AI',
              spacesByTopicIdConnection: { totalCount: 1, nodes: [spaceNode(AI_SPACE, 'AI')] },
              featuredTags: featuredTags(),
              subtopics: [],
            },
          ],
        });
      }
      if (q.includes('"untagged-parent"')) {
        return Effect.succeed({
          entities: [
            {
              id: 'untagged-parent',
              name: 'Unfeatured',
              spacesByTopicIdConnection: { totalCount: 1, nodes: [spaceNode(untaggedSpace, 'Unfeatured')] },
              featuredTags: featuredTags(false),
              subtopics: [{ toEntity: { id: 'featured-child' } }],
            },
          ],
        });
      }
      return Effect.succeed({
        entities: [
          {
            id: 'root',
            name: 'Geo',
            spacesByTopicIdConnection: { totalCount: 0, nodes: [] },
            featuredTags: featuredTags(false),
            subtopics: [{ toEntity: { id: 'untagged-parent' } }],
          },
        ],
      });
    });

    const result = await fetchFeaturedSpaces();

    expect(result.map(r => r.spaceId)).toEqual([AI_SPACE]);
    expect(result.some(r => r.spaceId === untaggedSpace)).toBe(false);
  });

  it('ignores a Featured tag attributed in a space other than Root', async () => {
    graphqlMock.mockImplementation((arg: unknown) => {
      const q = query(arg);
      if (q.includes('space(id:')) return Effect.succeed({ space: { topicId: 'root' } });
      if (q.includes('"topic"')) {
        return Effect.succeed({
          entities: [
            {
              id: 'topic',
              name: 'AI',
              spacesByTopicIdConnection: { totalCount: 1, nodes: [spaceNode(AI_SPACE, 'AI')] },
              featuredTags: featuredTags(true, '11111111111111111111111111111111'),
              subtopics: [],
            },
          ],
        });
      }
      return Effect.succeed({
        entities: [
          {
            id: 'root',
            name: 'Geo',
            spacesByTopicIdConnection: { totalCount: 0, nodes: [] },
            featuredTags: featuredTags(false),
            subtopics: [{ toEntity: { id: 'topic' } }],
          },
        ],
      });
    });

    expect(await fetchFeaturedSpaces()).toEqual([]);
  });

  it('returns [] when the root space has no topic', async () => {
    graphqlMock.mockImplementation(() => Effect.succeed({ space: { topicId: null } }));
    expect(await fetchFeaturedSpaces()).toEqual([]);
  });
});
