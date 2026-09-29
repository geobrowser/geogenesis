'use client';

import * as React from 'react';

import { EntityFeed } from '~/partials/feed/entity-feed';

import { TopicCompositionBar, useSpaceTopicComposition } from './topic-composition';
import { MAX_TOPIC_FEED_SELECTED_TOPICS } from './topic-feed-params';
import { TOPIC_FEED_ENTITY_TYPES, TOPIC_FEED_ENTITY_TYPE_IDS } from './topic-feed-types';

/**
 * The topic page's Explore tab, for a space whose home entity is a Topic.
 *
 * Same composition bar, same feed surface, same type and topic filters as `TopicPageView` — the
 * difference is only in what counts as belonging. A topic page gathers every entity tagged with
 * the topic across the curated graph; a topic space already *is* its topic's collection, so this
 * shows everything of the feed types that lives in the space, tagged or not.
 */
export function SpaceTopicExplore({ spaceId, spaceTopicId }: { spaceId: string; spaceTopicId: string }) {
  const fixedParams = React.useMemo(() => ({ spaceId, spaceTopicId }), [spaceId, spaceTopicId]);
  const { counts, isLoading } = useSpaceTopicComposition(spaceId);
  const typeCounts = React.useMemo(
    () =>
      counts
        ? TOPIC_FEED_ENTITY_TYPES.map(type => ({ id: type.id, count: counts.typeCounts[type.id] ?? 0 }))
        : undefined,
    [counts]
  );

  return (
    <div className="flex flex-col gap-6">
      <TopicCompositionBar counts={counts} isLoading={isLoading} />
      <EntityFeed
        key={spaceId}
        apiEndpoint="/api/topics/space/feed"
        initialSort="best"
        showSortFilter
        showTimeFilter={false}
        showSpaceFilter={false}
        showTypeFilter
        initialTypeIds={TOPIC_FEED_ENTITY_TYPE_IDS}
        typeOptions={TOPIC_FEED_ENTITY_TYPES}
        typeCounts={typeCounts}
        typeCountsPending={isLoading}
        selectTypesWithResultsByDefault
        persistTypeSelection={false}
        topicFacetEndpoint="/api/topics/space/facets"
        showTopicFilter
        fixedParams={fixedParams}
        maxTopicSelections={MAX_TOPIC_FEED_SELECTED_TOPICS}
        dividerBeforeFeed
        feedTopSpacingClassName="mt-5"
        titleOpensSidePanel
      />
    </div>
  );
}
