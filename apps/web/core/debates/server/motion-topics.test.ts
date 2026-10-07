import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';

import { loadMotionTopics } from './motion-topics';
import type { RelationTargetsPageFetcher } from './relation-targets';

const CLAIM = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SPACE = '8b5c8625ff017732063d56e85d24dbed';
const TOPIC = 'dddddddddddddddddddddddddddddddd';

/** A connection served one page per call, in order; items are the topic ids. */
function pages(...served: Array<{ items: string[]; endCursor: string | null; hasNextPage: boolean }>) {
  const fetchPage = vi.fn<RelationTargetsPageFetcher>(async () => {
    const page = served.shift();
    if (!page) throw new Error('fetched past the last page');
    return {
      ...page,
      items: page.items.map(toEntityId => ({ fromEntityId: CLAIM, typeId: TOPICS_PROPERTY_ID, toEntityId })),
    };
  });
  return fetchPage;
}

describe('loadMotionTopics', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it("returns the claim's topics in the debate's space", async () => {
    const fetchPage = pages({ items: [TOPIC], endCursor: null, hasNextPage: false });

    await expect(loadMotionTopics(CLAIM, SPACE, fetchPage)).resolves.toEqual([{ id: TOPIC, name: null }]);
    expect(fetchPage).toHaveBeenCalledWith(
      { fromEntityIds: [CLAIM], typeIds: [TOPICS_PROPERTY_ID], spaceId: SPACE },
      undefined
    );
  });

  // The Debate's topics are written once, so a read that stopped at the first page would publish a
  // permanently incomplete set.
  it('follows the cursor until the connection is exhausted', async () => {
    const [second, third] = ['eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 'ffffffffffffffffffffffffffffffff'];
    const fetchPage = pages(
      { items: [TOPIC], endCursor: 'c1', hasNextPage: true },
      { items: [second], endCursor: 'c2', hasNextPage: true },
      { items: [third], endCursor: 'c3', hasNextPage: false }
    );

    await expect(loadMotionTopics(CLAIM, SPACE, fetchPage)).resolves.toEqual([
      { id: TOPIC, name: null },
      { id: second, name: null },
      { id: third, name: null },
    ]);
    expect(fetchPage.mock.calls.map(([, after]) => after)).toEqual([undefined, 'c1', 'c2']);
  });

  it('returns no topics when the claim has none', async () => {
    const fetchPage = pages({ items: [], endCursor: null, hasNextPage: false });

    await expect(loadMotionTopics(CLAIM, SPACE, fetchPage)).resolves.toEqual([]);
  });

  // The SDK throws on an id it cannot parse, which would fail the whole publish on every sweep.
  it('skips a topic whose id could not be written', async () => {
    const fetchPage = pages({ items: ['not-an-id', TOPIC], endCursor: null, hasNextPage: false });

    await expect(loadMotionTopics(CLAIM, SPACE, fetchPage)).resolves.toEqual([{ id: TOPIC, name: null }]);
  });

  // Topics are secondary: a failed read must not cost the debate its publish.
  it('returns no topics when a page fails', async () => {
    const fetchPage = vi.fn<RelationTargetsPageFetcher>(async () => {
      throw new Error('graph down');
    });

    await expect(loadMotionTopics(CLAIM, SPACE, fetchPage)).resolves.toEqual([]);
  });

  // A partial list is not published as though it were the whole set.
  it('returns no topics when the cursor chain breaks mid-walk', async () => {
    const fetchPage = pages({ items: [TOPIC], endCursor: null, hasNextPage: true });

    await expect(loadMotionTopics(CLAIM, SPACE, fetchPage)).resolves.toEqual([]);
  });
});
