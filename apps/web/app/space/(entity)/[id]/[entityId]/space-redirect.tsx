'use client';

import { useRouter } from 'next/navigation';

import { useEffect } from 'react';

import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { NavUtils } from '~/core/utils/utils';

type SpaceRedirectProps = {
  entityId: string;
  spaceId: string;
  serverSpaces: string[];
  deterministicSpaceId: string | null;
  preventRedirect?: boolean;
  children: React.ReactNode;
};

/**
 * Client-side redirect for entities that don't exist in the requested
 * space on the server. Checks local state first — if the entity exists
 * locally in this space (e.g. unpublished edits), no redirect happens.
 * Otherwise redirects to the deterministic (top-ranked) space.
 */
export function SpaceRedirect({
  entityId,
  spaceId,
  serverSpaces,
  deterministicSpaceId,
  preventRedirect,
  children,
}: SpaceRedirectProps) {
  const { store } = useSyncEngine();
  const router = useRouter();

  useEffect(() => {
    if (preventRedirect) return;

    // Entity exists in this space on the server — no redirect needed
    if (serverSpaces.includes(spaceId)) return;

    // Check if entity exists locally in this space
    const localEntity = store.getEntity(entityId);
    if (localEntity && localEntity.spaces.includes(spaceId)) return;

    // Entity doesn't exist locally or on server in this space — redirect
    if (deterministicSpaceId) {
      router.replace(NavUtils.toEntity(deterministicSpaceId, entityId));
    }
  }, [entityId, spaceId, serverSpaces, deterministicSpaceId, preventRedirect, store, router]);

  return children;
}
