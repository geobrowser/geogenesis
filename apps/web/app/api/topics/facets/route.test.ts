import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';

import { POST } from './route';

const mocks = vi.hoisted(() => ({
  fetchCounts: vi.fn(),
}));

vi.mock('~/core/topics/browse/topic-feed-request-context', () => ({
  resolveTopicFeedRequestContext: () => ({
    browse: { featured: [], editorOf: [], memberOf: [], documentationImage: null, personalSpaceId: null },
  }),
}));

vi.mock('~/core/topics/browse/topic-feed-facets', () => ({
  fetchTopicFeedFacetCounts: (args: unknown) => mocks.fetchCounts(args),
}));

const PAGE_TOPIC = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CANDIDATE_TOPIC = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SPACE = 'cccccccccccccccccccccccccccccccc';

beforeEach(() => {
  mocks.fetchCounts.mockReset();
  mocks.fetchCounts.mockResolvedValue({ [CANDIDATE_TOPIC]: 4 });
});

describe('POST /api/topics/facets', () => {
  it('counts valid candidates against the current Topic, Topic selection, and type selection', async () => {
    const response = await POST(
      new Request('https://example.com/api/topics/facets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          candidateTopicIds: [PAGE_TOPIC, CANDIDATE_TOPIC, 'not-an-id'],
          selectedTopicIds: [CANDIDATE_TOPIC],
          typeIds: [CLAIM_TYPE_ID],
          fixedParams: { topicId: PAGE_TOPIC, spaceId: SPACE },
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ counts: { [CANDIDATE_TOPIC]: 4 } });
    expect(mocks.fetchCounts).toHaveBeenCalledWith(
      expect.objectContaining({
        topicId: PAGE_TOPIC,
        selectedTopicIds: [CANDIDATE_TOPIC],
        candidateTopicIds: [CANDIDATE_TOPIC],
        typeIds: [CLAIM_TYPE_ID],
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
    expect(mocks.fetchCounts).not.toHaveBeenCalled();
  });
});
