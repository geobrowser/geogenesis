import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { NEWS_STORY_TYPE_ID } from '~/core/explore/explore-constants';
import { resetLastGoodPublicFeedForTests } from '~/core/explore/last-good-public-feed';

import { FEED_TIME_BUDGET_MS, GET } from './route';

const mocks = vi.hoisted(() => ({ fetchFeed: vi.fn(), viewer: vi.fn(), freshState: vi.fn(), context: vi.fn() }));

vi.mock('~/core/explore/fetch-explore-feed', () => ({
  fetchExploreFeed: (args: unknown) => mocks.fetchFeed(args),
}));
vi.mock('~/core/explore/resolve-explore-feed-request-context', () => ({
  resolveExploreFeedRequestContext: async (...args: unknown[]) => ({
    browse: { featured: [], editorOf: [], memberOf: [], documentationImage: null, personalSpaceId: null },
    memberOrEditorSpaceIds: [],
    walletAddress: null,
    personalMemberSpaceId: null,
    ...mocks.context(...args),
  }),
}));
vi.mock('~/core/explore/fresh-slot/fresh-slot-store', () => ({
  readServingFreshSlotState: () => mocks.freshState(),
}));
vi.mock('~/core/explore/for-you/resolve-for-you-viewer', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/explore/for-you/resolve-for-you-viewer')>()),
  resolveForYouViewer: (...args: unknown[]) => mocks.viewer(...args),
}));

beforeEach(() => {
  mocks.fetchFeed.mockReset();
  mocks.fetchFeed.mockResolvedValue({ items: [], nextCursor: null });
  mocks.context.mockReset();
  mocks.viewer.mockReset();
  mocks.viewer.mockResolvedValue(null);
  mocks.freshState.mockReset();
  mocks.freshState.mockResolvedValue({ config: FRESH_ON, revision: 4, updatedAt: null, updatedBy: null });
  vi.unstubAllEnvs();
  resetLastGoodPublicFeedForTests(null);
});

afterEach(() => {
  vi.useRealTimers();
});

const FRESH_ON = { enabled: true, cadence: 4, firstPosition: 3, maxPerPage: 3, freshnessHours: 48, perTypeCaps: {} };

const sentArgs = () =>
  mocks.fetchFeed.mock.calls[0]?.[0] as {
    sort: string;
    typeIds: string[];
    excludeTypeIds?: string[];
    forYouTopicIds: string[];
    cursor: string | null;
    reorderWindow?: unknown;
    freshSlot?: { config: unknown; revision: number };
    markPlayableLeads?: boolean;
  };

describe('GET /api/explore/feed', () => {
  // GEO-3221. The live fresh slot config reaches Best, and only Best.
  it("hands Best the fresh slot's live config", async () => {
    await GET(new Request('https://example.com/api/explore/feed?sort=best'));

    expect(sentArgs().freshSlot).toEqual({ config: FRESH_ON, revision: 4 });
  });

  it('hands the feed the member space it resolved, so the feed does not look it up again', async () => {
    mocks.context.mockReturnValue({ walletAddress: '0xabc', personalMemberSpaceId: 'member-space' });

    await GET(new Request('https://example.com/api/explore/feed?sort=new'));

    expect(mocks.fetchFeed.mock.calls[0]?.[0]).toMatchObject({
      walletAddress: '0xabc',
      viewerMemberSpaceId: 'member-space',
    });
  });

  it.each(['new', 'top', 'for-you'])('does not read the fresh slot for %s', async sort => {
    await GET(new Request(`https://example.com/api/explore/feed?sort=${sort}`));

    expect(sentArgs().freshSlot).toBeUndefined();
    expect(mocks.freshState).not.toHaveBeenCalled();
  });

  // GEO-3234. Seen demotion runs in the browser; the page only says whether it is on.
  describe('seen demotion', () => {
    const SEEN_ON = { ...FRESH_ON, seenDemotion: { enabled: true, minViews: 2, days: 3 } };
    const bestPage = { items: [], nextCursor: null, feed: { name: 'best', version: 'best-1' } };

    it('ships the knobs with a Best page and asks for the playable leads, while on', async () => {
      mocks.freshState.mockResolvedValue({ config: SEEN_ON, revision: 5, updatedAt: null, updatedBy: null });
      mocks.fetchFeed.mockResolvedValue(bestPage);

      const response = await GET(new Request('https://example.com/api/explore/feed?sort=best'));

      expect(sentArgs().markPlayableLeads).toBe(true);
      expect((await response.json()).seenDemotion).toEqual({ minViews: 2, days: 3 });
      // Nothing per-visitor, so nothing stops a shared cache keeping it.
      expect(response.headers.get('cache-control')).toBeNull();
    });

    it('forwards the reserve with a Best page while on, and drops it otherwise', async () => {
      mocks.freshState.mockResolvedValue({ config: SEEN_ON, revision: 5, updatedAt: null, updatedBy: null });
      mocks.fetchFeed.mockResolvedValue({ ...bestPage, reserve: [{ entityId: 'a' }] });
      expect((await (await GET(new Request('https://example.com/api/explore/feed?sort=best'))).json()).reserve).toEqual(
        [{ entityId: 'a' }]
      );

      mocks.fetchFeed.mockResolvedValue({
        ...bestPage,
        feed: { name: 'interleaved', version: 'interleave(a,b)' },
        reserve: [{ entityId: 'a' }],
      });
      expect(
        (await (await GET(new Request('https://example.com/api/explore/feed?sort=best'))).json()).reserve
      ).toBeUndefined();
    });

    it('leaves the page exactly as it was while off', async () => {
      mocks.fetchFeed.mockResolvedValue(bestPage);

      const response = await GET(new Request('https://example.com/api/explore/feed?sort=best'));

      expect(sentArgs().markPlayableLeads).toBe(false);
      expect(await response.json()).toEqual(bestPage);
    });

    it('leaves an interleaved page alone', async () => {
      mocks.freshState.mockResolvedValue({ config: SEEN_ON, revision: 5, updatedAt: null, updatedBy: null });
      mocks.fetchFeed.mockResolvedValue({ ...bestPage, feed: { name: 'interleaved', version: 'interleave(a,b)' } });

      const response = await GET(new Request('https://example.com/api/explore/feed?sort=best'));

      expect((await response.json()).seenDemotion).toBeUndefined();
    });
  });

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

    it('uses the topic stream for verified viewers while onboarding follows are pending, then personalizes again', async () => {
      mocks.viewer.mockResolvedValue('aaaaaaaa000040008000000000000001');
      mocks.fetchFeed.mockResolvedValue({ items: [], nextCursor: 'w1:22:' });
      const topic = '8cb0a2b4adbf4627aa080cec5112099a';
      const url = `https://example.com/api/explore/feed?sort=for-you&followedTopicIds=${topic}`;
      const response = await GET(new Request(`${url}&pendingTopicFollows=1`));

      expect(sentArgs().reorderWindow).toBeUndefined();
      expect(sentArgs().forYouTopicIds).toEqual([topic]);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect((await response.json()).nextCursor).toBe('w1:22:');

      mocks.fetchFeed.mockClear();
      await GET(new Request(url));
      expect(sentArgs().reorderWindow).toBeTypeOf('function');
      expect(sentArgs().forYouTopicIds).toEqual([]);
    });

    it.each(['best', 'new', 'top'])('does not change %s for a pending onboarding signal', async sort => {
      vi.stubEnv('NEXT_PUBLIC_FEED_INTERLEAVING_ENABLED', 'true');
      mocks.viewer.mockResolvedValue('aaaaaaaa000040008000000000000001');
      await GET(
        new Request(
          `https://example.com/api/explore/feed?sort=${sort}&pendingTopicFollows=1&followedTopicIds=8cb0a2b4adbf4627aa080cec5112099a`
        )
      );

      expect(sentArgs().forYouTopicIds).toEqual([]);
      if (sort === 'best') expect(sentArgs().reorderWindow).toBeTypeOf('function');
    });

    it('does not disable personalization for a pending flag with no valid topic ids', async () => {
      mocks.viewer.mockResolvedValue('aaaaaaaa000040008000000000000001');
      await GET(
        new Request('https://example.com/api/explore/feed?sort=for-you&pendingTopicFollows=1&followedTopicIds=invalid')
      );

      expect(sentArgs().reorderWindow).toBeTypeOf('function');
    });

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

  // The CDN keys on the URL and ignores cookies, so the cacheable page lives at its own URL and
  // the server must treat that URL as anonymous whoever asks.
  describe('the public first page', () => {
    const url = 'https://example.com/api/explore/feed?sort=best&public=1';
    const item = (entityId: string) => ({ entityId });
    const page = { items: [item('e1')], nextCursor: 'c1', feed: { name: 'best', version: 'best-1' } };

    it('is read without cookies and without an identity token', async () => {
      vi.stubEnv('NEXT_PUBLIC_FEED_INTERLEAVING_ENABLED', 'true');
      mocks.viewer.mockResolvedValue('viewer-1');
      mocks.fetchFeed.mockResolvedValue(page);

      await GET(new Request(url, { headers: { authorization: 'Bearer token', cookie: 'wallet-address=0xabc' } }));

      expect(mocks.context).toHaveBeenCalledWith(undefined, { anonymous: true });
      expect(mocks.viewer).not.toHaveBeenCalled();
      expect(sentArgs().reorderWindow).toBeUndefined();
    });

    it('carries the CDN cache headers', async () => {
      mocks.fetchFeed.mockResolvedValue(page);

      const response = await GET(new Request(url));

      expect(response.headers.get('cache-control')).toBe(
        'public, s-maxage=60, stale-while-revalidate=600, stale-if-error=86400'
      );
    });

    it.each([
      ['the personal URL', 'sort=best'],
      ['a For you request', 'sort=for-you&public=1'],
      ['a later page', 'sort=best&public=1&cursor=abc'],
      ['a filtered page', 'sort=best&public=1&typeIds=x'],
      ['a stray parameter', 'sort=best&public=1&x=1'],
      ['public set to something else', 'sort=best&public=0'],
    ])('does not cache %s', async (_name, query) => {
      mocks.fetchFeed.mockResolvedValue(page);

      const response = await GET(new Request(`https://example.com/api/explore/feed?${query}`));

      expect(response.headers.get('cache-control')).toBeNull();
    });

    it('does not cache an empty page', async () => {
      mocks.fetchFeed.mockResolvedValue({ items: [], nextCursor: null });

      expect((await GET(new Request(url))).headers.get('cache-control')).toBeNull();
    });

    it('does not cache an error', async () => {
      mocks.fetchFeed.mockRejectedValue(new Error('boom'));
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET(new Request(url));

      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBeNull();
    });

    it('keeps a personalized page private even on the public URL', async () => {
      mocks.fetchFeed.mockResolvedValue(page);
      mocks.viewer.mockResolvedValue('viewer-1');

      const response = await GET(new Request('https://example.com/api/explore/feed?sort=for-you'));

      expect(response.headers.get('cache-control')).toBe('private, no-store');
    });
  });

  // 2026-10-16: gaia shed the feed's queries, and readers waited 60–106s to be told nothing.
  describe('when the feed cannot be built', () => {
    const publicUrl = 'https://example.com/api/explore/feed?sort=best&public=1';
    const page = { items: [{ entityId: 'e1' }], nextCursor: 'c1', feed: { name: 'best', version: 'best-1' } };

    async function rememberPublicPage() {
      mocks.fetchFeed.mockResolvedValueOnce(page);
      expect((await GET(new Request(publicUrl))).status).toBe(200);
    }

    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it.each([
      ['the public first page', publicUrl],
      ['the signed-in first page of Best', 'https://example.com/api/explore/feed?sort=best'],
    ])('serves the last good public page for %s, kept by no cache', async (_name, url) => {
      await rememberPublicPage();
      mocks.fetchFeed.mockRejectedValue(new Error('gaia 503'));

      const response = await GET(new Request(url));

      expect(response.status).toBe(200);
      expect((await response.json()).items).toEqual([{ entityId: 'e1', ranking: { version: 'best-1' } }]);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('x-feed-stale-age')).toBe('0');
    });

    it.each([
      ['a filtered page', `sort=best&typeIds=${DEBATE_TYPE_ID}`],
      ['a later page', 'sort=best&cursor=abc'],
      ['another sort', 'sort=new'],
      ['For you', 'sort=for-you'],
    ])('answers 503 for %s rather than a page that ignores it', async (_name, query) => {
      await rememberPublicPage();
      mocks.fetchFeed.mockRejectedValue(new Error('gaia 503'));

      const response = await GET(new Request(`https://example.com/api/explore/feed?${query}`));

      expect(response.status).toBe(503);
    });

    it('answers 503 when there is no last good page', async () => {
      mocks.fetchFeed.mockRejectedValue(new Error('gaia 503'));

      expect((await GET(new Request(publicUrl))).status).toBe(503);
    });

    it('answers 503 rather than 500 when the request context cannot be read', async () => {
      mocks.context.mockImplementation(() => {
        throw new Error('featured spaces timed out');
      });

      expect((await GET(new Request('https://example.com/api/explore/feed?sort=new'))).status).toBe(503);
    });

    it('stops waiting at the time budget', async () => {
      await rememberPublicPage();
      vi.useFakeTimers();
      mocks.fetchFeed.mockReturnValue(new Promise(() => {}));

      const answered = GET(new Request(publicUrl));
      await vi.advanceTimersByTimeAsync(FEED_TIME_BUDGET_MS);
      const response = await answered;

      expect(response.status).toBe(200);
      expect((await response.json()).items).toHaveLength(1);
    });

    it('answers 503 at the time budget for a request the last good page cannot stand in for', async () => {
      vi.useFakeTimers();
      mocks.fetchFeed.mockReturnValue(new Promise(() => {}));

      const answered = GET(new Request('https://example.com/api/explore/feed?sort=new'));
      await vi.advanceTimersByTimeAsync(FEED_TIME_BUDGET_MS);

      expect((await answered).status).toBe(503);
    });
  });
});
