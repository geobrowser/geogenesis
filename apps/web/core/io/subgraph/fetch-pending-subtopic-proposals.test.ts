import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SUBTOPIC_RELATION_TYPE_ID } from '~/core/constants';

import { fetchPendingSubtopicProposals } from './fetch-pending-subtopic-proposals';

const restFetchMock = vi.fn();
const fetchProposalDiffsMock = vi.fn();
const fetchSubtopicAncestorPathMock = vi.fn();
const fetchTopicMetadataMock = vi.fn();

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

vi.mock('./fetch-proposal-diffs', () => ({
  fetchProposalDiffs: (...args: unknown[]) => fetchProposalDiffsMock(...args),
}));

vi.mock('./fetch-subtopic-ancestor-path', () => ({
  fetchSubtopicAncestorPath: (...args: unknown[]) => fetchSubtopicAncestorPathMock(...args),
  formatSubtopicPath: (segments: Array<{ name: string }>) => segments.map(segment => segment.name).join(' > '),
}));

vi.mock('./fetch-topic-metadata', () => ({
  fetchTopicMetadata: (...args: unknown[]) => fetchTopicMetadataMock(...args),
}));

describe('fetchPendingSubtopicProposals', () => {
  beforeEach(() => {
    restFetchMock.mockReset();
    fetchProposalDiffsMock.mockReset();
    fetchSubtopicAncestorPathMock.mockReset();
    fetchTopicMetadataMock.mockReset();
  });

  it('returns pending subtopic relation proposals with paths', async () => {
    restFetchMock.mockImplementation(({ path }: { path: string }) => {
      expect(path).toContain('actionTypes=Publish');
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
            actions: [{ actionType: 'PUBLISH' }],
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

    fetchProposalDiffsMock.mockResolvedValue({
      status: 'success',
      entities: [
        {
          entityId: '00000000-0000-0000-0000-0000000000ff',
          name: 'Events',
          values: [],
          blocks: [],
          relations: [
            {
              relationId: 'rel-1',
              typeId: SUBTOPIC_RELATION_TYPE_ID,
              spaceId: '00000000-0000-0000-0000-000000000999',
              changeType: 'ADD',
              before: null,
              after: {
                toEntityId: '00000000-0000-0000-0000-0000000000aa',
                toEntityName: 'Berlin Events',
              },
            },
          ],
        },
      ],
    });

    fetchSubtopicAncestorPathMock.mockResolvedValue([
      { id: '00000000-0000-0000-0000-000000000099', name: 'Root' },
      { id: '00000000-0000-0000-0000-0000000000ff', name: 'Events' },
    ]);

    fetchTopicMetadataMock.mockResolvedValue(
      new Map([
        [
          '00000000-0000-0000-0000-0000000000aa',
          {
            name: 'Berlin Events',
            description: null,
            image: '',
            spaces: [],
            spacesCount: 0,
          },
        ],
      ])
    );

    await expect(
      fetchPendingSubtopicProposals(
        '00000000-0000-0000-0000-000000000999',
        '00000000-0000-0000-0000-000000000099'
      )
    ).resolves.toEqual([
      {
        spaceId: '00000000-0000-0000-0000-000000000999',
        proposalId: 'proposal-1',
        direction: 'add',
        parentEntityId: '00000000-0000-0000-0000-0000000000ff',
        childEntityId: '00000000-0000-0000-0000-0000000000aa',
        name: 'Berlin Events',
        path: 'Root > Events',
        yesCount: 1,
        noCount: 0,
        abstainCount: 0,
        endTime: 100,
        status: 'PROPOSED',
      },
    ]);
  });

  it('returns empty for invalid space ids', async () => {
    await expect(
      fetchPendingSubtopicProposals('not-a-space-id', '00000000-0000-0000-0000-000000000099')
    ).resolves.toEqual([]);

    expect(restFetchMock).not.toHaveBeenCalled();
  });
});
