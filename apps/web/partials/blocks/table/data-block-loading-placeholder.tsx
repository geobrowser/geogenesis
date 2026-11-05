import type { DataBlockView } from '~/core/blocks/data/data-block-view';
import type { BlockMediaFrame } from '~/core/hooks/use-block-media-dimensions';

import { Skeleton } from '~/design-system/skeleton';
import {
  BulletedListViewSkeleton,
  ExploreViewSkeleton,
  GalleryViewSkeleton,
  ListViewSkeleton,
} from '~/design-system/skeletons';

import { TableBlockLoadingPlaceholder } from './table-block-loading-placeholder';

type Props = {
  view: DataBlockView;
  /** The block's page size, so the placeholder reserves roughly the space the rows will need. */
  items?: number;
  /**
   * The block's known item total (a collection's length), so a collection of three in a page of ten
   * reserves three rows rather than ten. Omitted for query blocks, which reserve the full page size.
   */
  itemCount?: number;
  /** Resolved media sizing for gallery cards. Omit only when the view doesn't render media. */
  mediaFrame?: BlockMediaFrame;
};

/**
 * How many rows to actually reserve: the real item count where it's known, capped at the page size.
 * `undefined` is unknown and reserves the page; 0 is a known empty collection.
 */
function reservedItemCount(items?: number, itemCount?: number): number | undefined {
  if (itemCount === undefined) return items;
  return Math.min(itemCount, items ?? itemCount);
}

/**
 * The one loading state a data block shows.
 *
 * It has to be shaped like the view it's loading into. A gallery block that shows a table
 * placeholder first and cards second reads as two separate loads, and the page reflows between
 * them — so every view that has a skeleton gets its own, sized from the same config the real
 * rows use.
 */
export function DataBlockLoadingPlaceholder({ view, items, itemCount, mediaFrame }: Props) {
  const reserved = reservedItemCount(items, itemCount);

  if (reserved === 0) return <TableBlockLoadingPlaceholder rows={0} />;

  switch (view) {
    case 'GALLERY':
      return (
        <GalleryViewSkeleton
          items={reserved}
          frameStyle={mediaFrame?.style}
          hasCustomHeight={mediaFrame?.hasCustomHeight}
        />
      );
    case 'LIST':
      return <ListViewSkeleton items={reserved} />;
    case 'BULLETED_LIST':
      return <BulletedListViewSkeleton items={reserved} />;
    case 'EXPLORE':
      return <ExploreViewSkeleton items={reserved} />;
    default:
      return <TableBlockLoadingPlaceholder rows={reserved} />;
  }
}

export function DataBlockServerPlaceholder({ view, items, itemCount, mediaFrame }: Props) {
  return (
    <div>
      <div className="mb-2 flex h-8 items-center gap-2">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-5 w-16" />
      </div>
      <DataBlockLoadingPlaceholder view={view} items={items} itemCount={itemCount} mediaFrame={mediaFrame} />
    </div>
  );
}
