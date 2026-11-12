'use client';

import * as React from 'react';

import { HubMultiFilterMenu, pickerLabel } from '~/core/debates/matchmaking/hub-filter-menu';
import { HubPillButton } from '~/core/debates/matchmaking/hub-pill-button';
import { keepSelectedVisible, topicSuggestions } from '~/core/debates/matchmaking/topic-facets';
import { TopicSearchSuggestions } from '~/core/debates/matchmaking/topic-search-suggestions';
import { normId } from '~/core/utils/norm-id';

import type { BestDebatesTopicFacet } from './use-best-debates-topic-facet';

/** The team column's topic filter, shared by All, By space and To rank. */
export type BestDebatesTeamTools = {
  topicIds: string[];
  toggleTopic: (topicId: string) => void;
  clearTopics: () => void;
};

/** The topic filter's state. */
export function useBestDebatesTeamTools(): BestDebatesTeamTools {
  const [topicIds, setTopicIds] = React.useState<string[]>([]);
  return React.useMemo(
    () => ({
      topicIds,
      toggleTopic: (topicId: string) =>
        setTopicIds(ids => (ids.includes(topicId) ? ids.filter(id => id !== topicId) : [...ids, topicId])),
      clearTopics: () => setTopicIds([]),
    }),
    [topicIds]
  );
}

/**
 * The Topic menu, beside the search field: the Debates panel's own multi-select menu, with counts
 * over the whole list (`useBestDebatesTopicFacet`) and skeletons while they are pending.
 */
export function BestDebatesTeamToolbar({
  tools,
  facet,
}: {
  tools: BestDebatesTeamTools;
  facet: BestDebatesTopicFacet;
}) {
  const options = React.useMemo(
    () =>
      keepSelectedVisible(facet.topics, tools.topicIds).map(topic => ({
        value: topic.id,
        label: topic.name ?? 'Topic',
        pending: topic.name === null,
        count: topic.count,
      })),
    [facet.topics, tools.topicIds]
  );
  const picked = tools.topicIds;
  const label = pickerLabel(
    picked.length,
    'Topic',
    () => options.find(option => normId(option.value) === normId(picked[0]!))?.label ?? '1 topic',
    count => `${count} topics`
  );

  return (
    <div className="flex shrink-0 items-center gap-2">
      <HubMultiFilterMenu
        label={label}
        options={options}
        values={picked}
        onToggle={tools.toggleTopic}
        onClear={tools.clearTopics}
        clearLabel="Any topic"
        align="end"
        countsPending={facet.pending}
        searchPlaceholder="Search topics"
        emptyLabel="No topics on these debates"
      />
    </div>
  );
}

/**
 * Under the search field, as in the debate picker (the rematch claim picker): the picked topics as
 * chips to take off, and the topics matching what is typed, to pick. Picking one is the same
 * selection as the Topic menu's, and clears the text it now stands in for.
 */
export function BestDebatesTopicSearchRow({
  query,
  facet,
  tools,
  onPicked,
}: {
  query: string;
  facet: BestDebatesTopicFacet;
  tools: BestDebatesTeamTools;
  onPicked: () => void;
}) {
  const suggestions = topicSuggestions(facet.topics, query, tools.topicIds);
  const pickedTopics = tools.topicIds.map(id => ({
    id,
    name: facet.topics.find(topic => normId(topic.id) === normId(id))?.name ?? null,
  }));
  if (pickedTopics.length === 0 && suggestions.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 pt-2" data-testid="best-debates-topic-search">
      {pickedTopics.length > 0 ? (
        <div role="group" aria-label="Picked topics" className="flex flex-wrap items-center gap-2">
          {pickedTopics.map(topic => (
            <HubPillButton
              key={topic.id}
              variant="primary"
              aria-label={`Remove ${topic.name ?? 'topic'} filter`}
              onClick={() => tools.toggleTopic(topic.id)}
              className="gap-1.5"
            >
              <span className="max-w-[200px] truncate">{topic.name ?? 'Topic'}</span>
              <span aria-hidden>×</span>
            </HubPillButton>
          ))}
        </div>
      ) : null}
      <TopicSearchSuggestions
        query={query}
        topics={suggestions}
        onPick={topicId => {
          if (!tools.topicIds.some(id => normId(id) === normId(topicId))) tools.toggleTopic(topicId);
          onPicked();
        }}
      />
    </div>
  );
}
