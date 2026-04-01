'use client';

import { getImagePath } from '~/core/utils/utils';

/**
 * Resolves a raw image value (ipfs:// URI, http URL, or static path) to a Pinata gateway URL.
 * Returns `onError` for API compatibility with callers that pass it to img/Image elements.
 */
export function useImageWithFallback(value: string | undefined | null) {
  if (!value) return { src: undefined, onError: undefined };
  return { src: getImagePath(value), onError: undefined };
}
