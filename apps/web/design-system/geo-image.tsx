'use client';

import { useCallback, useState } from 'react';
import type { ImgHTMLAttributes } from 'react';

import cn from 'classnames';
import Image, { ImageProps } from 'next/image';

import { IPFS_GATEWAY_COUNT, getImagePathAtLevel } from '~/core/utils/utils';

/**
 * Default responsive sizes for Next.js Image components with fill prop.
 * Matches Tailwind breakpoints: sm (639px), lg (1023px)
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

/** Image component that resolves IPFS values through the gateway fallback chain (Filebase → Pinata → Lighthouse). */
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
  return <Image {...imageProps} src={src} alt={alt} onError={handleError} unoptimized={unoptimized} />;
}

type NativeGeoImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & {
  value: string;
};

/** Native img element resolving IPFS values through the gateway fallback chain (Filebase → Pinata → Lighthouse). */
export function NativeGeoImage({ value, alt = '', ...props }: NativeGeoImageProps) {
  const [level, setLevel] = useState(0);

  const handleError = useCallback(() => {
    if (value.startsWith('ipfs://')) {
      setLevel(prev => Math.min(prev + 1, IPFS_GATEWAY_COUNT - 1));
    }
  }, [value]);

  const src = getImagePathAtLevel(value, level);
  if (!isRenderableSrc(src)) return null;

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
