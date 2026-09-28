import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';

import { GET } from './route';

const mocks = vi.hoisted(() => ({
  fetchFeed: vi.fn(),
  filter: vi.fn(),
  scopes: vi.fn(),
}));

vi.mock('~/core/explore/fetch-explore-feed', () => ({
  fetchExploreFeed: (args: unknown) => mocks.fetchFeed(args),
}));
vi.mock('~/core/explore/resolve-explore-feed-request-context', () => ({
  resolveExploreFeedRequestContext: async () => ({
    browse: { featured: [], editorOf: [], memberOf: [], documentationImage: null, personalSpaceId: null },
    memberOrEditorSpaceIds: [],
    walletAddress: null,
  }),
}));
vi.mock('~/core/topics/browse/topic-feed-filter', () => ({
  topicFeedFilter: (topicId: string, selectedTopicIds: string[]) => {
    mocks.filter(topicId, selectedTopicIds);
    return {};
  },
  topicFeedPopulationScopes: (topicId: string, selectedTopicIds: string[], typeIds: string[]) => {
    mocks.scopes(topicId, selectedTopicIds, typeIds);
    return [];
  },
}));

const PAGE_TOPIC = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SPACE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function topicId(index: number) {
  return index.toString(16).padStart(32, '0');
}

beforeEach(() => {
  mocks.fetchFeed.mockReset();
  mocks.fetchFeed.mockResolvedValue({ items: [], nextCursor: null });
  mocks.filter.mockReset();
  mocks.scopes.mockReset();
});

describe('GET /api/topics/feed', () => {
  it('bounds selected Topics before building either Topic population filter', async () => {
    const selectedTopicIds = Array.from({ length: 11 }, (_, index) => topicId(index + 1));
    const params = new URLSearchParams({
      topicId: PAGE_TOPIC,
      spaceId: SPACE,
      typeIds: CLAIM_TYPE_ID,
      topicIds: selectedTopicIds.join(','),
    });

    const response = await GET(new Request(`https://example.com/api/topics/feed?${params}`));

    expect(response.status).toBe(200);
    expect(mocks.filter.mock.calls[0]?.[1]).toEqual(selectedTopicIds.slice(0, 10));
    expect(mocks.scopes.mock.calls[0]?.[1]).toEqual(selectedTopicIds.slice(0, 10));
  });
});
