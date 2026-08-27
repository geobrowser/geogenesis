import * as React from 'react';

import { Row } from '~/core/types';

export type PendingEntity = { entityId: string; spaceId: string };

/** In-memory pending rows keyed by data block entity id (tab-scoped, not shared across blocks). */
const pendingByBlockId = new Map<string, PendingEntity[]>();

/**
 * Entities created/added through one block's row-creation flow are owned by that block
 * for the lifetime of the tab. Other blocks hide them even when a broad query would match.
 */
const entityBlockOwner = new Map<string, string>();

export function isEntityVisibleInBlock(entityId: string, blockEntityId: string): boolean {
  const owner = entityBlockOwner.get(entityId);
  return owner === undefined || owner === blockEntityId;
}

export function registerEntityBlockOwner(entityId: string, blockEntityId: string) {
  entityBlockOwner.set(entityId, blockEntityId);
}

export function useOptimisticRows(blockEntityId: string, entries: Row[]) {
  if (!blockEntityId) {
    throw new Error('useOptimisticRows requires a non-empty blockEntityId');
  }

  const [pendingEntities, setPendingEntities] = React.useState<PendingEntity[]>(
    () => pendingByBlockId.get(blockEntityId) ?? []
  );

  const entityTargetSpaceRef = React.useRef<Map<string, string>>(new Map());
  const committedPlaceholderIdsRef = React.useRef(new Set<string>());
  const defaultPlaceholderSpaceRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    for (const pending of pendingEntities) {
      entityTargetSpaceRef.current.set(pending.entityId, pending.spaceId);
    }
  }, [pendingEntities]);

  React.useEffect(() => {
    if (pendingEntities.length > 0) {
      pendingByBlockId.set(blockEntityId, pendingEntities);
    } else {
      pendingByBlockId.delete(blockEntityId);
    }
  }, [blockEntityId, pendingEntities]);

  React.useEffect(() => {
    setPendingEntities(prev => {
      const next = prev.filter(p => !entries.some(e => e.entityId === p.entityId));
      if (next.length === prev.length) return prev;
      return next;
    });
  }, [entries, setPendingEntities]);

  const pendingNotInQuery = React.useMemo(
    () => pendingEntities.filter(p => !entries.some(e => e.entityId === p.entityId)),
    [pendingEntities, entries]
  );

  const getTargetSpace = React.useCallback(
    (entityId: string): string | undefined =>
      entityTargetSpaceRef.current.get(entityId) ?? pendingEntities.find(p => p.entityId === entityId)?.spaceId,
    [pendingEntities]
  );

  const setTargetSpace = React.useCallback((entityId: string, spaceId: string) => {
    entityTargetSpaceRef.current.set(entityId, spaceId);
  }, []);

  const rememberDefaultPlaceholderSpace = React.useCallback((spaceId: string) => {
    defaultPlaceholderSpaceRef.current = spaceId;
  }, []);

  const getDefaultPlaceholderSpace = React.useCallback((): string | null => {
    return defaultPlaceholderSpaceRef.current;
  }, []);

  const markPending = React.useCallback(
    (entityId: string, spaceId: string, options?: { registerBlockOwner?: boolean }) => {
      entityTargetSpaceRef.current.set(entityId, spaceId);
      if (options?.registerBlockOwner !== false) {
        registerEntityBlockOwner(entityId, blockEntityId);
      }
      setPendingEntities(prev => [{ entityId, spaceId }, ...prev.filter(p => p.entityId !== entityId)]);
    },
    [blockEntityId, setPendingEntities]
  );

  const markCommitted = React.useCallback((entityId: string) => {
    committedPlaceholderIdsRef.current.add(entityId);
  }, []);

  const isCommitted = React.useCallback((entityId: string) => {
    return committedPlaceholderIdsRef.current.has(entityId);
  }, []);

  return {
    pendingNotInQuery,
    getTargetSpace,
    setTargetSpace,
    rememberDefaultPlaceholderSpace,
    getDefaultPlaceholderSpace,
    markPending,
    markCommitted,
    isCommitted,
  };
}
