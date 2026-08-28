'use client';

import * as React from 'react';

import { CursorPager, useCursorPages } from '~/core/claims/browse/use-cursor-pages';
import type { ExploreFeedItem } from '~/core/explore/explore-card-item';
import { type SpaceLabel, spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';

import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { ExploreFeedCard } from '~/partials/explore/explore-feed-card';

import { useTopicCoverage } from './use-topic-coverage';

const COVERAGE_PAGE_SIZE = 8;

/**
 * Everything published elsewhere that names this topic: episodes, news stories, official documents,
 * tweets, posts, quotes, articles, papers and datasets.
 *
 * One feed rather than a module per type. Measured across topics, only episodes are ever numerous —
 * the rest run from a hundred down to one or two, so a section each would be seven empty ones and a
 * list. Together they are the bulk of what a topic knows.
 *
 * Episodes are folded in here despite being the largest single carrier. They are the same kind of
 * thing as the rest of this feed — published elsewhere, about the topic — and split out they
 * dominated the page while saying nothing the others didn't.
 *
 * Claims are the exception and have their own section: they are the only rows a reader can act on
 * rather than read.
 *
 * The rows are `ExploreFeedCard` itself, not a lookalike. Coverage is the explore feed narrowed to
 * one topic, so it should be the same card — thumbnail, space, type list, timestamp, vote and
 * comment row — and the version this section drew by hand had already drifted: no image, no
 * timestamp, no actions, a type chip where the feed sets a dotted meta line.
 */
export function TopicCoverage({ topicId }: { topicId: string }) {
  const pages = useCursorPages();
  const { page, isLoading, isPlaceholderData } = useTopicCoverage({
    topicId,
    first: COVERAGE_PAGE_SIZE,
    after: pages.cursor,
  });

  // A topic gathers across spaces, so these are routinely spaces the viewer has never opened and the
  // browse sidebar cannot name. Looked up for the page in one batch rather than per card.
  const spaceIds = React.useMemo(() => [...new Set(page.rows.map(row => row.spaceId))], [page.rows]);
  const { labelsById } = useSpaceLabels(spaceIds);

  const items = React.useMemo(
    () => page.rows.map(row => toFeedItem(row, spaceLabel(labelsById, row.spaceId))),
    [labelsById, page.rows]
  );

  if (isLoading && items.length === 0) {
    return <Skeleton className="h-[140px] w-full rounded-lg" />;
  }

  if (items.length === 0) return null;

  return (
    <section aria-label="Coverage">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Text as="h2" variant="mediumTitle" color="text">
          Coverage
        </Text>
        {/* A real total rather than a "there is more": `relationsConnection` counts the filtered set
            in the same request that returns the rows. */}
        <Text as="span" variant="metadata" color="grey-04" className="tabular-nums">
          {page.totalCount}
        </Text>
      </div>
      {/* Cards as direct siblings, exactly as the feed renders them: their bottom rule is a
          `last:border-b-0` on the card itself, so a wrapper around each one would leave a rule
          hanging under the final row.

          No Join button either. The feed shows one for spaces the viewer isn't in, but it knows
          that from membership data this query has no way to ask for — so rather than render the
          control in a state derived from a default, it isn't offered here. */}
      <div>
        {items.map(item => (
          <ExploreFeedCard key={`${item.entityId}-${item.spaceId}`} item={item} hideJoinButton />
        ))}
      </div>
      <CursorPager
        isFirstPage={pages.isFirstPage}
        hasNextPage={page.hasNextPage}
        isLoading={isLoading || isPlaceholderData}
        onPrevious={pages.toPrevious}
        onNext={() => page.endCursor && pages.toNext(page.endCursor)}
      />
    </section>
  );
}

/**
 * A row plus its space's name and thumbnail.
 *
 * `hasPendingMembershipRequest` is false because the Join button it belongs to is hidden — the flag
 * only ever changes that button's label.
 */
function toFeedItem(
  row: Omit<ExploreFeedItem, 'spaceName' | 'spaceImage' | 'hasPendingMembershipRequest'>,
  label: SpaceLabel | undefined
): ExploreFeedItem {
  return {
    ...row,
    // The same last resort the feed uses when a space has no name yet: an id fragment, which at
    // least differs between two spaces where a shared placeholder would not.
    spaceName: label?.name ?? row.spaceId.slice(0, 8),
    spaceImage: label?.image ?? null,
    hasPendingMembershipRequest: false,
  };
}
