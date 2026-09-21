'use client';

import * as React from 'react';

import { buildExploreFeedRows, toExploreFeedItem } from '~/core/explore/explore-card-item';
import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Relation } from '~/core/types';

import { RightArrowLongSmall } from '~/design-system/icons/right-arrow-long-small';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

import { ExploreFeedCard } from '~/partials/explore/explore-feed-card';
import { SectionTitle } from '~/partials/entity-page/section-title';

const PREVIEW_LIMIT = 3;
const SEE_ALL_CLASS =
  'mt-2 flex items-center justify-center gap-2 border-t border-divider py-3 text-metadataMedium text-grey-04 transition-colors hover:text-text';

export function TopicSubtopics({
  relations,
  spaceId,
  href,
  preview = false,
  onSeeAll,
}: {
  relations: Relation[];
  spaceId: string;
  href: string;
  preview?: boolean;
  onSeeAll?: () => void;
}) {
  const subtopicIds = React.useMemo(() => relations.map(relation => relation.toEntity.id), [relations]);
  const { entities, isLoading } = useQueryEntities({
    where: { id: { in: subtopicIds } },
    first: Math.max(subtopicIds.length, 1),
    enabled: subtopicIds.length > 0,
  });

  const orderedEntities = React.useMemo(() => {
    const order = new Map(subtopicIds.map((id, index) => [id, index]));
    return [...entities].sort(
      (left, right) => (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    );
  }, [entities, subtopicIds]);

  const rows = React.useMemo(
    () =>
      buildExploreFeedRows(
        orderedEntities.map(entity => ({
          ...entity,
          createdAt: typeof entity.createdAt === 'string' ? entity.createdAt : undefined,
          commentCount: 0,
        })),
        new Set([spaceId]),
        new Set()
      ),
    [orderedEntities, spaceId]
  );
  const rowSpaceIds = React.useMemo(() => [...new Set(rows.map(row => row.spaceId))], [rows]);
  const { labelsById } = useSpaceLabels(rowSpaceIds);
  const items = React.useMemo(
    () => rows.map(row => toExploreFeedItem(row, spaceLabel(labelsById, row.spaceId))),
    [labelsById, rows]
  );
  const visibleItems = preview ? items.slice(0, PREVIEW_LIMIT) : items;

  if (relations.length === 0) return null;
  if (isLoading && items.length === 0) return <Skeleton className="h-[180px] w-full rounded-lg" />;

  return (
    <section aria-label="Subtopics">
      <SectionTitle>Subtopics</SectionTitle>
      <div>
        {visibleItems.map(item => (
          <ExploreFeedCard key={`${item.entityId}-${item.spaceId}`} item={item} hideJoinButton />
        ))}
      </div>
      {preview && items.length > 0 ? (
        onSeeAll ? (
          <button type="button" className={SEE_ALL_CLASS} onClick={onSeeAll}>
            See all subtopics
            <RightArrowLongSmall />
          </button>
        ) : (
          <Link href={href} className={SEE_ALL_CLASS}>
            See all subtopics
            <RightArrowLongSmall />
          </Link>
        )
      ) : null}
    </section>
  );
}
