'use client';

import * as React from 'react';

import cx from 'classnames';

import { topicOptions } from '~/core/blocks/ranking/best-debates-team-filters';
import { HubMultiFilterMenu, pickerLabel } from '~/core/debates/matchmaking/hub-filter-menu';
import { normId } from '~/core/utils/norm-id';

import { BestDebateDisplaysContext } from './best-debate-row';

/** The team column's topic filter and Group by space, shared by All and To rank. */
export type BestDebatesTeamTools = {
  topicIds: string[];
  toggleTopic: (topicId: string) => void;
  clearTopics: () => void;
  groupBySpace: boolean;
  setGroupBySpace: (next: boolean) => void;
};

const GROUP_BY_SPACE_KEY = 'geo:best-debates:group-by-space';

function readGroupBySpace(): boolean {
  try {
    return window.localStorage.getItem(GROUP_BY_SPACE_KEY) === '1';
  } catch {
    return false;
  }
}

/** The tools' state. Group by space is the viewer's own setting, kept in this browser. */
export function useBestDebatesTeamTools(): BestDebatesTeamTools {
  const [topicIds, setTopicIds] = React.useState<string[]>([]);
  const [groupBySpace, setGroup] = React.useState(false);
  React.useEffect(() => setGroup(readGroupBySpace()), []);

  return React.useMemo(
    () => ({
      topicIds,
      toggleTopic: (topicId: string) =>
        setTopicIds(ids => (ids.includes(topicId) ? ids.filter(id => id !== topicId) : [...ids, topicId])),
      clearTopics: () => setTopicIds([]),
      groupBySpace,
      setGroupBySpace: (next: boolean) => {
        setGroup(next);
        try {
          if (next) window.localStorage.setItem(GROUP_BY_SPACE_KEY, '1');
          else window.localStorage.removeItem(GROUP_BY_SPACE_KEY);
        } catch {
          // Storage off (private window, blocked site data): the setting lasts for this visit only.
        }
      },
    }),
    [groupBySpace, topicIds]
  );
}

/**
 * Topic and By space, beside the search field. The topics are the ones present in the list on
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
      <button
        type="button"
        aria-pressed={tools.groupBySpace}
        onClick={() => tools.setGroupBySpace(!tools.groupBySpace)}
        className={cx(
          'flex h-8 shrink-0 items-center rounded-full border px-3 text-[14px] leading-[15px] font-medium whitespace-nowrap transition-colors',
          tools.groupBySpace ? 'border-text bg-text text-white' : 'border-grey-02 bg-white text-grey-04 hover:text-text'
        )}
      >
        By space
      </button>
    </div>
  );
}
