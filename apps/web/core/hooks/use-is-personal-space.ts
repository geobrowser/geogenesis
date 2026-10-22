'use client';

import { useSpaceType } from './use-space-type';

/**
 * Whether a space is someone's personal space. `undefined` until known. Reads the batched,
 * session-long space type lookup, so a feed's cards share one request.
 */
export function useIsPersonalSpace(spaceId: string, { enabled = true }: { enabled?: boolean } = {}) {
  const { data } = useSpaceType(spaceId, { enabled });
  return data === undefined ? undefined : data === 'PERSONAL';
}
