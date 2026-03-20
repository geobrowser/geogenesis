import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchSubtopics } from './fetch-subtopics';
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

describe('fetchSubtopics', () => {
  beforeEach(() => {
    graphqlMock.mockReset();
  });

  it('returns subtopics with deduped space usage and resolved images', async () => {
    graphqlMock.mockImplementation(({ query }: { query: string }) => {
      expect(query).toContain('topic {');
      expect(query).toContain('relationsList');
      expect(query).toContain('spacesByTopicIdConnection(first: 3)');
      expect(query).toContain('totalCount');

      return Effect.succeed({
        subspaceTopicsConnection: {
          nodes: [
            {
              topicId: '00000000-0000-0000-0000-0000000000aa',
              topic: {
                name: 'Funding',
                relationsList: [
                  {
                    typeId: AVATAR_PROPERTY_ID,
                    toEntity: {
                      valuesList: [{ propertyId: IMAGE_URL_PROPERTY_ID, text: 'ipfs://funding-avatar' }],
                    },
                  },
                ],
                spacesByTopicIdConnection: {
                  totalCount: 5,
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
                      id: '00000000-0000-0000-0000-000000000001',
                      page: {
                        name: 'Alpha Duplicate',
                        relationsList: [],
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
                    {
                      id: '00000000-0000-0000-0000-000000000003',
                      page: null,
                    },
                  ],
                },
              },
            },
            {
              topicId: '00000000-0000-0000-0000-0000000000aa',
              topic: {
                name: null,
                relationsList: [],
                spacesByTopicIdConnection: {
                  totalCount: 5,
                  nodes: [
                    {
                      id: '00000000-0000-0000-0000-000000000003',
                      page: {
                        name: 'Gamma',
                        relationsList: [
                          {
                            typeId: AVATAR_PROPERTY_ID,
                            toEntity: {
                              valuesList: [{ propertyId: IMAGE_URL_PROPERTY_ID, text: 'ipfs://gamma-avatar' }],
                            },
                          },
                        ],
                      },
                    },
                    {
                      id: '00000000-0000-0000-0000-000000000004',
                      page: {
                        name: 'Delta',
                        relationsList: [],
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      });
    });

    const result = await fetchSubtopics('00000000-0000-0000-0000-000000000999');

    expect(result).toEqual([
      {
        id: '00000000-0000-0000-0000-0000000000aa',
        name: 'Funding',
        image: 'ipfs://funding-avatar',
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
          {
            id: '00000000-0000-0000-0000-000000000003',
            name: 'Gamma',
            image: 'ipfs://gamma-avatar',
          },
        ],
        spacesCount: 5,
      },
    ]);
  });

  it('rejects invalid space ids before querying', async () => {
    await expect(fetchSubtopics('not-a-space-id')).rejects.toThrow(
      'Invalid space ID provided for subtopics fetch: not-a-space-id'
    );

    expect(graphqlMock).not.toHaveBeenCalled();
  });
});
