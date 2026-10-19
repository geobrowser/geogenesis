'use client';

import * as React from 'react';

import cx from 'classnames';

import { buildTopicPills } from '~/core/topics/feed-topic-pills';
import { type TopicOption, useTopicSearch, useTopicSuggestions } from '~/core/topics/use-topic-suggestions';
import { normId } from '~/core/utils/norm-id';

import { DIALOG_ACTION_BUTTON_CLASS_NAME } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { Check } from '~/design-system/icons/check';
import { Search } from '~/design-system/icons/search';
import { Text } from '~/design-system/text';

export const RECOMMENDED_FEED_TOPIC_COUNT = 3;

type Props = {
  /** Spaces to rank suggestions from. Empty shows search only. */
  spaceIds: string[];
  selected: TopicOption[];
  onChange: (topics: TopicOption[]) => void;
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  /** The caller is still working out `spaceIds`. */
  isPreparing?: boolean;
  /** The caller failed to work out `spaceIds`; `onRetryPrepare` tries again. */
  failedToPrepare?: boolean;
  onRetryPrepare?: () => void;
  className?: string;
};

/** Topic suggestions and a separate search view. Search picks are committed together with Add. */
export function FeedTopicPicker({
  spaceIds,
  selected,
  onChange,
  searchOpen,
  onSearchOpenChange,
  isPreparing = false,
  failedToPrepare = false,
  onRetryPrepare,
  className,
}: Props) {
  const [query, setQuery] = React.useState('');
  const [draft, setDraft] = React.useState<TopicOption[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const searchButtonRef = React.useRef<HTMLButtonElement>(null);
  const wasSearchingRef = React.useRef(false);

  React.useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
    else if (wasSearchingRef.current) searchButtonRef.current?.focus();
    wasSearchingRef.current = searchOpen;
  }, [searchOpen]);

  const { suggestions, isLoading, isError, refetch, hasMore, isFetchingMore, fetchMore } =
    useTopicSuggestions(spaceIds);
  const {
    results,
    isSearching,
    isError: isSearchError,
    refetch: refetchSearch,
  } = useTopicSearch(searchOpen ? query : '');

  const pills = React.useMemo(
    () => buildTopicPills({ suggestions, searchResults: [], hasQuery: false, selected }),
    [suggestions, selected]
  );
  // Search shows matching rows only. Reuse known ids for names that are already selected or listed.
  const searchResults = React.useMemo(
    () =>
      buildTopicPills({
        suggestions: [...draft, ...selected, ...suggestions],
        searchResults: results,
        hasQuery: true,
        selected: [],
      }),
    [draft, selected, suggestions, results]
  );
  const selectedIds = new Set(selected.map(topic => normId(topic.id)));
  const draftIds = new Set(draft.map(topic => normId(topic.id)));
  const draftChanged = draftIds.size !== selectedIds.size || [...draftIds].some(id => !selectedIds.has(id));
  const hasQuery = query.trim().length > 0;

  function toggle(topics: TopicOption[], topic: TopicOption) {
    const id = normId(topic.id);
    return topics.some(pick => normId(pick.id) === id)
      ? topics.filter(pick => normId(pick.id) !== id)
      : [...topics, topic];
  }

  return (
    <div
      className={cx('flex min-h-0 flex-col', className)}
      onKeyDown={event => {
        if (searchOpen && event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onSearchOpenChange(false);
        }
      }}
    >
      {searchOpen ? (
        <>
          <div className="flex shrink-0 items-center gap-3">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-grey-02 bg-grey-01 px-3 py-2 text-grey-04 focus-within:border-text">
              <Search />
              <input
                ref={inputRef}
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search topics..."
                aria-label="Search topics"
                spellCheck={false}
                className="w-full min-w-0 text-[16px] leading-5 text-text placeholder:text-grey-03 focus:outline-hidden"
              />
            </label>
            <button
              type="button"
              onClick={() => onSearchOpenChange(false)}
              className="text-smallButton text-grey-04 hover:text-text"
            >
              Cancel
            </button>
          </div>
          <div
            role="region"
            aria-label="Topic search results"
            aria-busy={isSearching}
            className="mt-4 min-h-0 flex-1 overflow-y-auto"
          >
            {hasQuery &&
              searchResults.map(topic => (
                <button
                  key={topic.id}
                  type="button"
                  aria-pressed={draftIds.has(normId(topic.id))}
                  aria-disabled={isSearching || undefined}
                  disabled={isSearching}
                  onClick={() => setDraft(previous => toggle(previous, topic))}
                  className={cx(
                    'mb-1 flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-body transition-colors focus-visible:outline-2 focus-visible:outline-text disabled:opacity-50',
                    draftIds.has(normId(topic.id)) ? 'border-text bg-grey-01' : 'border-transparent hover:bg-grey-01'
                  )}
                >
                  <span className="min-w-0 truncate">{topic.name}</span>
                  {draftIds.has(normId(topic.id)) && (
                    <span aria-hidden="true" className="shrink-0">
                      <Check />
                    </span>
                  )}
                </button>
              ))}
            {hasQuery && isSearching ? (
              <div className="flex justify-center py-6">
                <Dots />
              </div>
            ) : hasQuery && isSearchError ? (
              <TopicLoadError onRetry={() => void refetchSearch()} />
            ) : (
              (!hasQuery || searchResults.length === 0) && (
                <Text as="p" variant="body" className="py-6 text-center text-grey-04">
                  {hasQuery ? 'No topics match that search.' : 'Search for topics you want to follow.'}
                </Text>
              )
            )}
          </div>
          <div className="shrink-0 border-t border-grey-02 pt-4">
            <button
              type="button"
              disabled={!draftChanged || isSearching}
              onClick={() => {
                onChange(draft);
                onSearchOpenChange(false);
              }}
              className={DIALOG_ACTION_BUTTON_CLASS_NAME}
            >
              Add
            </button>
          </div>
        </>
      ) : (
        <>
          <button
            ref={searchButtonRef}
            type="button"
            aria-label="Search topics"
            onClick={() => {
              setDraft(selected);
              onSearchOpenChange(true);
            }}
            className="flex shrink-0 items-center gap-2 rounded-full border border-grey-02 bg-grey-01 px-3 py-2 text-left text-[16px] leading-5 text-grey-04 hover:border-grey-03 focus-visible:outline-2 focus-visible:outline-text"
          >
            <Search />
            <span className="min-w-0 truncate">{query.trim() || 'Find more of your interests'}</span>
          </button>
          <div role="region" aria-label="Topics" className="mt-4 min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-wrap content-start items-start gap-1.5">
              {pills.map(topic => (
                <button
                  key={topic.id}
                  type="button"
                  aria-pressed={selectedIds.has(normId(topic.id))}
                  onClick={() => onChange(toggle(selected, topic))}
                  className={cx(
                    'flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-metadata transition-colors focus-visible:outline-2 focus-visible:outline-text',
                    selectedIds.has(normId(topic.id)) ? 'border-text bg-grey-02' : 'border-grey-02 hover:bg-grey-01'
                  )}
                >
                  {selectedIds.has(normId(topic.id)) && (
                    <span aria-hidden="true" className="shrink-0">
                      <Check />
                    </span>
                  )}
                  <span className="min-w-0 break-words">{topic.name}</span>
                </button>
              ))}
            </div>
            {isPreparing || isLoading ? (
              <div className="flex justify-center py-6">
                <Dots />
              </div>
            ) : isError || failedToPrepare ? (
              <TopicLoadError onRetry={failedToPrepare ? onRetryPrepare : () => void refetch()} />
            ) : suggestions.length === 0 ? (
              <Text as="p" variant="body" className="py-6 text-center text-grey-04">
                Search for topics you want to follow.
              </Text>
            ) : (
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
        </>
      )}
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
