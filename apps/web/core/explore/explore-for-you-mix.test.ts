import { describe, expect, it } from 'vitest';

import { FOR_YOU_FEED, composeForYouPage } from './explore-for-you-mix';

type Item = { id: string; space: string; topics: string[] };

const item = (id: string, space: string, ...topics: string[]): Item => ({ id, space, topics });
const many = (prefix: string, count: number, space: string | ((i: number) => string), ...topics: string[]) =>
  Array.from({ length: count }, (_, i) =>
    item(`${prefix}${i}`, typeof space === 'string' ? space : space(i), ...topics)
  );
const keys = { idOf: (x: Item) => x.id, spaceOf: (x: Item) => x.space, topicsOf: (x: Item) => x.topics };
const compose = (topic: Item[], best: Item[]) => composeForYouPage(topic, best, keys);
const ids = (items: readonly Item[]) => items.map(x => x.id);
const spread = (i: number) => `s${i}`;

function largestShare(items: readonly Item[], keyOf: (x: Item) => string[]) {
  const counts = new Map<string, number>();
  for (const x of items) for (const k of keyOf(x)) counts.set(k, (counts.get(k) ?? 0) + 1);
  return Math.max(0, ...counts.values());
}

describe('composeForYouPage', () => {
  it('takes three topic items then one Best item while nothing binds', () => {
    const { page } = compose(many('t', 30, spread, 'a', 'b'), many('b', 30, spread));

    expect(ids(page).slice(0, 8)).toEqual(['t0', 't1', 't2', 'b0', 't3', 't4', 't5', 'b1']);
  });

  it('is Best alone when nothing is followed', () => {
    const { page } = compose([], many('b', 30, spread));

    expect(ids(page)).toEqual(ids(many('b', 22, spread)));
  });

  it('keeps every page full and mixed when all followed items sit in one space', () => {
    // The testnet case: two followed topics whose items all live in one space.
    const { page } = compose(many('t', 66, 'ai', 'a', 'b'), many('b', 66, spread));

    expect(page).toHaveLength(FOR_YOU_FEED.pageSize);
    expect(largestShare(page, x => [x.space])).toBeLessThanOrEqual(FOR_YOU_FEED.maxPerSpacePerPage);
    expect(page.filter(x => x.id.startsWith('t'))).toHaveLength(FOR_YOU_FEED.maxPerSpacePerPage);
  });

  it('holds each topic to its limit while other items can fill the page', () => {
    const topic = [...many('a', 40, spread, 'a'), ...many('c', 30, spread, 'c'), ...many('d', 30, spread, 'd')];
    const { page } = compose(topic, many('b', 66, spread));

    expect(page).toHaveLength(FOR_YOU_FEED.pageSize);
    expect(largestShare(page, x => x.topics)).toBeLessThanOrEqual(FOR_YOU_FEED.maxPerTopicPerPage);
  });

  it('keeps at least one Best item in every four', () => {
    const { page } = compose(many('t', 66, spread, 'a', 'b', 'c', 'd'), many('b', 66, spread));

    expect(page.filter(x => x.id.startsWith('b')).length).toBeGreaterThanOrEqual(
      Math.floor(FOR_YOU_FEED.pageSize / FOR_YOU_FEED.bestEvery)
    );
  });

  it('only breaks a limit when nothing else is left, so the page stays full', () => {
    const { page } = compose(many('t', 30, 'one', 'a'), []);

    expect(page).toHaveLength(FOR_YOU_FEED.pageSize);
  });

  it('counts an item with several topics against its least used one', () => {
    const topic = [...many('a', 6, spread, 'a'), item('ab', 'x', 'a', 'b'), ...many('z', 30, spread, 'z')];
    const { page } = compose(topic, many('b', 30, spread));

    expect(ids(page)).toContain('ab');
  });

  it('serves an item in both streams once, and reports it taken from both', () => {
    const shared = item('shared', 's-shared', 'a');
    const { page, takenTopic, takenBest } = compose([item('t0', 's0', 'a'), shared], [shared, item('b1', 's1')]);

    expect(ids(page).filter(id => id === 'shared')).toHaveLength(1);
    expect(takenTopic.has(1)).toBe(true);
    expect(takenBest.has(0)).toBe(true);
  });

  it('leaves the rows it skipped untaken, so a later page can serve them', () => {
    const { takenTopic } = compose(many('t', 66, 'ai', 'a'), many('b', 66, spread));

    expect([...takenTopic]).toEqual([0, 1, 2, 3, 4]);
  });
});
