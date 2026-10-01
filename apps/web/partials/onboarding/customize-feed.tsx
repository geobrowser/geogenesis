'use client';

import * as React from 'react';

import cx from 'classnames';

import { buildTopicPills } from '~/core/topics/feed-topic-pills';
import { type TopicOption, useTopicSearch, useTopicSuggestions } from '~/core/topics/use-topic-suggestions';
import { normId } from '~/core/utils/norm-id';

import { Dots } from '~/design-system/dots';
import { Search } from '~/design-system/icons/search';
import { Text } from '~/design-system/text';

export const RECOMMENDED_FEED_TOPIC_COUNT = 3;

type Props = {
  /** Spaces to rank suggestions from. Empty shows search only. */
  spaceIds: string[];
  selected: TopicOption[];
  onToggle: (topic: TopicOption) => void;
  /** The caller is still working out `spaceIds`. */
  isPreparing?: boolean;
  /** The caller failed to work out `spaceIds`; `onRetryPrepare` tries again. */
  failedToPrepare?: boolean;
  onRetryPrepare?: () => void;
  className?: string;
};

/**
 * Search box and a wall of topic pills. Holds no picks itself, so it renders the same inside
 * onboarding and anywhere else that lets someone choose topics to follow.
 */
export function FeedTopicPicker({
  spaceIds,
  selected,
  onToggle,
  isPreparing = false,
  failedToPrepare = false,
  onRetryPrepare,
  className,
}: Props) {
  const [query, setQuery] = React.useState('');
  const hasQuery = query.trim().length > 0;

  const { suggestions, isLoading, isError, refetch, hasMore, isFetchingMore, fetchMore } =
    useTopicSuggestions(spaceIds);
  const { results, isSearching, isError: isSearchError, refetch: refetchSearch } = useTopicSearch(query);

  const pills = React.useMemo(
    () => buildTopicPills({ suggestions, searchResults: results, hasQuery, selected }),
    [suggestions, results, hasQuery, selected]
  );
  const selectedIds = React.useMemo(() => new Set(selected.map(topic => normId(topic.id))), [selected]);

  const isBusy = hasQuery ? isSearching && results.length === 0 : isPreparing || isLoading;
  const failed = hasQuery ? isSearchError : isError || failedToPrepare;
  const retry = hasQuery ? () => void refetchSearch() : failedToPrepare ? onRetryPrepare : () => void refetch();
  // Hits from the previous query stay on screen while the next loads, but can't be picked.
  const isStale = hasQuery && isSearching;
  const nothingListed = (hasQuery ? results : suggestions).length === 0;

  return (
    <div className={cx('flex min-h-0 flex-col', className)}>
      <label className="flex shrink-0 items-center gap-2 rounded-md border border-grey-02 px-3 py-2 text-grey-04 focus-within:border-text">
        <Search />
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search topics..."
          aria-label="Search topics"
          spellCheck={false}
          className="w-full text-[16px] leading-5 text-text placeholder:text-grey-03 focus:outline-hidden"
        />
      </label>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-wrap content-start items-start justify-center gap-1">
          {pills.map(topic => (
            <TopicPill
              key={topic.id}
              topic={topic}
              isSelected={selectedIds.has(normId(topic.id))}
              isStale={isStale && !selectedIds.has(normId(topic.id))}
              onToggle={onToggle}
            />
          ))}
        </div>

        {isBusy ? (
          <div className="flex justify-center py-6">
            <Dots />
          </div>
        ) : failed && nothingListed ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Text as="p" variant="body" className="text-[16px] leading-5 font-normal text-grey-04">
              We couldn&apos;t load topics.
            </Text>
            {retry && (
              <button type="button" onClick={retry} className="text-smallButton text-text underline">
                Try again
              </button>
            )}
          </div>
        ) : nothingListed ? (
          <Text as="p" variant="body" className="py-6 text-center text-[16px] leading-5 font-normal text-grey-04">
            {hasQuery ? 'No topics match that search.' : 'Search for topics you want to follow.'}
          </Text>
        ) : (
          !hasQuery &&
          hasMore && (
            <div className="flex justify-center pt-3 pb-1">
              <button
                type="button"
                onClick={() => fetchMore()}
                disabled={isFetchingMore}
                className="text-smallButton text-grey-04 transition-colors hover:text-text"
              >
                {isFetchingMore ? <Dots /> : 'Show more topics'}
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function TopicPill({
  topic,
  isSelected,
  isStale,
  onToggle,
}: {
  topic: TopicOption;
  isSelected: boolean;
  isStale: boolean;
  onToggle: (topic: TopicOption) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={isStale ? -1 : 0}
      aria-pressed={isSelected}
      aria-disabled={isStale || undefined}
      onKeyDown={event => {
        if (isStale) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggle(topic);
        }
      }}
      onClick={() => !isStale && onToggle(topic)}
      className={cx(
        'flex items-center justify-start rounded-[40px] border px-4 py-3',
        isSelected ? 'border-[#2A2B2E]' : 'border-grey-02',
        isStale ? 'cursor-default opacity-50' : 'cursor-pointer'
      )}
    >
      <span className="text-[16px] leading-[10px] font-normal text-[#2A2B2E]">{topic.name}</span>
    </div>
  );
}
