import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import type { ExploreFeedItem } from '~/core/explore/explore-card-item';
import { TEMPLATE_ONTOLOGY } from '~/core/templates/ontology';
import type { Entity } from '~/core/types';

import { prefetchTopicTemplateQueries } from './topic-template-prefetch';

const TOPIC = '90ff85ca38574b39ad441fe5f01b34ac';
const SPACE = '89bd89bf28ff8a0963faf92a8c905e20';
const hex = (n: number) => n.toString(16).padStart(32, '0');
const [A, B, C, D, E, F] = [1, 2, 3, 4, 5, 6].map(hex);

const io = vi.hoisted(() => ({
  readTopicFeed: vi.fn(),
  fetchRecentAgendaClaims: vi.fn(),
  fetchTopicCoverage: vi.fn(),
  fetchTopicTaggedInSpace: vi.fn(),
  fetchTopicClaimVotes: vi.fn(),
}));

vi.mock('~/core/explore/resolve-explore-feed-request-context', () => ({
  resolveExploreFeedRequestContext: vi.fn(async () => ({})),
}));
vi.mock('~/core/topics/browse/read-topic-feed', () => ({ readTopicFeed: io.readTopicFeed }));
vi.mock('~/core/templates/adapters/recent-agenda-claims', async importOriginal => ({
  ...(await importOriginal<object>()),
  fetchRecentAgendaClaims: io.fetchRecentAgendaClaims,
}));
vi.mock('~/core/topics/browse/use-topic-coverage', async importOriginal => ({
  ...(await importOriginal<object>()),
  fetchTopicCoverage: io.fetchTopicCoverage,
}));
vi.mock('~/core/templates/adapters/use-topic-tagged-in-space', async importOriginal => ({
  ...(await importOriginal<object>()),
  fetchTopicTaggedInSpace: io.fetchTopicTaggedInSpace,
}));
vi.mock('~/core/templates/adapters/topic-template-queries', async importOriginal => ({
  ...(await importOriginal<object>()),
  fetchTopicClaimVotes: io.fetchTopicClaimVotes,
}));

function item(id: string, extra: Partial<ExploreFeedItem> = {}): ExploreFeedItem {
  return {
    entityId: id,
    spaceId: SPACE,
    title: `Item ${id.slice(-1)}`,
    debateClaim: null,
    ...extra,
  } as ExploreFeedItem;
}

const topic = {
  id: TOPIC,
  relations: [
    {
      type: { id: TEMPLATE_ONTOLOGY.TOPIC_CLAIMS_PROPERTY_ID },
      toEntity: { id: F, name: 'Direct claim' },
      toSpaceId: SPACE,
    },
  ],
} as unknown as Entity;

const coverage = { rows: [], hasNextPage: false };

beforeEach(() => {
  vi.clearAllMocks();
  io.readTopicFeed.mockImplementation(async ({ typeIds, sort }: { typeIds: string; sort: string }) => {
    if (typeIds === DEBATE_TYPE_ID)
      return { items: [item(D, { debateClaim: { entityId: E, name: 'Debated' } as never })] };
    return { items: sort === 'top' ? [item(B), item(C)] : [item(A), item(B)] };
  });
  io.fetchRecentAgendaClaims.mockResolvedValue([]);
  io.fetchTopicCoverage.mockResolvedValue(coverage);
  // C is in the feed but the space did not tag it.
  io.fetchTopicTaggedInSpace.mockResolvedValue(new Set([A, B, D]));
  io.fetchTopicClaimVotes.mockResolvedValue([]);
});

const keysOf = (entries: { queryKey: readonly unknown[] }[]) => entries.map(entry => entry.queryKey);

describe('prefetchTopicTemplateQueries', () => {
  it('seeds every section read under the key its hook asks for', async () => {
    const entries = await prefetchTopicTemplateQueries({ topicId: TOPIC, spaceId: SPACE, topic });

    // Written out rather than built with the key helpers, so a change to a key's shape on either side
    // shows up here rather than as a silent cache miss and a skeleton in the HTML.
    expect(keysOf(entries)).toEqual(
      expect.arrayContaining([
        ['live-topic-template', 'top-claims', TOPIC, SPACE],
        ['live-topic-template', 'best-claims', TOPIC, SPACE],
        ['live-topic-template', 'best-debates', TOPIC, SPACE, false],
        ['recent-agenda-claims', 21],
        ['topic', 'coverage', TOPIC, 12, null, [SPACE], 'relation-scoped'],
        ['topic', 'tagged-in-space', TOPIC, SPACE, [A, B, C, D]],
        // The claims the first render draws: tagged Best, tagged Top, the debated claim, the topic's own.
        ['live-topic-template', 'multi-space-votes', [A, B, E, F]],
      ])
    );
    expect(entries).toHaveLength(7);
    expect(entries.every(entry => typeof entry.updatedAt === 'number' && entry.updatedAt > 0)).toBe(true);
  });

  it('hands over the rows as the route would, and the votes as read', async () => {
    const entries = await prefetchTopicTemplateQueries({ topicId: TOPIC, spaceId: SPACE, topic });
    const byKey = new Map(entries.map(entry => [JSON.stringify(entry.queryKey), entry.data]));
    expect(byKey.get(JSON.stringify(['live-topic-template', 'best-debates', TOPIC, SPACE, false]))).toMatchObject({
      fromSpaceFeed: false,
      items: [{ entityId: D }],
    });
    expect(byKey.get(JSON.stringify(['topic', 'coverage', TOPIC, 12, null, [SPACE], 'relation-scoped']))).toBe(
      coverage
    );
    expect(io.fetchTopicClaimVotes).toHaveBeenCalledWith([A, B, E, F], expect.any(AbortSignal));
  });

  it('leaves out a failed read, and whatever depends on it, for the client to ask', async () => {
    io.fetchTopicTaggedInSpace.mockRejectedValue(new Error('graph down'));
    const entries = await prefetchTopicTemplateQueries({ topicId: TOPIC, spaceId: SPACE, topic });
    const keys = keysOf(entries).map(key => key.slice(0, 2).join('/'));
    expect(keys).not.toContain('topic/tagged-in-space');
    expect(keys).not.toContain('live-topic-template/multi-space-votes');
    expect(keys).toContain('live-topic-template/top-claims');
  });

  it('returns what has landed when the budget runs out, and aborts the rest', async () => {
    let signal: AbortSignal | undefined;
    io.fetchTopicCoverage.mockImplementation(
      (_args: unknown, s: AbortSignal) =>
        new Promise(() => {
          signal = s;
        })
    );
    const started = Date.now();
    const entries = await prefetchTopicTemplateQueries({ topicId: TOPIC, spaceId: SPACE, topic, budgetMs: 50 });
    expect(Date.now() - started).toBeLessThan(1_000);
    const keys = keysOf(entries).map(key => key.slice(0, 2).join('/'));
    expect(keys).toContain('live-topic-template/top-claims');
    expect(keys).not.toContain('topic/coverage');
    expect(signal?.aborted).toBe(true);
  });
});
