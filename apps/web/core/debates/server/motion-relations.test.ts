import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';
import { DEBATE_TAG_ID } from '~/core/debates/ontology';

import { loadMotionRelations } from './motion-relations';
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

const topicsOf = async (fetchPage: RelationTargetsPageFetcher) =>
  (await loadMotionRelations(CLAIM, SPACE, fetchPage)).topics;

describe('loadMotionRelations', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it("returns the claim's topics in the debate's space", async () => {
    const fetchPage = pages({ items: [TOPIC], endCursor: null, hasNextPage: false });

    await expect(topicsOf(fetchPage)).resolves.toEqual([{ id: TOPIC, name: null }]);
    expect(fetchPage).toHaveBeenCalledWith(
      { fromEntityIds: [CLAIM], typeIds: [TOPICS_PROPERTY_ID, TAG_PROPERTY_ID], spaceId: SPACE },
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

    await expect(topicsOf(fetchPage)).resolves.toEqual([
      { id: TOPIC, name: null },
      { id: second, name: null },
      { id: third, name: null },
    ]);
    expect(fetchPage.mock.calls.map(([, after]) => after)).toEqual([undefined, 'c1', 'c2']);
  });

  it('returns no topics when the claim has none', async () => {
    const fetchPage = pages({ items: [], endCursor: null, hasNextPage: false });

    await expect(topicsOf(fetchPage)).resolves.toEqual([]);
  });

  // The SDK throws on an id it cannot parse, which would fail the whole publish on every sweep.
  it('skips a topic whose id could not be written', async () => {
    const fetchPage = pages({ items: ['not-an-id', TOPIC], endCursor: null, hasNextPage: false });

    await expect(topicsOf(fetchPage)).resolves.toEqual([{ id: TOPIC, name: null }]);
  });

  // Topics are secondary: a failed read must not cost the debate its publish.
  it('returns no topics when a page fails', async () => {
    const fetchPage = vi.fn<RelationTargetsPageFetcher>(async () => {
      throw new Error('graph down');
    });

    await expect(topicsOf(fetchPage)).resolves.toEqual([]);
  });

  // A partial list is not published as though it were the whole set.
  it('returns no topics when the cursor chain breaks mid-walk', async () => {
    const fetchPage = pages({ items: [TOPIC], endCursor: null, hasNextPage: true });

    await expect(topicsOf(fetchPage)).resolves.toEqual([]);
  });

  describe('Debate tag (GEO-3616)', () => {
    const served = (items: Array<{ typeId: string; toEntityId: string }>) =>
      vi.fn<RelationTargetsPageFetcher>(async () => ({
        items: items.map(item => ({ fromEntityId: CLAIM, ...item })),
        endCursor: null,
        hasNextPage: false,
      }));

    it('says the claim is tagged when it carries the Debate tag here, whatever the id shape', async () => {
      const fetchPage = served([
        { typeId: TAG_PROPERTY_ID, toEntityId: '55c95b26-26f8-482c-b973-9ea99dfde438' },
        { typeId: TOPICS_PROPERTY_ID, toEntityId: TOPIC },
      ]);

      await expect(loadMotionRelations(CLAIM, SPACE, fetchPage)).resolves.toEqual({
        topics: [{ id: TOPIC, name: null }],
        debateTagged: true,
      });
    });

    it('says untagged when the claim has no tags, or only other tags', async () => {
      await expect(loadMotionRelations(CLAIM, SPACE, served([]))).resolves.toMatchObject({ debateTagged: false });
      const other = served([{ typeId: TAG_PROPERTY_ID, toEntityId: 'cccccccccccccccccccccccccccccccc' }]);
      await expect(loadMotionRelations(CLAIM, SPACE, other)).resolves.toEqual({ topics: [], debateTagged: false });
    });

    it('never counts a tag target as a topic, or a topic as the tag', async () => {
      const fetchPage = served([{ typeId: TOPICS_PROPERTY_ID, toEntityId: DEBATE_TAG_ID }]);

      await expect(loadMotionRelations(CLAIM, SPACE, fetchPage)).resolves.toEqual({
        topics: [{ id: DEBATE_TAG_ID, name: null }],
        debateTagged: false,
      });
    });

    // Unknown must not read as untagged, or a failed read would add a second tag.
    it('reports the tag as unknown when the read fails', async () => {
      const fetchPage = vi.fn<RelationTargetsPageFetcher>(async () => {
        throw new Error('graph down');
      });

      await expect(loadMotionRelations(CLAIM, SPACE, fetchPage)).resolves.toEqual({ topics: [], debateTagged: null });
    });
  });
});
