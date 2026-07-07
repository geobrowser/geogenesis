import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CURATED_TOPIC_TAG_ID, TAG_PROPERTY_ID, TOPIC_TYPE_ID } from '~/core/constants';

import { fetchDefaultSubtopics, fetchSubtopicSearch } from './fetch-subtopic-search';
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
            types: [
              { id: '00000000-0000-0000-0000-0000000000t1', name: 'Topic' },
              { id: '00000000-0000-0000-0000-0000000000t1', name: 'Topic' },
              { id: '00000000-0000-0000-0000-0000000000t2', name: 'Subject' },
            ],
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
        types: [
          { id: '00000000-0000-0000-0000-0000000000t1', name: 'Topic' },
          { id: '00000000-0000-0000-0000-0000000000t2', name: 'Subject' },
        ],
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
        types: [],
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

describe('fetchDefaultSubtopics', () => {
  beforeEach(() => {
    graphqlMock.mockReset();
  });

  it('queries curated Topic entities and maps/dedupes suggestions', async () => {
    graphqlMock.mockImplementation(({ query }: { query: string }) => {
      // Scoped to curated Topics: Types → Topic AND Tag → Curated topic tag.
      expect(query).toContain('entitiesConnection');
      expect(query).toContain(SystemIds.TYPES_PROPERTY);
      expect(query).toContain(TOPIC_TYPE_ID);
      expect(query).toContain(TAG_PROPERTY_ID);
      expect(query).toContain(CURATED_TOPIC_TAG_ID);
      expect(query).toContain('first: 10');

      return Effect.succeed({
        entitiesConnection: {
          nodes: [
            {
              id: '00000000-0000-0000-0000-0000000000aa',
              name: 'AI',
              description: 'Machine reasoning systems',
              types: [
                { id: '00000000-0000-0000-0000-0000000000t1', name: 'Topic' },
                { id: '00000000-0000-0000-0000-0000000000t1', name: 'Topic' },
                { id: '00000000-0000-0000-0000-0000000000t2', name: 'Subject' },
              ],
            },
            {
              id: '00000000-0000-0000-0000-0000000000bb',
              name: null,
              description: null,
              types: null,
            },
            // No id — should be filtered out.
            { id: '', name: 'Ghost', description: null, types: [] },
          ],
        },
      });
    });

    const result = await fetchDefaultSubtopics();

    expect(result).toEqual([
      {
        id: '00000000-0000-0000-0000-0000000000aa',
        name: 'AI',
        description: 'Machine reasoning systems',
        types: [
          { id: '00000000-0000-0000-0000-0000000000t1', name: 'Topic' },
          { id: '00000000-0000-0000-0000-0000000000t2', name: 'Subject' },
        ],
        image: '',
        spaces: [],
        spacesCount: 0,
      },
      {
        id: '00000000-0000-0000-0000-0000000000bb',
        name: 'Untitled',
        description: null,
        types: [],
        image: '',
        spaces: [],
        spacesCount: 0,
      },
    ]);
  });

  it('returns an empty list on network error', async () => {
    graphqlMock.mockImplementation(() => Effect.fail({ _tag: 'HttpError' }));

    await expect(fetchDefaultSubtopics()).resolves.toEqual([]);
  });
});
