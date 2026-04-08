import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchSpaceTopic } from './fetch-space-topic';
import { AVATAR_PROPERTY_ID, IMAGE_URL_PROPERTY_ID } from './space-image';

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

describe('fetchSpaceTopic', () => {
  beforeEach(() => {
    graphqlMock.mockReset();
  });

  it('returns the current topic with hydrated usage metadata', async () => {
    graphqlMock.mockImplementation(({ query }: { query: string }) => {
      expect(query).toContain('space(id: "00000000-0000-0000-0000-000000000999")');
      expect(query).toContain('spacesByTopicIdConnection(first: 3)');

      return Effect.succeed({
        space: {
          topic: {
            id: '000000000000000000000000000000aa',
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
              totalCount: 1,
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
              ],
            },
          },
        },
      });
    });

    await expect(fetchSpaceTopic('00000000-0000-0000-0000-000000000999')).resolves.toEqual({
      id: '000000000000000000000000000000aa',
      name: 'AI',
      description: 'Systems that can reason over language and images',
      image: 'ipfs://ai-avatar',
      spaces: [
        {
          id: '00000000-0000-0000-0000-000000000001',
          image: 'ipfs://alpha-avatar',
          name: 'Alpha',
        },
      ],
      spacesCount: 1,
    });
  });

  it('returns null when a space has no topic', async () => {
    graphqlMock.mockReturnValue(Effect.succeed({ space: { topic: null } }));
    await expect(fetchSpaceTopic('00000000-0000-0000-0000-000000000999')).resolves.toBeNull();
  });
});
