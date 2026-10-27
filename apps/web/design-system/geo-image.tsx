'use client';

import { type CSSProperties, type ReactNode, useCallback, useState } from 'react';
import type { ImgHTMLAttributes } from 'react';

import cn from 'classnames';
import Image, { ImageProps, getImageProps } from 'next/image';

import {
  IPFS_GATEWAY_COUNT,
  getImagePathAtLevel,
  isOptimizableImageSrc,
  isRenderableImageSrc,
} from '~/core/utils/utils';

/**
 * Default responsive sizes for Next.js Image components with fill prop.
 * Matches Tailwind breakpoints: mobile (639px), lg (1023px)
 */
export const DEFAULT_IMAGE_SIZES = '(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 25vw';

/** Skip the low-quality placeholder below this rendered width. */
const LQIP_MIN_PX = 48;

const LQIP_SIZES = '32px';

const DEFAULT_FADE_MS = 150;

/** Local object URLs from file pickers — fine for `<img>`, not for next/image. */
function isBlobSrc(src: string): boolean {
  return src.startsWith('blob:');
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

      const isIpfs = value.startsWith('ipfs://');
      const stage0Unoptimized = forceUnoptimized || !isOptimizableImageSrc(getImagePathAtLevel(value, 0));

      while (
        next < STAGES.length &&
        // Non-IPFS values have no alternate gateways — every level resolves to the same URL.
        ((STAGES[next].level > 0 && !isIpfs) ||
          (STAGES[next].level === 0 && STAGES[next].unoptimized && stage0Unoptimized))
      ) {
        next++;
      }
      if (next >= STAGES.length) return { value, stage: current.stage, failed: true };
      return { value, stage: next, failed: false };
    });
  }, [value, forceUnoptimized]);

  const { level, unoptimized } = STAGES[stage];
  const src = getImagePathAtLevel(value, level);
  return {
    src,
    // A host we do not control is served as-is rather than fetched, decoded and re-served under
    // our deployment (GEO-2984). This can only turn optimization further off, never back on.
    unoptimized: forceUnoptimized || unoptimized || !isOptimizableImageSrc(src),
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
 * low-quality placeholder first, and cross-fades the full image in over it on load without shifting
 * layout. Without a placeholder the image renders visible. If the full image can never load, the
 * placeholder (or `fallback`) stays put.
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

  const [failedPlaceholderSrc, setFailedPlaceholderSrc] = useState<string | null>(null);

  if (!isRenderableImageSrc(src)) return <>{fallback ?? null}</>;

  const isFill = Boolean(props.fill);
  const sizes = props.sizes ?? (isFill ? DEFAULT_IMAGE_SIZES : undefined);
  const fixedWidth = fixedWidthFromSizes(sizes);
  const objectFit = (style as CSSProperties | undefined)?.objectFit ?? 'cover';

  const placeholderSrc = getImagePathAtLevel(value, 0);
  const placeholderBroken = failedPlaceholderSrc === placeholderSrc;
  const wantsLqip =
    lqip &&
    isFill &&
    !unoptimized &&
    isHttpSrc(placeholderSrc) &&
    // The placeholder is an optimized 32px request; a host we do not control is never optimized
    // (GEO-2984), so there is no cheap low-quality version to show and the LQIP is skipped.
    isOptimizableImageSrc(placeholderSrc) &&
    !isSvgSrc(value) &&
    !isSvgSrc(placeholderSrc) &&
    (fixedWidth === null || fixedWidth >= LQIP_MIN_PX);

  const placeholder =
    wantsLqip && !placeholderBroken ? (
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
        onError={() => setFailedPlaceholderSrc(placeholderSrc)}
      />
    ) : null;

  if (failed) return placeholder ? <>{placeholder}</> : <>{fallback ?? null}</>;

  const fadesIn = placeholder !== null && !props.priority;

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
        style={fadesIn ? { ...style, opacity: loaded ? 1 : 0, transition: `opacity ${fadeMs}ms ease-in-out` } : style}
        unoptimized={effectiveUnoptimized}
        onError={advance}
        onLoad={event => {
          setLoadedSrc(src);
          props.onLoad?.(event);
        }}
      />
    </>
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

/**
 * Native img escape hatch for the cases the optimizer-backed {@link GeoImage} can't serve:
 * SVGs, and direct callers without a positioned box for a fill image.
 */
export function NativeGeoImage({ value, alt = '', fallback, displayWidth, ...props }: NativeGeoImageProps) {
  const [attempt, setAttempt] = useState({ value, stage: 0, failed: false });

  // Keyed on `value` rather than reset in an effect: these render in recycled lists — a LiveKit
  // participant strip reorders constantly — and carrying a previous participant's exhausted-gateway
  // state across would show their fallback for someone whose avatar is fine.
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
  // `blob:` is allowed here only — next/image rejects it, but file-picker previews need it.
  if (failed || (!isRenderableImageSrc(src) && !isBlobSrc(src))) return <>{fallback ?? null}</>;

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
