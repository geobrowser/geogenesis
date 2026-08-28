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
  });

  // Claims are filtered here rather than excluded in the query: the store's filter has no "not this
  // type" that survives translation, so a page can render short by however many claims it held. The
  // pager reads `hasNextPage` from the server rather than counting rows, so a short page still steps
  // correctly — it just shows fewer than the page size.
  const coverage = React.useMemo(
    () => entities.filter(entity => !entity.types.some(type => ID.equals(type.id, CLAIM_TYPE_ID)) && entity.name),
    [entities]
  );

  if (isLoading && coverage.length === 0) {
    return <Skeleton className="h-[140px] w-full rounded-lg" />;
  }

  if (coverage.length === 0 && pages.isFirstPage) return null;

  return (
    <section aria-label="Coverage">
      <Text as="h2" variant="smallTitle" color="text" className="mb-3 block">
        Coverage
      </Text>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
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

function CoverageRow({ entity, spaceId }: { entity: Entity; spaceId: string }) {
  const kind = primaryTypeName(entity);
  // The row's own space where it has one, so a link from a topic doesn't drop the reader into a
  // space the entity holds nothing in.
  const href = NavUtils.toEntity(entity.spaces[0] ?? spaceId, entity.id);

  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-lg border border-grey-02 bg-white p-3 transition-colors hover:border-grey-03"
    >
      {kind && (
        <span className="mt-0.5 shrink-0 rounded-xs bg-grey-01 px-1.5 py-0.5 text-[0.6875rem] font-medium tracking-wide text-grey-04 uppercase">
          {kind}
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-0.5">
        <Text as="span" variant="metadataMedium" color="text">
          {entity.name}
        </Text>
        {entity.description && (
          <Text as="span" variant="metadata" color="grey-04" className="line-clamp-1">
            {entity.description}
          </Text>
        )}
      </div>
    </Link>
  );
}
