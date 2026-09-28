'use client';

import * as React from 'react';

import { EntityFeed } from '~/partials/feed/entity-feed';

import { useTopicComposition } from './topic-composition';
import { MAX_TOPIC_FEED_SELECTED_TOPICS } from './topic-feed-params';
import { topicFeedTypeOptions } from './topic-feed-types';

export function TopicFeed({
  topicId,
  spaceId,
  spaceIds,
}: {
  topicId: string;
  spaceId: string;
  spaceIds: string[] | undefined;
}) {
  const fixedParams = React.useMemo(
    () => ({ topicId, spaceId, ...(spaceIds ? { spaceIds: spaceIds.join(',') } : {}) }),
    [spaceId, spaceIds, topicId]
  );
  const { counts, isLoading: typeCountsLoading } = useTopicComposition(topicId, spaceId, spaceIds);
  const typeOptions = React.useMemo(() => topicFeedTypeOptions(counts?.typeCounts ?? {}, counts?.typeNames), [counts]);
  const typeCounts = React.useMemo(
    () => (counts ? typeOptions.map(type => ({ id: type.id, count: counts.typeCounts[type.id] ?? 0 })) : undefined),
    [counts, typeOptions]
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
      initialTypeIds={[]}
      typeOptions={typeOptions}
      typeCounts={typeCounts}
      typeCountsPending={typeCountsLoading}
      selectTypesWithResultsByDefault
      persistTypeSelection={false}
      topicFacetEndpoint={spaceIds ? '/api/topics/facets' : undefined}
      showTopicFilter
      fixedParams={fixedParams}
      maxTopicSelections={MAX_TOPIC_FEED_SELECTED_TOPICS}
      dividerBeforeFeed
      feedTopSpacingClassName="mt-5"
      titleOpensSidePanel
    />
  );
}
