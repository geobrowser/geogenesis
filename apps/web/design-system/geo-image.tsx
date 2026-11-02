'use client';

import { type ReactNode, useCallback, useState } from 'react';
import type { ImgHTMLAttributes } from 'react';

import cn from 'classnames';
import Image, { ImageProps, getImageProps } from 'next/image';

import { IPFS_GATEWAY_COUNT, getImagePathAtLevel, isOptimizableImageSrc } from '~/core/utils/utils';

/**
 * Default responsive sizes for Next.js Image components with fill prop.
 * Matches Tailwind breakpoints: mobile (639px), lg (1023px)
 */
export const DEFAULT_IMAGE_SIZES = '(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 25vw';

type GeoImageProps = Omit<ImageProps, 'src' | 'onError'> & {
  value: string;
};

// next/image throws synchronously if `src` isn't a valid URL or local path, so
// skip values that don't resolve to something renderable — e.g. a bare CID or an
// unresolved entity id that slipped through in place of an ipfs:// URL.
function isRenderableSrc(src: string): boolean {
  return src.startsWith('https://') || src.startsWith('http://') || src.startsWith('/') || src.startsWith('data:');
}

/**
 * Image component that resolves IPFS values through the gateway fallback chain (Filebase →
 * Pinata → Lighthouse).
 *
 * Images from hosts we do not control are rendered unoptimized, so the browser fetches them from
 * their own origin rather than our deployment fetching, decoding, resizing and re-serving
 * arbitrary remote content under our certificate (GEO-2984). Passing `unoptimized` explicitly
 * still works; it can only turn optimization further off, never back on for a foreign host.
 */
export function GeoImage({ value, alt = '', unoptimized = false, ...props }: GeoImageProps) {
  const [level, setLevel] = useState(0);

  const handleError = useCallback(() => {
    if (value.startsWith('ipfs://')) {
      setLevel(prev => Math.min(prev + 1, IPFS_GATEWAY_COUNT - 1));
    }
  }, [value]);

  const src = getImagePathAtLevel(value, level);
  if (!isRenderableSrc(src)) return null;

  const imageProps = props.fill && !props.sizes ? { ...props, sizes: DEFAULT_IMAGE_SIZES } : props;
  return (
    <Image
      {...imageProps}
      src={src}
      alt={alt}
      onError={handleError}
      unoptimized={unoptimized || !isOptimizableImageSrc(src)}
    />
  );
}

type NativeGeoImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'onError'> & {
  value: string;
  /**
   * Rendered instead of the image once it cannot be shown — an unrenderable value, or every
   * gateway exhausted. Without one the caller gets the browser's broken-image icon, which is what
   * a participant with an unresolvable avatar looked like in a call (GEO-2642).
   */
  fallback?: ReactNode;
  /**
   * Rendered size in CSS pixels, when it is small and known (an avatar). If the resolved src is a
   * host we control, the first attempt asks the Next image optimizer for a resized copy (1x and 2x
   * via `srcSet`) instead of the full-size original, which for an avatar is routinely a multi-MB
   * PNG shown in a 20px circle. If the optimizer fails, the raw URL is tried next, so behaviour
   * degrades to what it was before. Hosts we do not control are never optimized (GEO-2984).
   */
  displayWidth?: number;
};

type Stage = { level: number; optimized: boolean };

function stagesFor(value: string, optimize: boolean): Stage[] {
  const levels = value.startsWith('ipfs://') ? IPFS_GATEWAY_COUNT : 1;
  const stages: Stage[] = [];
  for (let level = 0; level < levels; level += 1) {
    // The optimizer is only worth a try at the primary gateway, and only for hosts it will accept.
    if (level === 0 && optimize && isOptimizableImageSrc(getImagePathAtLevel(value, 0))) {
      stages.push({ level, optimized: true });
    }
    stages.push({ level, optimized: false });
  }
  return stages;
}

/** Native img element resolving IPFS values through the gateway fallback chain (Filebase → Pinata → Lighthouse). */
export function NativeGeoImage({ value, alt = '', fallback, displayWidth, ...props }: NativeGeoImageProps) {
  const [attempt, setAttempt] = useState({ value, stage: 0, failed: false });

  // Reset when the value changes rather than in an effect: these render in recycled lists — a
  // LiveKit participant strip reorders constantly — and carrying a previous participant's
  // exhausted-gateway state across would show their fallback for someone whose avatar is fine.
  const stageIndex = attempt.value === value ? attempt.stage : 0;
  const failed = attempt.value === value ? attempt.failed : false;

  const stages = stagesFor(value, displayWidth !== undefined);

  const handleError = useCallback(() => {
    setAttempt(previous => {
      const current = previous.value === value ? previous : { value, stage: 0, failed: false };
      // Only IPFS values have another gateway to look at, and only the optimizer has a second
      // attempt at the same one. Anything else has failed on its first and only attempt, and
      // retrying the same URL would loop.
      if (current.stage < stagesFor(value, displayWidth !== undefined).length - 1) {
        return { value, stage: current.stage + 1, failed: false };
      }
      return { value, stage: current.stage, failed: true };
    });
  }, [value, displayWidth]);

  const { level, optimized } = stages[Math.min(stageIndex, stages.length - 1)];
  const src = getImagePathAtLevel(value, level);
  // A bare CID or an entity id that slipped through resolves to something no browser can fetch.
  if (failed || !isRenderableSrc(src)) return <>{fallback ?? null}</>;

  if (optimized && displayWidth !== undefined) {
    // `getImageProps` snaps the widths to the configured `imageSizes`/`deviceSizes`; a width
    // outside that list is a 400 from the optimizer.
    const { props: resolved } = getImageProps({ src, alt, width: displayWidth, height: displayWidth });
    return <img {...props} src={resolved.src} srcSet={resolved.srcSet} alt={alt} onError={handleError} />;
  }

  return <img {...props} src={src} alt={alt} onError={handleError} />;
}

type ThumbGeoImageProps = {
  value: string;
  alt?: string;
  /** Parent must be `relative` with explicit width/height, e.g. `relative h-5 w-5 overflow-hidden rounded-md` */
  loading?: ImgHTMLAttributes<HTMLImageElement>['loading'];
  fetchPriority?: ImgHTMLAttributes<HTMLImageElement>['fetchPriority'];
  className?: string;
  style?: ImgHTMLAttributes<HTMLImageElement>['style'];
  onLoad?: ImgHTMLAttributes<HTMLImageElement>['onLoad'];
};

/**
 * Tiny space-style image: native &lt;img&gt; so remote IPFS URLs skip the Next optimizer
 * (avoids soft/downscaled output and occasional failed optimized requests for small slots).
 */
export function ThumbGeoImage({
  value,
  alt = '',
  loading = 'lazy',
  fetchPriority,
  className,
  style,
  onLoad,
}: ThumbGeoImageProps) {
  return (
    <NativeGeoImage
      value={value}
      alt={alt}
      className={cn('absolute inset-0', className)}
      style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', ...style }}
      loading={loading}
      fetchPriority={fetchPriority}
      decoding="async"
      draggable={false}
      onLoad={onLoad}
    />
  );
}
