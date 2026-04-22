'use client';

import * as React from 'react';

import Image from 'next/image';

import { getImagePath, getImagePathFallback } from '~/core/utils/utils';

type FallbackImageProps = {
  value: string;
  sizes: string;
  className?: string;
};

/**
 * Loads an image through Next.js optimizer (fast path, ~2-3 KB webp), with fallbacks
 * that stay on the primary gateway (Pinata) as long as possible.
 *
 * Stages, in order:
 *   1. Pinata + Next optimizer (fast, works for most raster images)
 *   2. Pinata unoptimized (bypasses Next's server fetch — handles SVGs without
 *      `dangerouslyAllowSVG`, and timeouts where browser can still reach Pinata fine)
 *   3. Lighthouse unoptimized (legacy CIDs not on Pinata)
 */
export function FallbackImage({ value, sizes, className }: FallbackImageProps) {
  const [stage, setStage] = React.useState<'primary' | 'primary-unoptimized' | 'lighthouse-unoptimized'>('primary');

  const src = stage === 'lighthouse-unoptimized' ? getImagePathFallback(value) : getImagePath(value);
  const unoptimized = stage !== 'primary';

  return (
    <Image
      src={src}
      alt=""
      fill
      sizes={sizes}
      className={className}
      unoptimized={unoptimized}
      onError={() => {
        setStage(prev => {
          if (prev === 'primary') return 'primary-unoptimized';
          if (prev === 'primary-unoptimized' && value.startsWith('ipfs://')) return 'lighthouse-unoptimized';
          return prev;
        });
      }}
    />
  );
}
