'use client';

import * as React from 'react';

import { TOPIC_TYPE_ID } from '~/core/constants';
import { useSubtopicSearch } from '~/core/hooks/use-subtopic-search';
import { ID } from '~/core/id';
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
  const topicSearch = useSubtopicSearch();
  const options = React.useMemo(() => {
    const byId = new Map<string, { value: string; label: string }>();
    for (const relation of topicOptions) {
      if (ID.equals(relation.toEntity.id, topicId)) continue;
      byId.set(ID.uuidToHex(relation.toEntity.id), {
        value: relation.toEntity.id,
        label: relation.toEntity.name?.trim() || 'Topic',
      });
    }
    for (const result of topicSearch.results) {
      if (ID.equals(result.id, topicId)) continue;
      if (!result.types.some(type => ID.equals(type.id, TOPIC_TYPE_ID))) continue;
      byId.set(ID.uuidToHex(result.id), { value: result.id, label: result.name?.trim() || 'Topic' });
    }
    return [...byId.values()];
  }, [topicId, topicOptions, topicSearch.results]);
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
      topicFacetEndpoint="/api/topics/facets"
      showTopicFilter
      topicSearch={{
        value: topicSearch.query,
        onChange: topicSearch.onQueryChange,
        placeholder: 'Search topics',
        isLoading: topicSearch.isLoading,
        emptyLabel: 'No topics found',
      }}
      fixedParams={fixedParams}
      dividerBeforeFeed
      feedTopSpacingClassName="mt-5"
      titleOpensSidePanel
    />
  );
}
