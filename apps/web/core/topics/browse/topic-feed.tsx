'use client';

import * as React from 'react';

import { EntityFeed } from '~/partials/feed/entity-feed';

import { TOPIC_FEED_ENTITY_TYPES, TOPIC_FEED_ENTITY_TYPE_IDS } from './topic-feed-types';

export function TopicFeed({ topicId, spaceId }: { topicId: string; spaceId: string }) {
  const [topicQuery, setTopicQuery] = React.useState('');
  const fixedParams = React.useMemo(() => ({ topicId, spaceId }), [spaceId, topicId]);

  return (
    <EntityFeed
      key={`${topicId}:${spaceId}`}
      apiEndpoint="/api/topics/feed"
      initialSort="best"
      showSortFilter
      showTimeFilter={false}
      showSpaceFilter={false}
      showTypeFilter
      initialTypeIds={TOPIC_FEED_ENTITY_TYPE_IDS}
      typeOptions={TOPIC_FEED_ENTITY_TYPES}
      persistTypeSelection={false}
      topicFacetEndpoint="/api/topics/facets"
      showTopicFilter
      topicSearch={{
        value: topicQuery,
        onChange: setTopicQuery,
        placeholder: 'Search topics',
        emptyLabel: 'No topics found',
      }}
      fixedParams={fixedParams}
      dividerBeforeFeed
      feedTopSpacingClassName="mt-5"
      titleOpensSidePanel
    />
  );
}
