'use client';

import * as React from 'react';

import type { Relation } from '~/core/types';

import { EntityFeed } from '~/partials/feed/entity-feed';

import { TOPIC_FEED_ENTITY_TYPES, TOPIC_FEED_ENTITY_TYPE_IDS } from './topic-feed-types';

export function TopicFeed({
  topicId,
  spaceId,
  topicOptions,
}: {
  topicId: string;
  spaceId: string;
  /** Child topics are the useful next narrowing from this page's already-fixed topic scope. */
  topicOptions: Relation[];
}) {
  const options = React.useMemo(
    () =>
      topicOptions.map(relation => ({
        value: relation.toEntity.id,
        label: relation.toEntity.name?.trim() || 'Topic',
      })),
    [topicOptions]
  );
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
      topicOptions={options}
      fixedParams={fixedParams}
      dividerBeforeFeed
      feedTopSpacingClassName="mt-5"
      titleOpensSidePanel
    />
  );
}
