'use client';

import * as React from 'react';

import { type HubFilterOption, HubMultiFilterMenu, pickerLabel } from '~/core/debates/matchmaking/hub-filter-menu';
import type { PersonClaimTopic } from '~/core/debates/use-person-claims';
import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { equals as idEquals } from '~/core/id/normalize';

type Props = {
  spaceIds: string[];
  topics: PersonClaimTopic[];
  selectedSpaceIds: string[];
  selectedTopicIds: string[];
  spaceCounts: Map<string, number>;
  topicCounts: Map<string, number>;
  onToggleSpace: (value: string) => void;
  onToggleTopic: (value: string) => void;
  onClearSpaces: () => void;
  onClearTopics: () => void;
};

/** Space and Topic multi-select filters for the personal Debates collections. */
export function PersonDebateFilters({
  spaceIds,
  topics,
  selectedSpaceIds,
  selectedTopicIds,
  spaceCounts,
  topicCounts,
  onToggleSpace,
  onToggleTopic,
  onClearSpaces,
  onClearTopics,
}: Props) {
  const { labelsById, isLoading } = useSpaceLabels(spaceIds);

  const spaceOptions = React.useMemo<HubFilterOption<string>[]>(
    () =>
      spaceIds.map(id => {
        const label = spaceLabel(labelsById, id);
        return {
          value: id,
          label: label?.name ?? 'Space',
          image: label?.image ?? null,
          pending: !label && isLoading,
          count: spaceCounts.get(id) ?? 0,
        };
      }),
    [spaceIds, labelsById, isLoading, spaceCounts]
  );

  const topicOptions = React.useMemo<HubFilterOption<string>[]>(
    () =>
      topics.map(topic => ({ value: topic.id, label: topic.name ?? 'Topic', count: topicCounts.get(topic.id) ?? 0 })),
    [topics, topicCounts]
  );

  const selectedSpaceName =
    selectedSpaceIds.length === 1 ? (spaceLabel(labelsById, selectedSpaceIds[0])?.name ?? null) : null;

  const spaceTriggerLabel = pickerLabel(
    selectedSpaceIds.length,
    'Any space',
    () => selectedSpaceName ?? 'Space',
    count => `${count} spaces`
  );
  const spaceLabelPending = selectedSpaceIds.length === 1 && selectedSpaceName == null && isLoading;

  const topicTriggerLabel = pickerLabel(
    selectedTopicIds.length,
    'Any topic',
    () => topics.find(topic => idEquals(topic.id, selectedTopicIds[0]))?.name ?? 'Topic',
    count => `${count} topics`
  );

  const showSpaceMenu = spaceIds.length > 1;
  const showTopicMenu = topics.length > 0;
  if (!showSpaceMenu && !showTopicMenu) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showSpaceMenu && (
        <HubMultiFilterMenu
          label={spaceTriggerLabel}
          labelPending={spaceLabelPending}
          options={spaceOptions}
          values={selectedSpaceIds}
          onToggle={onToggleSpace}
          onClear={onClearSpaces}
          clearLabel="Any space"
          showImages
        />
      )}
      {showTopicMenu && (
        <HubMultiFilterMenu
          label={topicTriggerLabel}
          options={topicOptions}
          values={selectedTopicIds}
          onToggle={onToggleTopic}
          onClear={onClearTopics}
          clearLabel="Any topic"
        />
      )}
    </div>
  );
}
