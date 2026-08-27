'use client';

import * as React from 'react';

import { queryClient } from '~/core/query-client';
import { store as geoStore } from '~/core/sync/use-sync-engine';

import { executeGetEntity } from './read-dispatcher';
import type { GetEntitySuccess } from './read-types';

export type PreloadedEntity = {
  entityId: string;
  spaceId: string | null;
  data: GetEntitySuccess;
};

// Pre-fetch the user's current entity when the chat panel opens so the model
// can answer "this entity"-style questions on turn 1 without burning a
// `getEntity` round-trip. The same call warms the underlying queryClient cache,
// so any later getEntity tool call hits a populated network cache too.
export function usePreloadedEntity(
  isOpen: boolean,
  currentEntityId: string | null,
  currentSpaceId: string | null
): PreloadedEntity | null {
  const [preload, setPreload] = React.useState<PreloadedEntity | null>(null);

  React.useEffect(() => {
    if (!isOpen || !currentEntityId) {
      setPreload(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const result = await executeGetEntity(
          { entityId: currentEntityId, spaceId: currentSpaceId ?? undefined },
          { store: geoStore, cache: queryClient }
        );
        if (cancelled) return;
        if ('error' in result) {
          setPreload(null);
          return;
        }
        setPreload({ entityId: currentEntityId, spaceId: currentSpaceId, data: result });
      } catch (err) {
        console.error('[chat/preload] failed', err);
        if (!cancelled) setPreload(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, currentEntityId, currentSpaceId]);

  return preload;
}
