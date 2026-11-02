import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExploreFeedRow } from '~/core/explore/explore-card-item';

import { BEST_FEED_VERSION } from './feed-version';
import type { GaiaForYouResponse } from './gaia-for-you';
import {
  applyForYouOrder,
  createPersonalizedWindowReorder,
  resetInterleavingCacheForTests,
} from './personalized-window';

const row = (id: string): ExploreFeedRow =>
  ({
    entityId: id,
    spaceId: 'space',
    types: [],
    createdAtSec: 0,
    title: id,
    description: null,
    imageUrl: null,
    recordingUrls: [],
    debateVideoUrls: [],
    debateClaim: null,
    commentCount: 0,
    isMemberOrEditor: false,
  }) as ExploreFeedRow;

const ids = (rows: readonly ExploreFeedRow[]) => rows.map(r => r.entityId);
const arrange = (rows: ExploreFeedRow[]) => rows;
const window = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map(row);

function gaia(overrides: Partial<GaiaForYouResponse> = {}): GaiaForYouResponse {
  return {
    ranking: { name: 'for-you', version: 'for-you-1.4', codeVersion: 1, configRevision: 4 },
    personalized: true,
    asOf: '2026-10-05T00:00:00.000Z',
    // a5 boosted to the top, a2 already voted on.
    items: ['a5', 'a1', 'a3', 'a4', 'a6'].map((entityId, i) => ({
      entityId,
      bestPosition: i,
      score: { best: 10 - i, interest: entityId === 'a5' ? 4 : 0, boost: entityId === 'a5' ? 3.4 : 0, total: 10 },
      reason:
        entityId === 'a5'
          ? {
              topicId: 't',
              topicName: 'AI safety',
              kind: 'vote',
              count: 4,
              viaTopicId: null,
              viaTopicName: null,
              text: '4 votes on AI safety',
            }
          : null,
      exploration: entityId === 'a6',
      explorationProbability: entityId === 'a6' ? 0.25 : null,
    })),
    excluded: [{ entityId: 'a2', reason: 'voted' }],
    exploration: { share: 0.1, slots: 0, poolSize: 4, picked: 0 },
    experiment: null,
    ...overrides,
  };
}

const reorder = (response: GaiaForYouResponse | null, requested: 'best' | 'for-you', interleavingEnabled = false) => {
  const fetchForYou = vi.fn(async () => response);
  return {
    fetchForYou,
    run: createPersonalizedWindowReorder({
      userId: 'user',
      requested,
      asOf: '2026-10-05T00:00:00.000Z',
      interleavingEnabled,
      fetchForYou,
    }),
  };
};

describe('applyForYouOrder', () => {
  it("follows gaia's order, drops the excluded, and carries each item's reason, score and exploration mark", () => {
    const out = applyForYouOrder(window, gaia(), 'v');
    expect(ids(out)).toEqual(['a5', 'a1', 'a3', 'a4', 'a6']);
    expect(out[0]?.ranking).toMatchObject({
      version: 'v',
      reason: { text: '4 votes on AI safety' },
      exploration: false,
    });
    expect(out[4]?.ranking).toMatchObject({ exploration: true, explorationProbability: 0.25 });
  });

  it('keeps a row gaia did not mention, at the end', () => {
    const out = applyForYouOrder([...window, row('a7')], gaia(), 'v');
    expect(ids(out).at(-1)).toBe('a7');
    expect(out).toHaveLength(6);
  });
});

describe('createPersonalizedWindowReorder', () => {
  beforeEach(() => resetInterleavingCacheForTests());

  it('serves For you, named and versioned', async () => {
    const { run } = reorder(gaia(), 'for-you');
    const result = await run(window, { windowKey: '', arrange });
    expect(result?.feed).toEqual({ name: 'for-you', version: 'for-you-1.4+web.1' });
    expect(ids(result!.rows)).toEqual(['a5', 'a1', 'a3', 'a4', 'a6']);
  });

  it('serves exactly Best to a user with no interests', async () => {
    const { run } = reorder(gaia({ personalized: false, items: [], excluded: [] }), 'for-you');
    expect(await run(window, { windowKey: '', arrange })).toBeNull();
  });

  it('serves Best when gaia is unavailable', async () => {
    const { run } = reorder(null, 'for-you');
    expect(await run(window, { windowKey: '', arrange })).toBeNull();
  });

  it('runs every arm through the diversity pass, and the merged page once more', async () => {
    const experiment = {
      id: 'x1',
      arms: ['best', 'for-you'] as [string, string],
      interleaved: true,
      assignment: 'hash' as const,
    };
    const { run } = reorder(gaia({ experiment }), 'best', true);
    const arrangeSpy = vi.fn((rows: ExploreFeedRow[]) => rows);
    await run(window, { windowKey: 'w', arrange: arrangeSpy });
    expect(arrangeSpy).toHaveBeenCalledTimes(3);
  });

  it('interleaves the two arms for a user in the group, crediting each card', async () => {
    const experiment = {
      id: 'x1',
      arms: ['best', 'for-you'] as [string, string],
      interleaved: true,
      assignment: 'hash' as const,
    };
    const { run } = reorder(gaia({ experiment }), 'best', true);
    const result = await run(window, { windowKey: 'w', arrange });
    expect(result?.feed).toEqual({
      name: 'interleaved',
      version: `interleave(${BEST_FEED_VERSION},for-you-1.4+web.1)`,
      experimentId: 'x1',
      arms: { a: BEST_FEED_VERSION, b: 'for-you-1.4+web.1' },
    });
    const rows = result!.rows;
    // Every candidate either arm wanted appears once: Best still has a2, For you does not.
    expect(new Set(ids(rows))).toEqual(new Set(['a1', 'a2', 'a3', 'a4', 'a5', 'a6']));
    expect(rows).toHaveLength(6);
    for (const r of rows) {
      expect(r.ranking?.experimentId).toBe('x1');
      expect(r.ranking?.version).toBe(r.ranking?.arm === 'a' ? BEST_FEED_VERSION : 'for-you-1.4+web.1');
    }
    // Teams stay level within one.
    const a = rows.filter(r => r.ranking?.arm === 'a').length;
    expect(Math.abs(a - (rows.length - a))).toBeLessThanOrEqual(1);
  });

  it('interleaves the same window identically on every request', async () => {
    const experiment = {
      id: 'x1',
      arms: ['best', 'for-you'] as [string, string],
      interleaved: true,
      assignment: 'hash' as const,
    };
    const first = await reorder(gaia({ experiment }), 'for-you', true).run(window, { windowKey: 'w', arrange });
    const second = await reorder(gaia({ experiment }), 'for-you', true).run(window, { windowKey: 'w', arrange });
    expect(first).toEqual(second);
  });

  it('does not interleave while interleaving is switched off', async () => {
    const experiment = {
      id: 'x1',
      arms: ['best', 'for-you'] as [string, string],
      interleaved: true,
      assignment: 'hash' as const,
    };
    const { run, fetchForYou } = reorder(gaia({ experiment }), 'best', false);
    expect(await run(window, { windowKey: 'w', arrange })).toBeNull();
    expect(fetchForYou).not.toHaveBeenCalled();
  });

  it('remembers that a Best reader is not in the group, and stops asking', async () => {
    const { run, fetchForYou } = reorder(gaia(), 'best', true);
    expect(await run(window, { windowKey: 'w', arrange })).toBeNull();
    expect(await run(window, { windowKey: 'w', arrange })).toBeNull();
    expect(fetchForYou).toHaveBeenCalledTimes(1);
  });

  it('interleaves Best with itself for the A/A check', async () => {
    const experiment = {
      id: 'aa',
      arms: ['best', 'best'] as [string, string],
      interleaved: true,
      assignment: 'member' as const,
    };
    const result = await reorder(gaia({ experiment }), 'best', true).run(window, { windowKey: 'w', arrange });
    expect(ids(result!.rows)).toEqual(ids(window));
    expect(result!.rows.filter(r => r.ranking?.arm === 'a')).toHaveLength(3);
  });
});
