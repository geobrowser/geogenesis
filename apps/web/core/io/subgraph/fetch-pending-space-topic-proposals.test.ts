import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchPendingSpaceTopicProposals } from './fetch-pending-space-topic-proposals';
import { AVATAR_PROPERTY_ID, IMAGE_URL_PROPERTY_ID } from './space-image';

const restFetchMock = vi.fn();
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

vi.mock('../rest', async () => {
  const actual = await vi.importActual('../rest');

  return {
    ...actual,
    restFetch: (...args: unknown[]) => restFetchMock(...args),
  };
});

vi.mock('./graphql', () => ({
  graphql: (...args: unknown[]) => graphqlMock(...args),
}));

describe('fetchPendingSpaceTopicProposals', () => {
  beforeEach(() => {
    restFetchMock.mockReset();
    graphqlMock.mockReset();
  });

  it('returns pending topic proposals with resolved topic metadata', async () => {
    restFetchMock.mockImplementation(({ path }: { path: string }) => {
      expect(path).toContain('actionTypes=TopicDeclared,TopicRemoved');
      expect(path).toContain('status=PROPOSED');

      return Effect.succeed({
        proposals: [
          {
            proposalId: 'proposal-1',
            spaceId: '00000000-0000-0000-0000-000000000999',
            name: 'Ignored proposal title',
            proposedBy: 'member-space',
            status: 'PROPOSED',
            votingMode: 'SLOW',
            actions: [
              {
                actionType: 'TOPIC_DECLARED',
                targetTopicId: '00000000-0000-0000-0000-0000000000aa',
              },
            ],
            userVote: null,
            quorum: { required: 1, current: 0, progress: 0, reached: false },
            threshold: { required: '50%', current: 0, progress: 0, reached: false },
            timing: { startTime: 0, endTime: 100, timeRemaining: 100, isVotingEnded: false },
            canExecute: false,
            votes: { yes: 1, no: 0, abstain: 0, total: 1 },
          },
        ],
        nextCursor: null,
      });
    });

    graphqlMock.mockImplementation(({ query }: { query: string }) => {
      expect(query).toContain('entities(filter: { id: { in: ["000000000000000000000000000000aa"] } })');

      return Effect.succeed({
        entities: [
          {
            id: '000000000000000000000000000000aa',
            name: 'Artificial Intelligence',
            description: 'Machine reasoning systems',
            relationsList: [
              {
                typeId: AVATAR_PROPERTY_ID,
                toEntity: {
                  valuesList: [{ propertyId: IMAGE_URL_PROPERTY_ID, text: 'ipfs://topic-avatar' }],
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
                          valuesList: [{ propertyId: IMAGE_URL_PROPERTY_ID, text: 'ipfs://space-avatar' }],
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

    await expect(fetchPendingSpaceTopicProposals('00000000-0000-0000-0000-000000000999')).resolves.toEqual([
      {
        spaceId: '00000000-0000-0000-0000-000000000999',
        proposalId: 'proposal-1',
        id: '000000000000000000000000000000aa',
        name: 'Artificial Intelligence',
        topicId: '000000000000000000000000000000aa',
        topicDescription: 'Machine reasoning systems',
        topicImage: 'ipfs://topic-avatar',
        spaces: [
          {
            id: '00000000-0000-0000-0000-000000000001',
            image: 'ipfs://space-avatar',
            name: 'Alpha',
          },
        ],
        spacesCount: 1,
        direction: 'set',
        yesCount: 1,
        noCount: 0,
        abstainCount: 0,
        endTime: 100,
        status: 'PROPOSED',
      },
    ]);
  });

  it('returns empty for invalid space ids', async () => {
    await expect(fetchPendingSpaceTopicProposals('not-a-space-id')).resolves.toEqual([]);

    expect(restFetchMock).not.toHaveBeenCalled();
    expect(graphqlMock).not.toHaveBeenCalled();
  });
});
