'use client';

import * as React from 'react';

import cx from 'classnames';

import { buildTopicPills } from '~/core/topics/feed-topic-pills';
import { type TopicOption, useTopicSearch, useTopicSuggestions } from '~/core/topics/use-topic-suggestions';
import { normId } from '~/core/utils/norm-id';

import { Dots } from '~/design-system/dots';
import { Close } from '~/design-system/icons/close';
import { Search } from '~/design-system/icons/search';
import { Text } from '~/design-system/text';

export const RECOMMENDED_FEED_TOPIC_COUNT = 3;

type Props = {
  /** Spaces to rank suggestions from. Empty shows search only. */
  spaceIds: string[];
  selected: TopicOption[];
  onChange: (topics: TopicOption[]) => void;
  /** The caller is still working out `spaceIds`. */
  isPreparing?: boolean;
  /** The caller failed to work out `spaceIds`; `onRetryPrepare` tries again. */
  failedToPrepare?: boolean;
  onRetryPrepare?: () => void;
  className?: string;
};

/** Suggestions and inline Topic-only search share the same pill controls and selection state. */
export function FeedTopicPicker({
  spaceIds,
  selected,
  onChange,
  isPreparing = false,
  failedToPrepare = false,
  onRetryPrepare,
  className,
}: Props) {
  const [query, setQuery] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const hasQuery = query.trim().length > 0;
  const { suggestions, isLoading, isError, refetch, hasMore, isFetchingMore, fetchMore } =
    useTopicSuggestions(spaceIds);
  const { results, isSearching, isError: isSearchError, refetch: refetchSearch } = useTopicSearch(query);

  const pills = React.useMemo(
    () =>
      buildTopicPills({
        suggestions: hasQuery ? [...selected, ...suggestions] : suggestions,
        searchResults: results,
        hasQuery,
        // Search shows matching results only; saved picks reappear when it is cleared.
        selected: hasQuery ? [] : selected,
      }),
    [suggestions, results, hasQuery, selected]
  );
  const selectedIds = new Set(selected.map(topic => normId(topic.id)));
  const isBusy = hasQuery ? isSearching : isPreparing || isLoading;
  const failed = hasQuery ? isSearchError : isError || failedToPrepare;
  const retry = hasQuery ? () => void refetchSearch() : failedToPrepare ? onRetryPrepare : () => void refetch();

  function clearSearch() {
    setQuery('');
    inputRef.current?.focus();
  }

  return (
    <div className={cx('flex min-h-0 flex-col', className)}>
      <div className="flex shrink-0 items-center gap-2 rounded-full border border-grey-02 bg-grey-01 px-3 py-2 text-grey-04 focus-within:border-text">
        <span aria-hidden="true" className="shrink-0">
          <Search />
        </span>
        <input
          ref={inputRef}
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (hasQuery && event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              clearSearch();
            }
          }}
          placeholder="Search topics..."
          aria-label="Search topics"
          spellCheck={false}
          className="w-full min-w-0 text-[16px] leading-5 text-text placeholder:text-grey-03 focus:outline-hidden"
        />
        {hasQuery && (
          <button
            type="button"
            aria-label="Clear topic search"
            onClick={clearSearch}
            className="shrink-0 rounded-sm text-grey-04 hover:text-text focus-visible:outline-2 focus-visible:outline-text"
          >
            <Close />
          </button>
        )}
      </div>
      <div
        role="region"
        aria-label={hasQuery ? 'Topic search results' : 'Topics'}
        aria-busy={isBusy}
        className="mt-4 min-h-0 flex-1 overflow-y-auto"
      >
        <div className="flex flex-wrap content-start items-start gap-1.5">
          {pills.map(topic => {
            const isSelected = selectedIds.has(normId(topic.id));
            const isStale = hasQuery && isSearching;
            return (
              <button
                key={topic.id}
                type="button"
                aria-pressed={isSelected}
                disabled={isStale}
                onClick={() =>
                  onChange(
                    isSelected ? selected.filter(pick => normId(pick.id) !== normId(topic.id)) : [...selected, topic]
                  )
                }
                className={cx(
                  'max-w-full rounded-full border px-3 py-1.5 text-left text-metadata transition-colors focus-visible:outline-2 focus-visible:outline-text disabled:opacity-50',
                  isSelected ? 'border-text bg-grey-02' : 'border-grey-02 hover:bg-grey-01'
                )}
              >
                <span className="break-words">{topic.name}</span>
              </button>
            );
          })}
        </div>
        {isBusy ? (
          <div className="flex justify-center py-6">
            <Dots />
          </div>
        ) : failed ? (
          <TopicLoadError onRetry={retry} />
        ) : pills.length === 0 ? (
          <Text as="p" variant="body" className="py-6 text-center text-grey-04">
            {hasQuery ? 'No topics match that search.' : 'Search for topics you want to follow.'}
          </Text>
        ) : (
          !hasQuery &&
          hasMore && (
            <button
              type="button"
              onClick={() => fetchMore()}
              disabled={isFetchingMore}
              aria-label={isFetchingMore ? 'Loading more topics' : undefined}
              className="mt-3 mb-1 rounded-full bg-grey-01 px-3 py-2 text-smallButton text-grey-04 transition-colors hover:bg-grey-02 hover:text-text"
            >
              {isFetchingMore ? <Dots /> : 'Show more topics'}
            </button>
          )
        )}
      </div>
    </div>
  );
}

function TopicLoadError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <Text as="p" variant="body" className="text-grey-04">
        We couldn&apos;t load topics.
      </Text>
      {onRetry && (
        <button type="button" onClick={onRetry} className="text-smallButton text-text underline">
          Try again
        </button>
      )}
    </div>
  );
}
