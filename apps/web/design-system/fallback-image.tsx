'use client';

import * as React from 'react';

import Image from 'next/image';

import { getImagePathAtLevel, isOptimizableImageSrc, isRenderableImageSrc } from '~/core/utils/utils';

type FallbackImageProps = {
  value: string;
  sizes: string;
  className?: string;
  priority?: boolean;
};

/**
 * Ordered load attempts. We first try the primary gateway through the Next.js
 * optimizer (fast path, ~2-3 KB webp), then unoptimized on the same gateway
 * (handles SVGs without `dangerouslyAllowSVG`, and optimizer timeouts where the
 * browser can still reach the gateway), then walk the remaining gateways
 * unoptimized (Filebase → Pinata → Lighthouse) for content not on the primary.
 */
const STAGES: { level: number; unoptimized: boolean }[] = [
  { level: 0, unoptimized: false }, // Filebase + Next optimizer
  { level: 0, unoptimized: true }, // Filebase unoptimized
  { level: 1, unoptimized: true }, // Pinata unoptimized
  { level: 2, unoptimized: true }, // Lighthouse unoptimized
];

export function FallbackImage({ value, sizes, className, priority = false }: FallbackImageProps) {
  const [stage, setStage] = React.useState(0);

  const { level, unoptimized: stageUnoptimized } = STAGES[stage];
  const src = getImagePathAtLevel(value, level);
  // Stage 0 is the optimizer fast path, which is only ours to take for hosts we control. A
  // foreign host skips straight to being served as-is (GEO-2984); the remaining stages are
  // already unoptimized, so the gateway walk is unaffected.
  const unoptimized = stageUnoptimized || !isOptimizableImageSrc(src);

  // Callers wrap us in a neutral placeholder, so rendering nothing degrades to an
  // empty thumbnail.
  if (!isRenderableImageSrc(src)) return null;

  return (
    <Image
      src={src}
      alt=""
      fill
      sizes={sizes}
      className={className}
      unoptimized={unoptimized}
      priority={priority}
      onError={() => {
        setStage(prev => {
          const next = prev + 1;
          if (next >= STAGES.length) return prev;
          // Only ipfs:// values benefit from switching gateways; http values
          // just need the unoptimized retry, so stop before the gateway hops.
          if (!value.startsWith('ipfs://') && STAGES[next].level > 0) return prev;
          return next;
        });
      }}
    />
  );
}
