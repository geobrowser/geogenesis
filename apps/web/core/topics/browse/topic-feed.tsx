'use client';

import * as React from 'react';

import { EntityFeed } from '~/partials/feed/entity-feed';

import { useTopicSpaceScope } from '../use-topic-space-scope';
import { TOPIC_FEED_ENTITY_TYPES, TOPIC_FEED_ENTITY_TYPE_IDS } from './topic-feed-types';

export function TopicFeed({ topicId, spaceId }: { topicId: string; spaceId: string }) {
  const [topicQuery, setTopicQuery] = React.useState('');
  const fullSpaceIds = useTopicSpaceScope(spaceId);
  const spaceIds = React.useMemo(() => fullSpaceIds?.slice(0, 100), [fullSpaceIds]);
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
      dividerBeforeFeed
      feedTopSpacingClassName="mt-5"
      titleOpensSidePanel
    />
  );
}
