'use client';

import { useCallback, useState } from 'react';
import type { ImgHTMLAttributes } from 'react';

import Image, { ImageProps } from 'next/image';

import { getImagePath, getImagePathFallback } from '~/core/utils/utils';

/**
 * Default responsive sizes for Next.js Image components with fill prop.
 * Matches Tailwind breakpoints: sm (639px), lg (1023px)
 */
export const DEFAULT_IMAGE_SIZES = '(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 25vw';

type GeoImageProps = Omit<ImageProps, 'src' | 'onError'> & {
  value: string;
};

/** Image component that resolves IPFS values via Pinata, with Lighthouse fallback for legacy CIDs. */
export function GeoImage({ value, alt = '', unoptimized = false, ...props }: GeoImageProps) {
  const [useFallback, setUseFallback] = useState(false);

  const handleError = useCallback(() => {
    if (!useFallback && value.startsWith('ipfs://')) {
      setUseFallback(true);
    }
  }, [useFallback, value]);

  const src = useFallback ? getImagePathFallback(value) : getImagePath(value);
  const imageProps = props.fill && !props.sizes ? { ...props, sizes: DEFAULT_IMAGE_SIZES } : props;
  return <Image {...imageProps} src={src} alt={alt} onError={handleError} unoptimized={unoptimized} />;
}

type NativeGeoImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & {
  value: string;
};

/** Native img element with Pinata primary, Lighthouse fallback for legacy CIDs. */
export function NativeGeoImage({ value, alt = '', ...props }: NativeGeoImageProps) {
  const [useFallback, setUseFallback] = useState(false);

  const handleError = useCallback(() => {
    if (!useFallback && value.startsWith('ipfs://')) {
      setUseFallback(true);
    }
  }, [useFallback, value]);

  const src = useFallback ? getImagePathFallback(value) : getImagePath(value);
  return <img {...props} src={src} alt={alt} onError={handleError} />;
}
