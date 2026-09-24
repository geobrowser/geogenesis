'use client';

import cx from 'classnames';

import { ThumbGeoImage } from '~/design-system/geo-image';

export function SpaceThumb({ image, name, className }: { image: string | null; name: string; className?: string }) {
  if (!image) {
    const initial = name.trim().slice(0, 1).toUpperCase() || '?';
    return (
      <span
        className={cx(
          'flex h-3 w-3 shrink-0 items-center justify-center rounded-[4px] bg-grey-01 text-[8px] font-medium text-grey-04',
          className
        )}
      >
        {initial}
      </span>
    );
  }
  return (
    <span className={cx('relative h-3 w-3 shrink-0 overflow-hidden rounded-[4px] bg-grey-01', className)}>
      <ThumbGeoImage value={image} />
    </span>
  );
}
