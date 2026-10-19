'use client';

import cx from 'classnames';
import { getImageProps } from 'next/image';
import { preload } from 'react-dom';

import type { BrowseSpaceRow } from '~/core/browse/fetch-browse-sidebar-data';
import { getImagePath, isOptimizableImageSrc, isRenderableImageSrc } from '~/core/utils/utils';

import { NativeGeoImage } from '~/design-system/geo-image';

const IMAGE_WIDTH = 72;
// Featured spaces use wide covers (roughly 4:1). A 72px-wide resized cover leaves only
// 18px of height to crop into a circle. Keep enough vertical detail for a sharp 2x crop.
const COVER_REQUEST_WIDTH = 256;

/** Warm the exact 1x/2x thumbnails the grid uses, rather than downloading the original covers. */
export function preloadInterestImages(spaces: BrowseSpaceRow[]) {
  for (const space of spaces) {
    if (!space.image) continue;
    const src = getImagePath(space.image);
    if (!isRenderableImageSrc(src) || !isOptimizableImageSrc(src)) continue;
    const { props } = getImageProps({ src, alt: '', width: COVER_REQUEST_WIDTH, height: COVER_REQUEST_WIDTH });
    preload(props.src, { as: 'image', imageSrcSet: props.srcSet, fetchPriority: 'low' });
  }
}

export function InterestGrid({
  spaces,
  selectedIds,
  onToggle,
}: {
  spaces: BrowseSpaceRow[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="mx-auto grid w-full max-w-[400px] grid-cols-4 items-start gap-x-3 gap-y-5 md:gap-x-2 md:gap-y-4">
      {spaces.map(space => {
        const selected = selectedIds.includes(space.id);
        const placeholder = <span className="text-xl text-grey-04">{space.name.slice(0, 1)}</span>;
        return (
          <button
            key={space.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle(space.id)}
            className="group flex min-w-0 flex-col items-center gap-2 text-center focus-visible:outline-none md:gap-1.5"
          >
            <span
              aria-hidden="true"
              className={cx(
                'flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full border p-1.5 transition-colors group-focus-visible:ring-2 group-focus-visible:ring-ctaPrimary group-focus-visible:ring-offset-2 md:h-14 md:w-14 md:p-1',
                selected ? 'border-ctaPrimary bg-ctaTertiary' : 'border-grey-02 bg-grey-01 group-hover:border-grey-04'
              )}
            >
              <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full">
                <NativeGeoImage
                  value={space.image ?? ''}
                  alt=""
                  displayWidth={COVER_REQUEST_WIDTH}
                  width={IMAGE_WIDTH}
                  height={IMAGE_WIDTH}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="h-full w-full object-cover"
                  fallback={placeholder}
                />
              </span>
            </span>
            <span className="min-h-8 w-full text-[13px] leading-4 font-medium break-words">{space.name}</span>
          </button>
        );
      })}
    </div>
  );
}
