import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchSubtopicChildren } from './fetch-subtopic-children';
import { fetchSubtopics } from './fetch-subtopics';
import { fetchTopicMetadata } from './fetch-topic-metadata';

vi.mock('./fetch-subtopic-children', () => ({
  fetchSubtopicChildren: vi.fn(),
}));

vi.mock('./fetch-topic-metadata', () => ({
  fetchTopicMetadata: vi.fn(),
}));

const fetchSubtopicChildrenMock = vi.mocked(fetchSubtopicChildren);
const fetchTopicMetadataMock = vi.mocked(fetchTopicMetadata);

describe('fetchSubtopics', () => {
  beforeEach(() => {
    fetchSubtopicChildrenMock.mockReset();
    fetchTopicMetadataMock.mockReset();
  });

  it('maps first-level subtopic children to topic usage', async () => {
    fetchSubtopicChildrenMock.mockResolvedValue([
      { id: '00000000-0000-0000-0000-0000000000aa', name: 'Alpha' },
    ]);
    fetchTopicMetadataMock.mockResolvedValue(
      new Map([
        [
          '00000000-0000-0000-0000-0000000000aa',
          {
            name: 'Alpha',
            description: null,
            image: 'ipfs://alpha',
            spaces: [],
            spacesCount: 0,
          },
        ],
      ])
    );

    const result = await fetchSubtopics(
      '00000000-0000-0000-0000-000000000999',
      '00000000-0000-0000-0000-0000000000ff'
    );

    expect(fetchSubtopicChildrenMock).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-0000000000ff',
      '00000000-0000-0000-0000-000000000999'
    );
    expect(result).toEqual([
      {
        id: '00000000-0000-0000-0000-0000000000aa',
        name: 'Alpha',
        image: 'ipfs://alpha',
        spaces: [],
        spacesCount: 0,
      },
    ]);
  });

  it('rejects invalid space ids', async () => {
    await expect(fetchSubtopics('not-a-space-id', '00000000-0000-0000-0000-0000000000ff')).rejects.toThrow(
      'Invalid space ID'
    );
  });
});
