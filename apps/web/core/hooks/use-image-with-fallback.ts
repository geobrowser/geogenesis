'use client';

import { useCallback, useState } from 'react';

import { getImagePath, getImagePathFallback } from '~/core/utils/utils';

/**
 * Hook for image URLs with automatic fallback from Pinata to Lighthouse.
 * Use this for CSS backgroundImage, passing URLs to other components, etc.
 *
 * @param value - The raw image value (ipfs:// URI, http URL, or static path)
 * @returns Object with current src URL and onError handler to trigger fallback
 *
 * @example
 * ```tsx
 * const { src, onError } = useImageWithFallback(imageUrl);
 * return <div style={{ backgroundImage: `url(${src})` }} />;
 * ```
 *
 * @example
 * ```tsx
 * const { src, onError } = useImageWithFallback(imageUrl);
 * return <img src={src} onError={onError} />;
 * ```
 */
export function useImageWithFallback(value: string | undefined | null) {
  const [useFallback, setUseFallback] = useState(false);

  const onError = useCallback(() => {
    // Only try fallback once and only for IPFS URIs
    if (!useFallback && value?.startsWith('ipfs://')) {
      setUseFallback(true);
    }
  }, [useFallback, value]);

  if (!value) {
    return { src: undefined, onError };
  }

  const src = useFallback ? getImagePathFallback(value) : getImagePath(value);

  return { src, onError };
}
