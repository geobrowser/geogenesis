import { MAX_TOPIC_FEED_SELECTED_TOPICS, parseTopicFeedSelectedIds } from '~/core/topics/browse/topic-feed-params';

/**
 * Explore shares the Topic pages' parser and cap (see `parseTopicFeedSelectedIds`) so the two can't
 * drift apart. Explore's only differences: it passes no page topic and takes ids back dashless.
 */
export const MAX_EXPLORE_TOPIC_SELECTIONS = MAX_TOPIC_FEED_SELECTED_TOPICS;

export function parseExploreTopicIds(raw: unknown): string[] {
  return parseTopicFeedSelectedIds(raw, { dashless: true });
}
