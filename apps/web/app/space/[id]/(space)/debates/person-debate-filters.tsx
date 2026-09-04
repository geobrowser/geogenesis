'use client';

import * as React from 'react';

import { HubFilterMenu, type HubFilterOption } from '~/core/debates/matchmaking/hub-filter-menu';
import type { PersonClaimTopic } from '~/core/debates/use-person-claims';
import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';

/** The unfiltered choice, distinct from any real space or topic id. */
export const ALL_FILTER = 'all';

type Props = {
  spaceIds: string[];
  topics: PersonClaimTopic[];
  selectedSpace: string;
  selectedTopic: string;
  onSelectSpace: (value: string) => void;
  onSelectTopic: (value: string) => void;
};

/**
 * The Space and Topic dropdowns that narrow the two collections.
 */
export function PersonDebateFilters({
  spaceIds,
  topics,
  selectedSpace,
  selectedTopic,
  onSelectSpace,
  onSelectTopic,
}: Props) {
  const { labelsById, isLoading } = useSpaceLabels(spaceIds);

  const spaceOptions = React.useMemo<HubFilterOption<string>[]>(
    () => [
      { value: ALL_FILTER, label: 'All spaces', showImage: false },
      ...spaceIds.map(id => {
        const label = spaceLabel(labelsById, id);
        return {
          value: id,
          label: label?.name ?? 'Space',
          image: label?.image ?? null,
          pending: !label && isLoading,
        };
      }),
    ],
    [spaceIds, labelsById, isLoading]
  );

  const topicOptions = React.useMemo<HubFilterOption<string>[]>(
    () => [
      { value: ALL_FILTER, label: 'All topics' },
      ...topics.map(topic => ({ value: topic.id, label: topic.name ?? 'Topic' })),
    ],
    [topics]
  );

  const spaceTriggerLabel =
    selectedSpace === ALL_FILTER ? 'All spaces' : (spaceLabel(labelsById, selectedSpace)?.name ?? 'Space');
  const topicTriggerLabel =
    selectedTopic === ALL_FILTER ? 'All topics' : (topics.find(topic => topic.id === selectedTopic)?.name ?? 'Topic');

  const showSpaceMenu = spaceIds.length > 1;
  const showTopicMenu = topics.length > 0;
  if (!showSpaceMenu && !showTopicMenu) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showSpaceMenu && (
        <HubFilterMenu
          label={spaceTriggerLabel}
          labelPending={selectedSpace !== ALL_FILTER && !spaceLabel(labelsById, selectedSpace) && isLoading}
          options={spaceOptions}
          value={selectedSpace}
          onChange={onSelectSpace}
          showImages
        />
      )}
      {showTopicMenu && (
        <HubFilterMenu
          label={topicTriggerLabel}
          options={topicOptions}
          value={selectedTopic}
          onChange={onSelectTopic}
        />
      )}
    </div>
  );
}
