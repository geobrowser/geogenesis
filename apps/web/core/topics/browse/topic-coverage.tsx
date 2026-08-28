'use client';

import * as React from 'react';

import { CursorPager, useCursorPages } from '~/core/claims/browse/use-cursor-pages';
import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { ID } from '~/core/id';
import type { Entity } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { primaryTypeName, useTopicLinkedEntities } from './use-topic-linked-entities';

const COVERAGE_PAGE_SIZE = 8;

/**
 * Everything published elsewhere that names this topic: episodes, news stories, tweets, posts,
 * articles, official documents, papers and datasets.
 *
 * One feed rather than a module per type. Measured across topics, only episodes are ever numerous —
 * the rest run from a few dozen down to one or two, so seven sections would be six empty ones and a
 * list. Together they are the bulk of what a topic knows.
 *
 * Episodes are folded in here despite being the single largest carrier of `Topics` in the graph.
 * They are the same kind of thing as the rest of this feed — something published elsewhere that
 * happens to be about the topic — and split out they dominated the page while saying nothing the
 * others didn't.
 *
 * Claims are the exception, and have their own section: they are the only rows a reader can act on
 * rather than read.
 */
export function TopicCoverage({ topicId, spaceId }: { topicId: string; spaceId: string }) {
  const pages = useCursorPages();
  const { entities, isLoading, isPlaceholderData, endCursor, hasNextPage } = useTopicLinkedEntities({
    topicId,
    first: COVERAGE_PAGE_SIZE,
    after: pages.cursor,
    rankInSpaceId: spaceId,
  });

  // Claims are filtered here rather than excluded in the query: the entities query takes types to
  // *include* and has no "not this type" to translate, so a page can come back holding only claims
  // and render as nothing at all.
  const coverage = React.useMemo(
    () => entities.filter(entity => !entity.types.some(type => ID.equals(type.id, CLAIM_TYPE_ID)) && entity.name),
    [entities]
  );

  // Step past such a page rather than showing a heading with a pager and no rows. Continues the way
  // the reader was already going — skipping forward after a Previous would walk them back to the
  // page they had just left. `entities.length > 0` distinguishes "this page held only claims" from
  // "this page hasn't arrived", which would otherwise skip the whole section on first load.
  const { direction, toNext, toPrevious, isFirstPage } = pages;
  React.useEffect(() => {
    if (isLoading || isPlaceholderData || coverage.length > 0 || entities.length === 0) return;
    if (direction === 'forward' && hasNextPage && endCursor) toNext(endCursor);
    else if (direction === 'back' && !isFirstPage) toPrevious();
  }, [
    coverage.length,
    direction,
    endCursor,
    entities.length,
    hasNextPage,
    isFirstPage,
    isLoading,
    isPlaceholderData,
    toNext,
    toPrevious,
  ]);

  if (isLoading && coverage.length === 0) {
    return <Skeleton className="h-[140px] w-full rounded-lg" />;
  }

  if (coverage.length === 0 && pages.isFirstPage) return null;

  return (
    <section aria-label="Coverage">
      <Text as="h2" variant="smallTitle" color="text" className="mb-3 block">
        Coverage
      </Text>
      {/* Divided rows rather than bordered cards, matching the explore feed's list rhythm. */}
      <ul className="m-0 flex list-none flex-col divide-y divide-divider p-0">
        {coverage.map(entity => (
          <li key={entity.id}>
            <CoverageRow entity={entity} spaceId={spaceId} />
          </li>
        ))}
      </ul>
      <CursorPager
        isFirstPage={pages.isFirstPage}
        hasNextPage={hasNextPage}
        isLoading={isLoading || isPlaceholderData}
        onPrevious={pages.toPrevious}
        onNext={() => endCursor && pages.toNext(endCursor)}
      />
    </section>
  );
}

/**
 * One row, built to the explore feed card's shape — same title size and weight, same two-line
 * clamped description, same dot-separated meta line — so a topic's coverage reads as the same kind
 * of listing the explore feed already trained people on.
 *
 * No thumbnail. The explore card leads with a 60px image, and resolving one here would be a media
 * lookup per row on a list of eight; the type is the more useful leading signal on a feed that
 * mixes episodes, tweets and documents.
 */
function CoverageRow({ entity, spaceId }: { entity: Entity; spaceId: string }) {
  const kind = primaryTypeName(entity);
  // The row's own space where it has one, so a link from a topic doesn't drop the reader into a
  // space the entity holds nothing in.
  const href = NavUtils.toEntity(entity.spaces[0] ?? spaceId, entity.id);

  return (
    <Link href={href} className="flex min-w-0 flex-col gap-1 py-3">
      <h3 className="text-[19px] leading-[23px] font-semibold tracking-[-0.02em] text-text hover:underline">
        {entity.name}
      </h3>
      {entity.description && (
        <p className="line-clamp-2 text-[16px] leading-[20px] tracking-[-0.03em] text-grey-04">{entity.description}</p>
      )}
      {kind && (
        <div className="mt-0.5 flex items-center text-metadata text-grey-04">
          <span>{kind}</span>
        </div>
      )}
    </Link>
  );
}
