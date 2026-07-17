'use client';

import * as React from 'react';

import cx from 'classnames';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useEntityMedia, useImageUrlFromEntity } from '~/core/utils/use-entity-media';
import { NavUtils } from '~/core/utils/utils';

import { GeoImage } from '~/design-system/geo-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

import { RankingBlockGlobalPagination } from './ranking-block-global-pagination';
import { RankingPeriodMetadata } from './ranking-period-metadata';
import type { RankingBlockState } from './use-ranking-block-state';

function RankingGalleryCard({
  entityId,
  spaceId,
  name,
  imageHint,
}: {
  entityId: string;
  spaceId: string;
  name: string;
  imageHint?: string | null;
}) {
  const { avatarUrl, coverUrl } = useEntityMedia(entityId, spaceId);
  const directIpfs = imageHint && imageHint.startsWith('ipfs://') ? imageHint : undefined;
  const lookedUpFromHint = useImageUrlFromEntity(imageHint && !directIpfs ? imageHint : undefined, spaceId);
  const imageUrl = directIpfs ?? lookedUpFromHint ?? coverUrl ?? avatarUrl ?? PLACEHOLDER_SPACE_IMAGE;
  const href = NavUtils.toEntity(spaceId, entityId);

  return (
    <div className="w-[240px] shrink-0 select-none">
      <Link href={href} className="block" draggable={false}>
        <div className="relative h-[120px] w-[240px] overflow-hidden rounded-xl bg-grey-01">
          <GeoImage value={imageUrl} className="pointer-events-none object-cover" fill alt="" draggable={false} />
        </div>
      </Link>
      <Link href={href} className="mt-2 block" draggable={false}>
        <p className="line-clamp-2 text-[19px] leading-[1.3] font-medium text-text">{name}</p>
      </Link>
    </div>
  );
}

function RankingGalleryCardSkeleton({ keyId }: { keyId: string }) {
  return (
    <div key={keyId} className="w-[240px] shrink-0">
      <Skeleton className="h-[120px] w-[240px] rounded-xl" />
      <Skeleton className="mt-2 h-6 w-[180px]" />
    </div>
  );
}

const GALLERY_SCROLL_ROW_CLASS =
  '-mx-1 flex flex-nowrap gap-8 overflow-x-auto overflow-y-clip px-1 select-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&_a]:[-webkit-user-drag:none] [&_img]:[-webkit-user-drag:none]';

const GALLERY_DRAG_THRESHOLD_PX = 5;

function RankingGalleryScrollRow({ children, itemCount }: { children: React.ReactNode; itemCount: number }) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const isDragging = React.useRef(false);
  const isPointerDown = React.useRef(false);
  const didDragScroll = React.useRef(false);
  const dragStartX = React.useRef(0);
  const scrollStartLeft = React.useRef(0);
  const [isScrollable, setIsScrollable] = React.useState(false);

  React.useEffect(() => {
    const checkScroll = () => {
      const element = scrollRef.current;
      if (!element) return;
      setIsScrollable(element.scrollWidth > element.clientWidth);
    };

    checkScroll();
    const element = scrollRef.current;
    element?.addEventListener('scroll', checkScroll);
    window.addEventListener('resize', checkScroll);

    return () => {
      element?.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [itemCount]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    if (element.scrollWidth <= element.clientWidth) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    element.scrollLeft += e.deltaY;
    e.preventDefault();
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrollable || e.button !== 0) return;
    isPointerDown.current = true;
    isDragging.current = false;
    didDragScroll.current = false;
    dragStartX.current = e.clientX;
    scrollStartLeft.current = scrollRef.current?.scrollLeft ?? 0;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDown.current || !scrollRef.current) return;

    const deltaX = e.clientX - dragStartX.current;
    if (!isDragging.current) {
      if (Math.abs(deltaX) < GALLERY_DRAG_THRESHOLD_PX) return;
      isDragging.current = true;
      didDragScroll.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }

    e.preventDefault();
    scrollRef.current.scrollLeft = scrollStartLeft.current - deltaX;
  };

  const endPointerDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    isPointerDown.current = false;
    isDragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!didDragScroll.current) return;
    e.preventDefault();
    e.stopPropagation();
    didDragScroll.current = false;
  };

  return (
    <div
      ref={scrollRef}
      className={cx(GALLERY_SCROLL_ROW_CLASS, isScrollable && 'cursor-grab active:cursor-grabbing')}
      onWheel={handleWheel}
      onDragStart={handleDragStart}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointerDrag}
      onPointerLeave={endPointerDrag}
      onPointerCancel={endPointerDrag}
      onClickCapture={handleClickCapture}
    >
      {children}
    </div>
  );
}

type Props = {
  state: RankingBlockState;
};

export function RankingGalleryView({ state }: Props) {
  const {
    spaceId,
    globalDisplayEntityIds,
    globalRankingEntryByEntityId,
    totalGlobalRankingEntityCount,
    entriesResolving,
    hasRankedByOthers,
    submissions,
    aggregatedSubmitterSpaceIds,
    aggregatedRankingCount,
    periodState,
    showEmbeddedGlobalPagination,
    embeddedGlobalPageNumber,
    hasEmbeddedGlobalPreviousPage,
    hasEmbeddedGlobalNextPage,
    setEmbeddedGlobalPage,
  } = state;

  const cards = globalDisplayEntityIds
    .map(entityId => {
      const entry = globalRankingEntryByEntityId.get(entityId);
      if (!entry) return null;

      return (
        <RankingGalleryCard
          key={entityId}
          entityId={entityId}
          spaceId={spaceId}
          name={entry.name}
          imageHint={entry.image}
        />
      );
    })
    .filter(Boolean);

  const showLoadingCards = cards.length === 0 && entriesResolving && globalDisplayEntityIds.length > 0;

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <RankingGalleryScrollRow itemCount={globalDisplayEntityIds.length}>
        {cards}
        {showLoadingCards
          ? globalDisplayEntityIds.map(entityId => <RankingGalleryCardSkeleton key={entityId} keyId={entityId} />)
          : null}
      </RankingGalleryScrollRow>
      {!entriesResolving && cards.length === 0 && totalGlobalRankingEntityCount === 0 ? (
        <p className="text-metadata text-grey-04">No published items yet</p>
      ) : null}

      <div className="mt-1 flex w-full items-end justify-between gap-3">
        <RankingPeriodMetadata
          className="mt-0"
          periodState={periodState}
          periodLabel={null}
          hasRankedByOthers={hasRankedByOthers}
          submissions={submissions}
          aggregatedSubmitterSpaceIds={aggregatedSubmitterSpaceIds}
          aggregatedRankingCount={aggregatedRankingCount}
        />

        {showEmbeddedGlobalPagination ? (
          <div className="ml-auto self-end [&>div:first-child]:hidden [&>div:last-child]:!mt-0 [&>div:last-child]:!mb-0 [&>div:last-child]:!justify-end">
            <RankingBlockGlobalPagination
              pageNumber={embeddedGlobalPageNumber}
              hasPreviousPage={hasEmbeddedGlobalPreviousPage}
              hasNextPage={hasEmbeddedGlobalNextPage}
              onSetPage={setEmbeddedGlobalPage}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
