import { cleanup, render } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { TOPIC_TYPE_ID } from '~/core/constants';

import { TopicFeed } from './topic-feed';
import { TOPIC_FEED_ENTITY_TYPES, TOPIC_FEED_ENTITY_TYPE_IDS } from './topic-feed-types';

const mocks = vi.hoisted(() => ({
  feed: null as Record<string, unknown> | null,
  onQueryChange: vi.fn(),
}));

vi.mock('~/core/hooks/use-subtopic-search', () => ({
  useSubtopicSearch: () => ({
    query: 'governance',
    onQueryChange: mocks.onQueryChange,
    isLoading: false,
    results: [
      {
        id: 'cccccccccccccccccccccccccccccccc',
        name: 'AI governance',
        types: [{ id: TOPIC_TYPE_ID, name: 'Topic' }],
      },
      {
        id: 'dddddddddddddddddddddddddddddddd',
        name: 'Not a topic',
        types: [{ id: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', name: 'Person' }],
      },
    ],
  }),
}));

vi.mock('~/partials/feed/entity-feed', () => ({
  EntityFeed: (props: Record<string, unknown>) => {
    mocks.feed = props;
    return null;
  },
}));

afterEach(cleanup);

describe('TopicFeed', () => {
  it('configures a Best-ranked feed with child and searchable Topic options', () => {
    render(
      <TopicFeed
        topicId="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        spaceId="space-1"
        topicOptions={[
          {
            id: 'relation-1',
            type: { id: 'property-1' },
            toEntity: { id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: 'Alignment' },
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
      topicOptions: [
        { value: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', label: 'Alignment' },
        { value: 'cccccccccccccccccccccccccccccccc', label: 'AI governance' },
      ],
      topicFacetEndpoint: '/api/topics/facets',
      showTopicFilter: true,
      topicSearch: {
        value: 'governance',
        onChange: mocks.onQueryChange,
        placeholder: 'Search topics',
        isLoading: false,
        emptyLabel: 'No topics found',
      },
      fixedParams: { topicId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', spaceId: 'space-1' },
      titleOpensSidePanel: true,
    });
  });
});
