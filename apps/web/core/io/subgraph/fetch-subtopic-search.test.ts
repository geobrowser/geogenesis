import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchSubtopicSearch } from './fetch-subtopic-search';
import { AVATAR_PROPERTY_ID, COVER_PROPERTY_ID, IMAGE_URL_PROPERTY_ID } from './space-image';

const graphqlMock = vi.fn();

vi.mock('~/core/environment', () => ({
  Environment: {
    getConfig: () => ({
      api: 'https://example.com/graphql',
      bundler: '',
      chainId: '19411',
      rpc: '',
    }),
  },
}));

vi.mock('./graphql', () => ({
  graphql: (...args: unknown[]) => graphqlMock(...args),
}));

describe('fetchSubtopicSearch', () => {
  beforeEach(() => {
    graphqlMock.mockReset();
  });

  it('returns topic search results with primary-topic space usage', async () => {
    graphqlMock.mockImplementation(({ query }: { query: string }) => {
      expect(query).toContain('search(query: "AI", first: 10)');
      expect(query).toContain('description');
      expect(query).toContain('relationsList');
      expect(query).toContain('spacesByTopicIdConnection(first: 3)');
      expect(query).toContain('totalCount');
      expect(query).not.toContain('subspaceTopicsByTopicId');

      return Effect.succeed({
        search: [
          {
            id: '00000000-0000-0000-0000-0000000000aa',
            name: 'AI',
            description: 'Systems that can reason over language and images',
            relationsList: [
              {
                typeId: AVATAR_PROPERTY_ID,
                toEntity: {
                  valuesList: [{ propertyId: IMAGE_URL_PROPERTY_ID, text: 'ipfs://ai-avatar' }],
                },
              },
            ],
            spacesByTopicIdConnection: {
              totalCount: 2,
              nodes: [
                {
                  id: '00000000-0000-0000-0000-000000000001',
                  page: {
                    name: 'Alpha',
                    relationsList: [
                      {
                        typeId: AVATAR_PROPERTY_ID,
                        toEntity: {
                          valuesList: [{ propertyId: IMAGE_URL_PROPERTY_ID, text: 'ipfs://alpha-avatar' }],
                        },
                      },
                    ],
                  },
                },
                {
                  id: '00000000-0000-0000-0000-000000000002',
                  page: {
                    name: 'Beta',
                    relationsList: [
                      {
                        typeId: COVER_PROPERTY_ID,
                        toEntity: {
                          valuesList: [{ propertyId: IMAGE_URL_PROPERTY_ID, text: 'ipfs://beta-cover' }],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
          {
            id: '00000000-0000-0000-0000-0000000000bb',
            name: null,
            description: null,
            relationsList: [],
            spacesByTopicIdConnection: {
              totalCount: 1,
              nodes: [
                {
                  id: '00000000-0000-0000-0000-000000000003',
                  page: null,
                },
              ],
            },
          },
        ],
      });
    });

    const result = await fetchSubtopicSearch('AI');

    expect(result).toEqual([
      {
        id: '00000000-0000-0000-0000-0000000000aa',
        name: 'AI',
        description: 'Systems that can reason over language and images',
        image: 'ipfs://ai-avatar',
        spaces: [
          {
            id: '00000000-0000-0000-0000-000000000001',
            image: 'ipfs://alpha-avatar',
            name: 'Alpha',
          },
          {
            id: '00000000-0000-0000-0000-000000000002',
            image: 'ipfs://beta-cover',
            name: 'Beta',
          },
        ],
        spacesCount: 2,
      },
      {
        id: '00000000-0000-0000-0000-0000000000bb',
        name: 'Untitled',
        description: null,
        image: '/placeholder.png',
        spaces: [
          {
            id: '00000000-0000-0000-0000-000000000003',
            image: '/placeholder.png',
            name: 'Untitled',
          },
        ],
        spacesCount: 1,
      },
    ]);
  });

  it('returns an empty result without querying for blank input', async () => {
    await expect(fetchSubtopicSearch('   ')).resolves.toEqual([]);

    expect(graphqlMock).not.toHaveBeenCalled();
  });
});
