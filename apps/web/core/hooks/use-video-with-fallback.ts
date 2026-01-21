'use client';

import { useCallback, useState } from 'react';

import { getVideoPath, getVideoPathFallback } from '~/core/utils/utils';

/**
 * Hook for video URLs with automatic fallback from Pinata to Lighthouse.
 * Use this for video elements where the primary CDN might fail.
 *
 * @param value - The raw video value (ipfs:// URI, http URL, or static path)
 * @returns Object with current src URL and onError handler to trigger fallback
 *
 * @example
 * ```tsx
 * const { src, onError } = useVideoWithFallback(videoUrl);
 * return <video src={src} onError={onError} controls />;
 * ```
 */
export function useVideoWithFallback(value: string | undefined | null) {
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

  const src = useFallback ? getVideoPathFallback(value) : getVideoPath(value);

  return { src, onError };
}
