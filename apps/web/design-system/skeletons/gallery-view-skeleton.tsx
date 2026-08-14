import type * as React from 'react';

import cx from 'classnames';

type GalleryViewSkeletonProps = {
  /** How many cards to reserve. Pass the block's page size so the block doesn't resize when rows land. */
  items?: number;
  /**
   * Media frame sizing, straight off the block's configured dimensions. Must match what
   * `TableBlockGalleryItem` renders — a skeleton at a different ratio just moves the layout
   * jump from "content arrives" to "skeleton swaps for content".
   */
  frameStyle?: React.CSSProperties;
  /** Set when `frameStyle` fixes the height; otherwise the frame keeps the default 2:1 ratio. */
  hasCustomHeight?: boolean;
};

export const GalleryViewSkeleton = ({ items = 6, frameStyle, hasCustomHeight = false }: GalleryViewSkeletonProps) => {
  const cards = Array.from({ length: Math.max(items, 1) });

  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-2">
      {cards.map((_, i) => (
        <div key={i} className="flex animate-pulse flex-col gap-3 rounded-[17px] p-1 pb-2">
          <div
            className={cx('w-full overflow-clip rounded-lg bg-grey-02', !hasCustomHeight && 'aspect-2/1')}
            style={frameStyle}
          />
          <div className="flex w-full flex-col gap-2 px-1">
            <div className="h-5 w-3/4 rounded-sm bg-grey-02" />
            <div className="h-3 w-full rounded-sm bg-grey-02" />
            <div className="h-3 w-4/5 rounded-sm bg-grey-02" />
          </div>
        </div>
      ))}
    </div>
  );
};
