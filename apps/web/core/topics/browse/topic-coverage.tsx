'use client';

import { CursorPager, useCursorPages } from '~/core/claims/browse/use-cursor-pages';
import { SpaceChip } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { NavUtils, validateSpaceId } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { type CoverageItem, useTopicCoverage } from './use-topic-coverage';

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
 */
export function TopicCoverage({ topicId, spaceId }: { topicId: string; spaceId: string }) {
  const pages = useCursorPages();
  const { page, isLoading, isPlaceholderData } = useTopicCoverage({
    topicId,
    first: COVERAGE_PAGE_SIZE,
    after: pages.cursor,
  });

  if (isLoading && page.items.length === 0) {
    return <Skeleton className="h-[140px] w-full rounded-lg" />;
  }

  if (page.items.length === 0) return null;

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
      {/* Divided rows rather than bordered cards, matching the explore feed's list rhythm. */}
      <ul className="m-0 flex list-none flex-col divide-y divide-divider p-0">
        {page.items.map(item => (
          <li key={item.id}>
            <CoverageRow item={item} spaceId={spaceId} />
          </li>
        ))}
      </ul>
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
 * One row: the entity's name at the size an entity name is set everywhere else, a clamped
 * description, and its kind as a chip.
 *
 * No thumbnail. The explore card leads with a 60px image, and resolving one here would be a media
 * lookup per row; the type is the more useful leading signal on a feed mixing episodes, tweets and
 * official documents.
 */
function CoverageRow({ item, spaceId }: { item: CoverageItem; spaceId: string }) {
  // The row's own space where it has one, so a link from a topic doesn't drop the reader into a
  // space the entity holds nothing in. A topic gathers across spaces, so this is routinely not the
  // space in the route — which is why the chip below is worth showing at all.
  const space = item.spaceIds.find(validateSpaceId) ?? null;
  const href = NavUtils.toEntity(space ?? spaceId, item.id);

  return (
    <Link href={href} className="flex min-w-0 flex-col gap-1 py-3">
      <Text as="h3" variant="cardEntityTitle" color="text" className="hover:underline">
        {item.name}
      </Text>
      {item.description && (
        <p className="line-clamp-2 text-[16px] leading-[20px] tracking-[-0.03em] text-grey-04">{item.description}</p>
      )}
      {/* What it is and where it came from, together. Chips rather than a line of grey text: on a
          feed mixing episodes, tweets and official documents drawn from several spaces, these are
          the row's leading signals, and set as metadata under the description they read as part of
          the description rather than labels on it.
          
          The space is the same chip a claim card draws, so one space reads identically wherever it
          appears. */}
      {(item.kind || space) && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {item.kind && (
            <span className="flex h-6 items-center rounded border border-grey-02 bg-white px-1.5 text-metadata text-grey-04">
              {item.kind}
            </span>
          )}
          {space && <SpaceChip spaceId={space} />}
        </div>
      )}
    </Link>
  );
}
