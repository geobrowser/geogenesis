'use client';

import { useCallback, useState } from 'react';

import { getImagePath, getImagePathFallback } from '~/core/utils/utils';

/**
 * Resolves a raw image value to a Pinata gateway URL.
 * Falls back to Lighthouse for legacy CIDs not yet migrated to Pinata.
 */
export function useImageWithFallback(value: string | undefined | null) {
  const [useFallback, setUseFallback] = useState(false);

  const onError = useCallback(() => {
    if (!useFallback && value?.startsWith('ipfs://')) {
      setUseFallback(true);
    }
  }, [useFallback, value]);

  if (!value) return { src: undefined, onError };

  const src = useFallback ? getImagePathFallback(value) : getImagePath(value);
  return { src, onError };
}
