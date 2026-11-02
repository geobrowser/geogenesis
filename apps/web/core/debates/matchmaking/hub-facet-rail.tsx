'use client';

import * as React from 'react';

import cx from 'classnames';

import { useInfiniteScrollSentinel } from '~/core/hooks/use-infinite-scroll-sentinel';
import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';

import { Avatar } from '~/design-system/avatar';
import { CheckboxVisual } from '~/design-system/checkbox';
import { Input } from '~/design-system/input';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import type { MatchmakingFacetCount, MatchmakingTopic } from '../api';

/** Topics past this are reachable by typing rather than by scrolling a list of hundreds. */
const TOPIC_ROWS_BEFORE_SEARCH = 12;

/**
 * Topic rows drawn at a time. The facet arrives whole — one grouped aggregate, which has no paging —
 * and in a broad scope that is well over a thousand topics, every one of them a row. The rest are
 * drawn as the rail is scrolled toward them; "Find a topic" still searches all of them.
 */
export const TOPIC_ROWS_PER_PAGE = 30;

type FacetTopic = MatchmakingTopic & { count?: number };

type Props = {
  facetSpaces: MatchmakingFacetCount[];
  spaceIds: string[];
  onSpaceToggle: (id: string) => void;
  onSpacesClear: () => void;
  facetTopics: FacetTopic[];
  topicIds: string[];
  onTopicToggle: (id: string) => void;
  onTopicsClear: () => void;
};

/** Workspace left rail: open space/topic/show facets (corpus-wide counts; selected rows pinned upstream). */
export function HubFacetRail({
  facetSpaces,
  spaceIds,
  onSpaceToggle,
  onSpacesClear,
  facetTopics,
  topicIds,
  onTopicToggle,
  onTopicsClear,
}: Props) {
  const [topicSearch, setTopicSearch] = React.useState('');

  const facetSpaceIds = React.useMemo(() => facetSpaces.map(space => space.id), [facetSpaces]);
  const { labelsById, isLoading: labelsLoading } = useSpaceLabels(facetSpaceIds);

  const matchingTopics = React.useMemo(() => {
    const term = topicSearch.trim().toLowerCase();
    if (!term) return facetTopics;
    return facetTopics.filter(topic => (topic.name ?? '').toLowerCase().includes(term));
  }, [facetTopics, topicSearch]);

  const [topicRowLimit, setTopicRowLimit] = React.useState(TOPIC_ROWS_PER_PAGE);
  const shownTopics = matchingTopics.slice(0, topicRowLimit);
  const moreTopics = matchingTopics.length > shownTopics.length;
  const showMoreTopics = React.useCallback(() => setTopicRowLimit(limit => limit + TOPIC_ROWS_PER_PAGE), []);
  const topicSentinelRef = useInfiniteScrollSentinel({
    hasNextPage: moreTopics,
    isFetchingNextPage: false,
    fetchNextPage: showMoreTopics,
    // The rail scrolls on its own, so the lead time has to be measured against it, not the page.
    rootSelector: '[data-hub-facet-rail-scroll]',
  });

  return (
    <div className="flex flex-col gap-6 pb-8">
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
              label={label?.name ?? 'Space'}
              pending={!label && labelsLoading}
              count={space.count}
              selected={spaceIds.includes(space.id)}
              onSelect={() => onSpaceToggle(space.id)}
              leading={<SpaceThumb spaceId={space.id} image={label?.image ?? null} />}
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
              onChange={event => {
                setTopicSearch(event.currentTarget.value);
                // Back to one page, so a narrowed list starts at its top.
                setTopicRowLimit(TOPIC_ROWS_PER_PAGE);
              }}
              placeholder="Find a topic"
              aria-label="Find a topic"
            />
          </div>
        )}
        {shownTopics.map(topic => (
          <FacetRow
            key={topic.id}
            label={topic.name ?? 'Topic'}
            count={topic.count}
            selected={topicIds.includes(topic.id)}
            onSelect={() => onTopicToggle(topic.id)}
          />
        ))}
        {moreTopics && (
          <div ref={topicSentinelRef} aria-hidden="true" data-testid="topic-rows-sentinel" className="h-px" />
        )}
      </FacetGroup>
    </div>
  );
}

/** A space's 16px thumbnail, its generated avatar where it has no image: the rail's rows and the space pills. */
export function SpaceThumb({ spaceId, image }: { spaceId: string; image: string | null }) {
  return (
    <span className="block size-4 shrink-0 overflow-hidden rounded-sm bg-grey-02">
      <Avatar avatarUrl={image} value={spaceId} size={16} />
    </span>
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
      <div className="flex flex-col">{children}</div>
      {emptyMessage && (
        <Text as="p" variant="footnote" color="grey-04" className="px-1 py-1">
          {emptyMessage}
        </Text>
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
  const multiSelect = role !== 'radio';

  return (
    <button
      type="button"
      role={role ?? 'checkbox'}
      aria-checked={selected}
      onClick={onSelect}
      className={cx(
        'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors',
        multiSelect
          ? cx('hover:bg-grey-01', selected ? 'text-text' : 'text-grey-04 hover:text-text')
          : selected
            ? 'bg-divider text-text'
            : 'text-grey-04 hover:bg-grey-01 hover:text-text'
      )}
    >
      {multiSelect && (
        <span className="shrink-0">
          <CheckboxVisual checked={selected} />
        </span>
      )}
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
