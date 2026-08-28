import type { DataBlockView } from '~/core/blocks/data/data-block-view';
import type { BlockMediaFrame } from '~/core/hooks/use-block-media-dimensions';

import { BulletedListViewSkeleton, GalleryViewSkeleton, ListViewSkeleton } from '~/design-system/skeletons';

import { TableBlockLoadingPlaceholder } from './table-block-loading-placeholder';

type Props = {
  view: DataBlockView;
  /** The block's page size, so the placeholder reserves roughly the space the rows will need. */
  items?: number;
  /** Resolved media sizing for gallery cards. Omit only when the view doesn't render media. */
  mediaFrame?: BlockMediaFrame;
};

/**
 * The one loading state a data block shows.
 *
 * It has to be shaped like the view it's loading into. A gallery block that shows a table
 * placeholder first and cards second reads as two separate loads, and the page reflows between
 * them — so every view that has a skeleton gets its own, sized from the same config the real
 * rows use.
 */
export function DataBlockLoadingPlaceholder({ view, items, mediaFrame }: Props) {
  switch (view) {
    case 'GALLERY':
      return (
        <GalleryViewSkeleton
          items={items}
          frameStyle={mediaFrame?.style}
          hasCustomHeight={mediaFrame?.hasCustomHeight}
        />
      );
    case 'LIST':
      return <ListViewSkeleton items={items} />;
    case 'BULLETED_LIST':
      return <BulletedListViewSkeleton items={items} />;
    default:
      return <TableBlockLoadingPlaceholder rows={items} />;
  }
}
