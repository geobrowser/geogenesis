import { cleanup, render } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { TopicFeed } from './topic-feed';
import { MAX_TOPIC_FEED_SELECTED_TOPICS } from './topic-feed-params';
import { TOPIC_FEED_ENTITY_TYPES, TOPIC_FEED_ENTITY_TYPE_IDS } from './topic-feed-types';

const mocks = vi.hoisted(() => ({
  feed: null as Record<string, unknown> | null,
}));

vi.mock('~/partials/feed/entity-feed', () => ({
  EntityFeed: (props: Record<string, unknown>) => {
    mocks.feed = props;
    return null;
  },
}));

afterEach(cleanup);

describe('TopicFeed', () => {
  it('configures a Best-ranked feed whose Topic options come from feed facets', () => {
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
      persistTypeSelection: false,
      topicFacetEndpoint: '/api/topics/facets',
      showTopicFilter: true,
      topicSearch: {
        value: '',
        onChange: expect.any(Function),
        placeholder: 'Search topics',
        emptyLabel: 'No topics found',
      },
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
