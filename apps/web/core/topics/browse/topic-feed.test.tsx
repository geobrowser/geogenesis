import { cleanup, render } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { TopicFeed } from './topic-feed';
import { MAX_TOPIC_FEED_SELECTED_TOPICS } from './topic-feed-params';
import { TOPIC_FEED_ENTITY_TYPES, TOPIC_FEED_ENTITY_TYPE_IDS } from './topic-feed-types';

const mocks = vi.hoisted(() => ({
  feed: null as Record<string, unknown> | null,
  typeCounts: {} as Record<string, number>,
}));

vi.mock('~/partials/feed/entity-feed', () => ({
  EntityFeed: (props: Record<string, unknown>) => {
    mocks.feed = props;
    return null;
  },
}));

vi.mock('./topic-composition', () => ({
  useTopicComposition: () => ({
    counts: { typeCounts: mocks.typeCounts },
    isLoading: false,
  }),
}));

afterEach(cleanup);

describe('TopicFeed', () => {
  it('configures a Best-ranked feed whose Topic options come from feed facets', () => {
    mocks.typeCounts = Object.fromEntries(TOPIC_FEED_ENTITY_TYPES.map((type, index) => [type.id, index + 1]));
    render(
      <TopicFeed
        topicId="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        spaceId="space-1"
        spaceIds={['11111111111111111111111111111111']}
      />
    );

    expect(mocks.feed).toMatchObject({
      apiEndpoint: '/api/topics/feed',
      initialSort: 'best',
      showSortFilter: true,
      showTimeFilter: false,
      showSpaceFilter: false,
      showTypeFilter: true,
      initialTypeIds: TOPIC_FEED_ENTITY_TYPE_IDS,
      typeOptions: TOPIC_FEED_ENTITY_TYPES,
      typeCounts: TOPIC_FEED_ENTITY_TYPES.map((type, index) => ({ id: type.id, count: index + 1 })),
      typeCountsPending: false,
      selectTypesWithResultsByDefault: true,
      persistTypeSelection: false,
      topicFacetEndpoint: '/api/topics/facets',
      showTopicFilter: true,
      fixedParams: {
        topicId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        spaceId: 'space-1',
        spaceIds: '11111111111111111111111111111111',
      },
      maxTopicSelections: MAX_TOPIC_FEED_SELECTED_TOPICS,
      titleOpensSidePanel: true,
    });
  });
});
