import { cleanup, render } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { TopicFeed } from './topic-feed';
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
  it('configures an all-type Explore feed ranked by Best with child Topic options', () => {
    render(
      <TopicFeed
        topicId="topic-1"
        spaceId="space-1"
        topicOptions={[
          {
            id: 'relation-1',
            type: { id: 'property-1' },
            toEntity: { id: 'topic-2', name: 'Alignment' },
          } as never,
        ]}
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
      topicOptions: [{ value: 'topic-2', label: 'Alignment' }],
      fixedParams: { topicId: 'topic-1', spaceId: 'space-1' },
      titleOpensSidePanel: true,
    });
  });
});
