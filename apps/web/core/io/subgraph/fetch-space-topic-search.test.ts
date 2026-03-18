import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchSpaceTopicSearch } from './fetch-space-topic-search';
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

describe('fetchSpaceTopicSearch', () => {
  beforeEach(() => {
    graphqlMock.mockReset();
  });

  it('returns topic search results with primary-topic space usage', async () => {
    graphqlMock.mockImplementation(({ query }: { query: string }) => {
      expect(query).toContain('search(query: "AI", first: 10)');
      expect(query).toContain('spacesByTopicIdConnection(first: 3)');

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
        ],
      });
    });

    await expect(fetchSpaceTopicSearch('AI')).resolves.toEqual([
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
    ]);
  });

  it('returns an empty result without querying for blank input', async () => {
    await expect(fetchSpaceTopicSearch('   ')).resolves.toEqual([]);
    expect(graphqlMock).not.toHaveBeenCalled();
  });
});
