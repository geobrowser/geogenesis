'use client';

import * as React from 'react';

import cx from 'classnames';

import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';

import { Avatar } from '~/design-system/avatar';
import { Input } from '~/design-system/input';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import type { MatchmakingFacetCount, MatchmakingTopic } from '../api';
import type { HubFilterOption } from './hub-filter-menu';

/** Topics past this are reachable by typing rather than by scrolling a list of hundreds. */
const TOPIC_ROWS_BEFORE_SEARCH = 12;

type FacetTopic = MatchmakingTopic & { count?: number };

type Props<TFilter extends string> = {
  filterOptions: HubFilterOption<TFilter>[];
  filter: TFilter;
  onFilterChange: (value: TFilter) => void;
  facetSpaces: MatchmakingFacetCount[];
  spaceIds: string[];
  onSpaceToggle: (id: string) => void;
  onSpacesClear: () => void;
  facetTopics: FacetTopic[];
  topicIds: string[];
  onTopicToggle: (id: string) => void;
  onTopicsClear: () => void;
};

/**
 * The workspace's left rail: the same three narrowings the panel keeps behind menus, held open.
 *
 * Open rather than menued because this layout has the column to spare and the corpus needs it — a
 * 400-claim sample carries 329 distinct topics, so the tail is a list to search, not a dropdown to
 * skim. The counts are geo-chat's own (`space_facets` / `topic_facets` from GEO-2659), computed
 * over the whole filtered corpus rather than the pages in hand, which is what makes a permanent
 * facet honest enough to sit here at all.
 *
 * Each dimension is counted without narrowing itself, so picking a space cannot collapse the space
 * list — see `MatchmakingFacets`. That is also why a space can vanish from the list while still
 * selected: the *combination* is empty, not the space. Selected rows are pinned by
 * `orderFacetOptions` upstream so a chosen filter never scrolls out of reach of the control that
 * unpicks it.
 */
export function HubFacetRail<TFilter extends string>({
  filterOptions,
  filter,
  onFilterChange,
  facetSpaces,
  spaceIds,
  onSpaceToggle,
  onSpacesClear,
  facetTopics,
  topicIds,
  onTopicToggle,
  onTopicsClear,
}: Props<TFilter>) {
  const [topicSearch, setTopicSearch] = React.useState('');

  const facetSpaceIds = React.useMemo(() => facetSpaces.map(space => space.id), [facetSpaces]);
  const { labelsById, isLoading: labelsLoading } = useSpaceLabels(facetSpaceIds);

  const matchingTopics = React.useMemo(() => {
    const term = topicSearch.trim().toLowerCase();
    if (!term) return facetTopics;
    return facetTopics.filter(topic => (topic.name ?? '').toLowerCase().includes(term));
  }, [facetTopics, topicSearch]);

  return (
    <div className="flex flex-col gap-6 pb-8">
      <FacetGroup label="Show">
        {filterOptions.map(option => (
          <FacetRow
            key={option.value}
            label={option.label}
            selected={option.value === filter}
            // One of these is always on, so it reads as a choice rather than a set of toggles.
            role="radio"
            onSelect={() => onFilterChange(option.value)}
          />
        ))}
      </FacetGroup>

      <FacetGroup
        label="Spaces"
        count={spaceIds.length}
        onClear={spaceIds.length > 0 ? onSpacesClear : undefined}
        emptyMessage={facetSpaces.length === 0 ? 'No spaces to narrow by yet.' : undefined}
      >
        {facetSpaces.map(space => {
          const label = spaceLabel(labelsById, space.id);
          return (
            <FacetRow
              key={space.id}
              // A settled lookup that still cannot name the space really does leave "Space" as the
              // best label there is; only a name still on its way draws as a skeleton.
              label={label?.name ?? 'Space'}
              pending={!label && labelsLoading}
              count={space.count}
              selected={spaceIds.includes(space.id)}
              onSelect={() => onSpaceToggle(space.id)}
              leading={
                <span className="block size-4 shrink-0 overflow-hidden rounded-sm bg-grey-02">
                  <Avatar avatarUrl={label?.image ?? null} value={space.id} size={16} />
                </span>
              }
            />
          );
        })}
      </FacetGroup>

      <FacetGroup
        label="Topics"
        count={topicIds.length}
        onClear={topicIds.length > 0 ? onTopicsClear : undefined}
        emptyMessage={
          facetTopics.length === 0
            ? 'No topics to narrow by yet.'
            : matchingTopics.length === 0
              ? 'No topics match that.'
              : undefined
        }
      >
        {facetTopics.length > TOPIC_ROWS_BEFORE_SEARCH && (
          <div className="pb-1">
            <Input
              withSearchIcon
              value={topicSearch}
              onChange={event => setTopicSearch(event.currentTarget.value)}
              placeholder="Find a topic"
              aria-label="Find a topic"
            />
          </div>
        )}
        {matchingTopics.map(topic => (
          <FacetRow
            key={topic.id}
            label={topic.name ?? 'Topic'}
            count={topic.count}
            selected={topicIds.includes(topic.id)}
            onSelect={() => onTopicToggle(topic.id)}
          />
        ))}
      </FacetGroup>
    </div>
  );
}

function FacetGroup({
  label,
  count,
  onClear,
  emptyMessage,
  children,
}: {
  label: string;
  /** How many are selected, shown beside the heading so a collapsed scroll still says so. */
  count?: number;
  onClear?: () => void;
  emptyMessage?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 px-1">
        <Text as="h3" variant="footnoteMedium" color="grey-04">
          {label}
          {count ? ` · ${count}` : ''}
        </Text>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-footnote text-grey-04 transition-colors hover:text-text"
          >
            Clear
          </button>
        )}
      </div>
      {emptyMessage ? (
        <Text as="p" variant="footnote" color="grey-04" className="px-1 py-1">
          {emptyMessage}
        </Text>
      ) : (
        <div className="flex flex-col">{children}</div>
      )}
    </section>
  );
}

function FacetRow({
  label,
  count,
  selected,
  pending,
  leading,
  onSelect,
  role,
}: {
  label: string;
  count?: number;
  selected: boolean;
  pending?: boolean;
  leading?: React.ReactNode;
  onSelect: () => void;
  role?: 'radio';
}) {
  return (
    <button
      type="button"
      role={role ?? 'checkbox'}
      aria-checked={selected}
      onClick={onSelect}
      className={cx(
        'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors',
        selected ? 'bg-divider text-text' : 'text-grey-04 hover:bg-grey-01 hover:text-text'
      )}
    >
      {leading}
      {pending ? (
        <Skeleton className="h-3 w-24" />
      ) : (
        <span className="min-w-0 flex-1 truncate text-metadata">{label}</span>
      )}
      {count !== undefined && <span className="shrink-0 text-footnote text-grey-04 tabular-nums">{count}</span>}
    </button>
  );
}
