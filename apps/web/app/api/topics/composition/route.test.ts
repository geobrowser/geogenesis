import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const mocks = vi.hoisted(() => ({
  fetchCounts: vi.fn(),
}));

vi.mock('~/core/topics/browse/topic-feed-request-context', () => ({
  resolveTopicFeedRequestContext: () => ({
    browse: { featured: [], editorOf: [], memberOf: [], documentationImage: null, personalSpaceId: null },
  }),
}));

vi.mock('~/core/topics/browse/topic-feed-facets', () => ({
  fetchTopicFeedCompositionCounts: (args: unknown) => mocks.fetchCounts(args),
}));

const TOPIC = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SPACE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

beforeEach(() => {
  mocks.fetchCounts.mockReset();
  mocks.fetchCounts.mockResolvedValue({ claims: 1, debates: 2, news: 3 });
});

describe('GET /api/topics/composition', () => {
  it('returns unique counts from the Topic feed population', async () => {
    const response = await GET(
      new Request(`https://example.com/api/topics/composition?topicId=${TOPIC}&spaceId=${SPACE}`)
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ claims: 1, debates: 2, news: 3 });
    expect(mocks.fetchCounts).toHaveBeenCalledWith(expect.objectContaining({ topicId: TOPIC }));
  });

  it('rejects an invalid Topic or route Space', async () => {
    const response = await GET(
      new Request(`https://example.com/api/topics/composition?topicId=invalid&spaceId=${SPACE}`)
    );

    expect(response.status).toBe(400);
    expect(mocks.fetchCounts).not.toHaveBeenCalled();
  });
});
