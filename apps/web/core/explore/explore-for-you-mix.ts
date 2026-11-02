import { EXPLORE_PAGE_SIZE } from './explore-constants';
import { EXPLORE_DIVERSITY_WINDOW_SIZE, EXPLORE_SPACE_MAX_PER_PAGE } from './explore-diversity';

/** Tuning for Explore's For you sort (GEO-3083). Every page limit here holds per page. */
export const FOR_YOU_FEED = {
  pageSize: EXPLORE_PAGE_SIZE,
  /** At least one Best item in every `bestEvery` slots (5 of 22), so new topics can surface. */
  bestEvery: 4,
  /** Most items one followed topic may hold on a page. */
  maxPerTopicPerPage: 6,
  /** Most items one space may hold on a page, as on Best. */
  maxPerSpacePerPage: EXPLORE_SPACE_MAX_PER_PAGE,
  /** Rows fetched ahead in each stream, so the limits have items to choose from. */
  lookahead: EXPLORE_DIVERSITY_WINDOW_SIZE,
  /** Most `lookahead` reads per stream per page, when too few of the first are still servable. */
  maxFetchesPerStream: 4,
} as const;

export type ForYouFeedConfig = typeof FOR_YOU_FEED;

type Stream<T> = { items: readonly T[]; isTopic: boolean };

/**
 * One page from the ranked topic and Best streams: each slot takes the first item within every limit,
 * relaxing space then topic only when none fits, so pages stay full. Pure; returns indices taken.
 */
export function composeForYouPage<T>(
  topicItems: readonly T[],
  bestItems: readonly T[],
  keys: { idOf: (item: T) => string; spaceOf: (item: T) => string; topicsOf: (item: T) => readonly string[] },
  config: Pick<ForYouFeedConfig, 'pageSize' | 'bestEvery' | 'maxPerTopicPerPage' | 'maxPerSpacePerPage'> = FOR_YOU_FEED
): { page: T[]; takenTopic: Set<number>; takenBest: Set<number> } {
  const topic: Stream<T> = { items: topicItems, isTopic: true };
  const best: Stream<T> = { items: bestItems, isTopic: false };
  const taken = new Map<Stream<T>, Set<number>>([
    [topic, new Set()],
    [best, new Set()],
  ]);
  const page: T[] = [];
  const ids = new Set<string>();
  const perSpace = new Map<string, number>();
  const perTopic = new Map<string, number>();
  let bestCount = 0;

  const leastUsedTopic = (item: T): string | null => {
    let least: string | null = null;
    for (const t of keys.topicsOf(item)) {
      if (least === null || (perTopic.get(t) ?? 0) < (perTopic.get(least) ?? 0)) least = t;
    }
    return least;
  };
  // 2: every limit. 1: the topic limit only, when spaces can't be spread. 0: none.
  const fits = (stream: Stream<T>, item: T, level: number) => {
    if (level === 0) return true;
    if (level === 2 && (perSpace.get(keys.spaceOf(item)) ?? 0) >= config.maxPerSpacePerPage) return false;
    if (!stream.isTopic) return true;
    const t = leastUsedTopic(item);
    return t === null || (perTopic.get(t) ?? 0) < config.maxPerTopicPerPage;
  };
  const firstIndex = (stream: Stream<T>, level: number): number => {
    const used = taken.get(stream)!;
    for (let i = 0; i < stream.items.length; i += 1) {
      if (used.has(i)) continue;
      if (ids.has(keys.idOf(stream.items[i]))) {
        used.add(i);
        continue;
      }
      if (fits(stream, stream.items[i], level)) return i;
    }
    return -1;
  };

  while (page.length < config.pageSize) {
    const wantBest = bestCount < Math.floor((page.length + 1) / config.bestEvery);
    const order = wantBest ? [best, topic] : [topic, best];
    let pick: { stream: Stream<T>; index: number } | null = null;
    for (const level of [2, 1, 0]) {
      for (const stream of order) {
        const index = firstIndex(stream, level);
        if (index >= 0) {
          pick = { stream, index };
          break;
        }
      }
      if (pick) break;
    }
    if (!pick) break;

    const item = pick.stream.items[pick.index];
    taken.get(pick.stream)!.add(pick.index);
    page.push(item);
    ids.add(keys.idOf(item));
    perSpace.set(keys.spaceOf(item), (perSpace.get(keys.spaceOf(item)) ?? 0) + 1);
    if (pick.stream.isTopic) {
      const t = leastUsedTopic(item);
      if (t !== null) perTopic.set(t, (perTopic.get(t) ?? 0) + 1);
    } else {
      bestCount += 1;
    }
  }

  return { page, takenTopic: taken.get(topic)!, takenBest: taken.get(best)! };
}
