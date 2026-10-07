import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { NEWS_STORY_TYPE_ID } from '~/core/explore/explore-constants';

import { GET } from './route';

const mocks = vi.hoisted(() => ({ fetchFeed: vi.fn(), viewer: vi.fn() }));

vi.mock('~/core/explore/fetch-explore-feed', () => ({
  fetchExploreFeed: (args: unknown) => mocks.fetchFeed(args),
}));
vi.mock('~/core/explore/resolve-explore-feed-request-context', () => ({
  resolveExploreFeedRequestContext: async () => ({
    browse: { featured: [], editorOf: [], memberOf: [], documentationImage: null, personalSpaceId: null },
    memberOrEditorSpaceIds: [],
    walletAddress: null,
    personalMemberSpaceId: null,
  }),
}));
vi.mock('~/core/explore/for-you/resolve-for-you-viewer', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/explore/for-you/resolve-for-you-viewer')>()),
  resolveForYouViewer: (...args: unknown[]) => mocks.viewer(...args),
}));

beforeEach(() => {
  mocks.fetchFeed.mockReset();
  mocks.fetchFeed.mockResolvedValue({ items: [], nextCursor: null });
  mocks.viewer.mockReset();
  mocks.viewer.mockResolvedValue(null);
  vi.unstubAllEnvs();
});

const sentArgs = () =>
  mocks.fetchFeed.mock.calls[0]?.[0] as {
    sort: string;
    typeIds: string[];
    excludeTypeIds?: string[];
    forYouTopicIds: string[];
    cursor: string | null;
    reorderWindow?: unknown;
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

  describe('personalized For you (GEO-3140)', () => {
    const item = (entityId: string, ranking?: object) => ({ entityId, ...(ranking ? { ranking } : {}) });

    it('personalizes only for a verified viewer, ignoring followed topics', async () => {
      mocks.viewer.mockResolvedValue('aaaaaaaa000040008000000000000001');
      mocks.fetchFeed.mockResolvedValue({
        items: [item('e1', { version: 'for-you-1.0+web.1', reason: null })],
        nextCursor: 'w1:22:',
        feed: { name: 'for-you', version: 'for-you-1.0+web.1' },
      });
      const response = await GET(
        new Request(
          'https://example.com/api/explore/feed?sort=for-you&followedTopicIds=8cb0a2b4adbf4627aa080cec5112099a'
        )
      );

      expect(sentArgs().reorderWindow).toBeTypeOf('function');
      expect(sentArgs().forYouTopicIds).toEqual([]);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      const body = await response.json();
      expect(body.feed).toEqual({ name: 'for-you', version: 'for-you-1.0+web.1' });
      // The pinned time rides in the cursor around the window cursor, and comes back off it.
      expect(body.nextCursor).toMatch(/^p1:\d+:w1:22:$/);
      await GET(
        new Request(`https://example.com/api/explore/feed?sort=for-you&cursor=${encodeURIComponent(body.nextCursor)}`)
      );
      expect((mocks.fetchFeed.mock.calls[1]?.[0] as { cursor: string }).cursor).toBe('w1:22:');
    });

    it('falls back to the followed-topic stream for an unverified viewer', async () => {
      const response = await GET(
        new Request(
          'https://example.com/api/explore/feed?sort=for-you&followedTopicIds=8cb0a2b4adbf4627aa080cec5112099a'
        )
      );

      expect(sentArgs().reorderWindow).toBeUndefined();
      expect(sentArgs().forYouTopicIds).toEqual(['8cb0a2b4adbf4627aa080cec5112099a']);
      expect(response.headers.get('cache-control')).toBeNull();
    });

    it('does not even look for a viewer on Best while interleaving is off', async () => {
      await GET(new Request('https://example.com/api/explore/feed?sort=best'));

      expect(mocks.viewer).not.toHaveBeenCalled();
      expect(sentArgs().reorderWindow).toBeUndefined();
    });

    it('looks for a viewer on Best once interleaving is on', async () => {
      vi.stubEnv('NEXT_PUBLIC_FEED_INTERLEAVING_ENABLED', 'true');
      mocks.viewer.mockResolvedValue('aaaaaaaa000040008000000000000001');
      await GET(new Request('https://example.com/api/explore/feed?sort=best'));

      expect(sentArgs().reorderWindow).toBeTypeOf('function');
    });

    it('names the version on every card of a Best page', async () => {
      mocks.fetchFeed.mockResolvedValue({
        items: [item('e1'), item('e2')],
        nextCursor: null,
        feed: { name: 'best', version: 'best-1' },
      });
      const body = await (await GET(new Request('https://example.com/api/explore/feed?sort=best'))).json();

      expect(body.items.map((i: { ranking: { version: string } }) => i.ranking.version)).toEqual(['best-1', 'best-1']);
    });
  });
});
