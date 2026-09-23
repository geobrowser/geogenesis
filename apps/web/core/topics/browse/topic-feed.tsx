'use client';

import * as React from 'react';

import { EntityFeed } from '~/partials/feed/entity-feed';

import { MAX_TOPIC_FEED_SELECTED_TOPICS } from './topic-feed-params';
import { TOPIC_FEED_ENTITY_TYPES, TOPIC_FEED_ENTITY_TYPE_IDS } from './topic-feed-types';

export function TopicFeed({
  topicId,
  spaceId,
  spaceIds,
}: {
  topicId: string;
  spaceId: string;
  spaceIds: string[] | undefined;
}) {
  const [topicQuery, setTopicQuery] = React.useState('');
  const fixedParams = React.useMemo(
    () => ({ topicId, spaceId, ...(spaceIds ? { spaceIds: spaceIds.join(',') } : {}) }),
    [spaceId, spaceIds, topicId]
  );

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
      topicFacetEndpoint={spaceIds ? '/api/topics/facets' : undefined}
      showTopicFilter
      topicSearch={{
        value: topicQuery,
        onChange: setTopicQuery,
        placeholder: 'Search topics',
        isLoading: spaceIds === undefined,
        emptyLabel: 'No topics found',
      }}
      fixedParams={fixedParams}
      maxTopicSelections={MAX_TOPIC_FEED_SELECTED_TOPICS}
      dividerBeforeFeed
      feedTopSpacingClassName="mt-5"
      titleOpensSidePanel
    />
  );
}
