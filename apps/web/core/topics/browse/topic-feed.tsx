'use client';

import * as React from 'react';

import { EntityFeed } from '~/partials/feed/entity-feed';

import { useSpaceTopicComposition, useTopicComposition } from './topic-composition';
import type { TopicFeedCompositionCounts } from './topic-feed-facets';
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
  const fixedParams = React.useMemo(
    () => ({ topicId, spaceId, ...(spaceIds ? { spaceIds: spaceIds.join(',') } : {}) }),
    [spaceId, spaceIds, topicId]
  );
  const { counts, isLoading } = useTopicComposition(topicId, spaceId, spaceIds);

  return (
    <TopicTypeFeed
      feedKey={`${topicId}:${spaceId}`}
      apiEndpoint="/api/topics/feed"
      topicFacetEndpoint={spaceIds ? '/api/topics/facets' : undefined}
      fixedParams={fixedParams}
      counts={counts}
      countsLoading={isLoading}
    />
  );
}

/**
 * The topic feed for a space whose home entity is a Topic.
 *
 * It uses the same feed surface and filters as `TopicFeed`. The difference is what belongs:
 * a topic page gathers every entity tagged with the topic, and a topic space already is its
 * topic's collection, so this is everything of the feed types that lives in the space.
 */
export function SpaceTopicFeed({ spaceId, spaceTopicId }: { spaceId: string; spaceTopicId: string }) {
  const fixedParams = React.useMemo(() => ({ spaceId, spaceTopicId }), [spaceId, spaceTopicId]);
  const { counts, isLoading } = useSpaceTopicComposition(spaceId);

  return (
    <TopicTypeFeed
      feedKey={spaceId}
      apiEndpoint="/api/topics/space/feed"
      topicFacetEndpoint="/api/topics/space/facets"
      fixedParams={fixedParams}
      counts={counts}
      countsLoading={isLoading}
    />
  );
}

/** The Best-ranked, type- and topic-filterable feed both topic surfaces share. */
function TopicTypeFeed({
  feedKey,
  apiEndpoint,
  topicFacetEndpoint,
  fixedParams,
  counts,
  countsLoading,
}: {
  feedKey: string;
  apiEndpoint: string;
  topicFacetEndpoint: string | undefined;
  fixedParams: Record<string, string>;
  counts: TopicFeedCompositionCounts | null;
  countsLoading: boolean;
}) {
  const typeCounts = React.useMemo(
    () =>
      counts
        ? TOPIC_FEED_ENTITY_TYPES.map(type => ({ id: type.id, count: counts.typeCounts[type.id] ?? 0 }))
        : undefined,
    [counts]
  );

  return (
    <EntityFeed
      key={feedKey}
      apiEndpoint={apiEndpoint}
      initialSort="best"
      showSortFilter
      showTimeFilter={false}
      showTypeFilter
      initialTypeIds={TOPIC_FEED_ENTITY_TYPE_IDS}
      typeOptions={TOPIC_FEED_ENTITY_TYPES}
      typeCounts={typeCounts}
      typeCountsPending={countsLoading}
      selectTypesWithResultsByDefault
      topicFacetEndpoint={topicFacetEndpoint}
      showTopicFilter
      fixedParams={fixedParams}
      maxTopicSelections={MAX_TOPIC_FEED_SELECTED_TOPICS}
      dividerBeforeFeed
      feedTopSpacingClassName="mt-5"
      titleOpensSidePanel
    />
  );
}
