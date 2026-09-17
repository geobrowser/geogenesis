'use client';

import { type CSSProperties, type ReactNode, useCallback, useState } from 'react';
import type { ImgHTMLAttributes } from 'react';

import cn from 'classnames';
import Image, { ImageProps } from 'next/image';

import { IPFS_GATEWAY_COUNT, getImagePathAtLevel } from '~/core/utils/utils';

/**
 * Default responsive sizes for Next.js Image components with fill prop.
 * Matches Tailwind breakpoints: sm (639px), lg (1023px)
 */
export const DEFAULT_IMAGE_SIZES = '(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 25vw';

/** Skip the low-quality placeholder below this rendered width. */
const LQIP_MIN_PX = 48;

const LQIP_SIZES = '32px';

const DEFAULT_FADE_MS = 150;

// next/image throws synchronously if `src` isn't a valid URL or local path, so
// skip values that don't resolve to something renderable — e.g. a bare CID or an
// unresolved entity id that slipped through in place of an ipfs:// URL.
function isRenderableSrc(src: string): boolean {
  return src.startsWith('https://') || src.startsWith('http://') || src.startsWith('/') || src.startsWith('data:');
}

function isHttpSrc(src: string): boolean {
  return src.startsWith('https://') || src.startsWith('http://');
}

function isSvgSrc(src: string): boolean {
  return /\.svg(\?|#|$)/i.test(src);
}

function fixedWidthFromSizes(sizes: string | undefined): number | null {
  if (!sizes) return null;
  const match = sizes.trim().match(/^(\d+)px$/);
  return match ? Number(match[1]) : null;
}

// Filebase optimized → Filebase raw → Pinata → Lighthouse.
const STAGES: { level: number; unoptimized: boolean }[] = [
  { level: 0, unoptimized: false },
  { level: 0, unoptimized: true },
  { level: 1, unoptimized: true },
  { level: 2, unoptimized: true },
];

/**
 * Walks the gateway/optimizer fallback chain, advancing on each load error until a
 * stage renders or the chain is exhausted.
 */
function useStagedImage(value: string, forceUnoptimized: boolean) {
  const [attempt, setAttempt] = useState({ value, stage: 0, failed: false });

  const stage = attempt.value === value ? attempt.stage : 0;
  const failed = attempt.value === value ? attempt.failed : false;

  const advance = useCallback(() => {
    setAttempt(previous => {
      const current = previous.value === value ? previous : { value, stage: 0, failed: false };
      let next = current.stage + 1;

      if (!value.startsWith('ipfs://')) {
        while (next < STAGES.length && STAGES[next].level > 0) next++;
      }
      if (next >= STAGES.length) return { value, stage: current.stage, failed: true };
      return { value, stage: next, failed: false };
    });
  }, [value]);

  const { level, unoptimized } = STAGES[stage];
  return {
    src: getImagePathAtLevel(value, level),
    unoptimized: forceUnoptimized || unoptimized,
    failed,
    advance,
  };
}

type GeoImageProps = Omit<ImageProps, 'src' | 'onError'> & {
  value: string;
  lqip?: boolean;
  fadeMs?: number;
  fallback?: ReactNode;
};

/**
 * The single progressive image component. Resolves IPFS values through the gateway fallback
 * chain (Filebase → Pinata → Lighthouse, optimized then unoptimized), shows a blurred
 * low-quality placeholder first, and cross-fades the full image in on load without shifting
 * layout. If the full image can never load, the placeholder (or `fallback`) stays put.
 */
export function GeoImage({
  value,
  alt = '',
  unoptimized = false,
  lqip = true,
  fadeMs = DEFAULT_FADE_MS,
  className,
  style,
  fallback,
  ...props
}: GeoImageProps) {
  const { src, unoptimized: effectiveUnoptimized, failed, advance } = useStagedImage(value, unoptimized);

  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const loaded = loadedSrc === src;

  if (!isRenderableSrc(src)) return <>{fallback ?? null}</>;

  const isFill = Boolean(props.fill);
  const sizes = props.sizes ?? (isFill ? DEFAULT_IMAGE_SIZES : undefined);
  const fixedWidth = fixedWidthFromSizes(sizes);
  const objectFit = (style as CSSProperties | undefined)?.objectFit ?? 'cover';

  const placeholderSrc = getImagePathAtLevel(value, 0);
  const wantsLqip =
    lqip &&
    isFill &&
    !unoptimized &&
    isHttpSrc(placeholderSrc) &&
    !isSvgSrc(value) &&
    !isSvgSrc(placeholderSrc) &&
    (fixedWidth === null || fixedWidth > LQIP_MIN_PX);

  const placeholder = wantsLqip ? (
    <Image
      aria-hidden
      src={placeholderSrc}
      alt=""
      fill
      sizes={LQIP_SIZES}
      className="scale-105 blur-lg"
      style={{ objectFit }}
      priority={props.priority}
      draggable={false}
    />
  ) : null;

  if (failed) return placeholder ? <>{placeholder}</> : <>{fallback ?? null}</>;

  return (
    <>
      {placeholder}
      <Image
        {...props}
        ref={node => {
          if (node?.complete && node.naturalWidth > 0) setLoadedSrc(src);
        }}
        src={src}
        alt={alt}
        sizes={sizes}
        className={className}
        style={{ ...style, opacity: loaded ? 1 : 0, transition: `opacity ${fadeMs}ms ease-in-out` }}
        unoptimized={effectiveUnoptimized}
        onError={advance}
        onLoad={() => setLoadedSrc(src)}
      />
    </>
  );
}

type NativeGeoImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & {
  value: string;
  /**
   * Rendered instead of the image once it cannot be shown — an unrenderable value, or every
   * gateway exhausted. Without one the caller gets the browser's broken-image icon, which is what
   * a participant with an unresolvable avatar looked like in a call (GEO-2642).
   */
  fallback?: ReactNode;
};

/**
 * Native img escape hatch for the cases the optimizer-backed {@link GeoImage} can't serve:
 * SVGs, and direct callers without a positioned box for a fill image.
 */
export function NativeGeoImage({ value, alt = '', fallback, ...props }: NativeGeoImageProps) {
  const [attempt, setAttempt] = useState({ value, level: 0, failed: false });

  // Keyed on `value` rather than reset in an effect: these render in recycled lists — a LiveKit
  // participant strip reorders constantly — and carrying a previous participant's exhausted-gateway
  // state across would show their fallback for someone whose avatar is fine.
  const level = attempt.value === value ? attempt.level : 0;
  const failed = attempt.value === value ? attempt.failed : false;

  const handleError = useCallback(() => {
    setAttempt(previous => {
      const current = previous.value === value ? previous : { value, level: 0, failed: false };
      // Only IPFS values have anywhere else to look. Anything else has failed on its first and
      // only attempt, and retrying the same URL would loop.
      if (value.startsWith('ipfs://') && current.level < IPFS_GATEWAY_COUNT - 1) {
        return { value, level: current.level + 1, failed: false };
      }
      return { value, level: current.level, failed: true };
    });
  }, [value]);

  const src = getImagePathAtLevel(value, level);
  // A bare CID or an entity id that slipped through resolves to something no browser can fetch.
  if (failed || !isRenderableSrc(src)) return <>{fallback ?? null}</>;

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
};

/**
 * Tiny space-style image. Fills a small `relative` parent through {@link GeoImage}; being below
 * the placeholder threshold it loads a single optimized request directly — fast and sharp.
 */
export function ThumbGeoImage({ value, alt = '', loading, fetchPriority, className, style }: ThumbGeoImageProps) {
  // next/image rejects `priority` and `loading` together — `priority` already implies eager.
  const priority = fetchPriority === 'high';
  return (
    <GeoImage
      value={value}
      alt={alt}
      fill
      sizes="64px"
      lqip={false}
      loading={priority ? undefined : loading}
      priority={priority}
      className={cn('object-cover', className)}
      style={{ objectFit: 'cover', ...style }}
      draggable={false}
    />
  );
}
