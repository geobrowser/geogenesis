import { describe, expect, it } from 'vitest';

import {
  MAX_TOPIC_FEED_SELECTED_TOPICS,
  MAX_TOPIC_FEED_SPACES,
  limitTopicFeedSpaceIds,
  parseTopicFeedIds,
  parseTopicFeedSelectedIds,
  parseTopicFeedSpaceIds,
} from './topic-feed-params';

describe('Topic feed request parameters', () => {
  it('validates and canonically deduplicates comma-separated and array ids', () => {
    const bare = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const hyphenated = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    expect(parseTopicFeedIds(`${bare},invalid,${hyphenated}`)).toEqual([bare]);
    expect(parseTopicFeedIds([hyphenated, bare, 42])).toEqual([hyphenated]);
  });

  it('preserves unresolved scope and applies the shared space cap', () => {
    expect(limitTopicFeedSpaceIds(undefined)).toBeUndefined();
    const ids = Array.from({ length: MAX_TOPIC_FEED_SPACES + 1 }, (_, index) => index.toString(16).padStart(32, '0'));
    expect(limitTopicFeedSpaceIds(ids)).toHaveLength(MAX_TOPIC_FEED_SPACES);
    expect(parseTopicFeedSpaceIds(ids.join(','))).toHaveLength(MAX_TOPIC_FEED_SPACES);
  });

  it('reserves the route space before applying the space cap', () => {
    const routeSpaceId = 'ffffffffffffffffffffffffffffffff';
    const ids = Array.from({ length: MAX_TOPIC_FEED_SPACES }, (_, index) => (index + 1).toString(16).padStart(32, '0'));

    expect(limitTopicFeedSpaceIds(ids, routeSpaceId)).toEqual([routeSpaceId, ...ids.slice(0, -1)]);
    expect(parseTopicFeedSpaceIds(ids.join(','), routeSpaceId)).toEqual([routeSpaceId, ...ids.slice(0, -1)]);
  });

  it('excludes the page Topic and caps additional AND predicates', () => {
    const pageTopicId = 'ffffffffffffffffffffffffffffffff';
    const ids = [
      pageTopicId,
      ...Array.from({ length: MAX_TOPIC_FEED_SELECTED_TOPICS + 1 }, (_, index) =>
        (index + 1).toString(16).padStart(32, '0')
      ),
    ];

    expect(parseTopicFeedSelectedIds(ids, pageTopicId)).toEqual(ids.slice(1, MAX_TOPIC_FEED_SELECTED_TOPICS + 1));
  });
});
