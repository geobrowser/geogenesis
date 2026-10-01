import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { NEWS_STORY_TYPE_ID } from '~/core/explore/explore-constants';

import { GET } from './route';

const mocks = vi.hoisted(() => ({ fetchFeed: vi.fn() }));

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

beforeEach(() => {
  mocks.fetchFeed.mockReset();
  mocks.fetchFeed.mockResolvedValue({ items: [], nextCursor: null });
});

const sentArgs = () =>
  mocks.fetchFeed.mock.calls[0]?.[0] as {
    sort: string;
    typeIds: string[];
    excludeTypeIds?: string[];
    forYouTopicIds: string[];
  };

describe('GET /api/explore/feed', () => {
  it('serves debates and claims when the client sends no types', async () => {
    await GET(new Request('https://example.com/api/explore/feed?sort=best'));

    expect(sentArgs().typeIds).toEqual([DEBATE_TYPE_ID, CLAIM_TYPE_ID]);
  });

  // The type filter matches an entity carrying *any* selected type, so a Claim that is also a News
  // story would pass it. The exclusion is what keeps it off Explore.
  it('excludes news stories, whatever else an entity is', async () => {
    await GET(new Request('https://example.com/api/explore/feed?sort=new'));

    expect(sentArgs().excludeTypeIds).toEqual([NEWS_STORY_TYPE_ID]);
  });

  // GEO-3083. Signed out or following nothing, For you is Best and must never come back empty.
  it('serves For you with no followed topics as Best', async () => {
    await GET(new Request('https://example.com/api/explore/feed?sort=for-you'));

    expect(sentArgs().sort).toBe('best');
  });

  it('sends valid followed topics for For you, normalized and deduplicated', async () => {
    const topic = '8CB0A2B4-ADBF-4627-AA08-0CEC5112099A';
    await GET(
      new Request(
        `https://example.com/api/explore/feed?sort=for-you&followedTopicIds=${topic},not-an-id,8cb0a2b4adbf4627aa080cec5112099a`
      )
    );

    expect(sentArgs()).toMatchObject({ sort: 'best', forYouTopicIds: ['8cb0a2b4adbf4627aa080cec5112099a'] });
  });

  it('ignores followed topics on every other sort', async () => {
    await GET(
      new Request('https://example.com/api/explore/feed?sort=best&followedTopicIds=8cb0a2b4adbf4627aa080cec5112099a')
    );

    expect(sentArgs().forYouTopicIds).toEqual([]);
  });
});
