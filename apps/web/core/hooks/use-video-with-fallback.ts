'use client';

import { useCallback, useState } from 'react';

import { IPFS_GATEWAY_COUNT, getVideoPathAtLevel } from '~/core/utils/utils';

/**
 * Resolves a raw video value to an IPFS gateway URL, walking the fallback chain
 * (Filebase → Pinata → Lighthouse) one gateway per load error.
 */
export function useVideoWithFallback(value: string | undefined | null) {
  const [level, setLevel] = useState(0);

  const onError = useCallback(() => {
    if (value?.startsWith('ipfs://')) {
      setLevel(prev => Math.min(prev + 1, IPFS_GATEWAY_COUNT - 1));
    }
  }, [value]);

  if (!value) return { src: undefined, onError };

  const src = getVideoPathAtLevel(value, level);
  return { src, onError };
}
