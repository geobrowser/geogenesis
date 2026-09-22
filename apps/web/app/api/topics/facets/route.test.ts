import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';

import { POST } from './route';

const mocks = vi.hoisted(() => ({
  fetchFacets: vi.fn(),
}));

vi.mock('~/core/topics/browse/topic-feed-facets', () => ({
  fetchTopicFeedFacets: (args: unknown) => mocks.fetchFacets(args),
}));

const PAGE_TOPIC = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CANDIDATE_TOPIC = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SPACE = 'cccccccccccccccccccccccccccccccc';

beforeEach(() => {
  mocks.fetchFacets.mockReset();
  mocks.fetchFacets.mockResolvedValue([{ id: CANDIDATE_TOPIC, name: 'Alignment', count: 4 }]);
});

describe('POST /api/topics/facets', () => {
  it('returns co-occurring Topics from the current Topic, Topic selection, and type selection', async () => {
    const response = await POST(
      new Request('https://example.com/api/topics/facets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          selectedTopicIds: [CANDIDATE_TOPIC],
          typeIds: [CLAIM_TYPE_ID],
          sort: 'new',
          fixedParams: { topicId: PAGE_TOPIC, spaceId: SPACE, spaceIds: SPACE },
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      topics: [{ id: CANDIDATE_TOPIC, name: 'Alignment', count: 4 }],
    });
    expect(mocks.fetchFacets).toHaveBeenCalledWith(
      expect.objectContaining({
        topicId: PAGE_TOPIC,
        spaceIds: [SPACE],
        selectedTopicIds: [CANDIDATE_TOPIC],
        typeIds: [CLAIM_TYPE_ID],
        sort: 'new',
      })
    );
  });

  it('rejects a request without a valid page Topic and route Space', async () => {
    const response = await POST(
      new Request('https://example.com/api/topics/facets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fixedParams: { topicId: 'invalid', spaceId: SPACE } }),
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.fetchFacets).not.toHaveBeenCalled();
  });
});
