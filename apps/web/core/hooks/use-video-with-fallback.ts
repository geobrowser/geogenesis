'use client';

import { getVideoPath } from '~/core/utils/utils';

/**
 * Resolves a raw video value (ipfs:// URI, http URL, or static path) to a Pinata gateway URL.
 * Returns `onError` for API compatibility with callers that pass it to video elements.
 */
export function useVideoWithFallback(value: string | undefined | null) {
  if (!value) return { src: undefined, onError: undefined };
  return { src: getVideoPath(value), onError: undefined };
}
