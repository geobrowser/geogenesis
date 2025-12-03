'use client';

import Image, { ImageProps } from 'next/image';
import { useCallback, useState } from 'react';
import type { ImgHTMLAttributes } from 'react';

import { getImagePath, getImagePathFallback } from '~/core/utils/utils';

type GeoImageProps = Omit<ImageProps, 'src' | 'onError'> & {
  /** The raw image value (ipfs:// URI, http URL, or static path) */
  value: string;
};

/**
 * Image component that renders IPFS images with automatic fallback.
 * Tries Pinata gateway first, falls back to Lighthouse if that fails.
 * Wraps Next.js Image component to preserve optimization.
 */
export function GeoImage({ value, alt = '', ...props }: GeoImageProps) {
  const [useFallback, setUseFallback] = useState(false);

  const handleError = useCallback(() => {
    // Only try fallback once and only for IPFS URIs
    if (!useFallback && value.startsWith('ipfs://')) {
      setUseFallback(true);
    }
  }, [useFallback, value]);

  const src = useFallback ? getImagePathFallback(value) : getImagePath(value);

  return <Image {...props} src={src} alt={alt} onError={handleError} />;
}
type NativeGeoImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & {
  /** The raw image value (ipfs:// URI, http URL, or static path) */
  value: string;
};

/**
 * Native img element with automatic fallback.
 * Tries Pinata gateway first, falls back to Lighthouse if that fails.
 * Use this when you need a native img element instead of Next.js Image.
 */
export function NativeGeoImage({ value, alt = '', ...props }: NativeGeoImageProps) {
  const [useFallback, setUseFallback] = useState(false);

  const handleError = useCallback(() => {
    // Only try fallback once and only for IPFS URIs
    if (!useFallback && value.startsWith('ipfs://')) {
      setUseFallback(true);
    }
  }, [useFallback, value]);

  const src = useFallback ? getImagePathFallback(value) : getImagePath(value);

  return <img {...props} src={src} alt={alt} onError={handleError} />;
}
