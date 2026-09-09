import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FEATURED_TAG_ID, ROOT_SPACE, TAG_PROPERTY_ID, TOPIC_TYPE_ID } from '~/core/constants';

import { clearFeaturedSpacesCache, fetchFeaturedSpaces, fetchFeaturedSpacesShared } from './fetch-featured-spaces';

const graphqlMock = vi.fn();

vi.mock('~/core/environment', () => ({
  Environment: {
    getConfig: () => ({ api: 'https://example.com/graphql', bundler: '', chainId: '19411', rpc: '' }),
  },
}));

vi.mock('./graphql', () => ({
  graphql: (...args: unknown[]) => graphqlMock(...args),
}));

// Curated rank ids (from space-ranking): Root=0, Crypto=2, AI=3.
const AI_SPACE = '41e851610e13a19441c4d980f2f2ce6b';
const CRYPTO_SPACE = 'c9f267dcb0d270718c2a3c45a64afd32';

function spaceNode(id: string, name: string) {
  return { id, page: { id: `page-${id}`, name, relationsList: [] }, members: { totalCount: 1 } };
}

/** One row of the Featured-tag relation list: the tagged topic and the spaces claiming it. */
function taggedTopic(id: string, name: string, spaces: ReturnType<typeof spaceNode>[]) {
  return { fromEntity: { id, name, spacesByTopicIdConnection: { nodes: spaces } } };
}

function query(arg: unknown): string {
  return (arg as { query?: string } | undefined)?.query ?? '';
}

function respondWith(relations: unknown[]) {
  graphqlMock.mockImplementation(() => Effect.succeed({ relations }));
}

describe('fetchFeaturedSpaces', () => {
  beforeEach(() => graphqlMock.mockReset());

  it('asks only for Topic entities tagged Featured in Root, in a single request', async () => {
    respondWith([taggedTopic('t1', 'AI', [spaceNode(AI_SPACE, 'AI')])]);

    await fetchFeaturedSpaces();

    // The whole point of the change: one round trip, not a tree walk.
    expect(graphqlMock.mock.calls.length).toBe(1);

    const q = query(graphqlMock.mock.calls[0][0]);
    expect(q).toContain(TAG_PROPERTY_ID);
    expect(q).toContain(FEATURED_TAG_ID);
    expect(q).toContain(`spaceId: { is: "${ROOT_SPACE}" }`);
    // Narrowing to Topic server-side is what keeps non-topic Featured things (rankings,
    // for one) out of the pill list without a second pass here.
    expect(q).toContain(TOPIC_TYPE_ID);
  });

  it('resolves each topic to its claiming space and orders by curated space rank', async () => {
    // Returned AI-first to prove the ordering is rank-based, not response order.
    respondWith([
      taggedTopic('t1', 'AI', [spaceNode(AI_SPACE, 'AI')]),
      taggedTopic('t2', 'Crypto', [spaceNode(CRYPTO_SPACE, 'Crypto')]),
    ]);

    const result = await fetchFeaturedSpaces();

    expect(result.map(r => r.spaceId)).toEqual([CRYPTO_SPACE, AI_SPACE]);
    expect(result.map(r => r.name)).toEqual(['Crypto', 'AI']);
    expect(result.map(r => r.topicId)).toEqual(['t2', 't1']);
  });

  it('dedupes a space that claims more than one featured topic', async () => {
    respondWith([
      taggedTopic('t1', 'AI', [spaceNode(AI_SPACE, 'AI')]),
      taggedTopic('t2', 'AI (alias)', [spaceNode(AI_SPACE, 'AI')]),
    ]);

    expect((await fetchFeaturedSpaces()).map(r => r.spaceId)).toEqual([AI_SPACE]);
  });

  it('skips a tagged topic that no space claims', async () => {
    respondWith([taggedTopic('t1', 'Unclaimed', []), taggedTopic('t2', 'AI', [spaceNode(AI_SPACE, 'AI')])]);

    expect((await fetchFeaturedSpaces()).map(r => r.spaceId)).toEqual([AI_SPACE]);
  });

  // Root is never offered in its own Join-spaces panel. It also outranks everything, so
  // dropping it from the candidates rather than skipping the topic outright is what keeps
  // a shared topic resolving to the space actually worth joining.
  it('never features the Root space, and picks the next-ranked claimant instead', async () => {
    respondWith([taggedTopic('t1', 'Geo', [spaceNode(ROOT_SPACE, 'Root'), spaceNode(AI_SPACE, 'AI')])]);

    expect((await fetchFeaturedSpaces()).map(r => r.spaceId)).toEqual([AI_SPACE]);
  });

  it('returns [] when nothing is tagged Featured', async () => {
    respondWith([]);
    expect(await fetchFeaturedSpaces()).toEqual([]);
  });

  it('throws when the query fails, so a failure is not indistinguishable from no featured spaces', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    graphqlMock.mockImplementation(() => Effect.fail({ _tag: 'GraphqlRuntimeError' }));

    await expect(fetchFeaturedSpaces()).rejects.toThrow();
    consoleError.mockRestore();
  });
});

/**
 * These cover the sharing, not the fetch, which the suite above owns. Much less
 * load-bearing than when this list cost five sequential round trips, but the in-flight
 * join still matters: `/api/explore/feed` runs per request and cannot hand its promise to
 * the next one the way `app/explore/page.tsx` hands one to the sidebar.
 */
describe('fetchFeaturedSpacesShared', () => {
  const AI_ONLY = () => respondWith([taggedTopic('t1', 'AI', [spaceNode(AI_SPACE, 'AI')])]);

  beforeEach(() => {
    graphqlMock.mockReset();
    clearFeaturedSpacesCache();
    vi.useRealTimers();
  });

  it('fetches once and reuses the answer', async () => {
    AI_ONLY();

    const first = await fetchFeaturedSpacesShared();
    const callsAfterFirst = graphqlMock.mock.calls.length;
    const second = await fetchFeaturedSpacesShared();

    expect(first.map(f => f.spaceId)).toEqual([AI_SPACE]);
    expect(second).toEqual(first);
    expect(graphqlMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it('makes concurrent callers join the fetch already running', async () => {
    AI_ONLY();

    const [a, b, c] = await Promise.all([
      fetchFeaturedSpacesShared(),
      fetchFeaturedSpacesShared(),
      fetchFeaturedSpacesShared(),
    ]);

    expect(graphqlMock.mock.calls.length).toBe(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it('fetches again once the list has gone stale', async () => {
    AI_ONLY();

    await fetchFeaturedSpacesShared();
    const callsAfterFirst = graphqlMock.mock.calls.length;
    vi.useFakeTimers();
    vi.advanceTimersByTime(5 * 60 * 1000);
    await fetchFeaturedSpacesShared();

    expect(graphqlMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  // A transient GraphQL failure must cost one request, not five minutes of an empty
  // Featured panel. `runQuery` re-throws cancellation on purpose, so the same applies to an
  // aborted caller: it must not leave its rejection behind for everyone else.
  it('does not keep a rejection', async () => {
    graphqlMock.mockImplementation(() => Effect.fail({ _tag: 'AbortError' }));

    await expect(fetchFeaturedSpacesShared()).rejects.toBeDefined();

    AI_ONLY();
    await expect(fetchFeaturedSpacesShared()).resolves.toEqual([expect.objectContaining({ spaceId: AI_SPACE })]);
  });
});
