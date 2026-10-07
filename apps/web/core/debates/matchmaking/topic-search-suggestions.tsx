'use client';

import * as React from 'react';

import { Text } from '~/design-system/text';

import { type DebateAnalyticsSurface, debateSurfaceAnalyticsAttributes } from './hub-analytics';
import { HubPillButton } from './hub-pill-button';
import { formatFacetCount } from './topic-facets';

/** Where the typed text starts a word in `name`, for the bold part of a suggestion. */
function matchStart(name: string, query: string): number {
  const haystack = name.toLowerCase();
  const needle = query.trim().toLowerCase();
  if (!needle) return -1;
  for (let index = haystack.indexOf(needle); index !== -1; index = haystack.indexOf(needle, index + 1)) {
    if (index === 0 || !/[\p{L}\p{N}]/u.test(haystack[index - 1]!)) return index;
  }
  return -1;
}

/**
 * The topics matching what is typed in the search box, as pills under it.
 *
 * The search box answers claims; this is what makes it answer topics too, without folding one into
 * the other. Typing "energy" lists the claims that match it, and offers the Energy topic beside them
 * as something to filter by — so a viewer who did not know topics were there finds them, and turning
 * a word into a filter is one press. Pressing one is the caller's to handle: it picks the topic and
 * clears the text the topic now stands in for.
 */
export function TopicSearchSuggestions({
  analyticsSurface,
  query,
  topics,
  onPick,
}: {
  analyticsSurface: DebateAnalyticsSurface;
  query: string;
  topics: { id: string; name: string | null; count: number }[];
  onPick: (topicId: string) => void;
}) {
  if (topics.length === 0) return null;

  return (
    <div role="group" aria-label="Matching topics" className="flex flex-wrap items-center gap-2">
      <Text as="span" variant="footnote" color="grey-04">
        Topics
      </Text>
      {topics.map(topic => {
        const name = topic.name ?? 'Topic';
        const start = matchStart(name, query);
        const end = start + query.trim().length;
        return (
          <HubPillButton
            key={topic.id}
            aria-label={`Filter by ${name}`}
            onClick={() => onPick(topic.id)}
            className="gap-1.5"
            {...debateSurfaceAnalyticsAttributes(analyticsSurface, 'Topic suggestion', 'filter')}
          >
            <span aria-hidden className="text-grey-04">
              +
            </span>
            <span className="max-w-[200px] truncate">
              {start === -1 ? (
                name
              ) : (
                <>
                  {name.slice(0, start)}
                  <span className="font-semibold">{name.slice(start, end)}</span>
                  {name.slice(end)}
                </>
              )}
            </span>
            <span className="text-grey-04 tabular-nums">{formatFacetCount(topic.count)}</span>
          </HubPillButton>
        );
      })}
    </div>
  );
}
