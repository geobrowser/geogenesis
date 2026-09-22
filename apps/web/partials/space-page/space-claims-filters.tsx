'use client';

import * as React from 'react';

import cx from 'classnames';

import { HubMultiFilterMenu, pickerLabel } from '~/core/debates/matchmaking/hub-filter-menu';
import { orderFacetOptions } from '~/core/debates/matchmaking/topic-facets';
import {
  SPACE_ACTIVITY_SORTS,
  SPACE_ACTIVITY_SORT_LABEL,
  type SpaceActivitySort,
} from '~/core/space/space-activity-rows';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Input } from '~/design-system/input';
import { Menu, MenuItem } from '~/design-system/menu';

export type SpaceClaimsTopicOption = { id: string; name: string | null; count: number };

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  sort: SpaceActivitySort;
  onSortChange: (sort: SpaceActivitySort) => void;
  topicIds: string[];
  onTopicToggle: (topicId: string) => void;
  onTopicsClear: () => void;
  topics: SpaceClaimsTopicOption[];
  /** The counts describe a set that is still being narrowed; the menu draws skeletons instead. */
  countsPending: boolean;
};

/**
 * Search, sort and topics for a space's claims feed.
 *
 * The three controls are one row and one question — which of this space's claims am I looking at —
 * so they live together rather than being spread across the page. Search takes the full width above
 * them because it is the one a reader types into rather than picks from.
 *
 * No space menu, unlike the debates hub's version of this row: the feed *is* one space, so a picker
 * offering that space and nothing else would be a label dressed up as a control.
 */
export function SpaceClaimsFilters({
  search,
  onSearchChange,
  sort,
  onSortChange,
  topicIds,
  onTopicToggle,
  onTopicsClear,
  topics,
  countsPending,
}: Props) {
  const [sortOpen, setSortOpen] = React.useState(false);

  /**
   * Highest count first, with anything ticked held at the top in the order it was picked.
   *
   * The facet answers in the graph's order, which is no order a reader can see — 21, 1, 1, 11, 31
   * down the menu. `orderFacetOptions` is the rule the debates hub's own topic menu uses, pinning
   * included: every count changes when the filter does, so without it the row just clicked jumps
   * elsewhere before the next click lands.
   */
  const topicOptions = React.useMemo(
    () =>
      orderFacetOptions(topics, topicIds).map(topic => ({
        value: topic.id,
        label: topic.name ?? 'Topic',
        count: topic.count,
      })),
    [topicIds, topics]
  );

  const topicLabel = pickerLabel(
    topicIds.length,
    'Any topic',
    () => topics.find(topic => topic.id === topicIds[0])?.name ?? 'Topic',
    count => `${count} topics`
  );

  return (
    <div className="flex flex-col gap-3">
      <Input
        withSearchIcon
        value={search}
        onChange={event => onSearchChange(event.currentTarget.value)}
        placeholder="Search claims"
        aria-label="Search claims"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Menu
          asChild
          open={sortOpen}
          onOpenChange={setSortOpen}
          sideOffset={8}
          className="max-w-60 bg-white"
          trigger={
            <button
              type="button"
              aria-label={`Sort: ${SPACE_ACTIVITY_SORT_LABEL[sort]}`}
              className="flex h-6 items-center gap-1.5 rounded border border-grey-02 pr-2 pl-1.5 text-metadata text-grey-04 shadow-button transition-colors duration-150 focus-within:border-text"
            >
              <span>{SPACE_ACTIVITY_SORT_LABEL[sort]}</span>
              <span className={cx('inline-flex transition-transform duration-200', sortOpen && 'rotate-180')}>
                <ChevronDownSmall color="grey-04" />
              </span>
            </button>
          }
        >
          {SPACE_ACTIVITY_SORTS.map(option => (
            <MenuItem
              key={option}
              active={option === sort}
              onClick={() => {
                onSortChange(option);
                setSortOpen(false);
              }}
            >
              {SPACE_ACTIVITY_SORT_LABEL[option]}
            </MenuItem>
          ))}
        </Menu>

        {/* Only once there is a menu to draw. An empty topic picker on a space whose claims carry
            no topics is a control that can do nothing, and it would sit there through every load. */}
        {topicOptions.length > 0 || topicIds.length > 0 ? (
          <HubMultiFilterMenu
            label={topicLabel}
            options={topicOptions}
            values={topicIds}
            onToggle={onTopicToggle}
            onClear={onTopicsClear}
            clearLabel="Any topic"
            countsPending={countsPending}
          />
        ) : null}
      </div>
    </div>
  );
}
