'use client';

import { useCallback, useState } from 'react';

import { getVideoPath, getVideoPathFallback } from '~/core/utils/utils';

/**
 * Resolves a raw video value to a Pinata gateway URL.
 * Falls back to Lighthouse for legacy CIDs not yet migrated to Pinata.
 */
export function useVideoWithFallback(value: string | undefined | null) {
  const [useFallback, setUseFallback] = useState(false);

  const onError = useCallback(() => {
    if (!useFallback && value?.startsWith('ipfs://')) {
      setUseFallback(true);
    }
  }, [useFallback, value]);

  if (!value) return { src: undefined, onError };

  const src = useFallback ? getVideoPathFallback(value) : getVideoPath(value);
  return { src, onError };
}
