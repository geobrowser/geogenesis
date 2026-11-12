'use client';

import * as React from 'react';

import { topicOptions } from '~/core/blocks/ranking/best-debates-team-filters';
import { HubMultiFilterMenu, pickerLabel } from '~/core/debates/matchmaking/hub-filter-menu';
import { normId } from '~/core/utils/norm-id';

import { BestDebateDisplaysContext } from './best-debate-row';

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
 * The Topic menu, beside the search field. The topics are the ones present in the list on
 * screen, each with how many of its debates carry it.
 */
export function BestDebatesTeamToolbar({
  tools,
  listIds,
}: {
  tools: BestDebatesTeamTools;
  listIds: readonly string[];
}) {
  const displays = React.useContext(BestDebateDisplaysContext);
  const options = React.useMemo(
    () =>
      topicOptions(listIds, id => displays?.get(normId(id))).map(option => ({
        value: option.id,
        label: option.name,
        count: option.count,
      })),
    [displays, listIds]
  );
  const picked = tools.topicIds;
  const label = pickerLabel(
    picked.length,
    'Topic',
    () => options.find(option => option.value === picked[0])?.label ?? '1 topic',
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
        searchPlaceholder="Search topics"
        emptyLabel="No topics on these debates"
      />
    </div>
  );
}
