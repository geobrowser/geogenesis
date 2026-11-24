import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GraphHop1, GraphNode } from '../fetch-graph-neighbourhood';
import type { GraphCardMeta } from '../graph-card-metadata';
import type { GraphKind } from '../graph-kinds';
import { FEATURED_BUDGET_MS, loadGraphCardData } from './graph-card-data';

vi.mock('./graph-card-meta', () => ({ loadGraphCardMeta: vi.fn() }));
vi.mock('~/core/io/subgraph/fetch-featured-spaces', () => ({ fetchFeaturedSpacesShared: vi.fn() }));

const TOPIC = '4ed3162278994f29bde7a6f7cf60e28e';
const SPACE = '89bd89bf28ff8a0963faf92a8c905e20';
const FEATURED = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const graphNode = (id: string, kind: GraphKind, extra: Partial<GraphNode> = {}): GraphNode => ({
  id,
  name: `Node ${id}`,
  spaceIds: [SPACE],
  namedSpaceIds: [SPACE],
  types: [{ id: 't', name: kind === 'src' ? 'Article' : null }],
  image: kind === 'ent' ? 'https://img.test/a.png' : null,
  kind,
  typeRank: 0,
  placedSpaceIds: [SPACE],
  date: null,
  agrees: 0,
  disagrees: 0,
  ...extra,
});

const edge = (id: string) => ({
  id: `e${id}`,
  fromId: TOPIC,
  toId: id,
  propertyId: 'p',
  propertyName: null,
  spaceId: SPACE,
});

const hop1 = (nodes: GraphNode[], centre: Partial<GraphNode> = {}): GraphHop1 => ({
  centre: { ...graphNode(TOPIC, 'topic', centre), description: null, texts: [] },
  neighbours: nodes.map(node => ({ node, edge: edge(node.id) })),
  moreKinds: ['src'],
});

const topicMeta: GraphCardMeta = {
  centre: { id: TOPIC, name: 'Israel-Gaza war', description: 'War.', types: [], kind: 'topic', image: null },
  topic: { id: TOPIC, name: 'Israel-Gaza war' },
};

function deps(overrides: Partial<Parameters<typeof loadGraphCardData>[1]> = {}) {
  return {
    loadMeta: vi.fn(async () => topicMeta),
    fetchFeatured: vi.fn(async () => [{ spaceId: FEATURED }]),
    fetchHop1: vi.fn(async () => hop1([])),
    fetchAllClaimsAbout: vi.fn(async () => ({ claims: [], truncated: false })),
    fetchSummaries: vi.fn(async () => new Map()),
    inlineImage: vi.fn(async () => ({ src: 'data:image/jpeg;base64,AA', timedOut: false })),
    ...overrides,
  } as NonNullable<Parameters<typeof loadGraphCardData>[1]>;
}

const ids = { entityId: TOPIC, topicId: TOPIC, spaceId: SPACE };

afterEach(() => vi.useRealTimers());

describe('loadGraphCardData', () => {
  it('draws nothing for an unknown or hidden centre', async () => {
    expect(await loadGraphCardData(ids, deps({ loadMeta: vi.fn(async () => null) }))).toBeNull();
  });

  it('scopes to featured spaces plus the route space, with no overrides', async () => {
    const d = deps();
    const data = await loadGraphCardData(ids, d);
    expect(d.fetchHop1).toHaveBeenCalledWith(TOPIC, expect.objectContaining({ spaceIds: [FEATURED, SPACE].sort() }));
    expect(data?.degraded).toBe(false);
  });

  it('falls back to the route space, degraded, when the featured walk is slow', async () => {
    vi.useFakeTimers();
    const d = deps({ fetchFeatured: vi.fn(() => new Promise<never>(() => {})) });
    const pending = loadGraphCardData(ids, d);
    await vi.advanceTimersByTimeAsync(FEATURED_BUDGET_MS);
    const data = await pending;
    expect(d.fetchHop1).toHaveBeenCalledWith(TOPIC, expect.objectContaining({ spaceIds: [SPACE] }));
    expect(data?.degraded).toBe(true);
  });

  it('counts claims in their own space, never from the cross-space node counts', async () => {
    const claim = graphNode('c1', 'claim', { agrees: 40, disagrees: 0 });
    const d = deps({
      fetchHop1: vi.fn(async () => hop1([claim])),
      fetchSummaries: vi.fn(
        async ({ spaceId }) =>
          new Map([
            [
              'c1:stance',
              {
                counts: spaceId === SPACE ? { positive: 1, negative: 3 } : { positive: 9, negative: 9 },
                viewerResponse: null,
                responders: [],
              },
            ],
          ])
      ),
    });
    const data = await loadGraphCardData(ids, d);
    expect(data?.neighbours[0].counts).toEqual({ positive: 1, negative: 3 });
  });

  it('picks at most six neighbours and counts every kind', async () => {
    const nodes = [
      ...Array.from({ length: 5 }, (_, i) => graphNode(`s${i}`, 'src')),
      ...Array.from({ length: 5 }, (_, i) => graphNode(`e${i}`, 'ent')),
    ];
    const data = await loadGraphCardData(ids, deps({ fetchHop1: vi.fn(async () => hop1(nodes)) }));
    expect(data?.neighbours).toHaveLength(6);
    expect(data?.kindCounts).toEqual([
      { kind: 'ent', n: 5, more: false },
      { kind: 'src', n: 5, more: true },
    ]);
    expect(data?.neighbours.find(node => node.kind === 'src')?.label).toBe('Article');
  });

  it('marks the card degraded when an image runs out of time', async () => {
    const d = deps({
      fetchHop1: vi.fn(async () => hop1([graphNode('e1', 'ent')])),
      inlineImage: vi.fn(async () => ({ src: null, timedOut: true })),
    });
    const data = await loadGraphCardData(ids, d);
    expect(data?.degraded).toBe(true);
    expect(data?.neighbours[0].image).toBeNull();
  });

  it('reads a claim centre’s counts in its own space', async () => {
    const CLAIM = 'cccccccccccccccccccccccccccccccc';
    const d = deps({
      loadMeta: vi.fn(async () => ({
        centre: { id: CLAIM, name: 'A claim', description: null, types: [], kind: 'claim' as const, image: null },
        topic: topicMeta.topic,
      })),
      fetchHop1: vi.fn(async () => hop1([], { id: CLAIM, kind: 'claim' })),
      fetchSummaries: vi.fn(
        async () =>
          new Map([[`${CLAIM}:stance`, { counts: { positive: 5, negative: 5 }, viewerResponse: null, responders: [] }]])
      ),
    });
    const data = await loadGraphCardData({ ...ids, entityId: CLAIM }, d);
    expect(data?.centre).toMatchObject({ kind: 'claim', typeLabel: 'Claim', counts: { positive: 5, negative: 5 } });
    expect(data?.isTopicCentre).toBe(false);
    expect(d.fetchAllClaimsAbout).not.toHaveBeenCalled();
    expect(d.inlineImage).not.toHaveBeenCalled();
  });

  it('summarises a topic with no voted claims as empty', async () => {
    const d = deps({
      fetchAllClaimsAbout: vi.fn(async () => ({ claims: [{ id: 'q', name: 'Q', spaceId: SPACE }], truncated: false })),
    });
    const data = await loadGraphCardData(ids, d);
    expect(data?.summary?.claims).toEqual([]);
  });
});
