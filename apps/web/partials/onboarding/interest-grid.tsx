'use client';

import cx from 'classnames';
import { getImageProps } from 'next/image';
import { preload } from 'react-dom';

import type { BrowseSpaceRow } from '~/core/browse/fetch-browse-sidebar-data';
import { getImagePath, isOptimizableImageSrc, isRenderableImageSrc } from '~/core/utils/utils';

import { NativeGeoImage } from '~/design-system/geo-image';

const IMAGE_WIDTH = 56;
// Featured spaces use wide covers (roughly 4:1). A 56px-wide resized cover leaves only
// 14px of height to crop into a circle. Keep enough vertical detail for a sharp 2x crop.
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
    <div className="mx-auto grid w-full grid-cols-4 items-start gap-x-2 gap-y-4">
      {spaces.map(space => {
        const selected = selectedIds.includes(space.id);
        const placeholder = <span className="text-xl text-grey-04">{space.name.slice(0, 1)}</span>;
        return (
          <button
            key={space.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle(space.id)}
            className="group flex min-w-0 flex-col items-center gap-1.5 text-center focus-visible:outline-none"
          >
            <span
              aria-hidden="true"
              className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-grey-01 group-focus-visible:ring-2 group-focus-visible:ring-ctaPrimary group-focus-visible:ring-offset-2"
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
              <span
                className={cx(
                  'pointer-events-none absolute inset-0 rounded-full transition-colors',
                  selected ? 'bg-ctaPrimary/25 ring-4 ring-ctaPrimary ring-inset' : 'group-hover:bg-text/5'
                )}
              />
            </span>
            <span
              className={cx(
                'flex min-h-8 w-full items-center justify-center rounded-md px-0.5 text-[13px] leading-4 font-medium break-words transition-colors',
                selected ? 'bg-ctaPrimary text-white' : 'text-text'
              )}
            >
              {space.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
